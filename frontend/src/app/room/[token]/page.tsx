"use client";

// PUBLIC sharing-room page. No auth, no sidebar, no owner data. A visitor lands
// here from a secure room link and sees the documents, files, and requests the
// owner gathered. The page NEVER exposes a raw file URL — every document is
// viewed/downloaded through the token-scoped public proxy. Uploads link out to
// the existing public document-request page.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FileUp,
  Loader2,
  Lock,
  Package,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import { LogoMark } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { formatFileSize, saveBlob } from "@/lib/document-files";
import {
  SHARING_ROOM_TYPE_LABELS,
  getPublicRoom,
  getPublicRoomFileDownloadBlob,
  getPublicRoomFilePreviewBlob,
  publicRoomStateMessage,
} from "@/lib/sharing-rooms";
import type {
  PublicSharingRoom,
  PublicSharingRoomDocument,
} from "@/types/sharing-rooms";

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

export default function PublicSharingRoomPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [room, setRoom] = useState<PublicSharingRoom | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "blocked">(
    "loading",
  );

  useEffect(() => {
    let active = true;
    getPublicRoom(token)
      .then((data) => {
        if (!active) return;
        setRoom(data);
        setLoadState(data.state === "ok" ? "ready" : "blocked");
      })
      .catch(() => {
        // A 404/410 (or any failure) becomes the calm blocked state — we never
        // leak whether a token exists.
        if (!active) return;
        setLoadState("blocked");
      });
    return () => {
      active = false;
    };
  }, [token]);

  const expiresLabel = formatDate(room?.expires_at ?? null);

  return (
    <main className="flex min-h-dvh flex-col items-center bg-muted/40 px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <LogoMark size="sm" />
        <span className="font-heading text-lg font-semibold">CertaNest</span>
      </div>

      <div className="w-full max-w-2xl">
        {loadState === "loading" ? (
          <Card>
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
              <span>Loading room…</span>
            </div>
          </Card>
        ) : loadState === "blocked" || !room ? (
          <BlockedCard
            state={
              room && room.state !== "ok" ? room.state : "not_found"
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Card>
              <p className="text-sm text-muted-foreground">
                {room.from_name ? (
                  <>
                    <span className="font-semibold text-foreground">
                      {room.from_name}
                    </span>{" "}
                    shared a secure room with you
                    {room.app_name ? ` via ${room.app_name}` : ""}.
                  </>
                ) : (
                  "A secure room has been shared with you."
                )}
              </p>
              <h1 className="mt-1 font-heading text-2xl font-semibold break-words">
                {room.title}
              </h1>
              {room.description && (
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                  {room.description}
                </p>
              )}

              {(room.context.pack_title ||
                room.context.application_title) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {room.context.pack_title && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                      <Package className="size-3.5" aria-hidden />
                      {room.context.pack_title}
                    </span>
                  )}
                  {room.context.application_title && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                      <Package className="size-3.5" aria-hidden />
                      {room.context.application_title}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                    {SHARING_ROOM_TYPE_LABELS[room.room_type]}
                  </span>
                </div>
              )}

              {expiresLabel && (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3.5" aria-hidden />
                  This link expires {expiresLabel}
                </p>
              )}
            </Card>

            {/* Documents */}
            {room.documents.length > 0 && (
              <Card>
                <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Documents ({room.documents.length})
                </h2>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {room.documents.map((doc) => (
                    <DocumentRow
                      key={doc.file_id}
                      token={token}
                      doc={doc}
                      allowDownload={room.allow_download}
                    />
                  ))}
                </ul>
              </Card>
            )}

            {/* Requests */}
            {room.requests.length > 0 && (
              <Card>
                <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Requested from you ({room.requests.length})
                </h2>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {room.requests.map((req, index) => (
                    <li
                      key={`${req.upload_token ?? "req"}-${index}`}
                      className="flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3.5"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <FileUp className="size-5" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {req.title}
                        </p>
                        {req.instructions && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {req.instructions}
                          </p>
                        )}
                      </div>
                      {req.can_upload && req.upload_token ? (
                        <a
                          href={`/document-request/${req.upload_token}`}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                        >
                          <UploadCloud className="size-3.5" aria-hidden />
                          Upload
                        </a>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <CheckCircle2 className="size-3.5" aria-hidden />
                          Received
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {room.documents.length === 0 && room.requests.length === 0 && (
              <Card>
                <p className="py-4 text-center text-sm text-muted-foreground">
                  This room is ready, but nothing has been added to it yet.
                </p>
              </Card>
            )}

            <div className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>
                This room is securely shared through CertaNest. Files are stored
                privately and opened only through this link — you don&apos;t need
                an account.
              </span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function DocumentRow({
  token,
  doc,
  allowDownload,
}: {
  token: string;
  doc: PublicSharingRoomDocument;
  allowDownload: boolean;
}) {
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    setPreviewing(true);
    setError(null);
    try {
      const blob = await getPublicRoomFilePreviewBlob(token, doc.file_id);
      const objectUrl = URL.createObjectURL(blob);
      // Open the proxied bytes in a new tab. No raw file URL is ever exposed —
      // this is a short-lived in-memory object URL for the fetched blob.
      window.open(objectUrl, "_blank", "noopener,noreferrer");
      // Revoke after a beat so the new tab has time to load it.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not preview this file.",
      );
    } finally {
      setPreviewing(false);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    setError(null);
    try {
      const blob = await getPublicRoomFileDownloadBlob(token, doc.file_id);
      saveBlob(blob, doc.name);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not download this file.",
      );
    } finally {
      setDownloading(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{doc.name}</p>
          <p className="text-xs text-muted-foreground">
            {doc.label ? `${doc.label} · ` : ""}
            {formatFileSize(doc.file_size)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {doc.is_previewable && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePreview}
              disabled={previewing}
            >
              {previewing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Eye className="size-4" />
              )}
              View
            </Button>
          )}
          {allowDownload && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              Download
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
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
  state: "expired" | "revoked" | "not_found";
}) {
  const { title, description } = publicRoomStateMessage(state);
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
