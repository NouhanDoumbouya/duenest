"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CreditCard,
  FileText,
  LifeBuoy,
  Package,
  ScanLine,
  Share2,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

import { LifeRadarHero } from "@/components/dashboard/life-radar/hero";
import {
  LifeRadarMetricGrid,
  type LifeRadarMetric,
} from "@/components/dashboard/life-radar/metric-grid";
import { FixFirstSection } from "@/components/dashboard/life-radar/fix-first";
import { QuickActionsPanel } from "@/components/dashboard/life-radar/quick-actions";
import {
  MoneyRadarPanel,
  RecentActivityPanel,
  SharingEmergencyPanel,
  ThisWeekPanel,
} from "@/components/dashboard/life-radar/panels";
import {
  FixFirstSkeleton,
  HeroSkeleton,
  MetricGridSkeleton,
  PanelSkeleton,
} from "@/components/dashboard/life-radar/states";
import { useDashboardUser } from "@/components/dashboard/user-context";
import { SetupChecklistCard } from "@/components/onboarding/setup-checklist-card";
import { buttonVariants } from "@/components/ui/button";
import { PageContainer } from "@/components/ui/page-container";
import { SectionCard } from "@/components/ui/section-card";
import { getAttentionNeeded, getDocuments } from "@/lib/documents";
import { getCalendarEvents, getCalendarSummary } from "@/lib/calendar";
import { getEmergencyPacks } from "@/lib/emergency";
import {
  getSubscriptionAttention,
  getSubscriptionSummary,
} from "@/lib/subscriptions";
import { listQuickShares, revokeQuickShare } from "@/lib/quick-share";
import {
  getDocumentSetupChecklist,
  getOnboardingState,
  updateOnboardingState,
} from "@/lib/onboarding";
import {
  getQuickStartGoals,
  type QuickStartGoal,
  type QuickStartGoalKey,
} from "@/lib/readiness";
import {
  buildLifeRadarSummary,
  computeDashboardReadinessScore,
  formatMoneyRisk,
  formatRelativeDeadline,
  getActiveShareRisk,
  getEmergencyReadiness,
  getNextCharge,
  getNextDeadline,
  type EmergencyReadiness,
} from "@/lib/life-radar";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { CalendarEvent, CalendarSummary } from "@/types/calendar";
import type { DocumentRecord } from "@/types/documents";
import type { EmergencyPack } from "@/types/emergency";
import type { QuickShareListItem } from "@/types/quick-share";
import type {
  SubscriptionAttentionItem,
  SubscriptionSummary,
} from "@/types/subscriptions";
import type {
  DocumentSetupChecklist,
  OnboardingState,
} from "@/types/onboarding";

/** Raw, per-source dashboard state. Each section fails independently. */
interface RadarState {
  totalDocs: number;
  expiringSoon: number;
  missingFiles: number;
  recentDocs: DocumentRecord[];
  attentionDocs: DocumentRecord[];
  subSummary: SubscriptionSummary | null;
  subAttention: SubscriptionAttentionItem[];
  shares: QuickShareListItem[];
  packs: EmergencyPack[];
  calSummary: CalendarSummary | null;
  calEvents: CalendarEvent[];
  onboarding: OnboardingState | null;
  checklist: DocumentSetupChecklist | null;
  errors: {
    documents: boolean;
    subscriptions: boolean;
    shares: boolean;
    emergency: boolean;
    calendar: boolean;
  };
}

const EMPTY_STATE: RadarState = {
  totalDocs: 0,
  expiringSoon: 0,
  missingFiles: 0,
  recentDocs: [],
  attentionDocs: [],
  subSummary: null,
  subAttention: [],
  shares: [],
  packs: [],
  calSummary: null,
  calEvents: [],
  onboarding: null,
  checklist: null,
  errors: {
    documents: false,
    subscriptions: false,
    shares: false,
    emergency: false,
    calendar: false,
  },
};

