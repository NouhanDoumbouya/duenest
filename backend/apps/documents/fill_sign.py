"""
Fill & Sign service: prepare a filled / signed **copy** of a PDF document.

Honest scope:
  * Real server-side overlay + flatten onto the original PDF using pypdf + fpdf2
    (already in requirements). The prepared copy is a NEW encrypted DocumentFile;
    the original is never modified.
  * PDF only. Image-only scans are rejected with a clear message (no fake fill).
  * This produces a *prepared copy*, not a legally binding e-signature. The
    accompanying DocumentSignatureRecord is an audit trail, not legal certification.

Coordinates in the annotation spec are normalised (0..1) from the TOP-LEFT of the
page, so the frontend can place marks resolution-independently.
"""

from __future__ import annotations

import base64
import binascii
import logging
from io import BytesIO

from django.db import transaction
from django.utils import timezone

from .file_encryption import encrypt_bytes_into_record, read_plaintext, sha256_hex
from .models import DocumentFile, DocumentSignatureRecord, PreparedDocument

logger = logging.getLogger(__name__)

# Annotation types the overlay renderer understands.
TEXT_TYPES = {"text", "date", "initials"}
ALL_TYPES = TEXT_TYPES | {"check", "signature"}


class FillSignError(Exception):
    """Raised for unsupported input or invalid annotations (mapped to HTTP 400/422)."""


def _is_pdf(source_file: DocumentFile, data: bytes) -> bool:
    ct = (source_file.content_type or "").lower()
    name = (source_file.original_filename or "").lower()
    return ct == "application/pdf" or name.endswith(".pdf") or data[:5] == b"%PDF-"


def _decode_image(value: str) -> bytes:
    """Decode a base64 (optionally data-URL) PNG/JPEG into raw bytes."""
    if "," in value and value.strip().lower().startswith("data:"):
        value = value.split(",", 1)[1]
    try:
        return base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise FillSignError("Invalid signature image.") from exc


def _build_overlay(width_pt: float, height_pt: float, items: list[dict]) -> bytes:
    """Render the given annotations onto a transparent PDF page of the exact page
    size, returning the overlay PDF bytes (one page)."""
    from fpdf import FPDF  # lazy: keeps import cost off the hot path

    pdf = FPDF(unit="pt", format=(width_pt, height_pt))
    pdf.set_auto_page_break(False)
    pdf.add_page()
    pdf.set_font("Helvetica", size=12)

    for item in items:
        kind = item.get("type")
        # Normalised top-left -> absolute points (fpdf2 origin is top-left too).
        x = float(item.get("x", 0)) * width_pt
        y = float(item.get("y", 0)) * height_pt

        if kind in TEXT_TYPES:
            text = str(item.get("value", ""))
            if not text:
                continue
            size = float(item.get("font_size", 12))
            pdf.set_font("Helvetica", size=size)
            pdf.set_text_color(15, 23, 42)  # Midnight Navy, like the app ink
            # fpdf2 .text() places the baseline at y; nudge down so the mark sits
            # at the requested top edge.
            pdf.text(x, y + size, text)
        elif kind == "check":
            size = float(item.get("font_size", 14))
            pdf.set_draw_color(15, 23, 42)
            pdf.set_line_width(max(1.0, size * 0.12))
            pdf.line(x, y + size * 0.55, x + size * 0.35, y + size)
            pdf.line(x + size * 0.35, y + size, x + size, y)
        elif kind == "signature":
            raw = item.get("image")
            if not raw:
                continue
            from PIL import Image  # lazy

            try:
                img = Image.open(BytesIO(_decode_image(str(raw))))
                img.load()
            except FillSignError:
                raise
            except Exception as exc:  # noqa: BLE001 - any decode failure is a 400
                raise FillSignError("Could not read the signature image.") from exc
            w = float(item.get("width", 0.2)) * width_pt
            h = float(item.get("height", 0.08)) * height_pt
            pdf.image(img, x=x, y=y, w=w, h=h)
        else:
            raise FillSignError(f"Unsupported annotation type: {kind!r}")

    return bytes(pdf.output())


