"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BadgeCheck,
  Check,
  Clock,
  Download,
  EyeOff,
  FileText,
  Loader2,
  LockKeyhole,
  LogIn,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import {
  FilePreviewDialog,
  type FilePreviewState,
} from "@/components/ui/file-preview-dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { formatFileSize } from "@/lib/document-files";
import {
  acceptQuickShare,
  declineQuickShare,
  downloadQuickShareFile,
  getQuickShareClaim,
  getQuickShareFilePreviewBlob,
  requestQuickShareExtension,
  saveQuickShareCopy,
  verifyQuickShareCode,
} from "@/lib/quick-share";
import {
  CountdownPill,
  PermissionChips,
} from "@/components/quick-share/shared";
import type { QuickShareFile, QuickSharePublic } from "@/types/quick-share";

interface ClaimError {
  title: string;
  message: string;
  state?: string;
}

function errorFromApi(err: unknown): ClaimError {
  if (err instanceof ApiError && err.data && typeof err.data === "object") {
    const data = err.data as Record<string, unknown>;
    const state = typeof data.state === "string" ? data.state : undefined;
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : "This Quick Share could not be opened.";
    if (state === "expired")
      return { title: "This Quick Share expired.", message: detail, state };
    if (state === "revoked")
      return { title: "Access revoked.", message: detail, state };
    if (state === "consumed")
      return {
        title: "This one-time Quick Share has already been used.",
        message: detail,
        state,
      };
    if (state === "limit_reached")
      return {
        title: "This Quick Share is no longer available.",
        message: detail,
        state,
      };
    if (state === "invalid")
      return { title: "This link is invalid.", message: detail, state };
    return { title: detail, message: detail, state };
  }
  return {
    title: "This Quick Share could not be opened.",
    message: err instanceof Error ? err.message : "Please try again later.",
  };
}

