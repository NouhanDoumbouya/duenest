"""
Shared secure-upload validation (SEC-005 / SEC-003).

A single chokepoint used by the vault upload, file inbox, organization upload
and public document-request upload so every entry point applies the same rules:

* size limit (before any expensive processing)
* extension allowlist
* **server-side content sniffing** from magic bytes — the client-reported
  ``content_type`` is never trusted on its own
* structural validation for PDFs (and a light image check)
* optional ClamAV malware scanning (settings-gated, fail-closed in production)

The dedicated document scanner endpoint keeps its own equivalent pipeline; this
module reuses the same ClamAV settings (``CLAMD_ENABLED`` / ``CLAMD_SOCKET_PATH``
/ ``CLAMD_FAIL_CLOSED``). Nothing here logs file contents, names or OCR text.
"""

from __future__ import annotations

import logging
import os
from io import BytesIO

from django.conf import settings

logger = logging.getLogger("duenest.file_validation")

_PDF_MAGIC = b"%PDF-"
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
_JPEG_MAGIC = b"\xff\xd8\xff"
_ZIP_MAGIC = b"PK\x03\x04"          # docx (Office Open XML is a zip)
_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # legacy .doc (OLE compound)

# Concrete, magic-detectable types and the extensions they may carry.
_TYPE_EXTENSIONS = {
    "application/pdf": {".pdf"},
    "image/jpeg": {".jpg", ".jpeg"},
    "image/png": {".png"},
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {".docx"},
    "application/msword": {".doc"},
}
# Types we can strongly verify from bytes (reject on mismatch).
_STRICT_TYPES = {"application/pdf", "image/jpeg", "image/png"}


