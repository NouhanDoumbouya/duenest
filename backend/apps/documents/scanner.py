"""
Document scanner upload endpoint and helpers.

The browser scanner captures a document, flattens/enhances it, and builds a PDF
client-side. This module accepts that PDF (or an imported image), validates and
optionally malware-scans it, runs best-effort OCR, and stores it through the
SAME encrypted ``DocumentFile`` pipeline as every other upload — scanned files
are ordinary inbox files, with no separate storage path or weaker permissions.

Security posture:
  * authenticated owner only; the file becomes a normal owner-scoped inbox file
  * per-user rate limiting (DRF ``scanner_upload`` scope)
  * size + MIME + structural (PDF) validation before anything is stored
  * optional ClamAV scan (settings-gated, fail-closed in production)
  * encrypted at rest via ``encrypt_bytes_into_record`` — plaintext never stored
  * responses return a secure document id + controlled routes, never raw paths

Self-contained on purpose: it depends only on stable model/encryption/plan
primitives so it stays robust to churn in ``views.py`` / ``services.py``.
"""

from __future__ import annotations

import logging
import os
from io import BytesIO

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.reverse import reverse
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .file_encryption import encrypt_bytes_into_record, sha256_hex
from .models import DocumentExtraction, DocumentFile
from .plan_usage import enforce_plan_limit

logger = logging.getLogger("duenest.scanner")

_EXTENSION_BY_MIME = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
}
_PDF_MAGIC = b"%PDF-"


class ScanValidationError(Exception):
    """Raised when an uploaded scan fails validation. Carries an HTTP status."""

    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def json_error(message: str, status_code: int) -> Response:
    """Uniform JSON error envelope for the scanner API (never an HTML page)."""
    return Response({"error": message}, status=status_code)


def _max_upload_bytes() -> int:
    return int(getattr(settings, "SCANNER_MAX_UPLOAD_MB", 15)) * 1024 * 1024


def _allowed_mime_types() -> set[str]:
    return set(
        getattr(
            settings,
            "SCANNER_ALLOWED_MIME_TYPES",
            ["application/pdf", "image/jpeg", "image/png"],
        )
    )


def validate_uploaded_scan(uploaded) -> str:
    """
    Validate size, emptiness, MIME type and (for PDFs) basic structure.

    Returns the resolved, trusted content type. Raises :class:`ScanValidationError`
    with a user-safe message on any failure. Validation happens before storage.
    """
    if uploaded is None:
        raise ScanValidationError("No file was provided.")

    size = getattr(uploaded, "size", 0) or 0
    if size == 0:
        raise ScanValidationError("The uploaded file is empty.")

    max_bytes = _max_upload_bytes()
    if size > max_bytes:
        max_mb = max_bytes // (1024 * 1024)
        raise ScanValidationError(
            f"File is too large. Maximum size is {max_mb} MB.",
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
        )

    allowed = _allowed_mime_types()
    content_type = (getattr(uploaded, "content_type", "") or "").split(";")[0].strip()
    if content_type not in allowed:
        raise ScanValidationError(
            "Unsupported file type. Allowed types: "
            + ", ".join(sorted(allowed))
            + ".",
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        )

    head = _read_head(uploaded)
    if content_type == "application/pdf" and not head.startswith(_PDF_MAGIC):
        raise ScanValidationError("The file is not a valid PDF.")

    return content_type


def _read_head(uploaded, length: int = 8) -> bytes:
    uploaded.seek(0)
    head = uploaded.read(length)
    uploaded.seek(0)
    return head or b""


def validate_pdf_structure(data: bytes) -> None:
    """
    Confirm a PDF parses and has at least one page. Raises
    :class:`ScanValidationError` otherwise. ``pypdf`` is optional: if it is not
    installed we fall back to the magic-byte check already done in validation.
    """
    if not data.startswith(_PDF_MAGIC):
        raise ScanValidationError("The file is not a valid PDF.")
    try:
        from pypdf import PdfReader  # type: ignore
    except Exception:  # noqa: BLE001 — optional dependency
        return
    try:
        reader = PdfReader(BytesIO(data))
        if len(reader.pages) < 1:
            raise ScanValidationError("The PDF has no pages.")
    except ScanValidationError:
        raise
    except Exception:  # noqa: BLE001 — malformed/encrypted structure
        raise ScanValidationError("The PDF could not be read or is corrupted.")


