"use client";

// Case detail for CertaNest Portals (B2B Portals MVP). A single document case:
// the person it's for, readiness/progress, any linked pack or sharing room, the
// document requests attached to it, and the owner actions that move it forward.
//
// Trust model: `room_public_url` and a request's `upload_url` are FRONTEND page
// routes — safe to show and copy. Nothing here is a raw storage URL. Writes are
// limited to org owners/admins; non-admins see a view-only state. Every action
// is explicit (no auto-sharing, no auto-submitting).

import {
  FormEvent,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Archive,
  CheckCircle2,
  Copy,
  DoorOpen,
  Download,
  Eye,
  ExternalLink,
  FileUp,
  Loader2,
  Package,
  RotateCcw,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Toast, type ToastState } from "@/components/ui/toast";
import { FilePreviewDialog } from "@/components/ui/file-preview-dialog";
import { useFeature } from "@/components/features/feature-flags-provider";
import { ApiError } from "@/lib/api";
import { formatFileSize } from "@/lib/document-files";
import { daysUntil, formatDate } from "@/lib/documents";
import { canManageOrganization, getOrganization } from "@/lib/organizations";
import {
  PORTAL_CASE_PRIORITY_LABELS,
  PORTAL_CASE_PRIORITY_TONE,
  PORTAL_CASE_STATUS_LABELS,
  PORTAL_CASE_STATUS_TONE,
  PORTAL_CASE_TYPE_LABELS,
  PORTAL_PERSON_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  REVIEW_STATUS_TONE,
  archivePortalCase,
  canDecideStatus,
  copyToClipboard,
  createCasePack,
  createCaseRequest,
  createCaseRoom,
  getPortalCase,
  getReviewFileDownloadBlob,
  getReviewFilePreviewBlob,
  groupReviewItemsByStatus,
  isOrgLimitError,
  isPortalForbiddenError,
  isPortalNotEnabledError,
  progressPercent,
  reviewCaseRequest,
  reviewNoteRequired,
  reviewNotifyDefault,
  startCaseRequestReview,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type { Organization } from "@/types/organizations";
import type {
  PortalCase,
  PortalCaseRequest,
  PortalReviewDecision,
} from "@/types/portals";

/**
 * Pick the best message for an action error. An `organization_plan_limit_exceeded`
 * error carries a clear, human `message` from the backend — surface that.
 * Any other ApiError uses its message; everything else uses the fallback.
 */
function orgLimitMessage(err: unknown, fallback: string): string {
  if (isOrgLimitError(err)) {
    const message = (err.data as Record<string, unknown>).message;
    if (typeof message === "string" && message) return message;
  }
  if (err instanceof ApiError) return err.message;
  return fallback;
}

export default function PortalCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string; caseId: string }>;
}) {
  const { id, caseId } = use(params);
  const orgId = Number(id);
  const caseIdNum = Number(caseId);
  const portalsEnabled = useFeature("b2b_portals");

  const [org, setOrg] = useState<Organization | null>(null);
  const [portalCase, setPortalCase] = useState<PortalCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState<
    "coming_soon" | "paywall" | "view_only" | null
  >(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [packModal, setPackModal] = useState(false);
  const [requestModal, setRequestModal] = useState(false);
  // Inline limit/validation errors surfaced inside the create modals.
  const [packError, setPackError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  // The request currently open in the review modal (admin decision flow).
  const [reviewTarget, setReviewTarget] = useState<PortalCaseRequest | null>(
    null,
  );
  // In-app file preview of an uploaded document (authenticated blob → object URL).
  const [previewMeta, setPreviewMeta] = useState<{
    fileName: string;
    contentType: string;
  } | null>(null);
  const [previewFetch, setPreviewFetch] = useState<{
    url: string | null;
    loading: boolean;
    error: string | null;
  }>({ url: null, loading: false, error: null });
  const previewUrlRef = useRef<string | null>(null);

  const canManage = org ? canManageOrganization(org.user_role) : false;

  const reload = useCallback(async () => {
    const next = await getPortalCase(orgId, caseIdNum);
    setPortalCase(next);
    return next;
  }, [orgId, caseIdNum]);

  useEffect(() => {
    let active = true;

    getOrganization(orgId)
      .then((organization) => {
        if (active) setOrg(organization);
      })
      .then(() => getPortalCase(orgId, caseIdNum))
      .then((next) => {
        if (active) setPortalCase(next);
      })
      .catch((err) => {
        if (!active) return;
        if (isPortalNotEnabledError(err)) return setBlock("paywall");
        if (err instanceof ApiError) {
          if (err.status === 503) return setBlock("coming_soon");
          if (err.status === 403) return setBlock("view_only");
          return setLoadError(err.message);
        }
        setLoadError("Unable to load this case.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orgId, caseIdNum]);

  const backLink = (
    <Link
      href={`/dashboard/organizations/${orgId}/portal`}
      className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}
    >
      <ArrowLeft className="size-4" />
      Back to portal
    </Link>
  );

  async function handleCopy(text: string, key: string) {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(key);
      setToast({ message: "Link copied.", kind: "success" });
      window.setTimeout(() => setCopied(null), 2000);
    } else {
      setToast({ message: "Could not copy the link.", kind: "error" });
    }
  }

  async function handleCreateRoom() {
    setBusy(true);
    try {
      await createCaseRoom(orgId, caseIdNum);
      await reload();
      setToast({ message: "Sharing room created.", kind: "success" });
    } catch (err) {
      setToast({
        message: orgLimitMessage(err, "Could not create the room."),
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Archive this case? It will leave the active list.")
    ) {
      return;
    }
    setBusy(true);
    try {
      await archivePortalCase(orgId, caseIdNum);
      setToast({ message: "Case archived.", kind: "success" });
      await reload();
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Could not archive this case.",
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  function revokePreviewUrl() {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }

  // Release any object URL when the page unmounts.
  useEffect(() => () => revokePreviewUrl(), []);

  // Preview an uploaded file: fetch it through the org-scoped proxy as an
  // authenticated blob (NEVER a raw storage URL) and show it in the dialog.
  async function handlePreviewUpload(request: PortalCaseRequest) {
    if (!request.uploaded_file) return;
    revokePreviewUrl();
    setPreviewMeta({
      fileName: request.uploaded_file.original_filename,
      contentType: request.uploaded_file.content_type,
    });
    setPreviewFetch({ url: null, loading: true, error: null });
    try {
      const blob = await getReviewFilePreviewBlob(
        orgId,
        caseIdNum,
        request.case_request_id,
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
    setPreviewMeta(null);
    setPreviewFetch({ url: null, loading: false, error: null });
  }

  // Download an uploaded file through the authenticated org-scoped proxy.
  async function handleDownloadUpload(request: PortalCaseRequest) {
    if (!request.uploaded_file) return;
    setBusy(true);
    try {
      await getReviewFileDownloadBlob(
        orgId,
        caseIdNum,
        request.case_request_id,
        request.uploaded_file.original_filename,
      );
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "Could not download this file.",
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  // Move an uploaded request into "under review" before opening the modal, so
  // the queue reflects that someone is working on it. Best-effort: even if the
  // start-review call fails (e.g. it's already under review), still open.
  async function openReview(request: PortalCaseRequest) {
    if (request.review_status === "uploaded") {
      try {
        await startCaseRequestReview(orgId, caseIdNum, request.case_request_id);
        const next = await reload();
        const refreshed = next.requests.find(
          (r) => r.case_request_id === request.case_request_id,
        );
        setReviewTarget(refreshed ?? request);
        return;
      } catch {
        // Fall through and open with what we have.
      }
    }
    setReviewTarget(request);
  }

  if (!portalsEnabled || block === "coming_soon") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Portal" title="Case" />
        <InlineAlert tone="warn">
          Portals aren&apos;t enabled for your account yet.
        </InlineAlert>
      </PageContainer>
    );
  }

  if (block === "paywall") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Portal" title="Case" />
        <InlineAlert tone="secure">
          B2B Portals are available on Teams. This organization isn&apos;t on a
          Teams plan yet — open the portal to request access.
        </InlineAlert>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer width="wide">
        {backLink}
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-56" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl" />
      </PageContainer>
    );
  }

  if (block === "view_only" && !portalCase) {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Portal" title="Case" />
        <InlineAlert tone="warn">
          You don&apos;t have access to this case.
        </InlineAlert>
      </PageContainer>
    );
  }

  if (loadError && !portalCase) {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Portal" title="Case" />
        <InlineAlert>{loadError}</InlineAlert>
      </PageContainer>
    );
  }

  if (!portalCase) return null;

  const progress = portalCase.progress;
  const percent = progressPercent(progress);

  return (
    <PageContainer width="wide">
      {backLink}
      <PageHeader
        eyebrow={PORTAL_CASE_TYPE_LABELS[portalCase.case_type]}
        title={portalCase.title}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              tone={PORTAL_CASE_STATUS_TONE[portalCase.status]}
              withDot={false}
            >
              {PORTAL_CASE_STATUS_LABELS[portalCase.status]}
            </StatusBadge>
            {portalCase.priority !== "normal" && (
              <StatusBadge
                tone={PORTAL_CASE_PRIORITY_TONE[portalCase.priority]}
                withDot={false}
              >
                {PORTAL_CASE_PRIORITY_LABELS[portalCase.priority]}
              </StatusBadge>
            )}
          </div>
        }
      />

      {!canManage && (
        <TrustNotice icon={ShieldAlert} title="View-only access">
          You can view this case. Creating packs, rooms, and requests is limited
          to organization owners and admins.
        </TrustNotice>
      )}

      <CaseSummaryStrip portalCase={portalCase} />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {/* Person card */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-heading text-base font-semibold">Person</h2>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {portalCase.person.full_name}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="rounded-md bg-muted px-1.5 py-0.5">
                    {PORTAL_PERSON_TYPE_LABELS[portalCase.person.person_type]}
                  </span>
                  {portalCase.person.email && (
                    <span className="truncate">{portalCase.person.email}</span>
                  )}
                </p>
              </div>
              {portalCase.due_date && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  Due {formatDate(portalCase.due_date)}
                </span>
              )}
            </div>
            {portalCase.notes && (
              <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {portalCase.notes}
              </p>
            )}
          </section>

          {/* Progress */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-base font-semibold">Readiness</h2>
              <span className="text-sm font-semibold">{percent}%</span>
            </div>
            <div
              className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Readiness"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Stat label="Satisfied" value={progress.satisfied_requirements} />
              <Stat
                label="Missing"
                value={progress.missing_requirements}
                tone={progress.missing_requirements ? "warn" : undefined}
              />
              <Stat label="Requests" value={progress.requests_total} />
              <Stat
                label="To review"
                value={progress.uploads_needing_review}
                tone={progress.uploads_needing_review ? "warn" : undefined}
              />
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">
              {progress.requests_uploaded} uploaded ·{" "}
              {progress.requests_accepted} accepted ·{" "}
              {progress.requests_needs_replacement} need replacement
            </p>
          </section>

          {/* Document requests */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-base font-semibold">
                Document requests
              </h2>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRequestModal(true)}
                  disabled={busy}
                >
                  <FileUp className="size-4" /> New request
                </Button>
              )}
            </div>

            {portalCase.requests.length === 0 ? (
              <p className="mt-4 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
                No document requests yet. Create one to ask the person to upload
                a document through a secure link.
              </p>
            ) : (
              <div className="mt-4 space-y-5">
                {groupReviewItemsByStatus(portalCase.requests).map((group) => (
                  <div key={group.status}>
                    <div className="flex items-center gap-2">
                      <StatusBadge
                        tone={REVIEW_STATUS_TONE[group.status]}
                        withDot={false}
                      >
                        {REVIEW_STATUS_LABELS[group.status]}
                      </StatusBadge>
                      <span className="text-xs text-muted-foreground">
                        {group.items.length}
                      </span>
                    </div>
                    <ul className="mt-2 space-y-2">
                      {group.items.map((request) => (
                        <RequestRow
                          key={request.case_request_id}
                          request={request}
                          canManage={canManage}
                          busy={busy}
                          copied={copied}
                          onCopy={handleCopy}
                          onPreview={handlePreviewUpload}
                          onDownload={handleDownloadUpload}
                          onReview={openReview}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column: linked resources + actions */}
        <aside className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-heading text-base font-semibold">
              Linked resources
            </h2>

            <div className="mt-3 space-y-3">
              {/* Pack */}
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <Package className="size-4 text-muted-foreground" aria-hidden />
                  Application pack
                </span>
                {portalCase.linked_bundle ? (
                  <Link
                    href={`/dashboard/bundles/${portalCase.linked_bundle}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Open <ExternalLink className="size-3.5" aria-hidden />
                  </Link>
                ) : canManage ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPackModal(true)}
                    disabled={busy}
                  >
                    Create pack
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">None</span>
                )}
              </div>

              {/* Room */}
              <div className="rounded-lg border border-border px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm">
                    <DoorOpen
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                    Sharing room
                  </span>
                  {!portalCase.linked_room && canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleCreateRoom}
                      disabled={busy}
                    >
                      {busy && <Loader2 className="size-4 animate-spin" />}
                      Create room
                    </Button>
                  )}
                  {!portalCase.linked_room && !canManage && (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </div>

                {portalCase.linked_room && portalCase.room_public_url && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a
                      href={portalCase.room_public_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        buttonVariants({ variant: "outline", size: "sm" }),
                      )}
                    >
                      Open public room
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        handleCopy(portalCase.room_public_url ?? "", "room")
                      }
                    >
                      {copied === "room" ? (
                        <CheckCircle2 className="size-4" aria-hidden />
                      ) : (
                        <Copy className="size-4" aria-hidden />
                      )}
                      {copied === "room" ? "Copied" : "Copy link"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Private until you share the link. Anyone with the room link can see
              what you place in it.
            </p>
          </section>

          {canManage && portalCase.status !== "archived" && (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-heading text-base font-semibold">Manage</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Archiving keeps the record but removes the case from the active
                list. The person and any files are preserved.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-destructive hover:text-destructive"
                onClick={handleArchive}
                disabled={busy}
              >
                <Archive className="size-4" /> Archive case
              </Button>
            </section>
          )}
        </aside>
      </div>

      {packModal && canManage && (
        <CreatePackModal
          error={packError}
          onClose={() => {
            setPackModal(false);
            setPackError(null);
          }}
          onConfirm={async (requirements) => {
            setBusy(true);
            setPackError(null);
            try {
              await createCasePack(orgId, caseIdNum, {
                requirements: requirements.length ? requirements : undefined,
              });
              await reload();
              setPackModal(false);
              setToast({ message: "Application pack created.", kind: "success" });
            } catch (err) {
              // Limit errors stay inline in the form; other failures too.
              setPackError(orgLimitMessage(err, "Could not create the pack."));
            } finally {
              setBusy(false);
            }
          }}
          busy={busy}
        />
      )}

      {requestModal && canManage && (
        <CreateRequestModal
          defaultRecipientName={portalCase.person.full_name}
          defaultRecipientEmail={portalCase.person.email}
          error={requestError}
          onClose={() => {
            setRequestModal(false);
            setRequestError(null);
          }}
          onConfirm={async (body) => {
            setBusy(true);
            setRequestError(null);
            try {
              await createCaseRequest(orgId, caseIdNum, body);
              await reload();
              setRequestModal(false);
              setToast({ message: "Document request created.", kind: "success" });
            } catch (err) {
              setRequestError(
                orgLimitMessage(err, "Could not create the request."),
              );
            } finally {
              setBusy(false);
            }
          }}
          busy={busy}
        />
      )}

      {reviewTarget && canManage && (
        <ReviewModal
          request={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onPreview={() => handlePreviewUpload(reviewTarget)}
          onDownload={() => handleDownloadUpload(reviewTarget)}
          downloading={busy}
          onConfirm={async (body) => {
            try {
              const result = await reviewCaseRequest(
                orgId,
                caseIdNum,
                reviewTarget.case_request_id,
                body,
              );
              await reload();
              setReviewTarget(null);
              const verb =
                body.decision === "accepted"
                  ? "accepted"
                  : body.decision === "rejected"
                    ? "rejected"
                    : "marked for replacement";
              setToast({
                message: result.notified_recipient
                  ? `Document ${verb}. The recipient was notified.`
                  : `Document ${verb}.`,
                kind: "success",
              });
            } catch (err) {
              // Re-throw a friendly message for the modal to show inline.
              if (isPortalForbiddenError(err)) {
                throw new Error(
                  "Only organization owners and admins can review uploads.",
                );
              }
              throw new Error(
                err instanceof ApiError
                  ? err.message
                  : "Could not record this decision.",
              );
            }
          }}
        />
      )}

      <FilePreviewDialog
        preview={
          previewMeta
            ? {
                fileName: previewMeta.fileName,
                contentType: previewMeta.contentType,
                url: previewFetch.url,
                loading: previewFetch.loading,
                error: previewFetch.error,
              }
            : null
        }
        onClose={closePreview}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </PageContainer>
  );
}

/**
 * A restrained at-a-glance strip near the top of the case: the few numbers and
 * dates that say "what's left to do here". Reuses the case payload already
 * loaded (`progress` + `due_date`/`status`) — no extra fetch.
 */
function CaseSummaryStrip({ portalCase }: { portalCase: PortalCase }) {
  const progress = portalCase.progress;
  const daysLeft = daysUntil(portalCase.due_date);
  const overdue =
    daysLeft !== null &&
    daysLeft < 0 &&
    portalCase.status !== "completed" &&
    portalCase.status !== "archived";
  const suggestDiffers =
    progress.suggested_status !== portalCase.status &&
    portalCase.status !== "archived";

  return (
    <section
      aria-label="Case summary"
      className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border border-border bg-card px-5 py-3.5 shadow-card"
    >
      <SummaryItem
        label="Missing"
        value={progress.missing_requirements}
        tone={progress.missing_requirements ? "warn" : undefined}
      />
      <SummaryItem
        label="Needs review"
        value={progress.uploads_needing_review}
        tone={progress.uploads_needing_review ? "warn" : undefined}
      />
      <SummaryItem label="Accepted" value={progress.requests_accepted} />
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Due date</span>
        <span
          className={cn(
            "mt-0.5 text-sm font-medium",
            overdue ? "text-destructive" : "text-foreground",
          )}
        >
          {portalCase.due_date ? formatDate(portalCase.due_date) : "No due date"}
          {overdue && " · Overdue"}
        </span>
      </div>
      {suggestDiffers && (
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Suggested status</span>
          <span className="mt-0.5">
            <StatusBadge
              tone={PORTAL_CASE_STATUS_TONE[progress.suggested_status]}
              withDot={false}
            >
              {PORTAL_CASE_STATUS_LABELS[progress.suggested_status]}
            </StatusBadge>
          </span>
        </div>
      )}
    </section>
  );
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "mt-0.5 text-sm font-semibold",
          tone === "warn" && value > 0 ? "text-brand-amber" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn";
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-lg font-semibold",
          tone === "warn" && value > 0 ? "text-brand-amber" : "",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function RequestRow({
  request,
  canManage,
  busy,
  copied,
  onCopy,
  onPreview,
  onDownload,
  onReview,
}: {
  request: PortalCaseRequest;
  canManage: boolean;
  busy: boolean;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
  onPreview: (request: PortalCaseRequest) => void;
  onDownload: (request: PortalCaseRequest) => void;
  onReview: (request: PortalCaseRequest) => void;
}) {
  const key = `req-${request.case_request_id}`;
  const file = request.uploaded_file;
  const decidable = canDecideStatus(request.review_status);
  return (
    <li
      id={`request-${request.case_request_id}`}
      className="scroll-mt-24 rounded-lg border border-border px-3 py-2.5"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {request.requested_document_title}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs text-muted-foreground">
            <span>{request.recipient_name || "No recipient"}</span>
            {request.due_date && <span>· Due {formatDate(request.due_date)}</span>}
          </p>
        </div>
        <StatusBadge
          tone={REVIEW_STATUS_TONE[request.review_status]}
          withDot={false}
        >
          {REVIEW_STATUS_LABELS[request.review_status]}
        </StatusBadge>
      </div>

      {/* Uploaded file + its metadata */}
      {file && (
        <div className="mt-2 rounded-lg bg-muted/40 px-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">
                {file.original_filename}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.file_size)}
                {request.uploaded_at && (
                  <> · Uploaded {formatDate(request.uploaded_at)}</>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {file.is_previewable && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onPreview(request)}
                  disabled={busy}
                >
                  <Eye className="size-4" aria-hidden /> Preview
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDownload(request)}
                disabled={busy}
              >
                <Download className="size-4" aria-hidden /> Download
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Decision outcome (when reviewed) */}
      {(request.reviewed_by || request.review_note || request.rejection_reason) && (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {request.reviewed_by && (
            <p>
              Reviewed by {request.reviewed_by}
              {request.reviewed_at && <> · {formatDate(request.reviewed_at)}</>}
            </p>
          )}
          {(request.review_note || request.rejection_reason) && (
            <p className="rounded-md bg-muted/40 px-2 py-1.5 text-foreground/80">
              {request.rejection_reason || request.review_note}
            </p>
          )}
          {request.decision_count > 0 && (
            <p>
              {request.decision_count} decision
              {request.decision_count === 1 ? "" : "s"} on record
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {canManage && decidable && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReview(request)}
            disabled={busy}
          >
            <ThumbsUp className="size-4" aria-hidden /> Review
          </Button>
        )}
        {request.can_upload && request.upload_url && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCopy(request.upload_url ?? "", key)}
          >
            {copied === key ? (
              <CheckCircle2 className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {copied === key ? "Copied" : "Copy upload link"}
          </Button>
        )}
      </div>
    </li>
  );
}

// ---- Modals -----------------------------------------------------------------

function ModalShell({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold">{title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
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
        {children}
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function CreatePackModal({
  onClose,
  onConfirm,
  busy,
  error,
}: {
  onClose: () => void;
  onConfirm: (requirements: string[]) => void;
  busy: boolean;
  error: string | null;
}) {
  const [text, setText] = useState("");
  const requirements = useMemo(
    () =>
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [text],
  );

  return (
    <ModalShell
      title="Create application pack"
      description="Build a pack from this case's requirements. The case keeps its own copy — nothing is shared yet."
      onClose={onClose}
    >
      <form
        className="mt-5 flex flex-col gap-4"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          onConfirm(requirements);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pack-reqs">Requirements (optional)</Label>
          <Textarea
            id="pack-reqs"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder={"One per line — leave blank to use the case's existing requirements."}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            {requirements.length} extra requirement
            {requirements.length === 1 ? "" : "s"}.
          </p>
        </div>
        {error && <InlineAlert>{error}</InlineAlert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Create pack
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

function CreateRequestModal({
  defaultRecipientName,
  defaultRecipientEmail,
  onClose,
  onConfirm,
  busy,
  error,
}: {
  defaultRecipientName: string;
  defaultRecipientEmail: string;
  onClose: () => void;
  onConfirm: (body: {
    requested_document_title: string;
    instructions?: string;
    recipient_name?: string;
    recipient_email?: string;
    due_date?: string;
  }) => void;
  busy: boolean;
  error: string | null;
}) {
  const [docTitle, setDocTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [recipientName, setRecipientName] = useState(defaultRecipientName);
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipientEmail);
  const [dueDate, setDueDate] = useState("");
  const [touched, setTouched] = useState(false);

  const titleEmpty = docTitle.trim().length === 0;

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (titleEmpty) {
      setTouched(true);
      return;
    }
    onConfirm({
      requested_document_title: docTitle.trim(),
      instructions: instructions.trim() || undefined,
      recipient_name: recipientName.trim() || undefined,
      recipient_email: recipientEmail.trim() || undefined,
      due_date: dueDate || undefined,
    });
  }

  return (
    <ModalShell
      title="Request a document"
      description="Ask this person to upload a document through a secure link. No public link is live until you share it."
      onClose={onClose}
    >
      <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rq-title">
            Document title <span className="text-destructive">*</span>
          </Label>
          <Input
            id="rq-title"
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="e.g. Passport copy"
            aria-invalid={touched && titleEmpty}
            disabled={busy}
          />
          {touched && titleEmpty && (
            <p className="text-xs text-destructive">
              Name the document you need.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rq-instructions">Instructions (optional)</Label>
          <Textarea
            id="rq-instructions"
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={2}
            placeholder="Any rules — e.g. PDF, both sides, clear scan."
            disabled={busy}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rq-name">Recipient name</Label>
            <Input
              id="rq-name"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rq-email">Recipient email</Label>
            <Input
              id="rq-email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rq-due">Due date (optional)</Label>
          <Input
            id="rq-due"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={busy}
          />
        </div>

        {error && <InlineAlert>{error}</InlineAlert>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy || titleEmpty}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Create request
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// ---- Review modal -----------------------------------------------------------

const DECISIONS: Array<{
  value: PortalReviewDecision;
  label: string;
  icon: typeof ThumbsUp;
}> = [
  { value: "accepted", label: "Accept", icon: ThumbsUp },
  { value: "needs_replacement", label: "Needs replacement", icon: RotateCcw },
  { value: "rejected", label: "Reject", icon: ThumbsDown },
];

function ReviewModal({
  request,
  onClose,
  onConfirm,
  onPreview,
  onDownload,
  downloading,
}: {
  request: PortalCaseRequest;
  onClose: () => void;
  onConfirm: (body: {
    decision: PortalReviewDecision;
    note?: string;
    notify_recipient?: boolean;
  }) => Promise<void>;
  onPreview: () => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  const [decision, setDecision] = useState<PortalReviewDecision>("accepted");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(reviewNotifyDefault("accepted"));
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const file = request.uploaded_file;
  const noteRequired = reviewNoteRequired(decision);
  const noteMissing = noteRequired && note.trim().length === 0;
  const satisfiesRequirement = request.requirement_id !== null;

  function pickDecision(next: PortalReviewDecision) {
    setDecision(next);
    setNotify(reviewNotifyDefault(next));
    setError(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (noteMissing) {
      setTouched(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        decision,
        note: note.trim() || undefined,
        notify_recipient: request.has_recipient_email ? notify : undefined,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not record this decision.",
      );
      setSubmitting(false);
    }
  }

  return (
    <ModalShell
      title="Review document"
      description="Decide whether this upload is accepted, needs replacing, or is rejected. The original file is always preserved."
      onClose={onClose}
    >
      <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
        {/* Context */}
        <div className="rounded-lg border border-border px-3 py-2.5">
          <p className="text-sm font-medium">
            {request.requested_document_title}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {request.recipient_name || "No recipient"}
          </p>
          {file ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">
                  {file.original_filename}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.file_size)}
                  {request.uploaded_at && (
                    <> · Uploaded {formatDate(request.uploaded_at)}</>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {file.is_previewable && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onPreview}
                    disabled={submitting}
                  >
                    <Eye className="size-4" aria-hidden /> Preview
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onDownload}
                  disabled={submitting || downloading}
                >
                  <Download className="size-4" aria-hidden /> Download
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-brand-amber">
              No file has been uploaded yet — you can only accept a document once
              it has been uploaded.
            </p>
          )}
        </div>

        {/* Decision */}
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Decision</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {DECISIONS.map((option) => {
              const Icon = option.icon;
              const active = decision === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => pickDecision(option.value)}
                  aria-pressed={active}
                  disabled={submitting}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {option.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {decision === "accepted" && satisfiesRequirement && (
          <InlineAlert tone="secure">
            Acceptance will satisfy the linked pack requirement.
          </InlineAlert>
        )}

        {/* Note */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rv-note">
            {decision === "accepted" ? "Note (optional)" : "Reason"}
            {noteRequired && <span className="text-destructive"> *</span>}
          </Label>
          <Textarea
            id="rv-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => setTouched(true)}
            rows={3}
            placeholder={
              decision === "accepted"
                ? "Anything worth noting for your team."
                : "Tell the recipient what to fix or why this was rejected."
            }
            aria-invalid={touched && noteMissing}
            disabled={submitting}
          />
          {touched && noteMissing && (
            <p className="text-xs text-destructive">
              Add a short reason so the recipient knows what to do.
            </p>
          )}
        </div>

        {/* Notify */}
        {request.has_recipient_email && (
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={notify}
              onChange={(e) => setNotify(e.target.checked)}
              disabled={submitting}
              className="mt-0.5 size-4 rounded border-input"
            />
            <span>
              Notify the recipient by email
              <span className="block text-xs text-muted-foreground">
                Sends a short update about this decision.
              </span>
            </span>
          </label>
        )}

        {error && <InlineAlert>{error}</InlineAlert>}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || (decision === "accepted" && !file)}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {decision === "accepted"
              ? "Accept document"
              : decision === "rejected"
                ? "Reject document"
                : "Request replacement"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}
