"use client";

// Owner UI for CertaNest Portals (B2B Portals MVP). An organization manages the
// people it serves (clients, students, applicants, employees, family members)
// and the document "cases" attached to each of them.
//
// The whole feature is behind the `b2b_portals` feature flag: a disabled flag
// surfaces as a 503 (we show a calm "coming soon" state). Writes require an org
// admin/owner role: non-admins get a 403 and a view-only message. Public links
// (room URL, request upload URL) are frontend page routes — safe to show/copy.

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
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Inbox,
  Loader2,
  ShieldAlert,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  InlineAlert,
  ProductMetric,
  SegmentedControl,
  TrustNotice,
} from "@/components/ui/product-ui";
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
  PORTAL_CASE_PRIORITY_ORDER,
  PORTAL_CASE_PRIORITY_TONE,
  PORTAL_CASE_STATUS_LABELS,
  PORTAL_CASE_STATUS_TONE,
  PORTAL_CASE_TYPE_LABELS,
  PORTAL_CASE_TYPE_ORDER,
  PORTAL_PERSON_STATUS_LABELS,
  PORTAL_PERSON_STATUS_TONE,
  PORTAL_PERSON_TYPE_LABELS,
  PORTAL_PERSON_TYPE_ORDER,
  createPortalCase,
  createPortalPerson,
  getPortalCases,
  getPortalPeople,
  getPortalReviewQueue,
  getPortalSummary,
  progressPercent,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type { Organization } from "@/types/organizations";
import type {
  PortalCase,
  PortalCasePriority,
  PortalCaseType,
  PortalPerson,
  PortalPersonType,
  PortalReviewItem,
  PortalSummary,
} from "@/types/portals";

type PortalTab = "people" | "cases";

interface PortalState {
  summary: PortalSummary;
  people: PortalPerson[];
  cases: PortalCase[];
  reviewItems: PortalReviewItem[];
}

/** Distinguish the disabled-feature (503) and permission (403) blocks. */
type BlockKind = "coming_soon" | "view_only" | null;

const TABS: Array<{ value: PortalTab; label: string }> = [
  { value: "people", label: "People" },
  { value: "cases", label: "Cases" },
];

