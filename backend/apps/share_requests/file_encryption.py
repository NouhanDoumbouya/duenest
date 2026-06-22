"""Encryption-at-rest for external ShareRequest submissions.

Reuses the same envelope-encryption primitives as the vault and organization
submissions (``apps.core.security.encryption``). The whole encrypted envelope is
written to the FileField; the AAD binds the ciphertext to the submission's UUID
and the owning request's owner, so a blob can't be replayed across records.
"""

from __future__ import annotations

from django.core.files.base import ContentFile

from apps.core.security import encryption


def _submission_aad(instance) -> bytes:
    # request.owner_id identifies who the ciphertext belongs to.
    return (
        f"duenest:sharesubmission:v1:{instance.file_uuid}:{instance.request.owner_id}"
    ).encode("utf-8")


def encrypt_share_submission_file(instance, plaintext: bytes, filename: str) -> None:
    """Seal plaintext into an unsaved ShareRequestSubmission (sets ``.file``)."""
    token = encryption.seal_blob(plaintext, aad=_submission_aad(instance))
    instance.file.save(filename, ContentFile(token), save=False)
    instance.is_encrypted = True


def read_share_submission_file(instance) -> bytes:
    """Decrypt a submission file (legacy plaintext, if any, is read as-is)."""
    with instance.file.open("rb") as fh:
        data = fh.read()
    if not getattr(instance, "is_encrypted", False):
        return data
    return encryption.open_blob(data, aad=_submission_aad(instance))
