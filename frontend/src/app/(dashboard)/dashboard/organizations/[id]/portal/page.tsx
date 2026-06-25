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
  AlarmClock,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  DoorOpen,
  FileWarning,
  Inbox,
  Loader2,
  Mail,
  RotateCcw,
  ShieldAlert,
  Sparkles,
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
import {
  LimitWarningBanners,
  PlanUsageCard,
} from "@/components/features/portals/plan-usage-card";
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
  dashboardActivityLabel,
  createPortalCase,
  createPortalPerson,
  getPortalCases,
  getPortalDashboard,
  getPortalLimits,
  getPortalPeople,
  isOrgLimitError,
  isPortalNotEnabledError,
  planLabel,
  progressPercent,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type { Organization } from "@/types/organizations";
import type {
  DashboardCaseItem,
  DashboardMetrics,
  DashboardNeedsReplacementItem,
  DashboardQueues,
  DashboardReviewItem,
  OrganizationDashboard,
  PortalCase,
  PortalCasePriority,
  PortalCaseType,
  PortalLimits,
  PortalPerson,
  PortalPersonType,
} from "@/types/portals";

type PortalTab = "people" | "cases";

interface PortalState {
  dashboard: OrganizationDashboard;
  people: PortalPerson[];
  cases: PortalCase[];
}

/**
 * Distinguish the page-level blocks:
 * - `coming_soon`: the `b2b_portals` feature flag is off (503 feature_disabled).
 * - `paywall`: the org has no Teams entitlement (403 portal_not_enabled).
 * - `view_only`: the user is a member but not an admin (403).
 */
type BlockKind = "coming_soon" | "paywall" | "view_only" | null;

const TABS: Array<{ value: PortalTab; label: string }> = [
  { value: "people", label: "People" },
  { value: "cases", label: "Cases" },
];

/**
 * Pick the best message for a create-form error. An `organization_plan_limit_exceeded`
 * error carries a clear, human `message` from the backend — surface that. Any
 * other ApiError uses its message; everything else uses the fallback.
 */
