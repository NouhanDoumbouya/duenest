"use client";

// Owner dashboard for Document Request Links V1. Create a secure link asking
// someone (often without an account) to upload a single document, track its
// status, then review the upload (accept / reject / needs-replacement) and save
// it to the vault or attach it to a pack. Nothing is accepted automatically.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  FileUp,
  Loader2,
  Mail,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Vault,
  X,
  XCircle,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Toast, type ToastState } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import {
  formatFileSize,
  getInboxFileDownloadBlob,
  saveBlob,
} from "@/lib/document-files";
import {
  DOCUMENT_REQUEST_BUCKET_LABELS,
  DOCUMENT_REQUEST_STATUS_LABELS,
  DOCUMENT_REQUEST_STATUS_TONE,
  acceptDocumentRequest,
  attachRequestToPack,
  buildPublicRequestUrl,
  cancelDocumentRequest,
  copyToClipboard,
  createDocumentRequest,
  getDocumentRequests,
  groupRequestsByBucket,
  isAwaitingReview,
  needsReplacementDocumentRequest,
  rejectDocumentRequest,
  saveRequestToVault,
  sendDocumentRequest,
} from "@/lib/document-requests";
import { cn } from "@/lib/utils";
import type {
  CreateDocumentRequestBody,
  DocumentRequestLink,
} from "@/types/document-requests";

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

