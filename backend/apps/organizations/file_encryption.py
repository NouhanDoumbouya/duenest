"""
Encryption-at-rest for organization files (SEC-002).

Organization document files and public document-request submissions used to be
stored as plaintext via a plain ``FileField`` — unlike the personal vault, which
encrypts every file. This module closes that gap by reusing the SAME envelope
encryption primitives (``apps.core.security.encryption``) used by the vault.

A file's whole encrypted envelope (KEK version + nonce + wrapped DEK +
ciphertext, self-describing) is stored as the ``FileField`` content, so only two
small model fields are needed: ``is_encrypted`` (distinguishes legacy plaintext)
and ``file_uuid`` (AAD binding). The AAD binds ciphertext to the file's UUID and
its owning organization, so a blob cannot be replayed under another org/record.

Decryption happens only after membership/role authorization in the view layer.
Legacy (``is_encrypted=False``) rows are read back as-is until migrated by the
``encrypt_legacy_org_files`` management command.
"""

from __future__ import annotations

from django.core.files.base import ContentFile

from apps.core.security import encryption


def _doc_file_aad(instance) -> bytes:
    return (
        f"duenest:orgdocfile:v1:{instance.file_uuid}:{instance.organization_id}"
    ).encode("utf-8")


def _submission_aad(instance) -> bytes:
    return (
        f"duenest:orgsubmission:v1:{instance.file_uuid}:{instance.organization_id}"
    ).encode("utf-8")


def _encrypt_into(instance, plaintext: bytes, filename: str, aad: bytes) -> None:
    token = encryption.seal_blob(plaintext, aad=aad)
    instance.file.save(filename, ContentFile(token), save=False)
    instance.is_encrypted = True


def encrypt_org_document_file(instance, plaintext: bytes, filename: str) -> None:
    """Seal plaintext into an unsaved OrganizationDocumentFile (sets .file)."""
    _encrypt_into(instance, plaintext, filename, _doc_file_aad(instance))


def read_org_document_file(instance) -> bytes:
    """Decrypt an OrganizationDocumentFile (legacy plaintext returned as-is)."""
    with instance.file.open("rb") as fh:
        data = fh.read()
    if not getattr(instance, "is_encrypted", False):
        return data
    return encryption.open_blob(data, aad=_doc_file_aad(instance))


def encrypt_submission_file(instance, plaintext: bytes, filename: str) -> None:
    """Seal plaintext into an unsaved DocumentRequestSubmission (sets .file)."""
    _encrypt_into(instance, plaintext, filename, _submission_aad(instance))


def read_submission_file(instance) -> bytes:
    """Decrypt a DocumentRequestSubmission file (legacy plaintext as-is)."""
    with instance.file.open("rb") as fh:
        data = fh.read()
    if not getattr(instance, "is_encrypted", False):
        return data
    return encryption.open_blob(data, aad=_submission_aad(instance))