export default function QuickShareClaimPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [metadata, setMetadata] = useState<QuickSharePublic | null>(null);
  const [requiresCode, setRequiresCode] = useState(false);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [error, setError] = useState<ClaimError | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessCode, setAccessCode] = useState<string | undefined>(undefined);

  const [codeInput, setCodeInput] = useState("");
  // Cookie tokens aren't JS-readable; derive login state from /users/me/.
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [extensionRequest, setExtensionRequest] = useState<
    "idle" | "sending" | "sent"
  >("idle");
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

  // Resolve whether the visitor is signed in (account-mode receive flow).
  useEffect(() => {
    let active = true;
    getCurrentUser()
      .then(() => active && setIsLoggedIn(true))
      .catch(() => active && setIsLoggedIn(false));
    return () => {
      active = false;
    };
  }, []);

  // Stable appliers so both the load effect and the action handlers share the
  // same state transitions without putting synchronous setState in the effect.
  const applyResult = useCallback((data: QuickSharePublic) => {
    setMetadata(data);
    setRequiresCode(false);
    setRequiresLogin(data.requires_login);
    setError(null);
  }, []);

  const applyError = useCallback((err: unknown) => {
    if (
      err instanceof ApiError &&
      err.status === 403 &&
      err.data &&
      typeof err.data === "object" &&
      (err.data as Record<string, unknown>).state === "requires_code"
    ) {
      setRequiresCode(true);
      setMetadata(null);
      setError(null);
    } else {
      setError(errorFromApi(err));
      setMetadata(null);
    }
  }, []);

  const load = useCallback(
    async (code?: string) => {
      try {
        applyResult(await getQuickShareClaim(token, code));
      } catch (err) {
        applyError(err);
      } finally {
        setLoading(false);
      }
    },
    [token, applyResult, applyError],
  );

  useEffect(() => {
    let active = true;
    getQuickShareClaim(token, accessCode)
      .then((data) => {
        if (active) applyResult(data);
      })
      .catch((err) => {
        if (active) applyError(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, accessCode, applyResult, applyError]);

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  }

  async function handleVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = codeInput.trim();
    if (!code) {
      setCodeError("Enter the access code from the sender.");
      return;
    }
    setVerifying(true);
    setCodeError(null);
    try {
      await verifyQuickShareCode(token, code);
      setLoading(true);
      setAccessCode(code); // triggers reload with the code attached
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

  async function handleAccept() {
    setActionBusy(true);
    setActionError(null);
    try {
      await acceptQuickShare(token, accessCode);
      flash("Added to Shared with me.");
      await load(accessCode);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not accept this share.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handleDecline() {
    setActionBusy(true);
    setActionError(null);
    try {
      await declineQuickShare(token);
      await load(accessCode);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not decline this share.",
      );
    } finally {
      setActionBusy(false);
    }
  }

  async function handleRequestExtension() {
    setExtensionRequest("sending");
    try {
      await requestQuickShareExtension(token);
      setExtensionRequest("sent");
    } catch {
      // Keep it calm — most failures are throttling; let them try again later.
      setExtensionRequest("idle");
      flash("Could not send the request. Please try again later.");
    }
  }

  async function handlePreview(file: QuickShareFile) {
    setActionError(null);
    revokePreviewUrl();
    setPreviewFile(file);
    setPreviewFetch({ url: null, loading: true, error: null });
    try {
      const blob = await getQuickShareFilePreviewBlob(token, file.file_id, accessCode);
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
    setActionError(null);
    setBusyFileId(file.file_id);
    try {
      await downloadQuickShareFile(token, file.file_id, file.name, accessCode);
    } catch (err) {
      setActionError(
        err instanceof ApiError ? err.message : "Could not download this file.",
      );
    } finally {
      setBusyFileId(null);
    }
  }

  async function handleSaveCopy(file: QuickShareFile) {
    setActionError(null);
    setBusyFileId(file.file_id);
    try {
      await saveQuickShareCopy(token, file.file_id, accessCode);
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
        onDownload: metadata?.download_allowed
          ? () => handleDownload(previewFile)
          : undefined,
        downloading: busyFileId === previewFile.file_id,
        watermark: metadata?.watermark_enabled
          ? `${metadata.watermark_text || metadata.sender_name} · ${metadata.short_id}`
          : undefined,
      }
    : null;

  const isAccountMode = metadata?.mode === "account_to_account";
  const accepted = metadata?.claim_status === "accepted";
  const awaitingApproval = metadata?.claim_approval === "pending";
  const declined = metadata?.claim_status === "declined";

  // A logged-in account-mode receiver must accept before file actions appear.
  const canUseFiles =
    metadata !== null &&
    (!isAccountMode || metadata.viewer_is_owner || accepted);

  return (
    <main className="min-h-dvh bg-background">
      <FilePreviewDialog preview={preview} onClose={closePreview} />
      {toast && (
        <div className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-floating">
          {toast}
        </div>
      )}

      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between">
          <Logo href="/" size="md" />
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-card">
            <ShieldCheck className="size-3.5 text-brand-success" />
            Quick Share
          </span>
        </header>

        <section className="flex flex-1 flex-col py-8">
          {loading ? (
            <Centered
              icon={<Loader2 className="size-6 animate-spin" />}
              title="Opening secure share"
              message="Checking access and permissions…"
            />
          ) : requiresLogin && !isLoggedIn ? (
            <Centered
              icon={<LogIn className="size-6" />}
              title="Sign in to open this share"
              message="The sender shared these files with your DueNest account. Sign in to view them — you'll come right back here."
              action={
                <Link
                  href={`/login?next=${encodeURIComponent(`/quick-share/${token}`)}`}
                  className="inline-flex"
                >
                  <Button size="lg">
                    <LogIn className="size-4" />
                    Sign in to continue
                  </Button>
                </Link>
              }
            />
          ) : requiresCode ? (
            <CodeGate
              codeInput={codeInput}
              setCodeInput={setCodeInput}
              codeError={codeError}
              verifying={verifying}
              onSubmit={handleVerify}
            />
          ) : error ? (
            <Centered
              icon={<EyeOff className="size-6" />}
              title={error.title}
              message={error.message}
              action={
                (error.state === "expired" || error.state === "consumed") &&
                (extensionRequest === "sent" ? (
                  <p className="inline-flex items-center gap-2 rounded-full bg-brand-success/10 px-4 py-2 text-sm font-medium text-brand-success">
                    <Check className="size-4" />
                    Request sent. The sender can re-open access.
                  </p>
                ) : (
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={handleRequestExtension}
                    disabled={extensionRequest === "sending"}
                  >
                    {extensionRequest === "sending" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Clock className="size-4" />
                    )}
                    Ask the sender for more time
                  </Button>
                ))
              }
            />
          ) : metadata ? (
            <div className="space-y-5">
              {/* Sender identity + summary */}
              <div className="rounded-2xl border border-border bg-card p-5 shadow-floating">
                <div className="flex items-center gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {metadata.sender_initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {metadata.sender_name}
                      </span>{" "}
                      wants to share {metadata.file_count} file
                      {metadata.file_count === 1 ? "" : "s"} with you.
                    </p>
                    {metadata.title && (
                      <p className="truncate text-sm font-medium">
                        {metadata.title}
                      </p>
                    )}
                    {(metadata.recipient_label || metadata.purpose) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        For: {metadata.recipient_label || metadata.purpose}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <CountdownPill expiresAt={metadata.expires_at} />
                  <PermissionChips
                    permission={metadata.permission}
                    watermark={metadata.watermark_enabled}
                  />
                  {metadata.verified && (
                    <Link
                      href={`/verify/${token}`}
                      className="inline-flex items-center gap-1 rounded-full border border-brand-success/30 bg-brand-success/10 px-2.5 py-1 text-xs font-medium text-brand-success transition-colors hover:bg-brand-success/15"
                    >
                      <BadgeCheck className="size-3.5" />
                      Verified by DueNest
                    </Link>
                  )}
                </div>

                <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                  This page only shows the files the sender selected. It does not
                  expose their full vault.
                </p>
                {!metadata.download_allowed && (
                  <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
                    <EyeOff className="size-3.5" />
                    View only · Download disabled by the sender.
                  </p>
                )}
              </div>

              {actionError && (
                <p className="text-sm text-destructive" role="alert">
                  {actionError}
                </p>
              )}

              {/* Account-mode decision */}
              {isAccountMode &&
                !metadata.viewer_is_owner &&
                !accepted &&
                !declined && (
                  <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
                    {awaitingApproval ? (
                      <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Waiting for {metadata.sender_name} to approve your access.
                      </p>
                    ) : (
                      <>
                        <p className="text-sm font-medium">
                          Accept this share?
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Accepted files appear in your Shared with me.
                          {metadata.require_sender_approval &&
                            " The sender will need to approve your access first."}
                        </p>
                        <div className="mt-4 flex gap-2">
                          <Button
                            variant="outline"
                            onClick={handleDecline}
                            disabled={actionBusy}
                            className="flex-1"
                          >
                            <X className="size-4" />
                            Decline
                          </Button>
                          <Button
                            onClick={handleAccept}
                            disabled={actionBusy}
                            className="flex-1"
                          >
                            {actionBusy ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Check className="size-4" />
                            )}
                            Accept
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}

              {declined && (
                <Centered
                  icon={<X className="size-6" />}
                  title="You declined this share"
                  message="No files were added to your account."
                />
              )}

              {metadata.save_copy_allowed && canUseFiles && (
                <p className="rounded-lg border border-brand-amber/30 bg-brand-amber/5 px-3 py-2 text-xs text-brand-amber">
                  Saving a copy creates your own copy. The sender will no longer
                  control that saved copy.
                </p>
              )}

              {/* Files */}
              {canUseFiles && (
                <div
                  className="rounded-2xl border border-border bg-card p-2 shadow-card"
                  onContextMenu={(e) => e.preventDefault()}
                >
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
                          {metadata.save_copy_allowed && isLoggedIn && (
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
              )}
            </div>
          ) : null}
        </section>

        <footer className="mt-auto border-t border-border pt-4 pb-2 text-center">
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-brand-success" />
            Shared securely through DueNest. Access is controlled by the sender.
          </p>
        </footer>
      </div>
    </main>
  );
}

function CodeGate({
  codeInput,
  setCodeInput,
  codeError,
  verifying,
  onSubmit,
}: {
  codeInput: string;
  setCodeInput: (v: string) => void;
  codeError: string | null;
  verifying: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-floating sm:p-10">
      <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
        <LockKeyhole className="size-6" />
      </span>
      <h1 className="mt-5 font-heading text-2xl font-semibold">
        This share is protected.
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the access code from the sender. The code is not saved in your
        browser.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <Input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="Access code"
          autoFocus
          inputMode="numeric"
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
          Unlock
        </Button>
      </form>
    </div>
  );
}

function Centered({
  icon,
  title,
  message,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  action?: React.ReactNode;
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
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
