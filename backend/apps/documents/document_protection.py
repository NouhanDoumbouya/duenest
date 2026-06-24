"""
Redaction + Watermarking V1 — create a safe PROTECTED COPY of an owner's file.

The protected copy is generated SERVER-SIDE so redaction is genuinely secure (not
a removable overlay) and the ORIGINAL file is never modified. Deterministic — no
AI, no automatic PII detection.

Security model:
* **Images** (PNG/JPEG): redaction rectangles are drawn directly into pixel data
  and the watermark is baked into pixels — there is no recoverable layer.
* **PDFs with redactions**: pages are RASTERIZED to images, the rectangles +
  watermark are burned into those images, and the pages are recomposed into a new
  PDF. Underlying text/objects are destroyed — redacted content is NOT extractable.
  (This is the spec's endorsed safe fallback; it sacrifices selectable text.)
* **Watermark-only PDFs**: a light watermark page is overlaid per page, preserving
  selectable text (nothing sensitive is being hidden).

Redaction coordinates are NORMALIZED (0..1 fractions of page width/height), so they
are DPI/point independent. The generated output is stored as a brand-new encrypted,
private ``DocumentFile`` (owner-owned); the original is read-only.
"""

from __future__ import annotations

import io
import os

from django.utils import timezone

from apps.users import plans as user_plans

from .file_encryption import encrypt_bytes_into_record, read_plaintext, sha256_hex
from .models import DocumentFile, ProtectedDocumentCopy
from .plan_usage import enforce_plan_limit, enforce_storage_limit