function orgLimitMessage(err: unknown, fallback: string): string {
  if (isOrgLimitError(err)) {
    const message = (err.data as Record<string, unknown>).message;
    if (typeof message === "string" && message) return message;
  }
  if (err instanceof ApiError) return err.message;
  return fallback;
}

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
  const [limits, setLimits] = useState<PortalLimits | null>(null);
  const [tab, setTab] = useState<PortalTab>("cases");
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState<BlockKind>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [creatingCase, setCreatingCase] = useState(false);

  const canManage = org ? canManageOrganization(org.user_role) : false;

  // The dashboard endpoint is the PRIMARY operational data (metrics, queues,
  // plan, recent activity). People + cases are still loaded for the tabs and the
  // Create case modal's person picker.
  const loadPortal = useCallback(async (): Promise<PortalState> => {
    const [dashboard, people, cases] = await Promise.all([
      getPortalDashboard(orgId),
      getPortalPeople(orgId),
      getPortalCases(orgId),
    ]);
    return {
      dashboard,
      people: people.people,
      cases: cases.cases,
    };
  }, [orgId]);

  const refresh = useCallback(
    async (message?: string) => {
      const next = await loadPortal();
      setData(next);
      // The dashboard payload carries the live plan/usage, so keep the card in
      // sync from it after a create/archive.
      setLimits(next.dashboard.plan);
      if (message) setToast({ message, kind: "success" });
    },
    [loadPortal],
  );

  useEffect(() => {
    let active = true;

    // Load the org first (gives us the role for write-gating). Then read the
    // portal LIMITS — which any member can read even when the portal is not
    // enabled — to decide between the live portal and the Teams paywall. Only
    // load the live portal data when `portal_enabled` is true.
    getOrganization(orgId)
      .then((organization) => {
        if (active) setOrg(organization);
      })
      .then(() => getPortalLimits(orgId))
      .then(async (nextLimits) => {
        if (!active) return;
        setLimits(nextLimits);
        if (!nextLimits.portal_enabled) {
          setBlock("paywall");
          return;
        }
        const next = await loadPortal();
        if (active) {
          setData(next);
          // Prefer the dashboard's fresh plan snapshot for the usage card.
          setLimits(next.dashboard.plan);
        }
      })
      .catch(async (err) => {
        if (!active) return;
        // The limits endpoint should not 403 with portal_not_enabled, but if
        // it does (or any portal call does), show the paywall rather than a
        // generic error.
        if (isPortalNotEnabledError(err)) {
          setBlock("paywall");
          return;
        }
        if (err instanceof ApiError) {
          if (err.status === 503) {
            setBlock("coming_soon");
            return;
          }
          if (err.status === 403) {
            // A 403 here means either not-an-admin (writes blocked) or
            // not-a-member. The org load succeeding tells us they're a member.
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

  if (block === "paywall") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader
          eyebrow={org ? org.name : "Organization"}
          title="Portal"
        />
        <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Teams
          </span>
          <h2 className="mt-3 font-heading text-xl font-semibold">
            B2B Portals are available on Teams.
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Portals let your team manage the people you serve and the documents
            each of them needs — request, review, and get every case ready in
            one calm, trackable place. This organization isn&apos;t on a Teams
            plan yet.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <a
              href="mailto:hello@certanest.com?subject=Request%20Teams%20access%20for%20Portals"
              className={cn(buttonVariants({}), "w-fit")}
            >
              <Mail className="size-4" /> Request access
            </a>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            No checkout yet — a CertaNest founder enables Teams for your
            organization. Nothing changes until then.
          </p>
        </section>

        {limits && <PlanUsageCard data={limits} />}
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

  const dashboard = data.dashboard;
  const metrics = dashboard.metrics;
  const queues = dashboard.queues;
  const isEmpty = metrics.total_people === 0 && metrics.total_cases === 0;

  return (
    <PageContainer width="wide">
      {backLink}
      <PageHeader
        eyebrow={dashboard.organization.name || org?.name || "Organization"}
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

      {/* Portal status + plan badge. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge
          tone={dashboard.plan.portal_enabled ? "success" : "neutral"}
          withDot
        >
          {dashboard.plan.portal_enabled ? "Portal active" : "Portal off"}
        </StatusBadge>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <Sparkles className="size-3.5" aria-hidden />
          {planLabel(dashboard.plan.plan)}
        </span>
      </div>

      {limits && <LimitWarningBanners data={limits} />}

      {isEmpty ? (
        <EmptyDashboard
          canManage={canManage}
          onAddPerson={() => setAddingPerson(true)}
          onCreateCase={() => setCreatingCase(true)}
          hasPeople={data.people.length > 0}
        />
      ) : (
        <>
          <OperationalCards metrics={metrics} />

          <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
            <div className="space-y-6">
              <ActionQueues queues={queues} />

              <section className="space-y-5">
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
              </section>
            </div>

            <div className="space-y-6">
              {limits && <PlanUsageCard data={limits} />}
              <RecentActivity queues={queues} />
            </div>
          </div>
        </>
      )}

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

// ---- Empty dashboard --------------------------------------------------------

/**
 * Shown when the org has no people AND no cases: a single focused panel with one
 * obvious next action, instead of a wall of empty queues.
 */
function EmptyDashboard({
  canManage,
  hasPeople,
  onAddPerson,
  onCreateCase,
}: {
  canManage: boolean;
  hasPeople: boolean;
  onAddPerson: () => void;
  onCreateCase: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card">
      <EmptyState
        icon={ClipboardList}
        title="Create your first case."
        description="Add a client, student, or applicant, then create a case to start collecting and reviewing the documents they need — all in one calm, trackable place."
        action={
          canManage ? (
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={onAddPerson}>
                <UserPlus className="size-4" /> Add person
              </Button>
              <Button
                onClick={onCreateCase}
                disabled={!hasPeople}
                title={!hasPeople ? "Add a person first" : undefined}
              >
                <ClipboardList className="size-4" /> Create case
              </Button>
            </div>
          ) : undefined
        }
      />
    </div>
  );
}

// ---- Operational summary cards ----------------------------------------------

/**
 * The compact "what needs doing" count grid: the six action-driving numbers, a
 * restrained tone per card, and a secondary stat row. Cards with a queue link
 * scroll to the matching action queue; the rest are static counts.
 */
function OperationalCards({ metrics }: { metrics: DashboardMetrics }) {
  const cards: Array<{
    label: string;
    value: number;
    hint: string;
    icon: typeof Inbox;
    tone: "default" | "warn" | "danger" | "secure" | "good";
    href?: string;
  }> = [
    {
      label: "Active cases",
      value: metrics.active_cases,
      hint: `${metrics.percent_cases_ready}% ready`,
      icon: ClipboardCheck,
      tone: "default",
    },
    {
      label: "Needs review",
      value: metrics.uploaded_requests_needing_review,
      hint: "Uploads waiting for you",
      icon: Inbox,
      tone: metrics.uploaded_requests_needing_review ? "warn" : "secure",
      href: "#queue-review",
    },
    {
      label: "Overdue",
      value: metrics.overdue_cases,
      hint: `${metrics.due_soon_cases} due soon`,
      icon: AlarmClock,
      tone: metrics.overdue_cases ? "danger" : "secure",
      href: "#queue-overdue",
    },
    {
      label: "Missing documents",
      value: metrics.missing_required_documents,
      hint: "Requirements not yet satisfied",
      icon: FileWarning,
      tone: metrics.missing_required_documents ? "warn" : "secure",
      href: "#queue-missing",
    },
    {
      label: "Ready",
      value: metrics.ready_cases,
      hint: "Cases ready to move forward",
      icon: CheckCircle2,
      tone: metrics.ready_cases ? "good" : "default",
      href: "#queue-ready",
    },
    {
      label: "Needs replacement",
      value: metrics.needs_replacement_requests,
      hint: "Uploads sent back to redo",
      icon: RotateCcw,
      tone: metrics.needs_replacement_requests ? "warn" : "secure",
      href: "#queue-replacement",
    },
  ];

  return (
    <section aria-label="Portal overview" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) =>
          card.href ? (
            <Link
              key={card.label}
              href={card.href}
              className="rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ProductMetric
                label={card.label}
                value={card.value}
                hint={card.hint}
                icon={card.icon}
                tone={card.tone}
              />
            </Link>
          ) : (
            <ProductMetric
              key={card.label}
              label={card.label}
              value={card.value}
              hint={card.hint}
              icon={card.icon}
              tone={card.tone}
            />
          ),
        )}
      </div>

      {/* Secondary stats — smaller, calm context. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <SecondaryStat
          icon={Users}
          label={`${metrics.active_people} active ${
            metrics.active_people === 1 ? "person" : "people"
          }`}
        />
        <SecondaryStat
          icon={Clock}
          label={`${metrics.due_soon_cases} due soon`}
        />
        <SecondaryStat
          icon={Mail}
          label={`${metrics.active_document_requests} active request${
            metrics.active_document_requests === 1 ? "" : "s"
          }`}
        />
        <SecondaryStat
          icon={DoorOpen}
          label={`${metrics.active_sharing_rooms} active room${
            metrics.active_sharing_rooms === 1 ? "" : "s"
          }`}
        />
        {metrics.readiness_average !== null && (
          <SecondaryStat
            icon={ClipboardCheck}
            label={`${metrics.readiness_average}% avg readiness`}
          />
        )}
      </div>
    </section>
  );
}

function SecondaryStat({
  icon: Icon,
  label,
}: {
  icon: typeof Users;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

// ---- Action queues ----------------------------------------------------------

/** A small reusable queue panel header with a count badge. */
function QueueShell({
  id,
  title,
  description,
  count,
  tone,
  children,
}: {
  id: string;
  title: string;
  description: string;
  count: number;
  tone: "warning" | "danger" | "success" | "neutral";
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-base font-semibold">{title}</h3>
        <StatusBadge tone={count ? tone : "neutral"} withDot={false}>
          {count}
        </StatusBadge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Calm "nothing here" line shared by the queues. */
function QueueEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-3 py-7 text-center">
      <CheckCircle2 className="size-5 text-brand-success" aria-hidden />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

/**
 * A single queue row: a deep-link (relative `action_url`) to the case/request.
 * `action_url` values are app routes from the backend — never raw storage URLs.
 */
function QueueRow({
  href,
  title,
  subtitle,
  meta,
  children,
}: {
  href: string;
  title: string;
  subtitle: string;
  meta?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-medium">{title}</p>
          {meta}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {subtitle}
        </p>
        {children}
      </Link>
    </li>
  );
}

/** Cap each queue list so a card stays scannable. */
const QUEUE_CAP = 5;

function ActionQueues({ queues }: { queues: DashboardQueues }) {
  return (
    <div className="space-y-4">
      <ReviewNowQueue items={queues.review_now} />
      <OverdueQueue items={queues.overdue_cases} />
      <MissingDocumentsQueue items={queues.missing_documents} />
      <NeedsReplacementQueue items={queues.needs_replacement} />
      <ReadyQueue items={queues.ready_cases} />
    </div>
  );
}

function ReviewNowQueue({ items }: { items: DashboardReviewItem[] }) {
  return (
    <QueueShell
      id="queue-review"
      title="Review now"
      description="Uploads people have sent that are waiting for your review."
      count={items.length}
      tone="warning"
    >
      {items.length === 0 ? (
        <QueueEmpty message="Nothing is waiting for review right now." />
      ) : (
        <ul className="space-y-2">
          {items.slice(0, QUEUE_CAP).map((item) => (
            <QueueRow
              key={item.case_request_id}
              href={item.action_url}
              title={item.requested_document_title}
              subtitle={`${item.person_name} · ${item.case_title}`}
              meta={
                <span className="shrink-0 text-xs font-medium text-primary">
                  Review
                </span>
              }
            >
              {item.uploaded_at && (
                <p className="mt-1 text-xs text-muted-foreground/80">
                  Uploaded {formatDate(item.uploaded_at)}
                </p>
              )}
            </QueueRow>
          ))}
        </ul>
      )}
    </QueueShell>
  );
}

function OverdueQueue({ items }: { items: DashboardCaseItem[] }) {
  return (
    <QueueShell
      id="queue-overdue"
      title="Overdue cases"
      description="Past their due date and still not ready."
      count={items.length}
      tone="danger"
    >
      {items.length === 0 ? (
        <QueueEmpty message="No cases are overdue. Nicely on top of it." />
      ) : (
        <ul className="space-y-2">
          {items.slice(0, QUEUE_CAP).map((item) => (
            <CaseQueueRow key={item.case_id} item={item} />
          ))}
        </ul>
      )}
    </QueueShell>
  );
}

function MissingDocumentsQueue({ items }: { items: DashboardCaseItem[] }) {
  return (
    <QueueShell
      id="queue-missing"
      title="Missing documents"
      description="Cases still waiting on required documents."
      count={items.length}
      tone="warning"
    >
      {items.length === 0 ? (
        <QueueEmpty message="Every case has what it needs so far." />
      ) : (
        <ul className="space-y-2">
          {items.slice(0, QUEUE_CAP).map((item) => (
            <CaseQueueRow key={item.case_id} item={item} showMissingTitles />
          ))}
        </ul>
      )}
    </QueueShell>
  );
}

function NeedsReplacementQueue({
  items,
}: {
  items: DashboardNeedsReplacementItem[];
}) {
  return (
    <QueueShell
      id="queue-replacement"
      title="Needs replacement"
      description="Uploads you sent back for the recipient to redo."
      count={items.length}
      tone="warning"
    >
      {items.length === 0 ? (
        <QueueEmpty message="Nothing is waiting on a replacement." />
      ) : (
        <ul className="space-y-2">
          {items.slice(0, QUEUE_CAP).map((item) => (
            <QueueRow
              key={item.case_request_id}
              href={item.action_url}
              title={item.requested_document_title}
              subtitle={`${item.person_name} · ${item.case_title}`}
            />
          ))}
        </ul>
      )}
    </QueueShell>
  );
}

function ReadyQueue({ items }: { items: DashboardCaseItem[] }) {
  return (
    <QueueShell
      id="queue-ready"
      title="Ready cases"
      description="Cases that have everything and are ready to move forward."
      count={items.length}
      tone="success"
    >
      {items.length === 0 ? (
        <QueueEmpty message="No cases are ready just yet." />
      ) : (
        <ul className="space-y-2">
          {items.slice(0, QUEUE_CAP).map((item) => (
            <CaseQueueRow key={item.case_id} item={item} />
          ))}
        </ul>
      )}
    </QueueShell>
  );
}

/** A case row used across the overdue / missing / ready queues. */
function CaseQueueRow({
  item,
  showMissingTitles = false,
}: {
  item: DashboardCaseItem;
  showMissingTitles?: boolean;
}) {
  const titles = item.missing_document_titles ?? [];
  return (
    <QueueRow
      href={item.action_url}
      title={item.case_title}
      subtitle={item.person_name}
      meta={
        <StatusBadge tone={PORTAL_CASE_STATUS_TONE[item.status]} withDot={false}>
          {PORTAL_CASE_STATUS_LABELS[item.status]}
        </StatusBadge>
      }
    >
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground/80">
        {item.due_date && (
          <span className={item.is_overdue ? "text-destructive" : undefined}>
            Due {formatDate(item.due_date)}
          </span>
        )}
        {typeof item.missing_requirements === "number" &&
          item.missing_requirements > 0 && (
            <span className="text-brand-amber">
              {item.missing_requirements} missing
            </span>
          )}
        {typeof item.uploads_needing_review === "number" &&
          item.uploads_needing_review > 0 && (
            <span className="text-brand-amber">
              {item.uploads_needing_review} to review
            </span>
          )}
      </p>
      {showMissingTitles && titles.length > 0 && (
        <p className="mt-1.5 flex flex-wrap gap-1">
          {titles.slice(0, 3).map((title) => (
            <span
              key={title}
              className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {title}
            </span>
          ))}
          {titles.length > 3 && (
            <span className="text-[11px] text-muted-foreground">
              +{titles.length - 3} more
            </span>
          )}
        </p>
      )}
    </QueueRow>
  );
}

// ---- Recent activity --------------------------------------------------------

/** A small, calm list of the latest portal events. Safe labels only. */
function RecentActivity({ queues }: { queues: DashboardQueues }) {
  const items = queues.recent_activity;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-heading text-base font-semibold">Recent activity</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        The latest things that happened across your portal.
      </p>

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          Nothing has happened yet. Activity will show here as your team works.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const { label, objectLabel } = dashboardActivityLabel(item);
            return (
              <li key={item.id} className="flex items-start gap-2.5 text-sm">
                <span
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="font-medium">{label}</span>
                    {objectLabel && (
                      <span className="text-muted-foreground">
                        {" "}
                        · {objectLabel}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground/80">
                    {item.actor_label && <>{item.actor_label} · </>}
                    {formatDate(item.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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
      setError(orgLimitMessage(err, "Could not add this person."));
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
      setError(orgLimitMessage(err, "Could not create this case."));
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
