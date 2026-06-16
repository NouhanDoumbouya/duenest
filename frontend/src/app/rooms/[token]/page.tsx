"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Download,
  EyeOff,
  FileArchive,
  FileText,
  Loader2,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import {
  FilePreviewDialog,
  type FilePreviewState,
} from "@/components/ui/file-preview-dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { formatFileSize } from "@/lib/document-files";
import {
  downloadPublicRoomFile,
  downloadPublicRoomZip,
  getPublicRoom,
  getPublicRoomFilePreviewBlob,
  verifyPublicRoomCode,
} from "@/lib/share-rooms";
import { cn } from "@/lib/utils";
import type { PublicRoomFile, PublicRoomMetadata } from "@/types/share-rooms";

interface RoomError {
  title: string;
  message: string;
}

function errorFromApi(err: unknown): RoomError {
  if (err instanceof ApiError && err.data && typeof err.data === "object") {
    const data = err.data as Record<string, unknown>;
    const state = typeof data.state === "string" ? data.state : undefined;
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : "This room could not be opened.";
    if (state === "expired")
      return { title: "This room has expired.", message: detail };
    if (state === "revoked")
      return { title: "This room is no longer available.", message: detail };
    if (state === "limit_reached")
      return { title: "This room has already been used.", message: detail };
    if (state === "invalid")
      return { title: "This room is invalid.", message: detail };
    return { title: detail, message: detail };
  }
  return {
    title: "This room could not be opened.",
    message: err instanceof Error ? err.message : "Please try again later.",
  };
}

function WatermarkOverlay({ metadata }: { metadata: PublicRoomMetadata }) {
  const line = [
    "Shared via DueNest",
    metadata.watermark_text,
    `ID ${metadata.short_id}`,
    new Date().toLocaleString(),
  ]
    .filter(Boolean)
    .join("  •  ");
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 flex flex-wrap content-start gap-x-10 gap-y-12 overflow-hidden p-6 opacity-[0.12]"
    >
      {Array.from({ length: 36 }).map((_, index) => (
        <span
          key={index}
          className="-rotate-[30deg] whitespace-nowrap text-xs font-semibold text-foreground"
        >
          {line}
        </span>
      ))}
    </div>
  );
}

export default function PublicRoomPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [grant, setGrant] = useState("");
  const [metadata, setMetadata] = useState<PublicRoomMetadata | null>(null);
  const [requiresCode, setRequiresCode] = useState(false);
  const [error, setError] = useState<RoomError | null>(null);
  const [loadKey, setLoadKey] = useState("");

  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [busyFileId, setBusyFileId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [zipping, setZipping] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [previewFile, setPreviewFile] = useState<PublicRoomFile | null>(null);
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

  // Release the object URL when the component unmounts.
  useEffect(() => () => revokePreviewUrl(), []);

  const key = `${token}:${grant}`;
  const loading = loadKey !== key;

  useEffect(() => {
    let active = true;
    getPublicRoom(token, grant || undefined)
      .then((result) => {
        if (!active) return;
        setMetadata(result);
        setRequiresCode(false);
        setError(null);
        setLoadKey(key);
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
          setMetadata(null);
          setRequiresCode(true);
          setError(null);
        } else {
          setMetadata(null);
          setRequiresCode(false);
          setError(errorFromApi(err));
        }
        setLoadKey(key);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, grant]);

  useEffect(() => {
    function onVisibility() {
      setTabHidden(document.hidden);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, []);

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
      const result = await verifyPublicRoomCode(token, code);
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

  async function handlePreview(file: PublicRoomFile) {
    setActionError(null);
    revokePreviewUrl();
    // Open the in-app preview immediately in a loading state.
    setPreviewFile(file);
    setPreviewFetch({ url: null, loading: true, error: null });
    try {
      const blob = await getPublicRoomFilePreviewBlob(
        token,
        file.file_id,
        grant || undefined,
      );
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

  async function handleDownload(file: PublicRoomFile) {
    setActionError(null);
    setBusyFileId(file.file_id);
    try {
      await downloadPublicRoomFile(
        token,
        file.file_id,
        file.name,
        grant || undefined,
      );
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not download this file.",
      );
    } finally {
      setBusyFileId(null);
    }
  }

  async function handleZip() {
    setActionError(null);
    setZipping(true);
    try {
      await downloadPublicRoomZip(token, grant || undefined);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not download this room.",
      );
    } finally {
      setZipping(false);
    }
  }

  const preview: FilePreviewState | null = previewFile
    ? {
        fileName: previewFile.name,
        contentType: previewFile.content_type,
        url: previewFetch.url,
        loading: previewFetch.loading,
        error: previewFetch.error,
        // Only offer download inside the preview when the room allows it.
        onDownload: metadata?.download_allowed
          ? () => handleDownload(previewFile)
          : undefined,
        downloading: busyFileId === previewFile.file_id,
      }
    : null;

  return (
    <main className="min-h-dvh bg-background">
      <FilePreviewDialog preview={preview} onClose={closePreview} />
      <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between">
          <Logo href="/" size="md" />
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-card">
            <ShieldCheck className="size-3.5 text-brand-success" />
            Secure room
          </span>
        </header>

        <section className="flex flex-1 flex-col py-10">
          {loading ? (
            <CenteredState
              icon={<Loader2 className="size-6 animate-spin" />}
              title="Opening secure room"
              message="Checking access and permissions…"
            />
          ) : requiresCode ? (
            <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-floating sm:p-10">
              <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <LockKeyhole className="size-6" />
              </span>
              <h1 className="mt-5 font-heading text-2xl font-semibold">
                This room is protected.
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
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
                  Unlock room
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
            <div className="space-y-5">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-floating">
                <h1 className="font-heading text-xl font-semibold">
                  {metadata.title}
                </h1>
                {metadata.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {metadata.description}
                  </p>
                )}
                <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  This was shared securely through DueNest. Access may expire or
                  be revoked by the owner.
                </p>
                {!metadata.download_allowed && (
                  <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
                    <EyeOff className="size-3.5" />
                    View-only access. Downloading is disabled by the owner.
                  </p>
                )}
                {metadata.download_allowed && metadata.files.length > 1 && (
                  <div className="mt-4">
                    <Button onClick={handleZip} disabled={zipping}>
                      {zipping ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <FileArchive className="size-4" />
                      )}
                      Download all as ZIP
                    </Button>
                  </div>
                )}
              </div>

              {actionError && (
                <p className="text-sm text-destructive" role="alert">
                  {actionError}
                </p>
              )}

              {metadata.files.length === 0 ? (
                <CenteredState
                  icon={<FileText className="size-6" />}
                  title="No files in this room"
                  message="The owner has not added any files yet."
                />
              ) : (
                <div
                  className={cn(
                    "relative rounded-2xl border border-border bg-card p-2 shadow-card",
                    tabHidden && metadata.privacy_screen_enabled && "blur-xl",
                  )}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  {metadata.watermark_enabled && (
                    <WatermarkOverlay metadata={metadata} />
                  )}
                  <ul className="divide-y divide-border">
                    {metadata.files.map((file) => (
                      <li
                        key={file.file_id}
                        className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                            <FileText className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {file.name}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {file.source} · {formatFileSize(file.file_size)}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {file.is_previewable && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePreview(file)}
                              disabled={busyFileId === file.file_id}
                            >
                              Preview
                            </Button>
                          )}
                          {metadata.download_allowed && (
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
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
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
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-floating sm:p-12">
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
