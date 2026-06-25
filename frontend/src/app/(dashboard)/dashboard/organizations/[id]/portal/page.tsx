"use client";

// Owner UI for CertaNest Portals (B2B Portals MVP) — the portal OVERVIEW: the
// operating center an org admin lands on. It answers, top to bottom, "what needs
// attention", "how are we doing", and "what do I do next". The People and Cases
// lists live on their own filterable sub-pages; this page links to them through
// the shared portal nav and surfaces the work (review queue, reminders) here.
//
// The whole feature is behind the `b2b_portals` feature flag: a disabled flag
// surfaces as a 503 (we show a calm "coming soon" state). Writes require an org
// admin/owner role: non-admins get a 403 and a view-only message. Public links
// (room URL, request upload URL) are frontend page routes — safe to show/copy.

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileWarning,
  Inbox,
  LayoutTemplate,
  Mail,
  Plus,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  UserPlus,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert, ProductMetric, TrustNotice } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toast, type ToastState } from "@/components/ui/toast";
import {
  LimitWarningBanners,
  PlanUsageCard,
} from "@/components/features/portals/plan-usage-card";
import { PortalNav } from "@/components/features/portals/portal-nav";
import { OrgOnboardingCard } from "@/components/features/portals/org-onboarding-card";
import {
  AddPersonModal,
  CreateCaseModal,
} from "@/components/features/portals/portal-modals";
import { ReminderModal } from "@/components/features/portals/reminder-modal";
import { CreateCaseFromTemplateModal } from "@/components/features/portals/template-modals";
import { useFeature } from "@/components/features/feature-flags-provider";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import { canManageOrganization, getOrganization } from "@/lib/organizations";
import {
  PORTAL_CASE_STATUS_LABELS,
  PORTAL_CASE_STATUS_TONE,
  dashboardActivityLabel,
  getOrgOnboarding,
  getPortalDashboard,
  getPortalLimits,
  getPortalPeople,
  getPortalTemplates,
  isPortalNotEnabledError,
  planLabel,
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
  OrgOnboarding,
  PortalLimits,
  PortalPerson,
  OrgCaseTemplateSummary,
  ReminderType,
} from "@/types/portals";

interface PortalState {
  dashboard: OrganizationDashboard;
  people: PortalPerson[];
  templates: OrgCaseTemplateSummary[];
  onboarding: OrgOnboarding;
}

/**
 * Distinguish the page-level blocks:
 * - `coming_soon`: the `b2b_portals` feature flag is off (503 feature_disabled).
 * - `paywall`: the org has no Teams entitlement (403 portal_not_enabled).
 * - `view_only`: the user is a member but not an admin (403).
 */