export default function OrganizationPortalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const orgId = Number(id);
  const portalsEnabled = useFeature("b2b_portals");

  const [org, setOrg] = useState<Organization | null>(null);
  const [data, setData] = useState<PortalState | null>(null);
  const [tab, setTab] = useState<PortalTab>("cases");
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState<BlockKind>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [creatingCase, setCreatingCase] = useState(false);

  const canManage = org ? canManageOrganization(org.user_role) : false;

  const loadPortal = useCallback(async (): Promise<PortalState> => {
    const [summary, people, cases, reviewQueue] = await Promise.all([
      getPortalSummary(orgId),
      getPortalPeople(orgId),
      getPortalCases(orgId),
      getPortalReviewQueue(orgId),
    ]);
    return {
      summary,
      people: people.people,
      cases: cases.cases,
      reviewItems: reviewQueue.items,
    };
  }, [orgId]);

  const refresh = useCallback(
    async (message?: string) => {
      const next = await loadPortal();
      setData(next);
      if (message) setToast({ message, kind: "success" });
    },
    [loadPortal],
  );

  useEffect(() => {
    let active = true;

    // Load the org first (gives us the role for write-gating), then the portal.
    getOrganization(orgId)
      .then((organization) => {
        if (!active) return organization;
        setOrg(organization);
        return organization;
      })
      .then(() => loadPortal())
      .then((next) => {
        if (!active) return;
        setData(next);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError) {
          if (err.status === 503) {
            setBlock("coming_soon");
            return;
          }
          if (err.status === 403) {
            // A 403 here means either not-an-admin (writes blocked) or
            // not-a-member. We can't always tell apart from the status alone,
            // but the org load succeeding tells us they're a member.
            setBlock("view_only");
            return;
          }
          setLoadError(err.message);
          return;
        }
        setLoadError("Unable to load this portal.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orgId, loadPortal]);

  const backLink = (
    <Link
      href={`/dashboard/organizations/${orgId}`}
      className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}
    >
      <ArrowLeft className="size-4" />
      Back to organization
    </Link>
  );

  // Feature flag is the most authoritative "off" signal we have client-side.
  if (!portalsEnabled || block === "coming_soon") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Portal" />
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={Inbox}
            title="Portals are coming soon."
            description="This workspace lets your team manage the people you serve and the documents each of them needs — in one calm, trackable place. It isn't enabled for your account yet."
          />
        </div>
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer width="wide">
        {backLink}
        <span className="sr-only" role="status">
          Loading portal…
        </span>
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageContainer>
    );
  }

  if (loadError && data === null) {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Portal" />
        <InlineAlert>{loadError}</InlineAlert>
      </PageContainer>
    );
  }

  if (block === "view_only" && data === null) {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Portal" />
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={ShieldAlert}
            title="You don't have access to this portal."
            description="Managing people and cases in this portal is limited to organization owners and admins. Ask an admin if you need access."
          />
        </div>
      </PageContainer>
    );
  }

  if (!data) return null;

  const summary = data.summary;

  return (
    <PageContainer width="wide">
      {backLink}
      <PageHeader
        eyebrow={org ? org.name : "Organization"}
        title="Portal"
        description="Manage the people you serve and the documents each of them needs — request, review, and get every case ready."
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setAddingPerson(true)}
              >
                <UserPlus className="size-4" /> Add person
              </Button>
              <Button
                onClick={() => setCreatingCase(true)}
                disabled={data.people.length === 0}
                title={
                  data.people.length === 0
                    ? "Add a person first"
                    : undefined
                }
              >
                <ClipboardList className="size-4" /> Create case
              </Button>
            </div>
          ) : undefined
        }
      />

      {!canManage && (
        <TrustNotice icon={ShieldAlert} title="View-only access">
          You can view this portal. Adding people, creating cases, and sending
          requests are limited to organization owners and admins.
        </TrustNotice>
      )}

      {/* Summary tiles — the 7 portal counts. */}
      <section
        aria-label="Portal summary"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <ProductMetric
          label="People"
          value={summary.people_total}
          hint={`${summary.people_waiting_for_documents} waiting for documents`}
          icon={Users}
          tone={summary.people_waiting_for_documents ? "warn" : "secure"}
        />
        <ProductMetric
          label="Active cases"
          value={summary.active_cases}
          hint={`${summary.ready_cases} ready`}
          icon={ClipboardCheck}
        />
        <ProductMetric
          label="Needs review"
          value={summary.uploads_needing_review}
          hint="Uploads waiting for you"
          icon={Inbox}
          tone={summary.uploads_needing_review ? "warn" : "secure"}
        />
        <ProductMetric
          label="At risk"
          value={summary.overdue_cases + summary.blocked_cases}
          hint={`${summary.overdue_cases} overdue · ${summary.blocked_cases} blocked`}
          icon={ShieldAlert}
          tone={
            summary.overdue_cases + summary.blocked_cases ? "danger" : "secure"
          }
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="space-y-5">
          <SegmentedControl
            value={tab}
            options={TABS}
            onChange={setTab}
            label="Portal sections"
          />

          {tab === "people" ? (
            <PeopleList
              people={data.people}
              canManage={canManage}
              onAdd={() => setAddingPerson(true)}
            />
          ) : (
            <CaseList
              orgId={orgId}
              cases={data.cases}
              canManage={canManage}
              hasPeople={data.people.length > 0}
              onCreate={() => setCreatingCase(true)}
            />
          )}
        </div>

        <ReviewQueuePanel orgId={orgId} items={data.reviewItems} />
      </div>

      {addingPerson && canManage && (
        <AddPersonModal
          orgId={orgId}
          onClose={() => setAddingPerson(false)}
          onCreated={async () => {
            setAddingPerson(false);
            setTab("people");
            await refresh("Person added.");
          }}
        />
      )}

      {creatingCase && canManage && (
        <CreateCaseModal
          orgId={orgId}
          people={data.people}
          onClose={() => setCreatingCase(false)}
          onCreated={async () => {
            setCreatingCase(false);
            setTab("cases");
            await refresh("Case created.");
          }}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </PageContainer>
  );
}

// ---- People list ------------------------------------------------------------

