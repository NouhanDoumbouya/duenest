/**
 * Shared "File tools" registry. One place that describes which transforms apply
 * to a file, and thin runners that wrap the existing client-side engines so the
 * Inbox, document detail, and scanner all behave identically.
 *
 * Every runner returns a NEW Blob; the source file is never modified. All work
 * happens in the browser (bytes never leave the device).
 */
import { compressPdf } from "@/lib/pdf/compress";
import { extractPages } from "@/lib/pdf/extract";
import { rasterizePdf } from "@/lib/pdf/rasterize";
import { generatePdfBlob } from "@/lib/scanner/pdf";
import { applyRedactions, type RedactionRect } from "@/lib/scanner/redaction";
import { compressImage, imageOutputName } from "@/lib/image/compress";
import type { DocumentFile } from "@/types/document-files";

export type ToolId = "compress" | "extract" | "redact";

export interface ToolDescriptor {
  id: ToolId;
  /** Verb shown to the user. */
  label: string;
  /** One-line description for the tool picker. */
  description: string;
  /** Feature flag that gates this tool (filtered by the caller via useFeature). */
  flag: string;
}

const ALL_TOOLS: ToolDescriptor[] = [
  {
    id: "compress",
    label: "Compress",
    description: "Make a smaller copy — great for upload portals.",
    flag: "document_compress",
  },
  {
    id: "extract",
    label: "Export pages",
    description: "Save selected pages as a new PDF.",
    flag: "document_page_extract",
  },
  {
    id: "redact",
    label: "Redact",
    description: "Permanently black out areas, then save a copy.",
    flag: "document_redaction",
  },
];

export function isPdf(file: Pick<DocumentFile, "content_type">): boolean {
  return file.content_type === "application/pdf";
}

export function isImage(file: Pick<DocumentFile, "content_type">): boolean {
  return file.content_type.startsWith("image/");
}

/**
 * Which tools apply to a file by content type (before feature-flag filtering):
 * - compress: PDFs and images
 * - export pages / redact: PDFs only
 * The caller still hides any tool whose `flag` is disabled.
 */
export function toolsForFile(
  file: Pick<DocumentFile, "content_type">,
): ToolDescriptor[] {
  return ALL_TOOLS.filter((tool) => {
    if (tool.id === "compress") return isPdf(file) || isImage(file);
    return isPdf(file);
  });
}

/** Build a derived filename: `<base>-<suffix>.<ext>`. */
export function derivedName(
  originalName: string,
  suffix: string,
  ext = "pdf",
): string {
  const base = originalName.replace(/\.[^/.]+$/, "") || "file";
  return `${base}-${suffix}.${ext}`;
}

export interface CompressResult {
  blob: Blob;
  name: string;
}

/**
 * Compress a file. PDFs are rasterized + re-encoded (`compressPdf`); images are
 * re-encoded as JPEG (`compressImage`). Returns the new blob and a suggested
 * filename. Callers should compare sizes and avoid keeping a copy that isn't
 * actually smaller (text PDFs can grow).
 */
export async function runCompress(
  file: Pick<DocumentFile, "content_type" | "original_filename">,
  source: Blob,
  quality: number,
): Promise<CompressResult> {
  if (isImage(file)) {
    const blob = await compressImage(source, { quality });
    return { blob, name: imageOutputName(file.original_filename) };
  }
  const buffer = await source.arrayBuffer();
  const blob = await compressPdf(buffer, quality);
  return { blob, name: derivedName(file.original_filename, "compressed") };
}

/** Export selected 0-based page indices from a PDF into a new PDF blob. */
export async function runExtract(
  file: Pick<DocumentFile, "original_filename">,
  source: Blob,
  indices: number[],
): Promise<CompressResult> {
  const buffer = await source.arrayBuffer();
  const bytes = await extractPages(buffer, indices);
  const copy = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([copy], { type: "application/pdf" });
  return { blob, name: derivedName(file.original_filename, "pages") };
}

/**
 * Rasterize a PDF into page canvases for the redaction editor. Throws if the
 * PDF has no pages. Rasterizing first is what makes burn-in redaction safe on
 * arbitrary PDFs (any text layer is flattened to pixels).
 */
export async function rasterizeForRedaction(
  source: Blob,
): Promise<HTMLCanvasElement[]> {
  const buffer = await source.arrayBuffer();
  const pages = await rasterizePdf(buffer);
  if (pages.length === 0) throw new Error("That PDF has no pages.");
  return pages;
}

/** Burn opaque rectangles into rasterized pages and rebuild an image-only PDF. */
export async function runRedact(
  file: Pick<DocumentFile, "original_filename">,
  pages: HTMLCanvasElement[],
  rectsPerPage: RedactionRect[][],
): Promise<CompressResult> {
  const burned = pages.map((canvas, i) =>
    applyRedactions(canvas, rectsPerPage[i] ?? []),
  );
  const blob = await generatePdfBlob(burned, { quality: 0.85 });
  return { blob, name: derivedName(file.original_filename, "redacted") };
}