function val<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === "fulfilled" ? r.value : null;
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function DashboardPage() {
  const user = useDashboardUser();
  const [state, setState] = useState<RadarState | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    // One parallel batch (no waterfall). allSettled so a single failed section
    // never breaks the whole dashboard.
    let results;
    try {
      results = await Promise.allSettled([
        getDocuments({ page_size: 1 }),
        getDocuments({ computed_status: "expiring_soon", page_size: 1 }),
        getDocuments({ missing_file: true, page_size: 1 }),
        getDocuments({ ordering: "-updated_at", page_size: 5 }),
        getAttentionNeeded(),
        getSubscriptionSummary(),
        getSubscriptionAttention(),
        listQuickShares(),
        getEmergencyPacks(),
        getCalendarSummary(),
        getCalendarEvents({ start: isoDate(0), end: isoDate(7) }),
        getOnboardingState(),
        getDocumentSetupChecklist(),
      ]);
    } catch {
      if (mountedRef.current) setState(EMPTY_STATE);
      trackEvent("dashboard_load_failed", { metadata: { reason: "batch" } });
      return;
    }
    if (!mountedRef.current) return;
    const [
      total,
      expiring,
      missing,
      recent,
      attention,
      subSummary,
      subAttention,
      shares,
      packs,
      calSummary,
      calEvents,
      onboarding,
      checklist,
    ] = results;

    const documentsError =
      total.status === "rejected" ||
      expiring.status === "rejected" ||
      missing.status === "rejected" ||
      attention.status === "rejected";

    setState({
      totalDocs: val(total)?.count ?? 0,
      expiringSoon: val(expiring)?.count ?? 0,
      missingFiles: val(missing)?.count ?? 0,
      recentDocs: (val(recent)?.results ?? []).slice(0, 5),
      attentionDocs: val(attention)?.items ?? [],
      subSummary: val(subSummary),
      subAttention: val(subAttention)?.items ?? [],
      shares: val(shares) ?? [],
      packs: val(packs)?.results ?? [],
      calSummary: val(calSummary),
      calEvents: val(calEvents)?.events ?? [],
      onboarding: val(onboarding),
      checklist: val(checklist),
      errors: {
        documents: documentsError,
        subscriptions:
          subSummary.status === "rejected" || subAttention.status === "rejected",
        shares: shares.status === "rejected",
        emergency: packs.status === "rejected",
        calendar:
          calSummary.status === "rejected" || calEvents.status === "rejected",
      },
    });

    if (documentsError) {
      trackEvent("dashboard_load_failed", { metadata: { section: "documents" } });
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    trackEvent("dashboard_viewed");
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  // Hide the readiness checklist for good (a calm "not now"). Optimistic; the
  // metadata flag is best-effort so a network blip never traps the card on screen.
  const handleDismissChecklist = useCallback(() => {
    setChecklistDismissed(true);
    void updateOnboardingState({
      metadata: { readiness_checklist_dismissed: true },
    }).catch(() => {});
  }, []);

  const handleRevoke = useCallback(async (id: number) => {
    setRevokingId(id);
    try {
      await revokeQuickShare(id);
      // Optimistic: drop it locally so Fix First + panels update instantly.
      setState((prev) =>
        prev ? { ...prev, shares: prev.shares.filter((s) => s.id !== id) } : prev,
      );
    } catch {
      // Soft-fail: leave it in place; the user can retry.
    } finally {
      setRevokingId(null);
    }
  }, []);

  const greetingName = user.first_name?.trim() || user.username;
  const loading = state === null;

  // ---- Derived (memoized) -------------------------------------------------
  const emergency: EmergencyReadiness = useMemo(
    () => getEmergencyReadiness(state?.packs ?? []),
    [state?.packs],
  );

  const radar = useMemo(
    () =>
      buildLifeRadarSummary({
        attentionDocuments: state?.attentionDocs ?? [],
        subscriptionAttention: state?.subAttention ?? [],
        activeShares: state?.shares ?? [],
        emergency,
      }),
    [state?.attentionDocs, state?.subAttention, state?.shares, emergency],
  );

  const shareRisk = useMemo(
    () => getActiveShareRisk(state?.shares ?? []),
    [state?.shares],
  );

  const readinessScore = useMemo(
    () =>
      computeDashboardReadinessScore({
        fixFirst: radar.fixFirst,
        totalDocuments: state?.totalDocs ?? 0,
        emergency,
      }),
    [radar.fixFirst, state?.totalDocs, emergency],
  );

  const metrics: LifeRadarMetric[] = useMemo(() => {
    if (!state) return [];
    const nextDeadline = getNextDeadline(state.attentionDocs, state.calSummary);
    const nextCharge = getNextCharge(state.subSummary);
    const atRisk = state.expiringSoon + state.missingFiles;
    return [
      {
        key: "attention",
        label: "Needs attention",
        value: String(radar.fixFirst.length),
        subtitle:
          radar.fixFirst.length === 0
            ? "All clear · most urgent first"
            : `${radar.criticalCount} critical · most urgent first`,
        icon: ShieldAlert,
        href: "/dashboard/attention",
        severity: radar.worstSeverity,
        tone: radar.criticalCount > 0 ? "red" : "amber",
      },
      {
        key: "deadline",
        label: "Next deadline",
        value: nextDeadline ? nextDeadline.relative : "—",
        subtitle: nextDeadline ? nextDeadline.label : "Nothing scheduled",
        icon: CalendarClock,
        href: nextDeadline?.href ?? "/dashboard/calendar",
        tone: "blue",
      },
      {
        key: "charge",
        label: "Next charge",
        value: nextCharge
          ? formatRelativeDeadline(nextCharge.days_until_renewal)
          : "—",
        subtitle: nextCharge
          ? `${nextCharge.name} · ${formatMoneyRisk(nextCharge.amount, nextCharge.currency)}`
          : "No upcoming charges",
        icon: CreditCard,
        href: "/dashboard/subscriptions",
        severity:
          nextCharge && nextCharge.days_until_renewal <= 3 ? "soon" : undefined,
        tone: "teal",
      },
      {
        key: "at-risk",
        label: "Documents at risk",
        value: String(atRisk),
        subtitle: `${state.expiringSoon} expiring · ${state.missingFiles} missing info`,
        icon: FileText,
        href: "/dashboard/documents?quick=expiring_soon",
        severity: atRisk > 0 ? "review" : undefined,
        tone: "amber",
      },
      {
        key: "shares",
        label: "Active shares",
        value: String(shareRisk.activeCount),
        subtitle:
          shareRisk.activeCount === 0
            ? "No active shares"
            : `${shareRisk.sensitiveCount} sensitive access open`,
        icon: Share2,
        href: "/dashboard/quick-share",
        severity: shareRisk.sensitiveCount > 0 ? "review" : undefined,
        tone: "blue",
      },
      {
        key: "emergency",
        label: "Emergency readiness",
        value: emergency.ready ? "Ready" : emergency.label,
        subtitle: emergency.ready
          ? "Trusted access prepared"
          : `${emergency.stepsLeft} step${emergency.stepsLeft === 1 ? "" : "s"} left`,
        icon: LifeBuoy,
        href: "/dashboard/emergency",
        severity: emergency.ready ? "safe" : "review",
        tone: emergency.ready ? "green" : "amber",
      },
    ];
  }, [state, radar, shareRisk, emergency]);

  const isBrandNew =
    !loading &&
    state.totalDocs === 0 &&
    (state.subSummary?.total_count ?? 0) === 0 &&
    state.shares.length === 0 &&
    state.packs.length === 0;

  const showSetupChecklist =
    !loading &&
    !checklistDismissed &&
    state.checklist !== null &&
    state.onboarding !== null &&
    !state.onboarding.has_completed_document_onboarding &&
    !state.onboarding.dismissed_onboarding_at &&
    !state.onboarding.metadata?.readiness_checklist_dismissed;

  return (
    <PageContainer>
      {/* Hero */}
      {loading ? (
        <HeroSkeleton />
      ) : (
        <LifeRadarHero
          name={greetingName}
          sentence={radar.statusSentence}
          worstSeverity={radar.worstSeverity}
          readinessScore={readinessScore}
          lastChecked="just now"
          clear={radar.fixFirst.length === 0}
          onForgottenClick={() =>
            trackEvent("forgetting_check_used", {
              metadata: { source: "hero" },
            })
          }
        />
      )}

      {showSetupChecklist && state?.checklist && (
        <SetupChecklistCard
          checklist={state.checklist}
          onDismiss={handleDismissChecklist}
        />
      )}

      {isBrandNew ? (
        <BrandNewState />
      ) : (
        <>
          {/* Metric cards */}
          {loading ? (
            <MetricGridSkeleton />
          ) : (
            <LifeRadarMetricGrid metrics={metrics} />
          )}

          {/* Main grid: Fix first + right rail */}
          <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
            <div className="flex flex-col gap-6" id="fix-first">
              <SectionCard
                title="Fix first"
                action={
                  <Link
                    href="/dashboard/attention"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    View all
                  </Link>
                }
              >
                {loading ? (
                  <FixFirstSkeleton />
                ) : (
                  <FixFirstSection
                    items={radar.fixFirst}
                    onRevoke={handleRevoke}
                    revokingId={revokingId}
                  />
                )}
              </SectionCard>

              <SectionCard title="Quick actions">
                <QuickActionsPanel />
              </SectionCard>

              {/* Recent activity sits under the main column on desktop. */}
              {loading ? (
                <SectionCard title="Recent activity">
                  <PanelSkeleton />
                </SectionCard>
              ) : (
                <RecentActivityPanel
                  recentDocs={state.recentDocs}
                  error={state.errors.documents}
                />
              )}
            </div>

            {/* Right rail */}
            <div className="flex flex-col gap-6">
              {loading ? (
                <>
                  <SectionCard title="This week">
                    <PanelSkeleton />
                  </SectionCard>
                  <SectionCard title="Money Radar">
                    <PanelSkeleton />
                  </SectionCard>
                  <SectionCard title="Sharing & emergency">
                    <PanelSkeleton rows={2} />
                  </SectionCard>
                </>
              ) : (
                <>
                  <ThisWeekPanel
                    events={state.calEvents}
                    summary={state.calSummary}
                    error={state.errors.calendar}
                    onRetry={load}
                  />
                  <MoneyRadarPanel
                    summary={state.subSummary}
                    error={state.errors.subscriptions}
                    onRetry={load}
                  />
                  <SharingEmergencyPanel
                    shareRisk={shareRisk}
                    emergency={emergency}
                    error={state.errors.shares || state.errors.emergency}
                    onRetry={load}
                  />
                </>
              )}
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}

const QUICK_START_ICONS: Record<QuickStartGoalKey, LucideIcon> = {
  document: FileText,
  scan: ScanLine,
  subscription: CreditCard,
  bundle: Package,
  safesend: Share2,
  emergency: LifeBuoy,
};

/** A single goal-based starting path. */
function GoalCard({ goal }: { goal: QuickStartGoal }) {
  const Icon = QUICK_START_ICONS[goal.key];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold">{goal.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {goal.body}
        </p>
      </div>
      <Link
        href={goal.href}
        onClick={() =>
          trackEvent("empty_state_cta_used", { metadata: { goal: goal.key } })
        }
        className={cn(buttonVariants({ size: "sm" }), "w-full")}
      >
        {goal.cta}
      </Link>
    </div>
  );
}

/**
 * Premium first-run state: goal-based starting paths (life goals, not feature
 * names). Four are shown by default; the rest are progressively disclosed so the
 * empty dashboard stays calm on mobile.
 */
function BrandNewState() {
  const goals = getQuickStartGoals();
  const primary = goals.filter((g) => g.primary);
  const more = goals.filter((g) => !g.primary);
  const [showMore, setShowMore] = useState(false);

  return (
    <SectionCard
      title="Start with one thing"
      description="Pick a goal — DueNest starts watching the dates that matter as soon as you add something. You can do the rest later."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {primary.map((goal) => (
          <GoalCard key={goal.key} goal={goal} />
        ))}
      </div>

      {showMore && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {more.map((goal) => (
            <GoalCard key={goal.key} goal={goal} />
          ))}
        </div>
      )}

      {!showMore && more.length > 0 && (
        <button
          type="button"
          onClick={() => setShowMore(true)}
          className="mt-3 text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          More ways to start
        </button>
      )}

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-brand-success" aria-hidden />
        Your documents stay private. Only you control what gets shared.
      </p>
    </SectionCard>
  );
}
