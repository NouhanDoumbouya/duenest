"""
Centralized accessor for CertaNest's configured object/file storage.

The whole codebase already reads and writes file content exclusively through
Django's storage API (``FieldFile.save`` / ``FieldFile.open``), which routes to
whatever backend ``STORAGES["default"]`` selects (local filesystem in dev/tests,
an S3-compatible bucket in production — see ``config/storage.py``). This module
is the single, documented place for storage-level helpers so provider logic
never leaks into views or services.

It deliberately does NOT decrypt: file contents are app-encrypted before they
reach storage. Decryption stays in ``apps.documents.file_encryption`` and only
ever runs after a view has authorized the request.
"""

from __future__ import annotations

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage


def backend_label() -> str:
    """Dotted import path of the active default storage backend (for diagnostics)."""
    return f"{type(default_storage).__module__}.{type(default_storage).__name__}"


def file_exists(name: str) -> bool:
    """Whether an object with this storage name exists."""
    return bool(name) and default_storage.exists(name)


def get_file_size(name: str) -> int:
    """Size in bytes of the stored object."""
    return default_storage.size(name)


def open_file(name: str, mode: str = "rb"):
    """Open a stored object for streaming. Caller is responsible for closing."""
    return default_storage.open(name, mode)


def save_bytes(name: str, data: bytes) -> str:
    """
    Save raw bytes under ``name`` and return the actual stored name (the backend
    may adjust it when overwrite is disabled). Used for migrations/admin tooling;
    normal uploads go through the model ``FileField`` + encryption layer.
    """
    return default_storage.save(name, ContentFile(data))


def delete_file(name: str) -> None:
    """Delete a stored object. No-op if the name is empty."""
    if name:
        default_storage.delete(name)


def signed_url(name: str, expire: int | None = None) -> str | None:
    """
    Return a short-lived signed URL for a stored object, if the backend supports
    it. Returns ``None`` for the local filesystem backend.

    NOTE: CertaNest does not use this for delivering user files (contents are
    encrypted ciphertext and are streamed through authenticated views). It exists
    only for diagnostics/admin and intentionally never yields a public URL.
    """
    try:
        url = default_storage.url(name, expire=expire) if expire else default_storage.url(name)
    except (NotImplementedError, TypeError, ValueError):
        return None
    return url
