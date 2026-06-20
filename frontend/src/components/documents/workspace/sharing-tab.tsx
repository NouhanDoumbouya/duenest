"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, FileText, Link2, Loader2, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { ApiError } from "@/lib/api";
import {
  formatFileSize,
  getDocumentFiles,
  listDocumentFileShareLinks,
  revokeDocumentFileShareLink,
} from "@/lib/document-files";
import { fileToSelected, setSharePrefill } from "@/lib/quick-share-prefill";
import type { DocumentFile, DocumentFileShareLink } from "@/types/document-files";

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
      description="Share a file through the secure Quick Share wizard. You can also review and revoke any links created before sharing moved to Quick Share."
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

      {files && files.length > 0 && (
        <LegacyShareLinks documentId={documentId} files={files} />
      )}
    </SectionCard>
  );
}

/**
 * Manage single-file links created before sharing moved to the Quick Share
 * engine. Opt-in (no requests until opened), so the common case — no legacy
 * links — costs nothing. Lists each file's active links with a Revoke action;
 * new shares are created through the wizard, so there is no create here.
 */
function LegacyShareLinks({
  documentId,
  files,
}: {
  documentId: number;
  files: DocumentFile[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<{ file: DocumentFile; link: DocumentFileShareLink }[]>(
    [],
  );
  const [revokingId, setRevokingId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const lists = await Promise.all(
        files.map((file) =>
          listDocumentFileShareLinks(documentId, file.id).then((links) =>
            links.map((link) => ({ file, link })),
          ),
        ),
      );
      // Only links the owner can still act on (already-revoked ones are noise).
      setRows(lists.flat().filter((row) => row.link.revoked_at === null));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to load existing links.",
      );
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && rows.length === 0 && !loading) void load();
  }

  async function revoke(file: DocumentFile, link: DocumentFileShareLink) {
    setRevokingId(link.id);
    setError(null);
    try {
      await revokeDocumentFileShareLink(documentId, file.id, link.id);
      setRows((prev) => prev.filter((row) => row.link.id !== link.id));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not revoke that link.",
      );
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <Button variant="ghost" size="sm" onClick={toggle} aria-expanded={open}>
        <Link2 className="size-4" />
        {open ? "Hide existing links" : "Manage existing links"}
      </Button>

      {open && (
        <div className="mt-3">
          {error && (
            <p
              className="mb-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span>Loading existing links…</span>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              No active share links. New shares are created in the Quick Share
              wizard.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map(({ file, link }) => (
                <li
                  key={link.id}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {link.label || file.original_filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {link.download_allowed ? "Download allowed" : "View only"}
                      {" · "}
                      {link.access_code_required ? "Access code · " : ""}
                      Expires {new Date(link.expires_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => revoke(file, link)}
                    disabled={revokingId === link.id}
                  >
                    {revokingId === link.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Ban className="size-4" />
                    )}
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