class MalwareDetected(ScanValidationError):
    """Raised when an antivirus engine flags the upload."""


class MalwareScanUnavailable(Exception):
    """Raised when scanning is required but the engine/daemon is unreachable."""


def scan_for_malware(data: bytes) -> None:
    """
    Scan ``data`` with ClamAV via the ``clamd`` client when ``CLAMD_ENABLED``.

    Honest behaviour:
      * disabled (default): no-op — the caller documents that no AV ran.
      * enabled + infected: raises :class:`MalwareDetected` (file not stored).
      * enabled + engine error: raises :class:`MalwareScanUnavailable` when
        ``CLAMD_FAIL_CLOSED`` (recommended for production), otherwise logs and
        allows the upload through (explicit dev opt-in).

    Never fakes a clean result: if scanning cannot run and fail-closed is set,
    the upload is rejected.
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
                "Malware scanning is temporarily unavailable."
            )
        return

    status_tuple = (result or {}).get("stream")
    if status_tuple and status_tuple[0] == "FOUND":
        logger.warning("clamav_scan_found")
        raise MalwareDetected(
            "Upload blocked for safety. The file did not pass validation."
        )


def compress_pdf(data: bytes) -> bytes:
    """
    Best-effort, *lossless* PDF slimming with ``pypdf``: drop the document info
    dictionary and apply stream (Flate) compression to content streams.

    Honest limitation: this does NOT recompress embedded raster images (that
    needs a rasteriser such as Ghostscript/Pillow and is lossy). The browser
    scanner already downscales/compresses the captured image before building the
    PDF, so backend compression here is intentionally conservative. On any error
    the ORIGINAL bytes are returned unchanged — compression must never corrupt.
    """
    try:
        from pypdf import PdfReader, PdfWriter  # type: ignore
    except Exception:  # noqa: BLE001 — optional dependency
        return data

    try:
        reader = PdfReader(BytesIO(data))
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        for page in writer.pages:
            try:
                page.compress_content_streams()
            except Exception:  # noqa: BLE001 — per-page best effort
                pass
        # Drop metadata (avoids leaking client app / timestamps); keep content.
        try:
            writer.add_metadata({})
        except Exception:  # noqa: BLE001
            pass
        out = BytesIO()
        writer.write(out)
        compressed = out.getvalue()
        if compressed and compressed.startswith(_PDF_MAGIC) and len(compressed) <= len(data):
            return compressed
        return data
    except Exception:  # noqa: BLE001 — never corrupt; fall back to original
        logger.warning("pdf_compression_failed", exc_info=True)
        return data


def extract_ocr_text(data: bytes, content_type: str):
    """
    Best-effort text/OCR extraction over in-memory *plaintext* bytes.

    Returns an ``ExtractionResult``-shaped object (status, provider, raw_text,
    extracted_fields, confidence_score, error_message) or ``None`` if extraction
    tooling is unavailable. Never raises — OCR must not block an upload.

    The scanner has plaintext in hand here; the on-disk record is encrypted, so
    re-reading it later would only see ciphertext. Heavy work is bounded by
    ``SCANNER_OCR_MAX_PAGES`` and a per-page Tesseract timeout.
    """
    max_pages = int(getattr(settings, "SCANNER_OCR_MAX_PAGES", 10))
    timeout = int(getattr(settings, "SCANNER_OCR_TIMEOUT_SECONDS", 20))
    try:
        from . import services as doc_services

        return doc_services.extract_details_from_bytes(
            data,
            content_type,
            max_pages=max_pages,
            ocr_timeout=timeout,
        )
    except AttributeError:
        return _local_extract(data, content_type, max_pages, timeout)
    except Exception:  # noqa: BLE001 — OCR is best effort
        logger.warning("scanner_ocr_failed", exc_info=True)
        return None


def _local_extract(data: bytes, content_type: str, max_pages: int, timeout: int):
    """Self-contained fallback extractor used if services helpers are absent."""
    raw_text = None
    provider = "local_text"
    try:
        if content_type == "application/pdf":
            from pypdf import PdfReader  # type: ignore

            reader = PdfReader(BytesIO(data))
            raw_text = "\n".join(
                (p.extract_text() or "") for p in reader.pages[:max_pages]
            ).strip() or None
            if not raw_text:
                raw_text = _ocr_pdf_local(data, max_pages, timeout)
                provider = "local_ocr" if raw_text else provider
        elif content_type.startswith("image/"):
            raw_text = _ocr_image_local(data, timeout)
            provider = "local_ocr"
    except Exception:  # noqa: BLE001
        return None

    if not raw_text:
        return None
    return type(
        "ScanExtraction",
        (),
        {
            "status": "needs_review",
            "provider": provider,
            "raw_text": raw_text[:20_000],
            "extracted_fields": {},
            "confidence_score": 0.3,
            "error_message": "",
        },
    )()


def _ocr_image_local(data: bytes, timeout: int):
    try:
        import pytesseract  # type: ignore
        from PIL import Image  # type: ignore

        with Image.open(BytesIO(data)) as image:
            return (
                pytesseract.image_to_string(image, timeout=timeout) or ""
            ).strip() or None
    except Exception:  # noqa: BLE001
        return None


def _ocr_pdf_local(data: bytes, max_pages: int, timeout: int):
    try:
        import pytesseract  # type: ignore
        from pdf2image import convert_from_bytes  # type: ignore

        images = convert_from_bytes(data, first_page=1, last_page=max_pages)
        parts = []
        for img in images:
            try:
                parts.append(pytesseract.image_to_string(img, timeout=timeout) or "")
            except Exception:  # noqa: BLE001
                pass
        return "\n".join(parts).strip() or None
    except Exception:  # noqa: BLE001
        return None


def _safe_filename(original: str | None, content_type: str) -> str:
    """A clean, extension-correct filename; never trust the client's path."""
    ext = _EXTENSION_BY_MIME.get(content_type, ".pdf")
    base = os.path.basename(original or "")
    base = os.path.splitext(base)[0].strip()
    if not base:
        from django.utils import timezone

        base = "scan-" + timezone.now().strftime("%Y%m%d-%H%M%S")
    base = "".join(c for c in base if c.isalnum() or c in ("-", "_", " ")).strip()
    base = (base or "scan")[:80]
    return f"{base}{ext}"