export default function DocumentRequestsPage() {
  const [requests, setRequests] = useState<DocumentRequestLink[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    let active = true;
    getDocumentRequests()
      .then((res) => active && setRequests(res.requests))
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Could not load your document requests.",
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const activeRequest = useMemo(
    () => (requests ?? []).find((r) => r.id === activeId) ?? null,
    [requests, activeId],
  );

  const grouped = useMemo(
    () => groupRequestsByBucket(requests ?? []),
    [requests],
  );

  function upsert(updated: DocumentRequestLink) {
    setRequests((current) =>
      (current ?? []).map((r) => (r.id === updated.id ? updated : r)),
    );
  }

  function prepend(created: DocumentRequestLink) {
    setRequests((current) => [created, ...(current ?? [])]);
  }

  const hasRequests = (requests ?? []).length > 0;
  const needsReviewCount = (requests ?? []).filter((r) =>
    isAwaitingReview(r.status),
  ).length;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Prepare & share"
        title="Document Requests"
        description="Ask someone to securely upload a document. You review every upload before anything enters your vault."
        actions={
          hasRequests ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New request
            </Button>
          ) : undefined
        }
      />

      {loadError && <InlineAlert>{loadError}</InlineAlert>}

      {needsReviewCount > 0 && (
        <InlineAlert tone="warn">
          {needsReviewCount} upload{needsReviewCount === 1 ? "" : "s"} waiting
          for your review.
        </InlineAlert>
      )}

      {loading ? (
        <section className="grid gap-3" aria-busy="true" aria-label="Loading requests">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : !hasRequests ? (
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={ClipboardList}
            title="Request your first document."
            description="Ask someone to securely upload a passport, transcript, certificate, or recommendation letter. They don't need an account — and nothing is accepted until you review it."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus className="size-4" /> New request
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map((group) => (
            <section key={group.bucket} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {DOCUMENT_REQUEST_BUCKET_LABELS[group.bucket]}
                </h2>
                <span className="text-xs text-muted-foreground/70">
                  {group.items.length}
                </span>
              </div>
              <div className="grid gap-3">
                {group.items.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    onOpen={() => setActiveId(request.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {creating && (
        <CreateRequestModal
          onClose={() => setCreating(false)}
          onCreated={(created) => {
            prepend(created);
            setCreating(false);
            setActiveId(created.id);
            setToast({ message: "Request created.", kind: "success" });
          }}
        />
      )}

      {activeRequest && (
        <RequestDetailDrawer
          key={activeRequest.id}
          request={activeRequest}
          onClose={() => setActiveId(null)}
          onUpdated={upsert}
          onToast={setToast}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </PageContainer>
  );
}

// ---- List card -------------------------------------------------------------

function RequestCard({
  request,
  onOpen,
}: {
  request: DocumentRequestLink;
  onOpen: () => void;
}) {
  const due = formatDate(request.due_date);
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elevated motion-reduce:transform-none motion-reduce:transition-none">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 text-left focus-visible:outline-none"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <ClipboardList className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">
              {request.requested_document_title}
            </h3>
            <StatusBadge
              tone={DOCUMENT_REQUEST_STATUS_TONE[request.status]}
              withDot={false}
            >
              {DOCUMENT_REQUEST_STATUS_LABELS[request.status]}
            </StatusBadge>
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
            {request.recipient_name || request.recipient_email
              ? `For ${request.recipient_name || request.recipient_email}`
              : "No recipient set yet"}
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
            {due && (
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" aria-hidden /> Due {due}
              </span>
            )}
            {request.linked_application && (
              <span className="inline-flex items-center gap-1">
                <Package className="size-3.5" aria-hidden /> Linked to an
                application
              </span>
            )}
            {request.linked_bundle && (
              <span className="inline-flex items-center gap-1">
                <Package className="size-3.5" aria-hidden /> Linked to a pack
              </span>
            )}
            <span>{formatDate(request.created_at)}</span>
          </p>
        </div>
        <ArrowUpRight
          className="mt-1 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>
    </article>
  );
}

// ---- Create modal ----------------------------------------------------------

function CreateRequestModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (created: DocumentRequestLink) => void;
}) {
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("");
  const [instructions, setInstructions] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sendEmail, setSendEmail] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleTouched, setTitleTouched] = useState(false);

  const titleEmpty = title.trim().length === 0;

  // Close on Escape (the drawer/dialog convention used elsewhere).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit() {
    if (titleEmpty) {
      setTitleTouched(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    const body: CreateDocumentRequestBody = {
      requested_document_title: title.trim(),
    };
    if (docType.trim()) body.requested_document_type = docType.trim();
    if (instructions.trim()) body.instructions = instructions.trim();
    if (recipientName.trim()) body.recipient_name = recipientName.trim();
    if (recipientEmail.trim()) body.recipient_email = recipientEmail.trim();
    if (dueDate) body.due_date = dueDate;
    if (expiresAt) body.expires_at = expiresAt;
    if (sendEmail && recipientEmail.trim()) body.send_email = true;

    try {
      const created = await createDocumentRequest(body);
      onCreated(created);
    } catch (err) {
      // Plan-limit 403 is surfaced globally (apiFetch dispatches
      // duenest:plan-limit → upgrade modal). Show a friendly inline note too.
      if (err instanceof ApiError && err.status === 403) {
        const data = err.data as Record<string, unknown> | null;
        if (data?.code === "plan_limit_exceeded") {
          setError(
            "You've reached your plan's document-request limit. Upgrade to create more.",
          );
        } else {
          setError(err.message);
        }
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Could not create this request.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label="New document request"
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">
              New document request
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Private until you share the link. Nothing is accepted
              automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dr-title">
              What document do you need?{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id="dr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              placeholder="e.g. Passport copy, University transcript"
              aria-invalid={titleTouched && titleEmpty}
              disabled={submitting}
            />
            {titleTouched && titleEmpty && (
              <p className="text-xs text-destructive">
                Give the request a clear title.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dr-type">Document type (optional)</Label>
            <Input
              id="dr-type"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              placeholder="e.g. Identity, Education, Reference"
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="dr-instructions">Instructions (optional)</Label>
            <Textarea
              id="dr-instructions"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Tell them exactly what you need — e.g. a clear colour scan of the photo page."
              rows={3}
              disabled={submitting}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dr-recipient-name">Recipient name (optional)</Label>
              <Input
                id="dr-recipient-name"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Who you're asking"
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dr-recipient-email">
                Recipient email (optional)
              </Label>
              <Input
                id="dr-recipient-email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="them@example.com"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dr-due">Due date (optional)</Label>
              <Input
                id="dr-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dr-expires">Link expires (optional)</Label>
              <Input
                id="dr-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

          {recipientEmail.trim() && (
            <label className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                disabled={submitting}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <Mail className="size-3.5 text-primary" aria-hidden /> Email
                  the link now
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  We&apos;ll send the secure upload link to{" "}
                  {recipientEmail.trim()}.
                </span>
              </span>
            </label>
          )}

          {error && <InlineAlert>{error}</InlineAlert>}

          <TrustNotice icon={ShieldCheck} title="Private until shared">
            No public link has been created yet — only people you send the link
            to can upload. You review every upload before it enters your vault.
          </TrustNotice>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || titleEmpty}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Create request
          </Button>
        </div>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

// ---- Detail drawer ---------------------------------------------------------

type ReasonAction = "reject" | "needs_replacement";

function RequestDetailDrawer({
  request,
  onClose,
  onUpdated,
  onToast,
}: {
  request: DocumentRequestLink;
  onClose: () => void;
  onUpdated: (request: DocumentRequestLink) => void;
  onToast: (t: ToastState) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<ReasonAction | null>(null);
  const [reason, setReason] = useState("");

  const publicUrl = buildPublicRequestUrl(request);
  const due = formatDate(request.due_date);
  const expires = formatDate(request.expires_at);
  const fileInfo = request.uploaded_file_info;
  const reviewable = isAwaitingReview(request.status);
  const accepted = request.status === "accepted";
  const canCancel =
    request.status !== "accepted" &&
    request.status !== "cancelled" &&
    request.status !== "rejected" &&
    request.status !== "expired";

  async function handleCopy() {
    const ok = await copyToClipboard(publicUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      onToast({ message: "Could not copy the link.", kind: "error" });
    }
  }

  async function run(
    key: string,
    fn: () => Promise<DocumentRequestLink>,
    successMessage: string,
  ) {
    setBusy(key);
    try {
      const updated = await fn();
      onUpdated(updated);
      onToast({ message: successMessage, kind: "success" });
    } catch (err) {
      onToast({
        message:
          err instanceof ApiError ? err.message : "Something went wrong.",
        kind: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function submitReason() {
    if (!reasonFor) return;
    const trimmed = reason.trim();
    if (!trimmed) return;
    const action = reasonFor;
    setReasonFor(null);
    setReason("");
    if (action === "reject") {
      await run(
        "reject",
        () => rejectDocumentRequest(request.id, trimmed),
        "Upload rejected. The recipient was not added to your vault.",
      );
    } else {
      await run(
        "needs_replacement",
        () => needsReplacementDocumentRequest(request.id, trimmed),
        "Replacement requested.",
      );
    }
  }

  async function handleSend() {
    if (!request.recipient_email) {
      onToast({
        message: "Add a recipient email first to send the link.",
        kind: "error",
      });
      return;
    }
    setBusy("send");
    try {
      const res = await sendDocumentRequest(request.id);
      onUpdated(res.request);
      onToast({
        message: res.sent
          ? `Link emailed to ${request.recipient_email}.`
          : "Could not send the email.",
        kind: res.sent ? "success" : "error",
      });
    } catch (err) {
      onToast({
        message:
          err instanceof ApiError ? err.message : "Could not send the email.",
        kind: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveToVault() {
    setBusy("vault");
    try {
      const res = await saveRequestToVault(request.id);
      onUpdated(res.request);
      onToast({ message: "Saved to your vault.", kind: "success" });
    } catch (err) {
      onToast({
        message:
          err instanceof ApiError ? err.message : "Could not save to vault.",
        kind: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleAttachToPack() {
    setBusy("pack");
    try {
      const res = await attachRequestToPack(request.id);
      onUpdated(res.request);
      onToast({ message: "Attached to the pack.", kind: "success" });
    } catch (err) {
      onToast({
        message:
          err instanceof ApiError ? err.message : "Could not attach to pack.",
        kind: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleDownload() {
    if (!fileInfo) return;
    setBusy("download");
    try {
      const blob = await getInboxFileDownloadBlob(fileInfo.id);
      saveBlob(blob, fileInfo.original_filename);
    } catch (err) {
      onToast({
        message:
          err instanceof ApiError ? err.message : "Could not download the file.",
        kind: "error",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label={request.requested_document_title}
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <StatusBadge
              tone={DOCUMENT_REQUEST_STATUS_TONE[request.status]}
              withDot={false}
            >
              {DOCUMENT_REQUEST_STATUS_LABELS[request.status]}
            </StatusBadge>
            <h2 className="mt-2 font-heading text-lg font-semibold break-words">
              {request.requested_document_title}
            </h2>
            {request.requested_document_type && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {request.requested_document_type}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Secure link + copy */}
        <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3.5">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Secure upload link
          </h3>
          <p className="mt-1.5 truncate font-mono text-xs text-foreground/80">
            {publicUrl || "Link will appear once the request is ready."}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!publicUrl}
            >
              {copied ? (
                <Check className="size-4 text-brand-success" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? "Copied" : "Copy link"}
            </Button>
            {request.recipient_email && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSend}
                disabled={busy === "send"}
              >
                {busy === "send" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Mail className="size-4" />
                )}
                Email link
              </Button>
            )}
          </div>
        </div>

        {/* Recipient + dates */}
        <dl className="mt-4 grid gap-2 text-sm">
          {(request.recipient_name || request.recipient_email) && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Recipient</dt>
              <dd className="min-w-0 truncate text-right font-medium">
                {request.recipient_name || request.recipient_email}
              </dd>
            </div>
          )}
          {due && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Due</dt>
              <dd className="font-medium">{due}</dd>
            </div>
          )}
          {expires && (
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Link expires</dt>
              <dd className="font-medium">{expires}</dd>
            </div>
          )}
        </dl>

        {request.instructions && (
          <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3.5">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Instructions sent
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap text-foreground/90">
              {request.instructions}
            </p>
          </div>
        )}

        {/* Status timeline */}
        <StatusTimeline request={request} />

        {/* Uploaded file (private to owner) */}
        {fileInfo && (
          <div className="mt-5">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Uploaded file
            </h3>
            <div className="mt-2 flex items-center gap-3 rounded-xl border border-border bg-card p-3.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <FileUp className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {fileInfo.original_filename}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(fileInfo.file_size)} · Private to you
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownload}
                disabled={busy === "download"}
              >
                {busy === "download" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Download
              </Button>
            </div>
          </div>
        )}

        {/* Rejection reason echo */}
        {request.rejection_reason && (
          <div className="mt-3 rounded-lg border border-brand-amber/30 bg-brand-amber/10 p-3 text-xs text-brand-amber">
            Reason given: {request.rejection_reason}
          </div>
        )}

        {/* Review actions */}
        {reviewable && fileInfo && (
          <div className="mt-5 flex flex-col gap-3">
            <TrustNotice icon={ShieldCheck} title="Nothing is accepted automatically">
              Review the uploaded file, then choose what happens. Accepting it
              keeps the original; rejecting it never adds anything to your vault.
            </TrustNotice>

            {reasonFor ? (
              <div className="rounded-xl border border-border bg-muted/20 p-3.5">
                <Label htmlFor="dr-reason">
                  {reasonFor === "reject"
                    ? "Why are you rejecting this?"
                    : "What should they upload instead?"}
                </Label>
                <Textarea
                  id="dr-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder={
                    reasonFor === "reject"
                      ? "Let them know what went wrong."
                      : "Explain what the replacement should be."
                  }
                  className="mt-1.5"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setReasonFor(null);
                      setReason("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={submitReason}
                    disabled={!reason.trim()}
                  >
                    {reasonFor === "reject"
                      ? "Reject upload"
                      : "Request replacement"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    run(
                      "accept",
                      () => acceptDocumentRequest(request.id),
                      "Upload accepted.",
                    )
                  }
                  disabled={busy === "accept"}
                >
                  {busy === "accept" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  Accept
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReasonFor("needs_replacement")}
                >
                  <RefreshCw className="size-4" /> Needs replacement
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setReasonFor("reject")}
                >
                  <XCircle className="size-4" /> Reject
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Accepted: save / attach */}
        {accepted && (
          <div className="mt-5 flex flex-col gap-3">
            <InlineAlert tone="good">
              Accepted. Keep it in this request, save it to your vault, or attach
              it to a pack.
            </InlineAlert>
            <div className="flex flex-wrap gap-2">
              {request.created_document ? (
                <Link
                  href={`/dashboard/documents/${request.created_document}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                >
                  <Vault className="size-4" /> View in vault
                </Link>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveToVault}
                  disabled={busy === "vault"}
                >
                  {busy === "vault" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Vault className="size-4" />
                  )}
                  Save to vault
                </Button>
              )}
              {(request.linked_requirement ||
                request.linked_bundle ||
                request.linked_application) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAttachToPack}
                  disabled={busy === "pack"}
                >
                  {busy === "pack" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Package className="size-4" />
                  )}
                  Attach to pack
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Footer: cancel */}
        {canCancel && (
          <div className="mt-6 flex items-center justify-between gap-2 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              <Sparkles className="mr-1 inline size-3.5" aria-hidden />
              Cancelling stops new uploads.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() =>
                run(
                  "cancel",
                  () => cancelDocumentRequest(request.id),
                  "Request cancelled.",
                )
              }
              disabled={busy === "cancel"}
            >
              {busy === "cancel" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="size-4" />
              )}
              Cancel request
            </Button>
          </div>
        )}
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function StatusTimeline({ request }: { request: DocumentRequestLink }) {
  const steps: { label: string; at: string | null }[] = [
    { label: "Created", at: request.created_at },
    { label: "Opened by recipient", at: request.opened_at },
    { label: "Uploaded", at: request.uploaded_at },
    { label: "Reviewed", at: request.reviewed_at },
  ];
  const visible = steps.filter((s) => s.at);
  if (visible.length === 0) return null;
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Activity
      </h3>
      <ol className="mt-2 flex flex-col gap-2">
        {visible.map((step) => (
          <li key={step.label} className="flex items-center gap-2.5 text-sm">
            <span className="size-2 shrink-0 rounded-full bg-primary/60" aria-hidden />
            <span className="font-medium">{step.label}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {formatDate(step.at)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
