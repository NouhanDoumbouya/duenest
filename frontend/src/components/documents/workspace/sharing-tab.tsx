"use client";

import { useEffect, useState } from "react";
import { FileText, Link2, Loader2, Share2 } from "lucide-react";

import { DocumentFileShareDialog } from "@/components/documents/document-file-share-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { ApiError } from "@/lib/api";
import { formatFileSize, getDocumentFiles } from "@/lib/document-files";
import type { DocumentFile } from "@/types/document-files";

export function SharingTab({ documentId }: { documentId: number }) {
  const [files, setFiles] = useState<DocumentFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sharingFile, setSharingFile] = useState<DocumentFile | null>(null);

  useEffect(() => {
    let active = true;
    getDocumentFiles(documentId)
      .then((page) => active && setFiles(page.results))
      .catch((err) => {
        if (!active) return;
        setFiles([]);
        setError(err instanceof ApiError ? err.message : "Unable to load files.");
      });
    return () => {
      active = false;
    };
  }, [documentId]);

  return (
    <SectionCard
      title="Sharing & access control"
      description="Create secure, time-limited links to individual files — with optional access codes and one-click revocation."
    >
      {error && (
        <p
          className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {files === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading files…</span>
        </div>
      ) : files.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="Nothing to share yet"
          description="Sharing works per file. Upload a scan or copy in the Files tab, then create a secure link here."
        />
      ) : (
        <ul className="divide-y divide-border">
          {files.map((file) => (
            <li
              key={file.id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {file.original_filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.file_size)}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSharingFile(file)}
              >
                <Share2 className="size-4" />
                Manage sharing
              </Button>
            </li>
          ))}
        </ul>
      )}

      {sharingFile && (
        <DocumentFileShareDialog
          file={sharingFile}
          onClose={() => setSharingFile(null)}
        />
      )}
    </SectionCard>
  );
}
