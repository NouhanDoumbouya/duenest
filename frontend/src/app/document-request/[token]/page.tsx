"use client";

// PUBLIC document-upload page. No auth, no sidebar, no owner data. An external
// recipient lands here from a secure link and uploads ONE document. The page
// never shows any file download URL or anything about the owner's vault.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  FileUp,
  Loader2,
  Lock,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  getPublicDocumentRequest,
  publicStateMessage,
  uploadPublicDocumentRequest,
} from "@/lib/document-requests";
import { ACCEPT_ATTR, formatFileSize, validateFile } from "@/lib/document-files";
import type { PublicDocumentRequest } from "@/types/document-requests";

function formatDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PublicDocumentRequestPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [meta, setMeta] = useState<PublicDocumentRequest | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "not_found">(
    "loading",
  );

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    getPublicDocumentRequest(token)
      .then((data) => {
        if (!active) return;
        setMeta(data);
        setLoadState("ready");
      })
      .catch(() => {
        // A 404 (or any failure) becomes the calm "not found" state — we never
        // leak whether a token exists.
        if (!active) return;
        setLoadState("not_found");
      });
    return () => {
      active = false;
    };
  }, [token]);

  function chooseFile(next: File | null) {
    setUploadError(null);
    if (!next) {
      setFile(null);
      setFileError(null);
      return;
    }
    const problem = validateFile(next);
    setFileError(problem);
    setFile(problem ? null : next);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadPercent(0);
    try {
      await uploadPublicDocumentRequest(token, file, setUploadPercent);
      setDone(true);
    } catch (err) {
      setUploadError(
        err instanceof ApiError
          ? err.message
          : "We couldn't upload your file. Please try again.",
      );
    } finally {
      setUploading(false);
      setUploadPercent(null);
    }
  }

  const dueLabel = formatDate(meta?.due_date ?? null);
  const expiresLabel = formatDate(meta?.expires_at ?? null);
  // `state` is the source of truth for whether uploads are possible; fall back
  // to `can_upload` for the open path.
  const canUpload = meta?.state === "ok" && meta?.can_upload;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-muted/40 px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <LogoMark size="sm" />
        <span className="font-heading text-lg font-semibold">CertaNest</span>
      </div>

      <div className="w-full max-w-lg">
        {loadState === "loading" ? (
          <Card>
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Loading request…</span>
            </div>
          </Card>
        ) : loadState === "not_found" || !meta ? (
          <BlockedCard state="not_found" />
        ) : done ? (
          <Card>
            <div className="flex flex-col items-center py-4 text-center">
              <CheckCircle2 className="size-12 text-brand-success" />
              <h1 className="mt-4 font-heading text-xl font-semibold">
                Uploaded
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Your document was sent securely
                {meta.from_name ? ` to ${meta.from_name}` : ""}. Thank you — you
                can close this page.
              </p>
            </div>
          </Card>
        ) : !canUpload ? (
          <BlockedCard state={meta.state === "ok" ? "closed" : meta.state} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              {meta.from_name ? (
                <>
                  <span className="font-semibold text-foreground">
                    {meta.from_name}
                  </span>{" "}
                  is requesting a document from you
                  {meta.app_name ? ` via ${meta.app_name}` : ""}.
                </>
              ) : (
                "You've been asked to upload a document."
              )}
            </p>
            <h1 className="mt-1 font-heading text-xl font-semibold break-words">
              {meta.requested_document_title}
            </h1>
            {meta.requested_document_type && (
              <p className="mt-1 text-sm text-muted-foreground">
                {meta.requested_document_type}
              </p>
            )}

            {meta.recipient_name && (
              <p className="mt-3 text-sm text-muted-foreground">
                For:{" "}
                <span className="font-medium text-foreground">
                  {meta.recipient_name}
                </span>
              </p>
            )}

            {meta.instructions && (
              <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3.5">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Instructions
                </p>
                <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
                  {meta.instructions}
                </p>
              </div>
            )}

            {meta.recipient_message && (
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                “{meta.recipient_message}”
              </p>
            )}

            {(dueLabel || expiresLabel) && (
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {dueLabel && (
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-3.5" aria-hidden />
                    Due by {dueLabel}
                  </span>
                )}
                {expiresLabel && (
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="size-3.5" aria-hidden />
                    Link expires {expiresLabel}
                  </span>
                )}
              </div>
            )}

            {/* Upload field */}
            <div className="mt-5 space-y-2">
              <Label htmlFor="dr-file">Choose your file</Label>
              <label
                htmlFor="dr-file"
                className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border px-4 py-6 text-center transition-colors hover:border-primary/40 hover:bg-muted/40"
              >
                <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
                  <UploadCloud className="size-5" aria-hidden />
                </span>
                {file ? (
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {file.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)} · Tap to change
                    </span>
                  </span>
                ) : (
                  <span>
                    <span className="block text-sm font-medium">
                      Tap to choose a file
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PDF, image, or Word file up to 10 MB
                    </span>
                  </span>
                )}
              </label>
              <input
                id="dr-file"
                type="file"
                className="sr-only"
                accept={ACCEPT_ATTR}
                disabled={uploading}
                onChange={(e) => {
                  chooseFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </div>

            {fileError && (
              <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {fileError}
              </p>
            )}
            {uploadError && (
              <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {uploadError}
              </p>
            )}

            {uploadPercent !== null && (
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            )}

            <Button
              onClick={handleUpload}
              disabled={uploading || !file}
              className="mt-4 w-full"
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileUp className="size-4" />
              )}
              {uploading ? "Uploading…" : "Upload document"}
            </Button>

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/5 px-3 py-2.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>
                Your upload is sent securely to the requester. CertaNest stores
                files privately. You don&apos;t need an account, and only the
                requester can open what you send.
              </span>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-floating">
      {children}
    </div>
  );
}

function BlockedCard({
  state,
}: {
  state: "expired" | "cancelled" | "closed" | "not_found";
}) {
  const { title, description } = publicStateMessage(state);
  return (
    <Card>
      <div className="flex flex-col items-center py-4 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 font-heading text-xl font-semibold">{title}</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      </div>
    </Card>
  );
}
