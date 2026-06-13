"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Download,
  EyeOff,
  FileText,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import {
  downloadSharedFile,
  formatFileSize,
  getSharedFileMetadata,
  getSharedFilePreviewBlob,
  verifySharedFileAccessCode,
} from "@/lib/document-files";
import type { PublicSharedFileMetadata } from "@/types/document-files";

interface ShareError {
  title: string;
  message: string;
  state?: string;
}

interface MetadataState {
  key: string;
  metadata: PublicSharedFileMetadata | null;
  requiresCode: boolean;
  error: ShareError | null;
}

interface PreviewState {
  key: string;
  url: string | null;
  error: string | null;
}

function errorFromApi(err: unknown): ShareError {
  if (err instanceof ApiError && err.data && typeof err.data === "object") {
    const data = err.data as Record<string, unknown>;
    const state = typeof data.state === "string" ? data.state : undefined;
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : "This shared file could not be opened.";

    if (state === "expired") {
      return {
        title: "This shared link has expired.",
        message: "Please ask the sender to create a new link if access is still needed.",
        state,
      };
    }
    if (state === "revoked") {
      return {
        title: "This shared link is no longer available.",
        message: "The sender has revoked access.",
        state,
      };
    }
    if (state === "invalid") {
      return {
        title: "This shared link is invalid.",
        message: "Check the link or ask the sender to share the file again.",
        state,
      };
    }
    if (state === "limit_reached") {
      return {
        title: "This secure link has already been used.",
        message:
          "It has reached the access limit set by the sender. Ask them for a new link if you still need access.",
        state,
      };
    }
    return { title: detail, message: detail, state };
  }

  return {
    title: "This shared file could not be opened.",
    message: err instanceof Error ? err.message : "Please try again later.",
  };
}

function fileKind(metadata: PublicSharedFileMetadata): "pdf" | "image" | "other" {
  if (!metadata.is_previewable) return "other";
  if (metadata.content_type === "application/pdf") return "pdf";
  if (metadata.content_type.startsWith("image/")) return "image";
  return "other";
}