def _flatten(original_pdf: bytes, annotations: list[dict]) -> bytes:
    """Merge per-page overlays onto the original PDF and return flattened bytes."""
    from pypdf import PdfReader, PdfWriter  # lazy

    try:
        reader = PdfReader(BytesIO(original_pdf))
    except Exception as exc:  # noqa: BLE001
        raise FillSignError("This PDF could not be opened.") from exc

    page_count = len(reader.pages)
    by_page: dict[int, list[dict]] = {}
    for ann in annotations:
        page = int(ann.get("page", 0))
        if page < 0 or page >= page_count:
            raise FillSignError(f"Annotation references page {page + 1}, which doesn't exist.")
        if ann.get("type") not in ALL_TYPES:
            raise FillSignError(f"Unsupported annotation type: {ann.get('type')!r}")
        by_page.setdefault(page, []).append(ann)

    writer = PdfWriter()
    for index, page in enumerate(reader.pages):
        items = by_page.get(index)
        if items:
            box = page.mediabox
            overlay_bytes = _build_overlay(float(box.width), float(box.height), items)
            overlay_page = PdfReader(BytesIO(overlay_bytes)).pages[0]
            page.merge_page(overlay_page)
        writer.add_page(page)

    out = BytesIO()
    writer.write(out)
    return out.getvalue()


@transaction.atomic
def prepare_signed_copy(
    *,
    user,
    source_file: DocumentFile,
    annotations: list[dict],
    signer_name: str = "",
    signer_email: str = "",
    signature_method: str = "none",
):
    """
    Build a filled/signed copy of ``source_file`` and persist it as a new encrypted
    DocumentFile, plus PreparedDocument + DocumentSignatureRecord audit rows.

    Returns ``(PreparedDocument, DocumentSignatureRecord)``. The original is never
    modified. Raises FillSignError for unsupported input.
    """
    if not isinstance(annotations, list) or not annotations:
        raise FillSignError("Add at least one mark before preparing the copy.")

    original_plaintext = read_plaintext(source_file)
    if not _is_pdf(source_file, original_plaintext):
        raise FillSignError(
            "Fill & Sign currently supports PDF files only. "
            "Convert image scans to PDF first."
        )

    prepared_bytes = _flatten(original_plaintext, annotations)

    original_hash = sha256_hex(original_plaintext)
    prepared_hash = sha256_hex(prepared_bytes)

    base_name = (source_file.original_filename or "document.pdf").rsplit(".", 1)[0]
    prepared_name = f"{base_name} (signed copy).pdf"[:255]

    prepared_file = DocumentFile(
        document=source_file.document,
        uploaded_by=user,
        original_filename=prepared_name,
        content_type="application/pdf",
        file_size=len(prepared_bytes),
        checksum=prepared_hash,
    )
    encrypt_bytes_into_record(prepared_file, prepared_bytes, prepared_name)
    prepared_file.save()

    prepared = PreparedDocument.objects.create(
        owner=user,
        document=source_file.document,
        original_file=source_file,
        prepared_file=prepared_file,
        preparation_type=PreparedDocument.PreparationType.FILL_SIGN,
        annotations=annotations,
    )

    valid_methods = {c.value for c in DocumentSignatureRecord.SignatureMethod}
    method = signature_method if signature_method in valid_methods else "none"
    record = DocumentSignatureRecord.objects.create(
        owner=user,
        prepared=prepared,
        signer_name=signer_name.strip()[:200],
        signer_email=signer_email.strip()[:254],
        signature_method=method,
        signed_at=timezone.now(),
        original_file_hash=original_hash,
        prepared_file_hash=prepared_hash,
        audit_payload={
            "annotation_count": len(annotations),
            "original_filename": source_file.original_filename,
            "prepared_filename": prepared_name,
            "original_file_id": source_file.id,
        },
    )

    logger.info(
        "fill_sign_prepared owner=%s source_file=%s prepared_file=%s method=%s anns=%d",
        user.id,
        source_file.id,
        prepared_file.id,
        method,
        len(annotations),
    )
    return prepared, record
