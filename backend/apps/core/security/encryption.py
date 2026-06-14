"""
Application-level encryption for DueNest.

Design (see docs/ENCRYPTION.md):

  * Envelope encryption. Every encrypted blob has its own random 32-byte Data
    Encryption Key (DEK) and a random 12-byte nonce.
  * Content is sealed with AES-256-GCM (authenticated). The 16-byte GCM tag is
    appended to the ciphertext by ``AESGCM`` and verified on every open.
  * The DEK is wrapped with the active Key Encryption Key (KEK) using AES Key
    Wrap with Padding (RFC 5649) from ``cryptography.hazmat.primitives.keywrap``.
  * Associated Authenticated Data (AAD) binds ciphertext to stable, immutable
    metadata so a blob cannot be moved between records undetected.

This is NOT zero-knowledge: the server can decrypt after permission checks.
Never call a decrypt function before authorization has been verified.

Nothing in this module may log key material, plaintext, or AAD-bound secrets.
"""

from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.keywrap import (
    InvalidUnwrap,
    aes_key_unwrap_with_padding,
    aes_key_wrap_with_padding,
)

from . import key_provider

DEK_LENGTH_BYTES = 32
NONCE_LENGTH_BYTES = 12
GCM_TAG_LENGTH_BYTES = 16

# Stable format identifiers (bumping these is how the on-disk format evolves).
FILE_ENCRYPTION_ALGORITHM = "AES-256-GCM"
FILE_ENCRYPTION_VERSION = 1
FIELD_AAD_VERSION = "v1"
FILE_AAD_VERSION = "v1"


class DecryptionError(Exception):
    """Raised when authenticated decryption fails. Carries no secret detail."""


class EncryptionError(Exception):
    """Raised when encryption cannot be completed."""


@dataclass(frozen=True)
class EncryptedPayload:
    """Result of encrypting a blob with a freshly generated, wrapped DEK."""

    ciphertext: bytes  # AES-GCM output (includes the appended 16-byte tag)
    nonce: bytes
    wrapped_dek: bytes
    kek_version: str
    algorithm: str = FILE_ENCRYPTION_ALGORITHM
    version: int = FILE_ENCRYPTION_VERSION

    @property
    def ciphertext_sha256(self) -> str:
        return hashlib.sha256(self.ciphertext).hexdigest()


# ---- Key material ----------------------------------------------------------


def generate_dek() -> bytes:
    """32 cryptographically secure random bytes; unique per blob, never reused."""
    return os.urandom(DEK_LENGTH_BYTES)


def generate_nonce() -> bytes:
    """12 cryptographically secure random bytes; unique per encrypt operation."""
    return os.urandom(NONCE_LENGTH_BYTES)


def wrap_dek(dek: bytes, kek_version: str) -> bytes:
    if len(dek) != DEK_LENGTH_BYTES:
        raise EncryptionError("DEK must be 32 bytes.")
    kek = key_provider.get_kek(kek_version)
    return aes_key_wrap_with_padding(kek, dek)


def unwrap_dek(wrapped_dek: bytes, kek_version: str) -> bytes:
    kek = key_provider.get_kek(kek_version)
    try:
        return aes_key_unwrap_with_padding(kek, wrapped_dek)
    except InvalidUnwrap as exc:
        # Wrong KEK or tampered wrapped DEK — fail closed without detail.
        raise DecryptionError("Unable to unwrap data key.") from exc


# ---- AAD builders ----------------------------------------------------------


def build_file_aad(file_uuid, owner_id: int) -> bytes:
    """Bind file ciphertext to its immutable UUID and owner."""
    return f"duenest:file:{FILE_AAD_VERSION}:{file_uuid}:{owner_id}".encode("utf-8")


def build_field_aad(model: str, field: str, record_id) -> bytes:
    """Bind an encrypted field value to its model/field/record."""
    return (
        f"duenest:field:{FIELD_AAD_VERSION}:{model}:{field}:{record_id}"
    ).encode("utf-8")


