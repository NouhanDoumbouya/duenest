// Types for the document files API
// (GET/POST/DELETE /api/v1/documents/:document_id/files/).
// Mirrors the backend DocumentFileSerializer.

export interface DocumentFile {
  id: number;
  document: number;
  uploaded_by: number;
  original_filename: string;
  content_type: string;
  file_size: number;
  checksum: string;
  download_url: string | null;
  created_at: string;
  updated_at: string;
}
