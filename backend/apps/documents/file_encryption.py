"""
Envelope encryption glue for :class:`DocumentFile`.

Uploads are encrypted with AES-256-GCM under a per-file wrapped DEK before the
bytes ever reach storage; reads decrypt in memory (uploads are capped at 10 MB)
only after the calling view/service has verified authorization.

PERMISSION-FIRST RULE: never call :func:`read_plaintext` (or anything that
decrypts) before authentication, ownership/scope, trash, revoke/expiry and
access-code checks have passed.

Logging rule: this module logs only safe identifiers and error categories —
never keys, plaintext, file names, or paths.
"""

from __future__ import annotations

import hashlib
import logging

from django.core.files.base import ContentFile
from django.utils import timezone

from apps.core.security import encryption

logger = logging.getLogger("duenest.encryption")


def encrypt_bytes_into_record(instance, plaintext: bytes, filename: str) -> None:
    """
    Encrypt ``plaintext`` and attach the ciphertext + envelope metadata to
    ``instance`` (an unsaved DocumentFile that already has ``file_uuid`` and
    ``uploaded_by_id``). Does not call ``instance.save()``.

    Raises encryption.EncryptionError on failure; the caller must not persist a
    half-encrypted record.
    """
    aad = encryption.build_file_aad(instance.file_uuid, instance.uploaded_by_id)
    payload = encryption.encrypt_bytes(plaintext, aad)

    # Store ciphertext (not the original bytes) under the normal upload path.
    instance.file.save(filename, ContentFile(payload.ciphertext), save=False)
    instance.encryption_status = instance.EncryptionStatus.ENCRYPTED
    instance.encryption_algorithm = payload.algorithm
    instance.encryption_version = payload.version
    instance.kek_version = payload.kek_version
    instance.wrapped_dek = payload.wrapped_dek
    instance.nonce = payload.nonce
    instance.gcm_tag = b""  # tag is appended to ciphertext in this format
    instance.ciphertext_sha256 = payload.ciphertext_sha256
    instance.plaintext_size_bytes = len(plaintext)
    instance.ciphertext_size_bytes = len(payload.ciphertext)
    instance.encrypted_at = timezone.now()
    instance.encryption_error = ""


def encrypt_uploaded_file(instance, uploaded) -> None:
    """Encrypt an uploaded file object into ``instance`` (see
    :func:`encrypt_bytes_into_record`)."""
    uploaded.seek(0)
    plaintext = uploaded.read()
    uploaded.seek(0)
    encrypt_bytes_into_record(instance, plaintext, uploaded.name)


def read_plaintext(instance) -> bytes:
    """
    Return decrypted file bytes for an authorized request.

    For ``encrypted`` records this unwraps the DEK and opens the ciphertext with
    AES-GCM (AAD-bound to the file's UUID + owner). For ``plaintext_legacy``
    records (not yet migrated) the raw bytes are returned as-is.

    Raises FileNotFoundError if storage is missing, or
    encryption.DecryptionError if authenticated decryption fails.
    """
    if instance.encryption_status == instance.EncryptionStatus.PLAINTEXT_LEGACY:
        with instance.file.open("rb") as fh:
            return fh.read()

    if instance.encryption_status != instance.EncryptionStatus.ENCRYPTED:
        # encrypting / failed — never serve partial or unverified content.
        raise encryption.DecryptionError("File is not available for decryption.")

    with instance.file.open("rb") as fh:
        ciphertext = fh.read()
    aad = encryption.build_file_aad(instance.file_uuid, instance.uploaded_by_id)
    try:
        return encryption.decrypt_bytes(
            ciphertext,
            nonce=bytes(instance.nonce),
            wrapped_dek=bytes(instance.wrapped_dek),
            kek_version=instance.kek_version,
            aad=aad,
        )
    except encryption.DecryptionError:
        logger.warning(
            "file_decryption_failed file_id=%s kek_version=%s error_category=auth_failure",
            instance.pk,
            instance.kek_version,
        )
        raise


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