# ---- Low-level seal/open ---------------------------------------------------


def encrypt_bytes(plaintext: bytes, aad: bytes) -> EncryptedPayload:
    """
    Seal ``plaintext`` under a new wrapped DEK with the active KEK.

    Suitable for in-memory blobs (DueNest caps uploads at 10 MB). The returned
    ciphertext already includes the GCM authentication tag.
    """
    kek_version, _ = key_provider.get_active_kek()
    dek = generate_dek()
    nonce = generate_nonce()
    try:
        ciphertext = AESGCM(dek).encrypt(nonce, plaintext, aad)
    except Exception as exc:  # pragma: no cover - defensive
        raise EncryptionError("Encryption failed.") from exc
    wrapped = wrap_dek(dek, kek_version)
    return EncryptedPayload(
        ciphertext=ciphertext,
        nonce=nonce,
        wrapped_dek=wrapped,
        kek_version=kek_version,
    )


def decrypt_bytes(
    ciphertext: bytes,
    *,
    nonce: bytes,
    wrapped_dek: bytes,
    kek_version: str,
    aad: bytes,
) -> bytes:
    """
    Open a blob produced by :func:`encrypt_bytes`. Fails closed (raises
    DecryptionError) on any wrong key, wrong AAD, or tampered ciphertext.

    Callers MUST have verified authorization before calling this.
    """
    dek = unwrap_dek(wrapped_dek, kek_version)
    try:
        return AESGCM(dek).decrypt(nonce, ciphertext, aad)
    except InvalidTag as exc:
        # Wrong AAD, wrong key, or corrupted/tampered ciphertext.
        raise DecryptionError("Unable to decrypt content.") from exc


# ---- Field-value convenience (P1 encrypted text fields) --------------------
#
# A field value is stored as a single opaque token so one DB column holds
# everything needed to open it. Layout (all length-prefixed, version-tagged):
#
#   b"DNEF1" | kek_version_len(1) | kek_version | nonce(12) |
#   wrapped_dek_len(2, big-endian) | wrapped_dek | ciphertext(rest)

_FIELD_MAGIC = b"DNEF1"


def encrypt_field_value(plaintext: str, *, model: str, field: str, record_id) -> bytes:
    aad = build_field_aad(model, field, record_id)
    payload = encrypt_bytes(plaintext.encode("utf-8"), aad)
    kek_v = payload.kek_version.encode("utf-8")
    if len(kek_v) > 255 or len(payload.wrapped_dek) > 65535:
        raise EncryptionError("Field encryption metadata too large.")
    return b"".join(
        [
            _FIELD_MAGIC,
            bytes([len(kek_v)]),
            kek_v,
            payload.nonce,
            len(payload.wrapped_dek).to_bytes(2, "big"),
            payload.wrapped_dek,
            payload.ciphertext,
        ]
    )


def decrypt_field_value(token: bytes, *, model: str, field: str, record_id) -> str:
    if not token or token[: len(_FIELD_MAGIC)] != _FIELD_MAGIC:
        raise DecryptionError("Unrecognized encrypted field format.")
    try:
        pos = len(_FIELD_MAGIC)
        kek_len = token[pos]
        pos += 1
        kek_version = token[pos : pos + kek_len].decode("utf-8")
        pos += kek_len
        nonce = token[pos : pos + NONCE_LENGTH_BYTES]
        pos += NONCE_LENGTH_BYTES
        wrapped_len = int.from_bytes(token[pos : pos + 2], "big")
        pos += 2
        wrapped_dek = token[pos : pos + wrapped_len]
        pos += wrapped_len
        ciphertext = token[pos:]
    except (IndexError, ValueError) as exc:
        raise DecryptionError("Malformed encrypted field value.") from exc
    aad = build_field_aad(model, field, record_id)
    plaintext = decrypt_bytes(
        ciphertext,
        nonce=nonce,
        wrapped_dek=wrapped_dek,
        kek_version=kek_version,
        aad=aad,
    )
    return plaintext.decode("utf-8")