type BlockKind = "coming_soon" | "paywall" | "view_only" | null;

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
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState<BlockKind>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);
  const [creatingCase, setCreatingCase] = useState(false);
  // When set, the create-case-from-template modal is open for this template.
  const [templateForCase, setTemplateForCase] =
    useState<OrgCaseTemplateSummary | null>(null);
  // When set, the bulk-reminder modal is open pre-set to this reminder type.
  const [reminderType, setReminderType] = useState<ReminderType | null>(null);

  const canManage = org ? canManageOrganization(org.user_role) : false;

  // The dashboard endpoint is the PRIMARY operational data (metrics, queues,
  // plan, recent activity). People + templates back the Create case / From
  // template actions; the case list itself lives on its own sub-page.
  const loadPortal = useCallback(async (): Promise<PortalState> => {
    const [dashboard, people, templates, onboarding] = await Promise.all([
      getPortalDashboard(orgId),
      getPortalPeople(orgId),
      getPortalTemplates(orgId),
      getOrgOnboarding(orgId),
    ]);
    return {
      dashboard,
      people: people.people,
      templates: templates.templates,
      onboarding,
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
      .catch((err) => {
        if (!active) return;
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
        <PageHeader eyebrow={org ? org.name : "Organization"} title="Portal" />
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
  const hasPeople = data.people.length > 0;

  return (
    <PageContainer width="wide">
      {backLink}
      <PortalNav orgId={orgId} active="overview" />
      <PageHeader
        eyebrow={dashboard.organization.name || org?.name || "Organization"}
        title="Overview"
        description="What needs attention, how every case is tracking, and the next step to take."
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              {data.templates.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setTemplateForCase(data.templates[0])}
                  disabled={!hasPeople}
                  title={hasPeople ? "Create a case from a template" : "Add a person first"}
                >
                  <LayoutTemplate className="size-4" /> From template
                </Button>
              )}
              <Button
                onClick={() => setCreatingCase(true)}
                disabled={!hasPeople}
                title={hasPeople ? undefined : "Add a person first"}
              >
                <ClipboardList className="size-4" /> Create case
              </Button>
            </div>
          ) : undefined
        }
      />

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

      {!canManage && (
        <TrustNotice icon={ShieldAlert} title="View-only access">
          You can view this portal. Adding people, creating cases, and sending
          requests are limited to organization owners and admins.
        </TrustNotice>
      )}

      {limits && <LimitWarningBanners data={limits} />}

      <OrgOnboardingCard
        orgId={orgId}
        onboarding={data.onboarding}
        canManage={canManage}
        onChanged={() => refresh()}
      />

      {isEmpty ? (
        <EmptyDashboard
          orgId={orgId}
          canManage={canManage}
          onAddPerson={() => setAddingPerson(true)}
          onCreateCase={() => setCreatingCase(true)}
          hasPeople={hasPeople}
        />
      ) : (
        <>
          <NeedsAttentionBanner metrics={metrics} />

          <OperationalCards metrics={metrics} />

          <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
            <div className="space-y-4">
              <h2 className="font-heading text-base font-semibold">
                Needs attention
              </h2>
              <ActionQueues
                queues={queues}
                onRemind={canManage ? setReminderType : undefined}
              />
            </div>

            <div className="space-y-6">
              {canManage && (
                <QuickActions
                  hasPeople={hasPeople}
                  hasTemplates={data.templates.length > 0}
                  onCreateCase={() => setCreatingCase(true)}
                  onCreateFromTemplate={() =>
                    data.templates[0] && setTemplateForCase(data.templates[0])
                  }
                  onAddPerson={() => setAddingPerson(true)}
                  onSendReminders={() => setReminderType("missing_documents")}
                />
              )}
              <TemplatesCard
                orgId={orgId}
                templates={data.templates}
                canManage={canManage}
                hasPeople={hasPeople}
                onCreateFromTemplate={() =>
                  data.templates[0] && setTemplateForCase(data.templates[0])
                }
              />
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
            await refresh("Case created.");
          }}
        />
      )}

      {reminderType !== null && canManage && (
        <ReminderModal
          orgId={orgId}
          defaultType={reminderType}
          onClose={() => setReminderType(null)}
          onSent={async () => {
            setReminderType(null);
            await refresh("Reminders sent.");
          }}
        />
      )}

      {templateForCase && canManage && (
        <CreateCaseFromTemplateModal
          orgId={orgId}
          template={templateForCase}
          people={data.people}
          onClose={() => setTemplateForCase(null)}
          onCreated={async () => {
            setTemplateForCase(null);
            await refresh("Case created from template.");
          }}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </PageContainer>
  );
}

// ---- Needs-attention lead ---------------------------------------------------

/**
 * A calm, glanceable lead that answers "what needs me right now". Shows only the
 * non-zero attention items as chips that jump to their queue; when everything is
 * clear it reassures rather than showing an empty row.
 */
function NeedsAttentionBanner({ metrics }: { metrics: DashboardMetrics }) {
  const chips: Array<{ href: string; label: string }> = [];
  if (metrics.uploaded_requests_needing_review > 0) {
    chips.push({
      href: "#queue-review",
      label: `${metrics.uploaded_requests_needing_review} to review`,
    });
  }
  if (metrics.overdue_cases > 0) {
    chips.push({
      href: "#queue-overdue",
      label: `${metrics.overdue_cases} overdue`,
    });
  }
  if (metrics.missing_required_documents > 0) {
    chips.push({
      href: "#queue-missing",
      label: `${metrics.missing_required_documents} missing document${
        metrics.missing_required_documents === 1 ? "" : "s"
      }`,
    });
  }
  if (metrics.needs_replacement_requests > 0) {
    chips.push({
      href: "#queue-replacement",
      label: `${metrics.needs_replacement_requests} to redo`,
    });
  }

  if (chips.length === 0) {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-brand-success/25 bg-brand-success/10 px-4 py-3 text-sm text-brand-success">
        <CheckCircle2 className="size-4 shrink-0" aria-hidden />
        <span className="font-medium text-foreground">
          You&apos;re all caught up.
        </span>
        <span className="text-muted-foreground">
          Nothing needs attention right now.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-amber/30 bg-brand-amber/10 px-4 py-3">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
        <AlarmClock className="size-4 text-brand-amber" aria-hidden />
        Needs attention
      </span>
      <span className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <Link
            key={chip.href}
            href={chip.href}
            className="rounded-full border border-brand-amber/30 bg-card px-2.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {chip.label}
          </Link>
        ))}
      </span>
    </div>
  );
}

// ---- Quick actions ----------------------------------------------------------

