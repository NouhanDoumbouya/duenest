"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Copy,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  LockKeyhole,
  Mail,
  RotateCcw,
  Share2,
  ShieldCheck,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  createDocumentFileShareLink,
  formatFileSize,
  getDocumentFileActivity,
  listDocumentFileShareLinks,
  revokeDocumentFileShareLink,
} from "@/lib/document-files";
import type {
  CreatedDocumentFileShareLink,
  DocumentFile,
  DocumentFileActivity,
  DocumentFileShareLink,
  ShareAccessLimitType,
  ShareLinkPermission,
  ShareLinkStatus,
} from "@/types/document-files";

type ExpiryPreset = "24h" | "7d" | "30d" | "custom";

const permissionCopy: Record<ShareLinkPermission, string> = {
  view_only: "View only",
  download_allowed: "View and download",
};

const activityCopy: Record<DocumentFileActivity["action"], string> = {
  file_uploaded: "File uploaded",
  file_previewed: "Previewed by you",
  file_downloaded: "Downloaded by you",
  share_created: "Share link created",
  share_opened: "Share link opened",
  share_previewed: "Shared file previewed",
  share_downloaded: "Shared file downloaded",
  share_revoked: "Share link revoked",
  share_access_code_verified: "Access code verified",
  share_access_code_failed: "Access code failed",
  share_limit_reached: "Access limit reached",
  share_blocked_limit_reached: "Blocked — limit reached",
  file_deleted: "File deleted",
};

