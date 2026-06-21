// Types for Fill & Sign — preparing a filled/signed copy of a PDF.
// Coordinates are normalised (0..1) from the page's TOP-LEFT, so marks place
// resolution-independently regardless of how the page is rendered.

import type { DocumentFile } from "@/types/document-files";

export type AnnotationType = "text" | "date" | "initials" | "check" | "signature";

export interface FillSignAnnotation {
  /** 0-based page index. */
  page: number;
  /** Normalised top-left position (0..1). */
  x: number;
  y: number;
  type: AnnotationType;
  /** For text / date / initials. */
  value?: string;
  /** Point size for text marks. */
  font_size?: number;
  /** Base64 (or data-URL) PNG for a signature mark. */
  image?: string;
  /** Normalised box size (0..1) for a signature image. */
  width?: number;
  height?: number;
}

export type SignatureMethod = "drawn" | "typed" | "uploaded" | "none";

export interface SignatureRecord {
  id: number;
  signer_name: string;
  signer_email: string;
  signature_method: SignatureMethod;
  signed_at: string;
  original_file_hash: string;
  prepared_file_hash: string;
  audit_payload: Record<string, unknown>;
  created_at: string;
}

export interface PreparedDocument {
  id: number;
  document: number | null;
  original_file: number;
  prepared_file: DocumentFile;
  preparation_type: "fill_sign";
  annotations: FillSignAnnotation[];
  signature_records: SignatureRecord[];
  created_at: string;
}

export interface FillSignPayload {
  annotations: FillSignAnnotation[];
  signer_name?: string;
  signer_email?: string;
  signature_method?: SignatureMethod;
}