# Formats that can be protected in V1 (must be previewable/rasterizable).
SUPPORTED_INPUT_TYPES = {"application/pdf", "image/jpeg", "image/png"}
_EXT_BY_TYPE = {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png"}
_PIL_FORMAT = {"image/jpeg": "JPEG", "image/png": "PNG"}
_RASTER_DPI = 150


class ProtectionError(ValueError):
    """A protection-flow error reported to the caller (mapped to a 400)."""


# ---- Validation -------------------------------------------------------------


def _detect_input_type(original_file: DocumentFile) -> str:
    ct = (original_file.content_type or "").lower()
    if ct in SUPPORTED_INPUT_TYPES:
        return ct
    ext = os.path.splitext(original_file.original_filename)[1].lower()
    for mime, e in _EXT_BY_TYPE.items():
        if ext == e or (mime == "image/jpeg" and ext == ".jpeg"):
            return mime
    return ct


def validate_watermark_payload(protection_type: str, payload: dict) -> None:
    if protection_type not in (
        ProtectedDocumentCopy.ProtectionType.WATERMARK,
        ProtectedDocumentCopy.ProtectionType.REDACTION_WATERMARK,
    ):
        return
    if not (payload.get("watermark_text") or "").strip():
        raise ProtectionError("Watermark text is required for a watermark copy.")
    pos = payload.get("watermark_position")
    if pos and pos not in ProtectedDocumentCopy.WatermarkPosition.values:
        raise ProtectionError("Invalid watermark_position.")
    opacity = payload.get("watermark_opacity")
    if opacity is not None and not (0.05 <= float(opacity) <= 1.0):
        raise ProtectionError("watermark_opacity must be between 0.05 and 1.0.")


def validate_redaction_payload(protection_type: str, payload: dict) -> list[dict]:
    redactions = payload.get("redactions") or []
    needs = protection_type in (
        ProtectedDocumentCopy.ProtectionType.REDACTION,
        ProtectedDocumentCopy.ProtectionType.REDACTION_WATERMARK,
    )
    if needs and not redactions:
        raise ProtectionError("At least one redaction rectangle is required.")
    cleaned: list[dict] = []
    for r in redactions:
        if not isinstance(r, dict):
            raise ProtectionError("Each redaction must be an object.")
        try:
            page = int(r.get("page_number", 1))
            x, y = float(r["x"]), float(r["y"])
            w, h = float(r["width"]), float(r["height"])
        except (KeyError, TypeError, ValueError):
            raise ProtectionError(
                "Each redaction needs page_number, x, y, width, height."
            )
        # Normalized fractions only (DPI-independent). Clamp into the page.
        if page < 1 or not (0 <= x <= 1 and 0 <= y <= 1 and 0 < w <= 1 and 0 < h <= 1):
            raise ProtectionError(
                "Redaction coordinates must be normalized fractions (0..1)."
            )
        cleaned.append({
            "page_number": page,
            "x": max(0.0, min(x, 1.0)), "y": max(0.0, min(y, 1.0)),
            "width": min(w, 1.0 - min(x, 1.0)), "height": min(h, 1.0 - min(y, 1.0)),
            "coordinate_space": "normalized",
        })
    return cleaned


# ---- Create + generate ------------------------------------------------------


def create_protected_copy(owner, original_file: DocumentFile, payload: dict) -> ProtectedDocumentCopy:
    """Create a draft protected-copy record. Validates the source format and the
    watermark/redaction payload. The view enforces ``original_file`` ownership."""
    input_type = _detect_input_type(original_file)
    if input_type not in SUPPORTED_INPUT_TYPES:
        raise ProtectionError(
            "Redaction and watermarking are available for PDF, PNG, and JPEG files only."
        )
    protection_type = payload.get("protection_type") or ProtectedDocumentCopy.ProtectionType.REDACTION_WATERMARK
    if protection_type not in ProtectedDocumentCopy.ProtectionType.values:
        raise ProtectionError("Invalid protection_type.")

    validate_watermark_payload(protection_type, payload)
    redactions = validate_redaction_payload(protection_type, payload)

    title = (payload.get("title") or "").strip() or _default_title(original_file)
    return ProtectedDocumentCopy.objects.create(
        owner=owner,
        original_file=original_file,
        original_document=original_file.document if original_file.document_id else None,
        title=title[:255],
        protection_type=protection_type,
        watermark_text=(payload.get("watermark_text") or "").strip()[:120],
        watermark_position=payload.get("watermark_position") or ProtectedDocumentCopy.WatermarkPosition.DIAGONAL,
        watermark_opacity=float(payload.get("watermark_opacity") or 0.25),
        redactions=redactions,
        status=ProtectedDocumentCopy.Status.DRAFT,
    )


def generate_protected_file(copy: ProtectedDocumentCopy) -> ProtectedDocumentCopy:
    """
    Render the protected output and store it as a NEW encrypted private file. The
    original is only ever READ (decrypted in memory), never modified. Enforces the
    owner's file + storage plan limits. On a rendering failure the copy is marked
    ``failed`` with a message (plan-limit errors propagate as 403).
    """
    copy.status = ProtectedDocumentCopy.Status.PROCESSING
    copy.save(update_fields=["status", "updated_at"])

    original = copy.original_file
    input_type = _detect_input_type(original)
    source = read_plaintext(original)  # decrypt original in memory (read-only)

    try:
        if input_type == "application/pdf":
            out_bytes, page_count = _protect_pdf(copy, source)
            out_type = "application/pdf"
        else:
            out_bytes = _protect_image(copy, source, input_type)
            page_count = 1
            out_type = input_type
    except ProtectionError:
        raise
    except Exception as exc:  # noqa: BLE001 — render failure -> failed status, not 500
        copy.status = ProtectedDocumentCopy.Status.FAILED
        copy.error_message = f"Could not generate the protected copy: {exc}"[:500]
        copy.save(update_fields=["status", "error_message", "updated_at"])
        return copy

    owner = copy.owner
    # The protected output counts against the owner's file + storage allowance.
    enforce_plan_limit(owner, user_plans.RESOURCE_FILES)
    enforce_storage_limit(owner, len(out_bytes))

    filename = _output_filename(copy, _EXT_BY_TYPE.get(out_type, ".bin"))
    protected = DocumentFile(
        document=None,
        uploaded_by=owner,
        original_filename=filename[:255],
        content_type=out_type,
        file_size=len(out_bytes),
        checksum=sha256_hex(out_bytes),
    )
    encrypt_bytes_into_record(protected, out_bytes, filename)
    protected.save()

    copy.protected_file = protected
    copy.output_mime_type = out_type
    copy.page_count = page_count
    copy.status = ProtectedDocumentCopy.Status.READY
    copy.error_message = ""
    copy.processed_at = timezone.now()
    copy.save(update_fields=[
        "protected_file", "output_mime_type", "page_count", "status",
        "error_message", "processed_at", "updated_at",
    ])
    return copy


# ---- Image protection (Pillow; pixels burned in) ----------------------------


def _protect_image(copy: ProtectedDocumentCopy, data: bytes, input_type: str) -> bytes:
    from PIL import Image

    img = Image.open(io.BytesIO(data)).convert("RGB")
    width, height = img.size

    if copy.has_redactions:
        _burn_redactions(img, copy.redactions, page_number=1)
    if copy.has_watermark and copy.watermark_text:
        _apply_image_watermark(img, copy)

    out = io.BytesIO()
    img.save(out, format=_PIL_FORMAT.get(input_type, "PNG"))
    return out.getvalue()


def _burn_redactions(img, redactions, *, page_number: int) -> None:
    """Fill the (normalized) rectangles for this page with solid black pixels."""
    from PIL import ImageDraw

    width, height = img.size
    draw = ImageDraw.Draw(img)
    for r in redactions:
        if int(r.get("page_number", 1)) != page_number:
            continue
        x0 = r["x"] * width
        y0 = r["y"] * height
        x1 = (r["x"] + r["width"]) * width
        y1 = (r["y"] + r["height"]) * height
        draw.rectangle([x0, y0, x1, y1], fill=(0, 0, 0))


def _apply_image_watermark(img, copy: ProtectedDocumentCopy) -> None:
    from PIL import Image, ImageDraw, ImageFont

    width, height = img.size
    text = copy.watermark_text
    alpha = int(max(0.05, min(copy.watermark_opacity, 1.0)) * 255)
    font_size = max(18, int(width / max(len(text), 8)))
    try:
        font = ImageFont.load_default(size=font_size)
    except TypeError:  # very old Pillow
        font = ImageFont.load_default()

    layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    bbox = d.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    color = (90, 90, 90, alpha)

    pos = copy.watermark_position
    if pos == ProtectedDocumentCopy.WatermarkPosition.FOOTER:
        d.text(((width - tw) / 2, height - th - 24), text, font=font, fill=color)
    elif pos == ProtectedDocumentCopy.WatermarkPosition.HEADER:
        d.text(((width - tw) / 2, 18), text, font=font, fill=color)
    elif pos == ProtectedDocumentCopy.WatermarkPosition.CENTER:
        d.text(((width - tw) / 2, (height - th) / 2), text, font=font, fill=color)
    else:  # diagonal
        d.text(((width - tw) / 2, (height - th) / 2), text, font=font, fill=color)
        layer = layer.rotate(35, expand=False, center=(width / 2, height / 2))

    img.paste(Image.alpha_composite(img.convert("RGBA"), layer).convert("RGB"), (0, 0))


# ---- PDF protection ---------------------------------------------------------


def _protect_pdf(copy: ProtectedDocumentCopy, data: bytes):
    """Redaction → rasterize+recompose (text destroyed). Watermark-only → overlay
    (text preserved)."""
    if copy.has_redactions:
        return _rasterize_pdf_protect(copy, data)
    return _watermark_pdf_overlay(copy, data)


def _rasterize_pdf_protect(copy: ProtectedDocumentCopy, data: bytes):
    """Flatten every page to an image, burn redactions + watermark, recompose. The
    underlying text is destroyed — redacted content is not extractable."""
    from pdf2image import convert_from_bytes

    pages = convert_from_bytes(data, dpi=_RASTER_DPI)
    if not pages:
        raise ProtectionError("The PDF has no readable pages.")
    out_pages = []
    for i, page in enumerate(pages, start=1):
        page = page.convert("RGB")
        _burn_redactions(page, copy.redactions, page_number=i)
        if copy.has_watermark and copy.watermark_text:
            _apply_image_watermark(page, copy)
        out_pages.append(page)

    buf = io.BytesIO()
    out_pages[0].save(
        buf, format="PDF", save_all=True, append_images=out_pages[1:],
        resolution=_RASTER_DPI,
    )
    return buf.getvalue(), len(out_pages)


def _watermark_pdf_overlay(copy: ProtectedDocumentCopy, data: bytes):
    """Overlay a light watermark on each page (selectable text preserved)."""
    import pypdf

    reader = pypdf.PdfReader(io.BytesIO(data))
    writer = pypdf.PdfWriter()
    cache: dict = {}
    for page in reader.pages:
        if copy.has_watermark and copy.watermark_text:
            w = float(page.mediabox.width)
            h = float(page.mediabox.height)
            key = (round(w), round(h))
            if key not in cache:
                cache[key] = _watermark_pdf_page(w, h, copy)
            page.merge_page(cache[key])
        writer.add_page(page)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue(), len(reader.pages)


def _watermark_pdf_page(width_pt: float, height_pt: float, copy: ProtectedDocumentCopy):
    """A single transparent watermark page (rotated/positioned gray text) as a
    pypdf page object, matching the source page size."""
    import pypdf
    from fpdf import FPDF

    pdf = FPDF(unit="pt", format=(width_pt, height_pt))
    pdf.add_page()
    text = copy.watermark_text
    # Lighter gray reads as a subtle watermark (core fonts have no alpha).
    g = int(90 + (1 - max(0.05, min(copy.watermark_opacity, 1.0))) * 120)
    pdf.set_text_color(g, g, g)
    size = max(18, int(width_pt / max(len(text), 8)))
    pdf.set_font("Helvetica", size=size)
    tw = pdf.get_string_width(text)
    pos = copy.watermark_position

    if pos == ProtectedDocumentCopy.WatermarkPosition.FOOTER:
        pdf.text((width_pt - tw) / 2, height_pt - 24, _latin(text))
    elif pos == ProtectedDocumentCopy.WatermarkPosition.HEADER:
        pdf.text((width_pt - tw) / 2, 30, _latin(text))
    elif pos == ProtectedDocumentCopy.WatermarkPosition.CENTER:
        pdf.text((width_pt - tw) / 2, height_pt / 2, _latin(text))
    else:  # diagonal
        with pdf.rotation(35, x=width_pt / 2, y=height_pt / 2):
            pdf.text((width_pt - tw) / 2, height_pt / 2, _latin(text))

    out = bytes(pdf.output())
    return pypdf.PdfReader(io.BytesIO(out)).pages[0]


# ---- Room integration + payload --------------------------------------------


def add_protected_copy_to_room(copy: ProtectedDocumentCopy, room, owner):
    """Add the protected output (never the original) to an owner's Sharing Room."""
    from .sharing_rooms import add_room_item

    if copy.status != ProtectedDocumentCopy.Status.READY or copy.protected_file_id is None:
        raise ProtectionError("Generate the protected copy before adding it to a room.")
    if room.owner_id != owner.id:
        raise ProtectionError("That room is not yours.")
    return add_room_item(room, owner, {
        "item_type": "file",
        "file": copy.protected_file_id,
        "title": copy.title,
    })


def archive_protected_copy(copy: ProtectedDocumentCopy, owner) -> ProtectedDocumentCopy:
    if copy.status != ProtectedDocumentCopy.Status.ARCHIVED:
        copy.status = ProtectedDocumentCopy.Status.ARCHIVED
        copy.save(update_fields=["status", "updated_at"])
    return copy


def build_protected_copy_payload(copy: ProtectedDocumentCopy) -> dict:
    """Owner-facing payload. The protected file is referenced by the PRIVATE owner
    download route only — never a raw storage URL."""
    protected = None
    if copy.protected_file_id:
        f = copy.protected_file
        protected = {
            "id": f.id,
            "original_filename": f.original_filename,
            "content_type": f.content_type,
            "file_size": f.file_size,
            "download_url": f"/api/v1/files/{f.id}/download/",
        }
    return {
        "id": copy.id,
        "title": copy.title,
        "protection_type": copy.protection_type,
        "status": copy.status,
        "original_file": copy.original_file_id,
        "original_document": copy.original_document_id,
        "protected_file": copy.protected_file_id,
        "protected_file_info": protected,
        "watermark_text": copy.watermark_text,
        "watermark_position": copy.watermark_position,
        "watermark_opacity": copy.watermark_opacity,
        "redactions": copy.redactions,
        "output_mime_type": copy.output_mime_type,
        "page_count": copy.page_count,
        "error_message": copy.error_message,
        "created_at": copy.created_at.isoformat(),
        "updated_at": copy.updated_at.isoformat(),
        "processed_at": copy.processed_at.isoformat() if copy.processed_at else None,
    }


# ---- Helpers ----------------------------------------------------------------


def _default_title(original_file: DocumentFile) -> str:
    stem = os.path.splitext(original_file.original_filename)[0] or "Document"
    return f"{stem} (protected)"


def _output_filename(copy: ProtectedDocumentCopy, ext: str) -> str:
    base = "".join(c if (c.isalnum() or c in " -_") else "" for c in copy.title).strip()
    base = " ".join(base.split())[:80] or "protected"
    if not base.lower().endswith("protected"):
        base = f"{base} (protected)"
    return f"{base}{ext}"


def _latin(text: str) -> str:
    # Core PDF fonts are latin-1; replace unsupported glyphs gracefully.
    return str(text).encode("latin-1", "replace").decode("latin-1")
