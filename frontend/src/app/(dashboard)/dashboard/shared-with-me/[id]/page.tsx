"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Download,
  EyeOff,
  FileText,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  FilePreviewDialog,
  type FilePreviewState,
} from "@/components/ui/file-preview-dialog";
import { PageContainer } from "@/components/ui/page-container";
import { InlineAlert } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { formatFileSize } from "@/lib/document-files";
import {
  downloadQuickShareFile,
  getSharedWithMe,
  getQuickShareFilePreviewBlob,
  saveQuickShareCopy,
} from "@/lib/quick-share";
import { CountdownPill } from "@/components/quick-share/shared";
import type { QuickShareFile, SharedWithMeItem } from "@/types/quick-share";

export default function SharedWithMeDetailPage() {
  const params = useParams<{ id: string }>();
  const claimId = Number(params.id);

  const [item, setItem] = useState<SharedWithMeItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyFileId, setBusyFileId] = useState<number | null>(null);
  const [savedFileIds, setSavedFileIds] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  const [previewFile, setPreviewFile] = useState<QuickShareFile | null>(null);
  const [previewFetch, setPreviewFetch] = useState<{
    url: string | null;
    loading: boolean;
    error: string | null;
  }>({ url: null, loading: false, error: null });
  const previewUrlRef = useRef<string | null>(null);

  function revokePreviewUrl() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }
  useEffect(() => () => revokePreviewUrl(), []);

  useEffect(() => {
    let active = true;
    getSharedWithMe(claimId)
      .then((data) => active && setItem(data))
      .catch(
        (err) =>
          active &&
          setError(
            err instanceof ApiError ? err.message : "Could not load this share.",
          ),
      );
    return () => {
      active = false;
    };
  }, [claimId]);

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  }

  async function handlePreview(file: QuickShareFile) {
    if (!item) return;
    setActionError(null);
    revokePreviewUrl();
    setPreviewFile(file);
    setPreviewFetch({ url: null, loading: true, error: null });
    try {
      const blob = await getQuickShareFilePreviewBlob(item.token, file.file_id);
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewFetch({ url, loading: false, error: null });
    } catch (err) {
      setPreviewFetch({
        url: null,
        loading: false,
        error:
          err instanceof ApiError ? err.message : "Could not preview this file.",
      });
    }
  }

  function closePreview() {
    revokePreviewUrl();
    setPreviewFile(null);
    setPreviewFetch({ url: null, loading: false, error: null });
  }

  async function handleDownload(file: QuickShareFile) {
    if (!item) return;
    setActionError(null);
    setBusyFileId(file.file_id);
    try {
      await downloadQuickShareFile(item.token, file.file_id, file.name);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not download this file.",
      );
    } finally {
      setBusyFileId(null);
    }
  }

  async function handleSaveCopy(file: QuickShareFile) {
    if (!item) return;
    setActionError(null);
    setBusyFileId(file.file_id);
    try {
      await saveQuickShareCopy(item.token, file.file_id);
      setSavedFileIds((prev) => new Set(prev).add(file.file_id));
      flash("Saved to your vault.");
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not save a copy.",
      );
    } finally {
      setBusyFileId(null);
    }
  }

  const preview: FilePreviewState | null = previewFile
    ? {
        fileName: previewFile.name,
        contentType: previewFile.content_type,
        url: previewFetch.url,
        loading: previewFetch.loading,
        error: previewFetch.error,
        onDownload: item?.download_allowed
          ? () => handleDownload(previewFile)
          : undefined,
        downloading: busyFileId === previewFile.file_id,
      }
    : null;

  return (
    <PageContainer width="narrow">
      <FilePreviewDialog preview={preview} onClose={closePreview} />
      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-floating">
          {toast}
        </div>
      )}

      <Link
        href="/dashboard/shared-with-me"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Shared with me
      </Link>

      {error ? (
        <InlineAlert tone="danger">{error}</InlineAlert>
      ) : !item ? (
        <Skeleton className="h-48 w-full rounded-2xl" />
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-floating">
            <div className="flex items-center gap-3">
              <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {item.sender_initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-base font-semibold">
                  {item.session_title}
                </p>
                <p className="text-sm text-muted-foreground">
                  Shared by {item.sender_name}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {item.is_active ? (
                <CountdownPill expiresAt={item.expires_at} />
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {item.session_state === "revoked"
                    ? "Access revoked"
                    : item.session_state === "expired"
                      ? "Expired"
                      : "No longer active"}
                </span>
              )}
            </div>
            {!item.download_allowed && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
                <EyeOff className="size-3.5" />
                View only · Download disabled by the sender.
              </p>
            )}
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 text-brand-success" />
              The sender controls this access and can revoke it anytime.
            </p>
          </div>

          {actionError && (
            <p className="text-sm text-destructive" role="alert">
              {actionError}
            </p>
          )}

          {item.save_copy_allowed && (
            <p className="rounded-lg border border-brand-amber/30 bg-brand-amber/5 px-3 py-2 text-xs text-brand-amber">
              Saving a copy creates your own copy. The sender will no longer
              control that saved copy.
            </p>
          )}

          {item.is_active && item.files && item.files.length > 0 ? (
            <div
              className="rounded-2xl border border-border bg-card p-2 shadow-card"
              onContextMenu={(e) => e.preventDefault()}
            >
              <ul className="divide-y divide-border">
                {item.files.map((file) => (
                  <li
                    key={file.file_id}
                    className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{file.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {file.source} · {formatFileSize(file.file_size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {file.is_previewable && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreview(file)}
                        >
                          Preview
                        </Button>
                      )}
                      {item.download_allowed && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownload(file)}
                          disabled={busyFileId === file.file_id}
                        >
                          {busyFileId === file.file_id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Download className="size-4" />
                          )}
                          Download
                        </Button>
                      )}
                      {item.save_copy_allowed && (
                        <Button
                          size="sm"
                          onClick={() => handleSaveCopy(file)}
                          disabled={
                            busyFileId === file.file_id ||
                            savedFileIds.has(file.file_id)
                          }
                        >
                          {savedFileIds.has(file.file_id) ? (
                            <Check className="size-4" />
                          ) : (
                            <Save className="size-4" />
                          )}
                          {savedFileIds.has(file.file_id) ? "Saved" : "Save copy"}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              These files are no longer available.
            </p>
          )}
        </div>
      )}
    </PageContainer>
  );
}
