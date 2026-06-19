/**
 * Client-side image compression. The image is drawn to a canvas (optionally
 * downscaled by its longest edge) and re-encoded as JPEG, so the output is
 * smaller and bytes never leave the browser. The source Blob is never modified.
 *
 * This is the image counterpart to the PDF compressor (`lib/pdf/compress.ts`):
 * it gives the common "shrink this photo before uploading" case a real path.
 */

export interface ImageCompressOptions {
  /** JPEG quality, 0..1. Lower → smaller file. */
  quality?: number;
  /**
   * Cap the longest edge (in pixels). Larger images are scaled down keeping
   * aspect ratio; smaller images are left as-is. Omit to keep the resolution.
   */
  maxEdge?: number;
}

/**
 * Scale dimensions so the longest edge is at most `maxEdge`, preserving aspect
 * ratio. Returns the input unchanged when no cap is given or it already fits.
 * Pure (no DOM) so it can be unit-tested.
 */
export function scaledDimensions(
  width: number,
  height: number,
  maxEdge?: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!maxEdge || longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Output filename for a compressed image: keeps the base, forces a .jpg. */
export function imageOutputName(originalName: string): string {
  const base = originalName.replace(/\.[^/.]+$/, "") || "image";
  return `${base}-compressed.jpg`;
}

/**
 * Compress an image Blob to a smaller JPEG. Runs in the browser (uses canvas).
 * Throws a user-facing message if the image can't be decoded or encoded.
 */
export async function compressImage(
  source: Blob,
  opts: ImageCompressOptions = {},
): Promise<Blob> {
  const quality = opts.quality ?? 0.72;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    throw new Error("Couldn't read that image.");
  }
  try {
    const { width, height } = scaledDimensions(
      bitmap.width,
      bitmap.height,
      opts.maxEdge,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't process that image.");
    // Flatten onto white so transparent PNGs don't become black under JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (!blob) throw new Error("Couldn't compress that image.");
    return blob;
  } finally {
    bitmap.close?.();
  }
}