export default function SharedFilePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [metadataState, setMetadataState] = useState<MetadataState>({
    key: "",
    metadata: null,
    requiresCode: false,
    error: null,
  });
  // Short-lived grant returned after the access code is verified. The raw code
  // is never kept in state or storage — only this scoped, expiring grant.
  const [grant, setGrant] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [previewState, setPreviewState] = useState<PreviewState>({
    key: "",
    url: null,
    error: null,
  });
  const [downloading, setDownloading] = useState(false);

  const metadataKey = `${token}:${grant}`;
  const metadataCurrent = metadataState.key === metadataKey;
  const metadata = metadataCurrent ? metadataState.metadata : null;
  const requiresCode = metadataCurrent && metadataState.requiresCode;
  const error = metadataCurrent ? metadataState.error : null;
  const loading = !metadataCurrent;
  const previewKey = metadata
    ? `${token}:${grant}:${metadata.file_name}:${metadata.expires_at}`
    : "";
  const previewUrl = previewState.key === previewKey ? previewState.url : null;
  const previewError =
    previewState.key === previewKey ? previewState.error : null;
  const previewLoading =
    Boolean(metadata?.is_previewable) && previewState.key !== previewKey;

  useEffect(() => {
    let active = true;
    const key = `${token}:${grant}`;

    getSharedFileMetadata(token, grant || undefined)
      .then((result) => {
        if (!active) return;
        setMetadataState({
          key,
          metadata: result,
          requiresCode: false,
          error: null,
        });
      })
      .catch((err) => {
        if (!active) return;
        if (
          err instanceof ApiError &&
          err.status === 403 &&
          err.data &&
          typeof err.data === "object" &&
          (err.data as Record<string, unknown>).state === "requires_code"
        ) {
          setMetadataState({
            key,
            metadata: null,
            requiresCode: true,
            error: null,
          });
          return;
        }
        setMetadataState({
          key,
          metadata: null,
          requiresCode: false,
          error: errorFromApi(err),
        });
      });

    return () => {
      active = false;
    };
  }, [token, grant]);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    if (!metadata || !metadata.is_previewable) {
      return () => undefined;
    }

    const key = `${token}:${grant}:${metadata.file_name}:${metadata.expires_at}`;
    getSharedFilePreviewBlob(token, grant || undefined)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewState({ key, url: objectUrl, error: null });
      })
      .catch((err) => {
        if (!active) return;
        setPreviewState({
          key,
          url: null,
          error:
            err instanceof ApiError
              ? err.message
              : "Preview is not available for this file type.",
        });
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [metadata, token, grant]);

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = codeInput.trim();
    if (!code) {
      setCodeError("Enter the access code provided by the sender.");
      return;
    }
    setVerifying(true);
    setCodeError(null);
    try {
      const result = await verifySharedFileAccessCode(token, code);
      // Switch to grant-based access; the raw code is discarded here.
      setGrant(result.grant ?? "");
    } catch (err) {
      setCodeError(
        err instanceof ApiError
          ? err.message
          : "That code does not match. Check the code and try again.",
      );
    } finally {
      setVerifying(false);
    }
  }

  async function handleDownload() {
    if (!metadata) return;
    setDownloading(true);
    try {
      await downloadSharedFile(token, metadata.file_name, grant || undefined);
    } catch (err) {
      setPreviewState((current) => ({
        ...current,
        key: previewKey,
        error:
          err instanceof ApiError
            ? err.message
            : "Could not download this shared file.",
      }));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between">
          <Logo href="/" size="md" />
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-card">
            <ShieldCheck className="size-3.5 text-brand-success" />
            Secure shared file
          </span>
        </header>

        <section className="flex flex-1 items-center justify-center py-10">
          <div className="w-full rounded-2xl border border-border bg-card shadow-floating">
            {loading ? (
              <CenteredState
                icon={<Loader2 className="size-6 animate-spin" />}
                title="Opening shared file"
                message="Checking link status and permissions..."
              />
            ) : requiresCode ? (
              <div className="mx-auto max-w-md p-6 text-center sm:p-10">
                <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <LockKeyhole className="size-6" />
                </span>
                <h1 className="mt-5 font-heading text-2xl font-semibold">
                  This file is protected.
                </h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Enter the access code provided by the sender. The code is not
                  saved in your browser.
                </p>
                <form onSubmit={handleVerify} className="mt-6 space-y-3">
                  <Input
                    value={codeInput}
                    onChange={(event) => setCodeInput(event.target.value)}
                    placeholder="Access code"
                    autoFocus
                  />
                  {codeError && (
                    <p className="text-sm text-destructive" role="alert">
                      {codeError}
                    </p>
                  )}
                  <Button type="submit" className="w-full" disabled={verifying}>
                    {verifying ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <LockKeyhole className="size-4" />
                    )}
                    Unlock file
                  </Button>
                </form>
              </div>
            ) : error ? (
              <CenteredState
                icon={<EyeOff className="size-6" />}
                title={error.title}
                message={error.message}
              />
            ) : metadata ? (
              <SharedFileViewer
                metadata={metadata}
                previewUrl={previewUrl}
                previewLoading={previewLoading}
                previewError={previewError}
                downloading={downloading}
                onDownload={handleDownload}
              />
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function SharedFileViewer({
  metadata,
  previewUrl,
  previewLoading,
  previewError,
  downloading,
  onDownload,
}: {
  metadata: PublicSharedFileMetadata;
  previewUrl: string | null;
  previewLoading: boolean;
  previewError: string | null;
  downloading: boolean;
  onDownload: () => void;
}) {
  const kind = fileKind(metadata);

  return (
    <div className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <FileText className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-heading text-lg font-semibold">
              {metadata.file_name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {metadata.content_type || "File"} ·{" "}
              {formatFileSize(metadata.file_size)} · Expires{" "}
              {new Date(metadata.expires_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        {metadata.download_allowed && (
          <Button type="button" onClick={onDownload} disabled={downloading}>
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download
          </Button>
        )}
      </div>

      <div className="bg-muted/35 p-4 sm:p-6">
        <p className="mb-4 text-sm text-muted-foreground">
          This file was shared securely through DueNest.
        </p>

        {previewLoading ? (
          <div className="flex min-h-[440px] items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            Loading preview...
          </div>
        ) : previewError ? (
          <PreviewFallback
            message={previewError}
            canDownload={metadata.download_allowed}
            onDownload={onDownload}
            downloading={downloading}
          />
        ) : kind === "other" ? (
          <PreviewFallback
            message={
              metadata.download_allowed
                ? "Preview is not available for this file type. You can still download the file."
                : "Preview is not available for this file type. The sender allowed preview only."
            }
            canDownload={metadata.download_allowed}
            onDownload={onDownload}
            downloading={downloading}
          />
        ) : previewUrl && kind === "image" ? (
          <div className="flex min-h-[440px] items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={metadata.file_name}
              className="max-h-[70vh] max-w-full rounded-xl border border-border bg-card object-contain shadow-elevated"
            />
          </div>
        ) : previewUrl && kind === "pdf" ? (
          <iframe
            src={previewUrl}
            title={metadata.file_name}
            className="h-[72vh] min-h-[480px] w-full rounded-xl border border-border bg-card shadow-elevated"
          />
        ) : (
          <PreviewFallback
            message="Preview is not available for this file type."
            canDownload={metadata.download_allowed}
            onDownload={onDownload}
            downloading={downloading}
          />
        )}
      </div>
    </div>
  );
}

function PreviewFallback({
  message,
  canDownload,
  downloading,
  onDownload,
}: {
  message: string;
  canDownload: boolean;
  downloading: boolean;
  onDownload: () => void;
}) {
  return (
    <div className="flex min-h-[360px] items-center justify-center">
      <div className="max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-card">
        <FileText className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-4 font-heading text-base font-semibold">
          Preview unavailable
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {message}
        </p>
        {canDownload && (
          <Button
            type="button"
            className="mt-5"
            onClick={onDownload}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            Download file
          </Button>
        )}
      </div>
    </div>
  );
}

function CenteredState({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="mx-auto max-w-md p-8 text-center sm:p-12">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        {icon}
      </span>
      <h1 className="mt-5 font-heading text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {message}
      </p>
    </div>
  );
}