function formatDateTime(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shareUrl(token: string): string {
  if (typeof window === "undefined") return `/share/files/${token}`;
  return `${window.location.origin}/share/files/${token}`;
}

const SENSITIVE_KEYWORDS = [
  "passport",
  "visa",
  "id",
  "identity",
  "bank",
  "statement",
  "certificate",
  "contract",
  "insurance",
  "license",
  "licence",
  "ssn",
  "tax",
];

function looksSensitive(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SENSITIVE_KEYWORDS.some((word) => lower.includes(word));
}

function expiryCountdown(value: string): string {
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) {
    const overdue = Math.ceil(-ms / 86_400_000);
    return `Expired ${overdue} day${overdue === 1 ? "" : "s"} ago`;
  }
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `Expires in ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.max(1, Math.floor(ms / 3_600_000));
  return `Expires in ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** A small Weak/Safer/Strong indicator from how many protections are enabled. */
function shareQuality(opts: {
  accessCodeRequired: boolean;
  viewOnly: boolean;
  watermark: boolean;
  limited: boolean;
}): { label: "Weak" | "Safer" | "Strong"; tone: string } {
  const score =
    (opts.accessCodeRequired ? 1 : 0) +
    (opts.viewOnly ? 1 : 0) +
    (opts.watermark ? 1 : 0) +
    (opts.limited ? 1 : 0);
  if (score >= 3) return { label: "Strong", tone: "text-brand-success" };
  if (score >= 1) return { label: "Safer", tone: "text-amber-600" };
  return { label: "Weak", tone: "text-muted-foreground" };
}

function statusVariant(status: ShareLinkStatus) {
  if (status === "active") return "bg-brand-success/10 text-brand-success";
  if (status === "revoked") return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

const statusLabel: Record<ShareLinkStatus, string> = {
  active: "active",
  expired: "expired",
  revoked: "revoked",
  limit_reached: "limit reached",
};

function accessLimitSummary(link: DocumentFileShareLink): string | null {
  if (link.access_limit_type === "one_time") {
    return `One-time view · ${link.view_count}/1 used`;
  }
  if (link.access_limit_type === "limited_count" && link.max_views) {
    return `${link.view_count}/${link.max_views} views used`;
  }
  if (link.max_downloads) {
    return `${link.download_count}/${link.max_downloads} downloads used`;
  }
  return null;
}

function buildExpiry(preset: ExpiryPreset, customValue: string): string | null {
  if (preset === "custom") {
    if (!customValue) return null;
    const custom = new Date(customValue);
    return Number.isNaN(custom.getTime()) ? null : custom.toISOString();
  }

  const date = new Date();
  if (preset === "24h") date.setHours(date.getHours() + 24);
  if (preset === "7d") date.setDate(date.getDate() + 7);
  if (preset === "30d") date.setDate(date.getDate() + 30);
  return date.toISOString();
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function DocumentFileShareDialog({
  file,
  onClose,
}: {
  file: DocumentFile | null;
  onClose: () => void;
}) {
  const [links, setLinks] = useState<DocumentFileShareLink[]>([]);
  const [activity, setActivity] = useState<DocumentFileActivity[]>([]);
  const [loadedFileId, setLoadedFileId] = useState<number | null>(null);
  const [error, setError] = useState<{
    fileId: number;
    message: string;
  } | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  const [permission, setPermission] =
    useState<ShareLinkPermission>("view_only");
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("7d");
  const [customExpiry, setCustomExpiry] = useState("");
  const [accessCodeRequired, setAccessCodeRequired] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [accessLimitType, setAccessLimitType] =
    useState<ShareAccessLimitType>("unlimited");
  const [maxViews, setMaxViews] = useState("3");
  const [maxDownloads, setMaxDownloads] = useState("");
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [privacyScreenEnabled, setPrivacyScreenEnabled] = useState(false);
  const [label, setLabel] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [purpose, setPurpose] = useState("");
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [createdLink, setCreatedLink] = useState<{
    fileId: number;
    link: CreatedDocumentFileShareLink;
  } | null>(null);

  const activeLinks = useMemo(
    () =>
      links.filter((link) => loadedFileId === file?.id && link.status === "active")
        .length,
    [file?.id, loadedFileId, links],
  );

  useEffect(() => {
    if (!file) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [file, onClose]);

  useEffect(() => {
    if (!file || file.document === null) return;
    let active = true;
    const documentId = file.document;
    Promise.all([
      listDocumentFileShareLinks(documentId, file.id),
      getDocumentFileActivity(documentId, file.id),
    ])
      .then(([shareLinks, activityEntries]) => {
        if (!active) return;
        setLinks(shareLinks);
        setActivity(activityEntries);
        setLoadedFileId(file.id);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setLinks([]);
        setActivity([]);
        setError({
          fileId: file.id,
          message:
            err instanceof ApiError
              ? err.message
              : "Could not load sharing details.",
        });
        setLoadedFileId(file.id);
      });

    return () => {
      active = false;
    };
  }, [file]);

  async function refreshActivity(target: DocumentFile) {
    if (target.document === null) return;
    try {
      setActivity(await getDocumentFileActivity(target.document, target.id));
    } catch {
      // Activity is helpful, but should not block the sharing workflow.
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || file.document === null) return;

    const expiresAt = buildExpiry(expiryPreset, customExpiry);
    if (!expiresAt) {
      setError({
        fileId: file.id,
        message: "Choose a valid expiry date for this share link.",
      });
      return;
    }

    setCreating(true);
    setCopyMessage(null);
    try {
      const downloadCap =
        permission === "download_allowed" && maxDownloads.trim()
          ? Number(maxDownloads)
          : undefined;
      const link = await createDocumentFileShareLink(file.document, file.id, {
        permission,
        expires_at: expiresAt,
        access_code_required: accessCodeRequired,
        access_code: accessCodeRequired ? accessCode.trim() : undefined,
        access_limit_type: accessLimitType,
        max_views:
          accessLimitType === "limited_count" ? Number(maxViews) : undefined,
        max_downloads: downloadCap,
        watermark_enabled: watermarkEnabled,
        privacy_screen_enabled: privacyScreenEnabled,
        label: label.trim(),
        recipient_email: recipientEmail.trim(),
        purpose: purpose.trim(),
      });
      setCreatedLink({ fileId: file.id, link });
      setLinks((prev) => [link, ...prev]);
      setError(null);
      setLabel("");
      setRecipientEmail("");
      setPurpose("");
      setAccessCode("");
      await refreshActivity(file);
    } catch (err) {
      setError({
        fileId: file.id,
        message:
          err instanceof ApiError
            ? err.message
            : "Could not create this share link.",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy(text: string, message: string) {
    try {
      await copyText(text);
      setCopyMessage(message);
    } catch {
      setCopyMessage("Could not copy. Select the text manually.");
    }
  }

  async function handleRevoke(link: DocumentFileShareLink) {
    if (!file || file.document === null) return;
    setRevokingId(link.id);
    try {
      const revoked = await revokeDocumentFileShareLink(
        file.document,
        file.id,
        link.id,
      );
      setLinks((prev) =>
        prev.map((item) => (item.id === revoked.id ? revoked : item)),
      );
      setError(null);
      await refreshActivity(file);
    } catch (err) {
      setError({
        fileId: file.id,
        message:
          err instanceof ApiError ? err.message : "Could not revoke this link.",
      });
    } finally {
      setRevokingId(null);
    }
  }

  if (!file) return null;

  if (file.document === null) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
        <div className="max-w-md rounded-xl border border-border bg-card p-5 shadow-floating">
          <h2 className="font-heading text-lg font-semibold">
            Attach file before sharing
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Single-file share links are available after an inbox file is attached
            to a document. Quick Share can still share inbox files directly.
          </p>
          <div className="mt-4 flex justify-end">
            <Button type="button" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const currentError = error?.fileId === file.id ? error.message : null;
  const loading = loadedFileId !== file.id;
  const visibleLinks = loadedFileId === file.id ? links : [];
  const visibleActivity = loadedFileId === file.id ? activity : [];
  const visibleCreatedLink =
    createdLink?.fileId === file.id ? createdLink.link : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`Share ${file.original_filename}`}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-floating">
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Share2 className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-semibold">
                Share file securely
              </h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {file.original_filename} · {formatFileSize(file.file_size)}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close share dialog"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[1.05fr_0.95fr]">
          <form onSubmit={handleCreate} className="space-y-5 p-5">
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-success" />
                <p className="text-sm leading-relaxed text-muted-foreground">
                  Create a temporary link for this file only. You can revoke
                  access anytime, and view-only links cannot download server-side.
                </p>
              </div>
            </div>

            {currentError && (
              <p
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {currentError}
              </p>
            )}

            {visibleCreatedLink && (
              <div className="rounded-xl border border-brand-success/30 bg-brand-success/10 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-brand-success">
                  <Check className="size-4" />
                  Share link created.
                </div>
                <div className="mt-3 flex gap-2">
                  <Input readOnly value={shareUrl(visibleCreatedLink.token)} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      handleCopy(
                        shareUrl(visibleCreatedLink.token),
                        `Secure link copied. ${expiryCountdown(
                          visibleCreatedLink.expires_at,
                        )}.`,
                      )
                    }
                  >
                    <Copy className="size-4" />
                    Copy
                  </Button>
                </div>
                <a
                  href={shareUrl(visibleCreatedLink.token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Eye className="size-3.5" />
                  Preview as recipient
                </a>
                {visibleCreatedLink.access_code && (
                  <div className="mt-3 rounded-lg border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">
                      Copy the access code now. For security, it will not be
                      shown again.
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <code className="rounded-md bg-muted px-2 py-1 font-mono text-sm">
                        {visibleCreatedLink.access_code}
                      </code>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          handleCopy(
                            visibleCreatedLink.access_code ?? "",
                            "Access code copied.",
                          )
                        }
                      >
                        <Copy className="size-3.5" />
                        Copy code
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {copyMessage && (
              <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                {copyMessage}
              </p>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Permission" htmlFor="share-permission">
                <select
                  id="share-permission"
                  value={permission}
                  onChange={(event) =>
                    setPermission(event.target.value as ShareLinkPermission)
                  }
                  className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="view_only">View only</option>
                  <option value="download_allowed">View and download</option>
                </select>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {permission === "view_only"
                    ? "Supported files can be previewed, but download is blocked."
                    : "Use only when the recipient needs their own copy."}
                </p>
              </Field>

              <Field label="Expiry" htmlFor="share-expiry">
                <select
                  id="share-expiry"
                  value={expiryPreset}
                  onChange={(event) =>
                    setExpiryPreset(event.target.value as ExpiryPreset)
                  }
                  className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                  <option value="custom">Custom date</option>
                </select>
                {expiryPreset === "custom" && (
                  <Input
                    type="datetime-local"
                    value={customExpiry}
                    onChange={(event) => setCustomExpiry(event.target.value)}
                  />
                )}
              </Field>
            </div>

            <div className="rounded-xl border border-border p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={accessCodeRequired}
                  onChange={(event) =>
                    setAccessCodeRequired(event.target.checked)
                  }
                  className="mt-1 size-4 rounded border-input"
                />
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <LockKeyhole className="size-4" />
                    Require an access code
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    Add a code for sensitive files. The recipient will need both
                    the link and the code.
                  </span>
                </span>
              </label>
              {accessCodeRequired && (
                <div className="mt-4">
                  <Label htmlFor="share-access-code">Access code</Label>
                  <Input
                    id="share-access-code"
                    className="mt-2"
                    value={accessCode}
                    onChange={(event) => setAccessCode(event.target.value)}
                    placeholder="Leave blank to generate a 6-digit code"
                  />
                </div>
              )}
            </div>

            <div className="rounded-xl border border-border p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Access limit" htmlFor="share-access-limit">
                  <select
                    id="share-access-limit"
                    value={accessLimitType}
                    onChange={(event) =>
                      setAccessLimitType(
                        event.target.value as ShareAccessLimitType,
                      )
                    }
                    className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="unlimited">Unlimited access</option>
                    <option value="one_time">One-time view</option>
                    <option value="limited_count">Limited number of views</option>
                  </select>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {accessLimitType === "one_time"
                      ? "The link works for a single view, then stops."
                      : accessLimitType === "limited_count"
                        ? "The link stops after the chosen number of views."
                        : "The link works until it expires or is revoked."}
                  </p>
                </Field>
                {accessLimitType === "limited_count" && (
                  <Field label="Maximum views" htmlFor="share-max-views">
                    <Input
                      id="share-max-views"
                      type="number"
                      min={1}
                      value={maxViews}
                      onChange={(event) => setMaxViews(event.target.value)}
                    />
                  </Field>
                )}
                {permission === "download_allowed" && (
                  <Field label="Maximum downloads" htmlFor="share-max-downloads">
                    <Input
                      id="share-max-downloads"
                      type="number"
                      min={1}
                      value={maxDownloads}
                      onChange={(event) => setMaxDownloads(event.target.value)}
                      placeholder="Unlimited"
                    />
                  </Field>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={watermarkEnabled}
                  onChange={(event) =>
                    setWatermarkEnabled(event.target.checked)
                  }
                  className="mt-1 size-4 rounded border-input"
                />
                <span>
                  <span className="text-sm font-medium">Add watermark</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    Overlay “Shared via DueNest”, the recipient, and a timestamp
                    on the preview to discourage reuse.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={privacyScreenEnabled}
                  onChange={(event) =>
                    setPrivacyScreenEnabled(event.target.checked)
                  }
                  className="mt-1 size-4 rounded border-input"
                />
                <span>
                  <span className="text-sm font-medium">
                    Blur preview when the viewer leaves the tab
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    A privacy screen hides the file when the browser tab is not
                    focused.
                  </span>
                </span>
              </label>
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                DueNest can discourage screenshots with watermarking and
                view-only controls, but browsers cannot fully prevent OS-level
                screenshots.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Label" htmlFor="share-label">
                <Input
                  id="share-label"
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="University visa office"
                />
              </Field>
              <Field label="Recipient email" htmlFor="share-recipient">
                <Input
                  id="share-recipient"
                  type="email"
                  value={recipientEmail}
                  onChange={(event) => setRecipientEmail(event.target.value)}
                  placeholder="visaoffice@example.edu"
                />
              </Field>
            </div>

            <Field label="Purpose / note" htmlFor="share-purpose">
              <Textarea
                id="share-purpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Student pass renewal submission"
              />
            </Field>

            {looksSensitive(file.original_filename) && (
              <p className="rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                This may contain sensitive information. Consider view-only
                access, watermarking, an access code, and an expiry date.
              </p>
            )}

            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">Sharing setup</span>
                {(() => {
                  const quality = shareQuality({
                    accessCodeRequired,
                    viewOnly: permission === "view_only",
                    watermark: watermarkEnabled,
                    limited: accessLimitType !== "unlimited",
                  });
                  return (
                    <span className={cn("font-semibold", quality.tone)}>
                      {quality.label}
                    </span>
                  );
                })()}
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                <li>
                  {permission === "view_only"
                    ? "View-only (download blocked)"
                    : "View and download"}
                </li>
                <li>
                  Expiry:{" "}
                  {expiryPreset === "24h"
                    ? "24 hours"
                    : expiryPreset === "7d"
                      ? "7 days"
                      : expiryPreset === "30d"
                        ? "30 days"
                        : "custom date"}
                </li>
                <li>
                  {accessCodeRequired
                    ? "Access code required"
                    : "No access code"}
                </li>
                <li>{watermarkEnabled ? "Watermarked" : "No watermark"}</li>
                <li>
                  {accessLimitType === "unlimited"
                    ? "Unlimited access"
                    : accessLimitType === "one_time"
                      ? "One-time view"
                      : `Up to ${maxViews || "?"} views`}
                </li>
                {recipientEmail.trim() && <li>For {recipientEmail.trim()}</li>}
              </ul>
            </div>

            <div className="flex justify-end border-t border-border pt-5">
              <Button type="submit" disabled={creating}>
                {creating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Share2 className="size-4" />
                )}
                Create share link
              </Button>
            </div>
          </form>

          <aside className="space-y-5 border-t border-border bg-muted/25 p-5 lg:border-l lg:border-t-0">
            <section>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-heading text-sm font-semibold">
                    Existing links
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {activeLinks} active · expired and revoked links stop
                    working automatically.
                  </p>
                </div>
                {loading && <Loader2 className="size-4 animate-spin" />}
              </div>

              <div className="mt-4 space-y-3">
                {visibleLinks.length === 0 && !loading ? (
                  <EmptyMini
                    icon={<Share2 className="size-4" />}
                    text="No share links yet."
                  />
                ) : (
                  visibleLinks.map((link) => (
                    <div
                      key={link.id}
                      className="rounded-xl border border-border bg-card p-3 shadow-card"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {link.label || file.original_filename}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {permissionCopy[link.permission]} ·{" "}
                            {link.status === "active"
                              ? expiryCountdown(link.expires_at)
                              : `Expired ${formatDateTime(link.expires_at)}`}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={statusVariant(link.status)}
                        >
                          {statusLabel[link.status]}
                        </Badge>
                      </div>

                      {accessLimitSummary(link) && (
                        <p className="mt-2 text-xs font-medium text-muted-foreground">
                          {accessLimitSummary(link)}
                        </p>
                      )}

                      {(link.recipient_email || link.purpose) && (
                        <div className="mt-3 space-y-1 rounded-lg bg-muted/50 p-2 text-xs text-muted-foreground">
                          {link.recipient_email && (
                            <p className="flex items-center gap-1.5">
                              <Mail className="size-3" />
                              {link.recipient_email}
                            </p>
                          )}
                          {link.purpose && <p>{link.purpose}</p>}
                        </div>
                      )}

                      <p className="mt-3 text-xs text-muted-foreground">
                        Last accessed: {formatDateTime(link.last_accessed_at)}
                      </p>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleCopy(
                              shareUrl(link.token),
                              link.status === "active"
                                ? `Secure link copied. ${expiryCountdown(link.expires_at)}.`
                                : "Share link copied.",
                            )
                          }
                        >
                          <Copy className="size-3.5" />
                          Copy
                        </Button>
                        {link.status === "active" && (
                          <a
                            href={shareUrl(link.token)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                            )}
                          >
                            <Eye className="size-3.5" />
                            Preview
                          </a>
                        )}
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={link.status !== "active" || revokingId === link.id}
                          onClick={() => handleRevoke(link)}
                        >
                          {revokingId === link.id ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                          Revoke
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <h3 className="font-heading text-sm font-semibold">Activity</h3>
              <div className="mt-4 space-y-2">
                {visibleActivity.length === 0 && !loading ? (
                  <EmptyMini
                    icon={<Clock3 className="size-4" />}
                    text="Activity will appear here as this file is viewed, downloaded, or shared."
                  />
                ) : (
                  visibleActivity.slice(0, 8).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm"
                    >
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        {entry.action.includes("failed") ? (
                          <EyeOff className="size-3.5" />
                        ) : entry.action.includes("preview") ? (
                          <Eye className="size-3.5" />
                        ) : (
                          <FileText className="size-3.5" />
                        )}
                      </span>
                      <div>
                        <p className="font-medium">
                          {activityCopy[entry.action] ?? entry.action}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(entry.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function EmptyMini({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/70 p-4 text-center text-sm text-muted-foreground">
      <span className="mx-auto mb-2 flex size-8 items-center justify-center rounded-lg bg-muted">
        {icon}
      </span>
      {text}
    </div>
  );
}