/** A compact card of the most common admin actions, one obvious primary. */
function QuickActions({
  hasPeople,
  hasTemplates,
  onCreateCase,
  onCreateFromTemplate,
  onAddPerson,
  onSendReminders,
}: {
  hasPeople: boolean;
  hasTemplates: boolean;
  onCreateCase: () => void;
  onCreateFromTemplate: () => void;
  onAddPerson: () => void;
  onSendReminders: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-heading text-base font-semibold">Quick actions</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        The things your team does most.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <Button
          onClick={onCreateCase}
          disabled={!hasPeople}
          title={hasPeople ? undefined : "Add a person first"}
          className="w-full justify-center"
        >
          <ClipboardList className="size-4" /> Create case
        </Button>
        {hasTemplates && (
          <Button
            variant="outline"
            onClick={onCreateFromTemplate}
            disabled={!hasPeople}
            title={hasPeople ? undefined : "Add a person first"}
            className="w-full justify-center"
          >
            <LayoutTemplate className="size-4" /> Create from template
          </Button>
        )}
        <Button
          variant="outline"
          onClick={onAddPerson}
          className="w-full justify-center"
        >
          <UserPlus className="size-4" /> Add person
        </Button>
        <Button
          variant="outline"
          onClick={onSendReminders}
          className="w-full justify-center"
        >
          <Mail className="size-4" /> Send reminders
        </Button>
      </div>
    </section>
  );
}

// ---- Empty dashboard --------------------------------------------------------

/**
 * Shown when the org has no people AND no cases: a single focused panel that
 * walks an admin through the first steps, instead of a wall of empty queues.
 */
function EmptyDashboard({
  orgId,
  canManage,
  hasPeople,
  onAddPerson,
  onCreateCase,
}: {
  orgId: number;
  canManage: boolean;
  hasPeople: boolean;
  onAddPerson: () => void;
  onCreateCase: () => void;
}) {
  const steps = [
    {
      title: "Add a person",
      body: "A client, student, or applicant you're helping.",
    },
    {
      title: "Create a case",
      body: "The documents that person needs, in one place.",
    },
    {
      title: "Request documents",
      body: "Send a secure upload link — no account needed.",
    },
    {
      title: "Review and get ready",
      body: "Accept uploads and move the case forward.",
    },
  ];
  return (
    <section className="rounded-2xl border border-dashed border-border bg-card p-6 sm:p-8">
      <div className="max-w-prose">
        <h2 className="font-heading text-xl font-semibold">
          Set up your first workflow.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A portal keeps the people you serve and the documents each of them
          needs in one calm, trackable place. Here&apos;s the shape of it:
        </p>
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex gap-3 rounded-xl border border-border bg-background/40 p-3"
          >
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{step.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {canManage && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={onAddPerson}>
            <UserPlus className="size-4" /> Add person
          </Button>
          <Button
            variant="outline"
            onClick={onCreateCase}
            disabled={!hasPeople}
            title={hasPeople ? undefined : "Add a person first"}
          >
            <ClipboardList className="size-4" /> Create case
          </Button>
          <Link
            href={`/dashboard/organizations/${orgId}/portal/templates`}
            className={cn(buttonVariants({ variant: "ghost" }))}
          >
            <LayoutTemplate className="size-4" /> Start from a template
          </Link>
        </div>
      )}
    </section>
  );
}

// ---- Operational summary cards ----------------------------------------------

/**
 * The compact "what needs doing" count grid: the six action-driving numbers and
 * a restrained tone per card. Cards with a queue link scroll to the matching
 * action queue; the rest are static counts.
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
    </section>
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
  action,
  children,
}: {
  id: string;
  title: string;
  description: string;
  count: number;
  tone: "warning" | "danger" | "success" | "neutral";
  /** Optional header action (e.g. the bulk "Remind…" button). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-border bg-card p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-base font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          {action}
          <StatusBadge tone={count ? tone : "neutral"} withDot={false}>
            {count}
          </StatusBadge>
        </div>
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

function ActionQueues({
  queues,
  onRemind,
}: {
  queues: DashboardQueues;
  /** When present (admin/owner), queues show a bulk "Remind…" action. */
  onRemind?: (type: ReminderType) => void;
}) {
  return (
    <div className="space-y-4">
      {/* The Review-now queue intentionally has NO bulk-remind action: these are
          uploads waiting on YOUR review, not on the recipient. */}
      <ReviewNowQueue items={queues.review_now} />
      <OverdueQueue items={queues.overdue_cases} onRemind={onRemind} />
      <MissingDocumentsQueue
        items={queues.missing_documents}
        onRemind={onRemind}
      />
      <NeedsReplacementQueue
        items={queues.needs_replacement}
        onRemind={onRemind}
      />
      <ReadyQueue items={queues.ready_cases} />
    </div>
  );
}

