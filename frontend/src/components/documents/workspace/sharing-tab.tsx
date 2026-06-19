"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Link2, Loader2, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { ApiError } from "@/lib/api";
import { formatFileSize, getDocumentFiles } from "@/lib/document-files";
import { fileToSelected, setSharePrefill } from "@/lib/quick-share-prefill";
import type { DocumentFile } from "@/types/document-files";

export function SharingTab({ documentId }: { documentId: number }) {
  const router = useRouter();
  const [files, setFiles] = useState<DocumentFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Unified on the Quick Share engine: sharing a file seeds the wizard and opens
  // it, so this tab uses the same secure-share flow as everywhere else.
  function handleShare(file: DocumentFile) {
    setSharePrefill({ files: [fileToSelected(file)] });
    router.push("/dashboard/quick-share/new");
  }

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
                onClick={() => handleShare(file)}
              >
                <Share2 className="size-4" />
                Share
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