def save_scanned_document(user, data: bytes, *, content_type: str, filename: str):
    """
    Persist plaintext ``data`` as an encrypted, owner-scoped inbox ``DocumentFile``.

    Reuses the shared envelope-encryption pipeline (AES-256-GCM under a wrapped
    DEK); plaintext is never written to storage. Returns the saved instance.
    """
    safe_name = _safe_filename(filename, content_type)
    instance = DocumentFile(
        document=None,
        uploaded_by=user,
        original_filename=safe_name[:255],
        content_type=content_type,
        file_size=len(data),
        checksum=sha256_hex(data),
    )
    encrypt_bytes_into_record(instance, data, safe_name)
    instance.save()
    return instance


def _maybe_run_ocr(user, instance, data: bytes, content_type: str) -> bool:
    """Run OCR if enabled + feature-flagged; store a DocumentExtraction. Best
    effort — returns whether searchable text was stored. Never blocks upload
    unless ``SCANNER_OCR_REQUIRED``."""
    if not getattr(settings, "SCANNER_OCR_ENABLED", True):
        return False
    try:
        from apps.features.flags import is_feature_enabled

        if not is_feature_enabled("ocr", user):
            return False
    except Exception:  # noqa: BLE001 — flags optional
        pass

    result = extract_ocr_text(data, content_type)
    if result is None:
        if getattr(settings, "SCANNER_OCR_REQUIRED", False):
            raise ScanValidationError(
                "Could not read text from the document.",
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        return False

    try:
        DocumentExtraction.objects.create(
            owner=user,
            document=instance.document,
            file=instance,
            extraction_status=getattr(result, "status", "needs_review"),
            raw_text=getattr(result, "raw_text", "") or "",
            extracted_fields=getattr(result, "extracted_fields", {}) or {},
            confidence_score=getattr(result, "confidence_score", None),
            provider=getattr(result, "provider", "local_text"),
            error_message=getattr(result, "error_message", "") or "",
        )
    except Exception:  # noqa: BLE001 — never fail the upload on extraction storage
        logger.warning("scanner_extraction_store_failed", exc_info=True)
        return False
    return bool(getattr(result, "raw_text", ""))


def _log_scan_activity(instance, request) -> None:
    """Audit the upload through the existing activity log when available."""
    try:
        from .models import DocumentFileActivity
        from .services import log_activity

        log_activity(
            file=instance,
            action=DocumentFileActivity.Action.FILE_UPLOADED,
            actor_type=DocumentFileActivity.ActorType.OWNER,
            request=request,
        )
    except Exception:  # noqa: BLE001 — auditing is non-critical to the response
        logger.debug("scanner_activity_log_skipped", exc_info=True)


class UploadScannedDocumentView(APIView):
    """
    POST a scanned PDF (or imported image) and store it as an encrypted,
    owner-scoped inbox file.

    Pipeline: rate limit -> plan limit -> validate -> read bytes -> malware scan
    -> (PDF) structure check + lossless compression -> encrypt + store -> OCR
    (best effort) -> secure JSON response.

    Response (200):
        {"status": "success", "document_id": <id>, "file_uuid": "...",
         "preview_url": "...", "download_url": "...", "ocr_text_stored": bool,
         "size_bytes": <int>}
    Errors return {"error": "..."} with an appropriate status code.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "scanner_upload"

    def post(self, request, *args, **kwargs):
        enforce_plan_limit(request.user, _resource_files())
        # Monthly metered limit (free plan: a few scans/month; Pro: unlimited).
        from apps.billing import entitlements as billing_entitlements

        billing_entitlements.enforce_feature_usage(
            request.user, "scanner_scans_per_month"
        )

        uploaded = request.FILES.get("file")
        try:
            content_type = validate_uploaded_scan(uploaded)
        except ScanValidationError as exc:
            return json_error(exc.message, exc.status_code)

        uploaded.seek(0)
        data = uploaded.read()

        try:
            scan_for_malware(data)
        except MalwareDetected as exc:
            return json_error(exc.message, status.HTTP_400_BAD_REQUEST)
        except MalwareScanUnavailable as exc:
            return json_error(str(exc), status.HTTP_503_SERVICE_UNAVAILABLE)

        if content_type == "application/pdf":
            try:
                validate_pdf_structure(data)
            except ScanValidationError as exc:
                return json_error(exc.message, exc.status_code)
            data = compress_pdf(data)

        instance = save_scanned_document(
            request.user,
            data,
            content_type=content_type,
            filename=getattr(uploaded, "name", ""),
        )

        try:
            ocr_stored = _maybe_run_ocr(request.user, instance, data, content_type)
        except ScanValidationError as exc:
            instance.delete()
            return json_error(exc.message, exc.status_code)

        _log_scan_activity(instance, request)
        billing_entitlements.increment_usage(request.user, "scanner_scans_per_month")

        return Response(
            {
                "status": "success",
                "document_id": instance.id,
                "file_uuid": str(instance.file_uuid),
                "preview_url": reverse(
                    "file-inbox-preview", kwargs={"pk": instance.pk}, request=request
                ),
                "download_url": reverse(
                    "file-inbox-download", kwargs={"pk": instance.pk}, request=request
                ),
                "ocr_text_stored": ocr_stored,
                "size_bytes": instance.file_size,
            },
            status=status.HTTP_201_CREATED,
        )


def _resource_files() -> str:
    from apps.users import plans as user_plans

    return user_plans.RESOURCE_FILES