/** A small, restrained "Remind…" button for a queue header. */
function RemindButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Mail className="size-3.5" aria-hidden />
      Remind…
    </button>
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
          <QueueMore shown={items.length} cap={QUEUE_CAP} />
        </ul>
      )}
    </QueueShell>
  );
}

function OverdueQueue({
  items,
  onRemind,
}: {
  items: DashboardCaseItem[];
  onRemind?: (type: ReminderType) => void;
}) {
  return (
    <QueueShell
      id="queue-overdue"
      title="Overdue cases"
      description="Past their due date and still not ready."
      count={items.length}
      tone="danger"
      action={
        onRemind && items.length > 0 ? (
          <RemindButton onClick={() => onRemind("overdue_requests")} />
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <QueueEmpty message="No cases are overdue. Nicely on top of it." />
      ) : (
        <ul className="space-y-2">
          {items.slice(0, QUEUE_CAP).map((item) => (
            <CaseQueueRow key={item.case_id} item={item} />
          ))}
          <QueueMore shown={items.length} cap={QUEUE_CAP} />
        </ul>
      )}
    </QueueShell>
  );
}

function MissingDocumentsQueue({
  items,
  onRemind,
}: {
  items: DashboardCaseItem[];
  onRemind?: (type: ReminderType) => void;
}) {
  return (
    <QueueShell
      id="queue-missing"
      title="Missing documents"
      description="Cases still waiting on required documents."
      count={items.length}
      tone="warning"
      action={
        onRemind && items.length > 0 ? (
          <RemindButton onClick={() => onRemind("missing_documents")} />
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <QueueEmpty message="Every case has what it needs so far." />
      ) : (
        <ul className="space-y-2">
          {items.slice(0, QUEUE_CAP).map((item) => (
            <CaseQueueRow key={item.case_id} item={item} showMissingTitles />
          ))}
          <QueueMore shown={items.length} cap={QUEUE_CAP} />
        </ul>
      )}
    </QueueShell>
  );
}

function NeedsReplacementQueue({
  items,
  onRemind,
}: {
  items: DashboardNeedsReplacementItem[];
  onRemind?: (type: ReminderType) => void;
}) {
  return (
    <QueueShell
      id="queue-replacement"
      title="Needs replacement"
      description="Uploads you sent back for the recipient to redo."
      count={items.length}
      tone="warning"
      action={
        onRemind && items.length > 0 ? (
          <RemindButton onClick={() => onRemind("needs_replacement")} />
        ) : undefined
      }
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
          <QueueMore shown={items.length} cap={QUEUE_CAP} />
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
          <QueueMore shown={items.length} cap={QUEUE_CAP} />
        </ul>
      )}
    </QueueShell>
  );
}

/** Honest "+N more" line so a capped queue never reads as the whole story. */
function QueueMore({ shown, cap }: { shown: number; cap: number }) {
  if (shown <= cap) return null;
  return (
    <li className="px-1 pt-0.5 text-xs text-muted-foreground">
      +{shown - cap} more — open Cases to see them all.
    </li>
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
                      <span className="text-muted-foreground"> · {objectLabel}</span>
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

// ---- Templates entry point --------------------------------------------------

/**
 * A small sidebar card linking to the templates library, with a quick
 * "Create from template" action when templates exist. When there are none, it
 * nudges admins to set up their first template.
 */
function TemplatesCard({
  orgId,
  templates,
  canManage,
  hasPeople,
  onCreateFromTemplate,
}: {
  orgId: number;
  templates: OrgCaseTemplateSummary[];
  canManage: boolean;
  hasPeople: boolean;
  onCreateFromTemplate: () => void;
}) {
  const manageHref = `/dashboard/organizations/${orgId}/portal/templates`;
  const count = templates.length;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-heading text-base font-semibold">
            <LayoutTemplate className="size-4 text-primary" aria-hidden />
            Templates
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Reusable blueprints for the cases you set up most often.
          </p>
        </div>
        {count > 0 && (
          <StatusBadge tone="neutral" withDot={false}>
            {count}
          </StatusBadge>
        )}
      </div>

      {count === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border px-3 py-4 text-center">
          <p className="text-xs text-muted-foreground">
            {canManage
              ? "Save a case setup once and reuse it — defaults and required documents in one click."
              : "No templates yet."}
          </p>
          {canManage && (
            <Link
              href={manageHref}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "mt-3",
              )}
            >
              <Plus className="size-4" /> Create a template
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {canManage && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCreateFromTemplate}
              disabled={!hasPeople}
              title={hasPeople ? undefined : "Add a person first"}
              className="w-full justify-center"
            >
              <LayoutTemplate className="size-4" /> Create from template
            </Button>
          )}
          <Link
            href={manageHref}
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "w-full justify-center text-muted-foreground",
            )}
          >
            Manage templates
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      )}
    </section>
  );
}
