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
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Archive,
  CheckCircle2,
  Copy,
  DoorOpen,
  ExternalLink,
  FileUp,
  Loader2,
  Package,
  ShieldAlert,
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
import { useFeature } from "@/components/features/feature-flags-provider";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import { canManageOrganization, getOrganization } from "@/lib/organizations";
import {
  PORTAL_CASE_PRIORITY_LABELS,
  PORTAL_CASE_PRIORITY_TONE,
  PORTAL_CASE_STATUS_LABELS,
  PORTAL_CASE_STATUS_TONE,
  PORTAL_CASE_TYPE_LABELS,
  PORTAL_PERSON_TYPE_LABELS,
  archivePortalCase,
  copyToClipboard,
  createCasePack,
  createCaseRequest,
  createCaseRoom,
  getPortalCase,
  progressPercent,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type { Organization } from "@/types/organizations";
import type { PortalCase, PortalCaseRequest } from "@/types/portals";

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
  const [block, setBlock] = useState<"coming_soon" | "view_only" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [packModal, setPackModal] = useState(false);
  const [requestModal, setRequestModal] = useState(false);

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
        message:
          err instanceof ApiError ? err.message : "Could not create the room.",
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
              <ul className="mt-4 space-y-2">
                {portalCase.requests.map((request) => (
                  <RequestRow
                    key={request.document_request_id}
                    request={request}
                    copied={copied}
                    onCopy={handleCopy}
                  />
                ))}
              </ul>
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
          onClose={() => setPackModal(false)}
          onConfirm={async (requirements) => {
            setBusy(true);
            try {
              await createCasePack(orgId, caseIdNum, {
                requirements: requirements.length ? requirements : undefined,
              });
              await reload();
              setPackModal(false);
              setToast({ message: "Application pack created.", kind: "success" });
            } catch (err) {
              setToast({
                message:
                  err instanceof ApiError
                    ? err.message
                    : "Could not create the pack.",
                kind: "error",
              });
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
          onClose={() => setRequestModal(false)}
          onConfirm={async (body) => {
            setBusy(true);
            try {
              await createCaseRequest(orgId, caseIdNum, body);
              await reload();
              setRequestModal(false);
              setToast({ message: "Document request created.", kind: "success" });
            } catch (err) {
              setToast({
                message:
                  err instanceof ApiError
                    ? err.message
                    : "Could not create the request.",
                kind: "error",
              });
            } finally {
              setBusy(false);
            }
          }}
          busy={busy}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </PageContainer>
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
  copied,
  onCopy,
}: {
  request: PortalCaseRequest;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const key = `req-${request.document_request_id}`;
  return (
    <li className="rounded-lg border border-border px-3 py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {request.requested_document_title}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {request.recipient_name || "No recipient"} · {request.status}
          </p>
        </div>
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
}: {
  onClose: () => void;
  onConfirm: (requirements: string[]) => void;
  busy: boolean;
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