function PeopleList({
  people,
  canManage,
  onAdd,
}: {
  people: PortalPerson[];
  canManage: boolean;
  onAdd: () => void;
}) {
  if (people.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card">
        <EmptyState
          icon={Users}
          title="No people yet."
          description="Add the clients, students, applicants, or employees you're helping. Each person can hold one or more document cases."
          action={
            canManage ? (
              <Button onClick={onAdd}>
                <UserPlus className="size-4" /> Add person
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {people.map((person) => (
        <article
          key={person.id}
          className="rounded-xl border border-border bg-card p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate font-medium">{person.full_name}</h3>
                <StatusBadge
                  tone={PORTAL_PERSON_STATUS_TONE[person.status]}
                  withDot={false}
                >
                  {PORTAL_PERSON_STATUS_LABELS[person.status]}
                </StatusBadge>
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="rounded-md bg-muted px-1.5 py-0.5">
                  {PORTAL_PERSON_TYPE_LABELS[person.person_type]}
                </span>
                {person.email && <span className="truncate">{person.email}</span>}
              </p>
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {person.active_cases} active case
              {person.active_cases === 1 ? "" : "s"}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

// ---- Case list --------------------------------------------------------------

function CaseList({
  orgId,
  cases,
  canManage,
  hasPeople,
  onCreate,
}: {
  orgId: number;
  cases: PortalCase[];
  canManage: boolean;
  hasPeople: boolean;
  onCreate: () => void;
}) {
  if (cases.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card">
        <EmptyState
          icon={ClipboardList}
          title="No cases yet."
          description={
            hasPeople
              ? "Create a case to start collecting and tracking the documents a person needs — a visa file, a scholarship application, an onboarding pack."
              : "Add a person first, then create a case to start collecting the documents they need."
          }
          action={
            canManage && hasPeople ? (
              <Button onClick={onCreate}>
                <ClipboardList className="size-4" /> Create case
              </Button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {cases.map((portalCase) => (
        <CaseCard key={portalCase.id} orgId={orgId} portalCase={portalCase} />
      ))}
    </div>
  );
}

function CaseCard({
  orgId,
  portalCase,
}: {
  orgId: number;
  portalCase: PortalCase;
}) {
  const percent = progressPercent(portalCase.progress);
  const missing = portalCase.progress.missing_requirements;
  const review = portalCase.progress.uploads_needing_review;
  return (
    <Link
      href={`/dashboard/organizations/${orgId}/portal/cases/${portalCase.id}`}
      className="block rounded-xl border border-border bg-card p-4 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transform-none motion-reduce:transition-none"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">{portalCase.title}</h3>
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
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="truncate">{portalCase.person.full_name}</span>
            <span className="rounded-md bg-muted px-1.5 py-0.5">
              {PORTAL_CASE_TYPE_LABELS[portalCase.case_type]}
            </span>
            {portalCase.due_date && (
              <span>Due {formatDate(portalCase.due_date)}</span>
            )}
          </p>
        </div>
        <ArrowUpRight
          className="mt-1 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </div>

      <div className="mt-3">
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
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
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{percent}% ready</span>
          {missing > 0 && (
            <span className="text-brand-amber">{missing} missing</span>
          )}
          {review > 0 && (
            <span className="text-brand-amber">{review} to review</span>
          )}
        </p>
      </div>
    </Link>
  );
}

// ---- Review queue panel -----------------------------------------------------

function ReviewQueuePanel({
  orgId,
  items,
}: {
  orgId: number;
  items: PortalReviewItem[];
}) {
  return (
    <aside className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-base font-semibold">Review queue</h2>
        <StatusBadge tone={items.length ? "warning" : "neutral"} withDot={false}>
          {items.length}
        </StatusBadge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Uploads people have sent that are waiting for your review.
      </p>

      {items.length === 0 ? (
        <div className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-3 py-8 text-center">
          <CheckCircle2 className="size-6 text-brand-success" aria-hidden />
          <p className="text-sm font-medium">You&apos;re all caught up.</p>
          <p className="text-xs text-muted-foreground">
            Nothing is waiting for review right now.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((item) => (
            <li key={item.document_request_id}>
              <Link
                href={`/dashboard/organizations/${orgId}/portal/cases/${item.case_id}`}
                className="block rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <p className="truncate text-sm font-medium">
                  {item.requested_document_title}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {item.person_name} · {item.case_title}
                </p>
                {item.uploaded_at && (
                  <p className="mt-0.5 text-xs text-muted-foreground/80">
                    Uploaded {formatDate(item.uploaded_at)}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

// ---- Add person modal -------------------------------------------------------

function ModalHeader({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
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
  );
}

function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function selectClass() {
  return "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
}

function AddPersonModal({
  orgId,
  onClose,
  onCreated,
}: {
  orgId: number;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [personType, setPersonType] = useState<PortalPersonType>("client");
  const [notes, setNotes] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(onClose);

  const nameEmpty = fullName.trim().length === 0;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (nameEmpty) {
      setNameTouched(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createPortalPerson(orgId, {
        full_name: fullName.trim(),
        person_type: personType,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      await onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not add this person.",
      );
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label="Add person"
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <ModalHeader
          title="Add person"
          description="Someone you're helping — a client, student, applicant, or employee."
          onClose={onClose}
        />
        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-name">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pp-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              placeholder="e.g. Amina Diallo"
              aria-invalid={nameTouched && nameEmpty}
              disabled={submitting}
            />
            {nameTouched && nameEmpty && (
              <p className="text-xs text-destructive">
                Enter the person&apos;s full name.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-type">Type</Label>
            <select
              id="pp-type"
              value={personType}
              onChange={(e) =>
                setPersonType(e.target.value as PortalPersonType)
              }
              className={selectClass()}
              disabled={submitting}
            >
              {PORTAL_PERSON_TYPE_ORDER.map((type) => (
                <option key={type} value={type}>
                  {PORTAL_PERSON_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pp-email">Email (optional)</Label>
              <Input
                id="pp-email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="amina@example.com"
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pp-phone">Phone (optional)</Label>
              <Input
                id="pp-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-notes">Notes (optional)</Label>
            <Textarea
              id="pp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything your team should know."
              disabled={submitting}
            />
          </div>

          {error && <InlineAlert>{error}</InlineAlert>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || nameEmpty}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Add person
            </Button>
          </div>
        </form>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

// ---- Create case modal ------------------------------------------------------

function CreateCaseModal({
  orgId,
  people,
  onClose,
  onCreated,
}: {
  orgId: number;
  people: PortalPerson[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [personId, setPersonId] = useState<string>(
    people[0] ? String(people[0].id) : "",
  );
  const [title, setTitle] = useState("");
  const [caseType, setCaseType] = useState<PortalCaseType>("general");
  const [priority, setPriority] = useState<PortalCasePriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [requirementsText, setRequirementsText] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(onClose);

  const titleEmpty = title.trim().length === 0;
  const personMissing = personId === "";

  // One requirement per non-empty line — kept simple and explicit.
  const requirements = useMemo(
    () =>
      requirementsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [requirementsText],
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (titleEmpty || personMissing) {
      setTitleTouched(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createPortalCase(orgId, {
        person: Number(personId),
        title: title.trim(),
        case_type: caseType,
        priority,
        due_date: dueDate || undefined,
        requirements: requirements.length ? requirements : undefined,
      });
      await onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create this case.",
      );
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label="Create case"
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <ModalHeader
          title="Create case"
          description="A document case for one person — collect, review, and get it ready."
          onClose={onClose}
        />
        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pc-person">
              Person <span className="text-destructive">*</span>
            </Label>
            <select
              id="pc-person"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              className={selectClass()}
              disabled={submitting}
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pc-title">
              Case title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              placeholder="e.g. Student visa application"
              aria-invalid={titleTouched && titleEmpty}
              disabled={submitting}
            />
            {titleTouched && titleEmpty && (
              <p className="text-xs text-destructive">
                Give the case a clear title.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pc-type">Type</Label>
              <select
                id="pc-type"
                value={caseType}
                onChange={(e) =>
                  setCaseType(e.target.value as PortalCaseType)
                }
                className={selectClass()}
                disabled={submitting}
              >
                {PORTAL_CASE_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>
                    {PORTAL_CASE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pc-priority">Priority</Label>
              <select
                id="pc-priority"
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as PortalCasePriority)
                }
                className={selectClass()}
                disabled={submitting}
              >
                {PORTAL_CASE_PRIORITY_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {PORTAL_CASE_PRIORITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pc-due">Due date (optional)</Label>
            <Input
              id="pc-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pc-reqs">Initial requirements (optional)</Label>
            <Textarea
              id="pc-reqs"
              value={requirementsText}
              onChange={(e) => setRequirementsText(e.target.value)}
              rows={3}
              placeholder={"One document per line, e.g.\nPassport copy\nBank statement"}
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              {requirements.length} requirement
              {requirements.length === 1 ? "" : "s"} · one per line. You can add
              more later.
            </p>
          </div>

          {error && <InlineAlert>{error}</InlineAlert>}

          <div className="flex justify-end gap-2 pt-1">
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
              disabled={submitting || titleEmpty || personMissing}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Create case
            </Button>
          </div>
        </form>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}
