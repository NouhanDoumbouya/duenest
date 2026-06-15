export interface Point {
  x: number;
  y: number;
}

/** Four document corners, clockwise from top-left, in image pixel space. */
export type Quad = [Point, Point, Point, Point];

export type DetectionState = "searching" | "detected" | "hold-steady" | "captured";

export type EnhanceMode = "original" | "clean" | "high-contrast";

export interface ScannerCapabilities {
  camera: boolean;
  torch: boolean;
  vibration: boolean;
  speech: boolean;
  orientation: boolean;
  webShare: boolean;
  serviceWorker: boolean;
  backgroundSync: boolean;
  secureContext: boolean;
}

export interface QueuedScan {
  id: string;
  createdAt: number;
  sizeBytes: number;
  filename: string;
  status: "queued" | "uploading" | "failed";
  /** AES-GCM ciphertext of the PDF when encryption is available, else raw. */
  encrypted: boolean;
  iv: number[] | null;
  blob: Blob;
  attempts: number;
  lastError?: string;
}

export interface UploadResult {
  status: string;
  document_id: number;
  file_uuid: string;
  preview_url: string;
  download_url: string;
  ocr_text_stored: boolean;
  size_bytes: number;
}

export type TiltState = "level" | "slight" | "tilted" | "unavailable";