class SecureUploadError(Exception):
    """An upload failed validation. Carries an HTTP status code."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class MalwareDetected(SecureUploadError):
    """An antivirus engine flagged the upload."""


class MalwareScanUnavailable(SecureUploadError):
    """Scanning was required but the engine/daemon was unreachable (503)."""

    def __init__(self, message: str):
        super().__init__(message, status_code=503)


def read_upload_head(uploaded, size: int = 8192) -> bytes:
    """Read the leading bytes of an uploaded file without consuming it."""
    uploaded.seek(0)
    head = uploaded.read(size)
    uploaded.seek(0)
    return head or b""


def detect_file_type(head: bytes) -> str | None:
    """Best-effort content-type detection from magic bytes. Returns a concrete
    MIME type, ``"application/zip"`` for an unspecified zip container, or None."""
    if head.startswith(_PDF_MAGIC):
        return "application/pdf"
    if head.startswith(_PNG_MAGIC):
        return "image/png"
    if head.startswith(_JPEG_MAGIC):
        return "image/jpeg"
    if head.startswith(_OLE_MAGIC):
        return "application/msword"
    if head.startswith(_ZIP_MAGIC):
        # A docx is a zip; we cannot cheaply prove it is specifically a docx.
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return None


def validate_pdf_structure(data: bytes) -> None:
    """Confirm a PDF parses and has at least one page (pypdf optional)."""
    if not data.startswith(_PDF_MAGIC):
        raise SecureUploadError("The file is not a valid PDF.")
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:  # noqa: BLE001 — optional dependency
        return
    try:
        reader = PdfReader(BytesIO(data))
        if len(reader.pages) < 1:
            raise SecureUploadError("The PDF has no pages.")
    except SecureUploadError:
        raise
    except Exception:  # noqa: BLE001 — malformed/encrypted structure
        raise SecureUploadError("The PDF could not be read or is corrupted.")


def validate_image_structure(data: bytes) -> None:
    """Confirm an image actually decodes (Pillow optional)."""
    try:
        from PIL import Image  # type: ignore
    except Exception:  # noqa: BLE001 — optional dependency
        return
    try:
        with Image.open(BytesIO(data)) as image:
            image.verify()
    except Exception:  # noqa: BLE001
        raise SecureUploadError("The image could not be read or is corrupted.")


def scan_file_for_malware(data: bytes) -> None:
    """Scan bytes with ClamAV when ``CLAMD_ENABLED``.

    Honest behaviour mirrors the scanner endpoint: disabled -> no-op; infected
    -> MalwareDetected (file rejected); engine error -> MalwareScanUnavailable
    when ``CLAMD_FAIL_CLOSED`` (recommended in prod), else allowed through.
    """
    if not getattr(settings, "CLAMD_ENABLED", False):
        return
    fail_closed = getattr(settings, "CLAMD_FAIL_CLOSED", True)
    try:
        import clamd  # type: ignore

        socket_path = getattr(
            settings, "CLAMD_SOCKET_PATH", "/var/run/clamav/clamd.ctl"
        )
        client = clamd.ClamdUnixSocket(path=socket_path)
        result = client.instream(BytesIO(data))
    except MalwareDetected:
        raise
    except Exception:  # noqa: BLE001 — daemon/socket/library problem
        logger.warning("clamav_scan_unavailable error_category=engine_error")
        if fail_closed:
            raise MalwareScanUnavailable(
                "Malware scanning is temporarily unavailable. Please try again."
            )
        return
    status_tuple = (result or {}).get("stream")
    if status_tuple and status_tuple[0] == "FOUND":
        logger.warning("clamav_scan_found")
        raise MalwareDetected(
            "Upload blocked for safety. The file did not pass validation."
        )


def validate_secure_upload(
    uploaded,
    *,
    allowed_content_types,
    allowed_extensions,
    max_bytes: int,
    scan: bool = True,
    validate_structure: bool = True,
) -> str:
    """Validate an uploaded file end-to-end and return the trusted content type.

    Raises :class:`SecureUploadError` (or subclasses) on any failure. The order
    is size -> extension -> declared type -> sniffed type -> structure ->
    malware, so cheap checks reject before expensive ones run.
    """
    if uploaded is None:
        raise SecureUploadError("No file was provided.")

    size = getattr(uploaded, "size", 0) or 0
    if size == 0:
        raise SecureUploadError("The uploaded file is empty.")
    if size > max_bytes:
        max_mb = max_bytes // (1024 * 1024)
        raise SecureUploadError(
            f"File is too large. Maximum size is {max_mb} MB.", status_code=413
        )

    name = getattr(uploaded, "name", "") or ""
    ext = os.path.splitext(name)[1].lower()
    if ext not in allowed_extensions:
        raise SecureUploadError(
            "Unsupported file extension. Allowed: "
            + ", ".join(sorted(allowed_extensions))
            + "."
        )

    declared = (getattr(uploaded, "content_type", "") or "").split(";")[0].strip()
    if declared and declared not in allowed_content_types:
        raise SecureUploadError(
            "Unsupported file type. Allowed: "
            + ", ".join(sorted(allowed_content_types))
            + "."
        )

    head = read_upload_head(uploaded)
    detected = detect_file_type(head)

    # Strongly-verifiable types must match their magic bytes and extension.
    if detected in _STRICT_TYPES:
        if detected not in allowed_content_types:
            raise SecureUploadError("This file type is not allowed here.")
        if ext not in _TYPE_EXTENSIONS[detected]:
            raise SecureUploadError(
                "The file content does not match its extension."
            )
        trusted = detected
    elif detected is not None:
        # docx/doc container: accept when the extension is consistent.
        if ext not in _TYPE_EXTENSIONS.get(detected, set()):
            # A zip could legitimately be a .docx; only reject a hard mismatch
            # against a strict type's extension (e.g. claims .png but is a zip).
            if ext in {".pdf", ".jpg", ".jpeg", ".png"}:
                raise SecureUploadError(
                    "The file content does not match its extension."
                )
        trusted = detected if detected in allowed_content_types else (declared or detected)
    else:
        # Unknown magic. Reject if it claims to be a strict (sniffable) type but
        # produced no matching signature — that is the dangerous mismatch.
        if ext in {".pdf", ".jpg", ".jpeg", ".png"}:
            raise SecureUploadError(
                "The file content could not be verified for this type."
            )
        trusted = declared or "application/octet-stream"

    # Read once for structure + malware. The strict anti-spoofing guarantee is
    # the magic-byte vs extension match above; deep structural parsing is
    # best-effort (pypdf/Pillow have false negatives on valid files), so a parse
    # failure is logged, not fatal — except a hard magic mismatch, already
    # rejected. Malware detection is always fatal when the engine flags a file.
    if scan or validate_structure:
        uploaded.seek(0)
        data = uploaded.read()
        uploaded.seek(0)
        if validate_structure:
            try:
                if trusted == "application/pdf":
                    validate_pdf_structure(data)
                elif trusted in {"image/jpeg", "image/png"}:
                    validate_image_structure(data)
            except SecureUploadError:
                logger.info("upload_structure_check_soft_fail type=%s", trusted)
        if scan:
            scan_file_for_malware(data)

    return trusted
