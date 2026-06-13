"use client";

import { useRef, useState } from "react";
import { Camera, CheckCircle2, FileUp, Paperclip, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  ACCEPT_ATTR,
  SCAN_ACCEPT_ATTR,
  uploadDocumentFile,
  validateFile,
} from "@/lib/document-files";
import type { DocumentFile } from "@/types/document-files";

export function DocumentFileUploader({
  documentId,
  onUploaded,
}: {
  documentId: number;
  onUploaded: (file: DocumentFile) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function handleSelect(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    setSuccess(null);
    const selected = event.target.files?.[0] ?? null;
    if (selected) {
      const validationError = validateFile(selected);
      if (validationError) {
        setError(validationError);
        setFile(null);
        return;
      }
    }
    setFile(selected);
  }

  async function handleUpload() {
    if (!file) return;
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      const uploaded = await uploadDocumentFile(documentId, file);
      onUploaded(uploaded);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      setSuccess(`“${uploaded.original_filename}” uploaded.`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <UploadCloud className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {file ? "Ready to upload" : "Upload or scan"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {file ? (
                <span className="inline-flex items-center gap-1">
                  <Paperclip className="size-3" />
                  {file.name}
                </span>
              ) : (
                "PDF, JPG, PNG, DOC, DOCX · up to 10 MB"
              )}
            </p>
            {!file && (
              <p className="mt-1 text-xs text-muted-foreground">
                Camera scans upload as image files. Cropping and OCR review are
                manual in this beta.
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            onChange={handleSelect}
            disabled={uploading}
            className="hidden"
            id={`document-file-input-${documentId}`}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept={SCAN_ACCEPT_ATTR}
            capture="environment"
            onChange={handleSelect}
            disabled={uploading}
            className="hidden"
            id={`document-camera-input-${documentId}`}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            <FileUp className="size-4" />
            Choose
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => cameraInputRef.current?.click()}
            disabled={uploading}
          >
            <Camera className="size-4" />
            Scan
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>

      {error && (
        <p
          className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-brand-success/10 px-3 py-2 text-sm text-brand-success">
          <CheckCircle2 className="size-4 shrink-0" />
          {success}
        </p>
      )}
    </div>
  );
}
