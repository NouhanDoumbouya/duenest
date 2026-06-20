"""
Verifiable Shares — tamper-evident, DueNest-signed share manifests.

A verified Quick Share carries an Ed25519-signed manifest listing each shared
file's SHA-256. The public verify page recomputes the hashes from the currently
served files and checks the signature, proving PROVENANCE + INTEGRITY: these exact
files were shared by this DueNest account at this time and have not been altered.

It does NOT assert real-world document authenticity (DueNest cannot know whether a
passport is genuine). The private key is server-only; only the public key is ever
exposed, so verification can become independent/offline later without rework.
"""

from __future__ import annotations

import base64
import json
import logging

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.conf import settings
from django.utils import timezone

from apps.documents.file_encryption import read_plaintext, sha256_hex

logger = logging.getLogger(__name__)

MANIFEST_VERSION = 1

# Cached so we load/generate the key once per process.
_signing_key: Ed25519PrivateKey | None = None


def _load_signing_key() -> Ed25519PrivateKey:
    global _signing_key
    if _signing_key is not None:
        return _signing_key
    pem = (settings.SHARE_SIGNING_PRIVATE_KEY or "").strip()
    if pem:
        key = serialization.load_pem_private_key(pem.encode("utf-8"), password=None)
        if not isinstance(key, Ed25519PrivateKey):
            raise ValueError("SHARE_SIGNING_PRIVATE_KEY must be an Ed25519 PEM key.")
        _signing_key = key
    else:
        logger.warning(
            "SHARE_SIGNING_PRIVATE_KEY is not set — generating an ephemeral dev "
            "signing key. Set it in the environment for shared/production use; "
            "signatures will not survive a restart otherwise."
        )
        _signing_key = Ed25519PrivateKey.generate()
    return _signing_key


def public_key_b64() -> str:
    """Base64 of the raw Ed25519 public key (for /verify/key/ and offline verify)."""
    raw = (
        _load_signing_key()
        .public_key()
        .public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
    )
    return base64.b64encode(raw).decode("ascii")


def canonical_bytes(manifest: dict) -> bytes:
    """Deterministic JSON encoding so the signature is reproducible on verify."""
    return json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _sender_display(owner) -> str:
    full = (owner.get_full_name() or "").strip()
    return full or owner.get_username()


def _file_hash(file) -> str:
    """Plaintext SHA-256 — the stored checksum, recomputed only for legacy rows."""
    if file.checksum:
        return file.checksum
    return sha256_hex(read_plaintext(file))


def _resolved_files(session):
    # Imported here to avoid a circular import (services imports the models too).
    from .services import session_files

    return [file for _item, file in session_files(session)]


def build_manifest(session, files, *, issued_at=None) -> dict:
    """Build the signed manifest from the session's resolved files."""
    return {
        "v": MANIFEST_VERSION,
        "share": session.short_id,
        "sender": _sender_display(session.owner),
        "issued_at": (issued_at or timezone.now()).isoformat(),
        "files": [
            {
                "name": file.original_filename,
                "sha256": _file_hash(file),
                "size": file.file_size,
            }
            for file in files
        ],
    }


def sign_manifest(manifest: dict) -> str:
    sig = _load_signing_key().sign(canonical_bytes(manifest))
    return base64.b64encode(sig).decode("ascii")


def sign_session(session) -> None:
    """Mark the session verified, then build, sign, and persist its manifest."""
    issued_at = timezone.now()
    manifest = build_manifest(session, _resolved_files(session), issued_at=issued_at)
    session.verified = True
    session.verification_manifest = manifest
    session.verification_signature = sign_manifest(manifest)
    session.verified_at = issued_at
    session.save(
        update_fields=[
            "verified",
            "verification_manifest",
            "verification_signature",
            "verified_at",
            "updated_at",
        ]
    )


def verify_session(session) -> dict:
    """
    Recompute the current files' hashes, compare to the signed manifest, and check
    the signature. Returns a recipient-safe result (names + hashes + per-file match
    booleans) — never document bytes.
    """
    manifest = session.verification_manifest
    signature_b64 = session.verification_signature
    if not session.verified or not manifest or not signature_b64:
        return {"verified": False, "status": "not_verified", "files": []}

    # 1. Was the manifest signed by DueNest?
    try:
        _load_signing_key().public_key().verify(
            base64.b64decode(signature_b64), canonical_bytes(manifest)
        )
        signature_valid = True
    except (InvalidSignature, ValueError):
        signature_valid = False

    # 2. Do the currently served files still match the signed hashes? Match on the
    # hash multiset so duplicate filenames don't confuse the comparison.
    remaining = [_file_hash(file) for file in _resolved_files(session)]
    files_out = []
    all_present = True
    for entry in manifest.get("files", []):
        digest = entry.get("sha256")
        matches = digest in remaining
        if matches:
            remaining.remove(digest)
        else:
            all_present = False
        files_out.append(
            {"name": entry.get("name"), "sha256": digest, "matches": matches}
        )
    # Extra files now in the share that weren't signed also mean the content drifted.
    content_intact = all_present and not remaining

    return {
        "verified": bool(signature_valid and content_intact),
        "status": "verified" if (signature_valid and content_intact) else "altered",
        "signature_valid": signature_valid,
        "content_intact": content_intact,
        "share": manifest.get("share"),
        "sender": manifest.get("sender"),
        "issued_at": manifest.get("issued_at"),
        "files": files_out,
    }
