"""Profile-avatar image processing.

Validates, normalizes, and inline-encodes a user-uploaded picture as a small
base64 data URL. Kept separate from the view so the (CPU-bound, security-
sensitive) image handling is unit-testable in isolation.

Re-encoding every upload through Pillow strips EXIF/metadata and guarantees a
clean raster image — an uploaded SVG or a payload disguised as an image can
never round-trip into the stored data URL.
"""

from __future__ import annotations

import base64
import io

from PIL import Image, ImageOps, UnidentifiedImageError

# Largest accepted upload (bytes) before processing — generous, but rejects
# abuse. The stored result is far smaller after downscale + re-encode.
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
# Longest edge of the stored avatar.
MAX_EDGE = 256
JPEG_QUALITY = 82


class AvatarProcessingError(Exception):
    """Raised when an upload isn't a usable image."""


def build_avatar_data_url(raw: bytes) -> str:
    """Return a `data:image/jpeg;base64,...` URL for a small, normalized avatar.

    Raises AvatarProcessingError for empty, oversized, or unreadable input.
    """
    if not raw:
        raise AvatarProcessingError("No image data received.")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise AvatarProcessingError("Image is too large (max 8 MB).")

    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise AvatarProcessingError("That file isn't a readable image.") from exc

    # Respect EXIF orientation, flatten onto an RGB canvas (keeps the payload
    # small and avoids alpha edge cases), then downscale to a square-ish thumb.
    image = ImageOps.exif_transpose(image)
    image = image.convert("RGB")
    image.thumbnail((MAX_EDGE, MAX_EDGE))

    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"
