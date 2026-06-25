"use client";

// Organization portal — Cases. The dedicated, filterable list of every document
// case across the org's people. Lives under the shared portal nav so it reads as
// one connected workspace with the Overview, People, Documents, and Templates.
//
// Same access model as the rest of the portal: behind the `b2b_portals` flag
// (503 → "coming soon"), gated by a Teams entitlement (403 portal_not_enabled →
// paywall). Reads are open to any member; creating cases is admin/owner only.

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ClipboardList,
  Inbox,
  LayoutTemplate,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast, type ToastState } from "@/components/ui/toast";
import { CaseCard } from "@/components/features/portals/case-card";
import { LimitWarningBanners } from "@/components/features/portals/plan-usage-card";
import { PortalNav } from "@/components/features/portals/portal-nav";
import { CreateCaseModal } from "@/components/features/portals/portal-modals";
import { CreateCaseFromTemplateModal } from "@/components/features/portals/template-modals";
import { useFeature } from "@/components/features/feature-flags-provider";
import { ApiError } from "@/lib/api";
import { canManageOrganization, getOrganization } from "@/lib/organizations";
import {
  PORTAL_CASE_STATUS_LABELS,
  PORTAL_CASE_STATUS_ORDER,
  type CaseFocus,
  filterPortalCases,
  getPortalCases,
  getPortalLimits,
  getPortalPeople,
  getPortalTemplates,
  isPortalNotEnabledError,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type { Organization } from "@/types/organizations";
import type {
  CaseStatusRef,
  OrgCaseTemplateSummary,
  PortalCase,
  PortalCaseStatus,
  PortalLimits,
  PortalPerson,
} from "@/types/portals";

type BlockKind = "coming_soon" | "paywall" | "view_only" | null;

const FILTER_SELECT =
  "h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const FOCUS_OPTIONS: Array<{ value: CaseFocus; label: string }> = [
  { value: "all", label: "All cases" },
  { value: "needs_review", label: "Needs review" },
  { value: "missing_docs", label: "Missing documents" },
  { value: "due_soon", label: "Due soon" },
  { value: "overdue", label: "Overdue" },
  { value: "ready", label: "Ready" },
];

export default function PortalCasesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const orgId = Number(id);
  const portalsEnabled = useFeature("b2b_portals");

  const [org, setOrg] = useState<Organization | null>(null);
  const [cases, setCases] = useState<PortalCase[]>([]);
  const [people, setPeople] = useState<PortalPerson[]>([]);
  const [templates, setTemplates] = useState<OrgCaseTemplateSummary[]>([]);
  const [limits, setLimits] = useState<PortalLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState<BlockKind>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const [creatingCase, setCreatingCase] = useState(false);
  const [templateForCase, setTemplateForCase] =
    useState<OrgCaseTemplateSummary | null>(null);

  // Filters (all applied in memory against the loaded set).
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PortalCaseStatus | "">("");
  const [customStatusKey, setCustomStatusKey] = useState("");
  const [personId, setPersonId] = useState<number | null>(null);
  const [focus, setFocus] = useState<CaseFocus>("all");

  const canManage = org ? canManageOrganization(org.user_role) : false;

  async function refresh(message?: string) {
    const [nextCases, nextPeople, nextLimits] = await Promise.all([
      getPortalCases(orgId),
      getPortalPeople(orgId),
      getPortalLimits(orgId),
    ]);
    setCases(nextCases.cases);
    setPeople(nextPeople.people);
    setLimits(nextLimits);
    if (message) setToast({ message, kind: "success" });
  }

  useEffect(() => {
    let active = true;
    getOrganization(orgId)
      .then((organization) => {
        if (active) setOrg(organization);
        return getPortalLimits(orgId);
      })
      .then(async (nextLimits) => {
        if (!active) return;
        setLimits(nextLimits);
        if (!nextLimits.portal_enabled) {
          setBlock("paywall");
          return;
        }
        const [nextCases, nextPeople, nextTemplates] = await Promise.all([
          getPortalCases(orgId),
          getPortalPeople(orgId),
          getPortalTemplates(orgId),
        ]);
        if (!active) return;
        setCases(nextCases.cases);
        setPeople(nextPeople.people);
        setTemplates(nextTemplates.templates);
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
        setLoadError("Unable to load cases.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  // Distinct custom statuses present in the loaded cases, for the filter select.
  const customStatuses = useMemo(() => {
    const seen = new Map<string, CaseStatusRef>();
    for (const c of cases) {
      if (c.custom_status && !seen.has(c.custom_status.key)) {
        seen.set(c.custom_status.key, c.custom_status);
      }
    }
    return Array.from(seen.values());
  }, [cases]);

  const filtered = useMemo(
    () =>
      filterPortalCases(cases, {
        search,
        status,
        customStatusKey,
        personId,
        focus,
      }),
    [cases, search, status, customStatusKey, personId, focus],
  );

  const hasFilters =
    search.trim() !== "" ||
    status !== "" ||
    customStatusKey !== "" ||
    personId !== null ||
    focus !== "all";

  function clearFilters() {
    setSearch("");
    setStatus("");
    setCustomStatusKey("");
    setPersonId(null);
    setFocus("all");
  }

  const backLink = (
    <Link
      href={`/dashboard/organizations/${orgId}`}
      className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}
    >
      <ArrowLeft className="size-4" />
      Back to organization
    </Link>
  );

  if (!portalsEnabled || block === "coming_soon") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Cases" />
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={Inbox}
            title="Portals are coming soon."
            description="Cases let your team collect and track the documents each person needs. This isn't enabled for your account yet."
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
          Loading cases…
        </span>
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </PageContainer>
    );
  }

  if (block === "paywall") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow={org ? org.name : "Organization"} title="Cases" />
        <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Teams
          </span>
          <h2 className="mt-3 font-heading text-xl font-semibold">
            Cases are part of B2B Portals on Teams.
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Track the documents each person needs — request, review, and get
            every case ready. This organization isn&apos;t on a Teams plan yet.
          </p>
        </section>
      </PageContainer>
    );
  }

  if (block === "view_only") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Cases" />
        <InlineAlert>
          You don&apos;t have access to this portal&apos;s cases.
        </InlineAlert>
      </PageContainer>
    );
  }

  if (loadError) {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="Cases" />
        <InlineAlert>{loadError}</InlineAlert>
      </PageContainer>
    );
  }

  const noCasesAtAll = cases.length === 0;

  return (
    <PageContainer width="wide">
      {backLink}
      <PortalNav orgId={orgId} active="cases" />
      <PageHeader
        eyebrow={org?.name || "Organization"}
        title="Cases"
        description="Every document case across the people you serve — find, filter, and open the one that needs you."
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              {templates.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setTemplateForCase(templates[0])}
                  disabled={people.length === 0}
                  title={
                    people.length === 0
                      ? "Add a person first"
                      : "Create a case from a template"
                  }
                >
                  <LayoutTemplate className="size-4" /> From template
                </Button>
              )}
              <Button
                onClick={() => setCreatingCase(true)}
                disabled={people.length === 0}
                title={people.length === 0 ? "Add a person first" : undefined}
              >
                <ClipboardList className="size-4" /> Create case
              </Button>
            </div>
          ) : undefined
        }
      />

      {limits && <LimitWarningBanners data={limits} />}

      {!canManage && (
        <TrustNotice icon={SlidersHorizontal} title="View-only access">
          You can browse and open cases. Creating cases and sending requests are
          limited to organization owners and admins.
        </TrustNotice>
      )}

      {noCasesAtAll ? (
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={ClipboardList}
            title="No cases yet."
            description={
              people.length > 0
                ? "Create a case to start collecting and tracking the documents a person needs — a visa file, a scholarship application, an onboarding pack."
                : "Add a person first, then create a case to start collecting the documents they need."
            }
            action={
              canManage && people.length > 0 ? (
                <Button onClick={() => setCreatingCase(true)}>
                  <ClipboardList className="size-4" /> Create case
                </Button>
              ) : !canManage ? undefined : (
                <Link
                  href={`/dashboard/organizations/${orgId}/portal/people`}
                  className={cn(buttonVariants({}))}
                >
                  Add a person
                </Link>
              )
            }
          />
        </div>
      ) : (
        <>
          {/* Search + filters. Calm, wraps on small screens. */}
          <section
            aria-label="Filter cases"
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="case-search" className="sr-only">
                Search cases by title or person
              </label>
              <Input
                id="case-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by case or person…"
                className="h-9"
              />
            </div>
            <label htmlFor="case-focus" className="sr-only">
              Focus
            </label>
            <select
              id="case-focus"
              value={focus}
              onChange={(e) => setFocus(e.target.value as CaseFocus)}
              className={FILTER_SELECT}
            >
              {FOCUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <label htmlFor="case-status" className="sr-only">
              Status
            </label>
            <select
              id="case-status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as PortalCaseStatus | "")
              }
              className={FILTER_SELECT}
            >
              <option value="">Any status</option>
              {PORTAL_CASE_STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {PORTAL_CASE_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
            {customStatuses.length > 0 && (
              <>
                <label htmlFor="case-custom-status" className="sr-only">
                  Custom status
                </label>
                <select
                  id="case-custom-status"
                  value={customStatusKey}
                  onChange={(e) => setCustomStatusKey(e.target.value)}
                  className={FILTER_SELECT}
                >
                  <option value="">Any label</option>
                  {customStatuses.map((cs) => (
                    <option key={cs.key} value={cs.key}>
                      {cs.label}
                    </option>
                  ))}
                </select>
              </>
            )}
            {people.length > 0 && (
              <>
                <label htmlFor="case-person" className="sr-only">
                  Person
                </label>
                <select
                  id="case-person"
                  value={personId === null ? "" : String(personId)}
                  onChange={(e) =>
                    setPersonId(e.target.value ? Number(e.target.value) : null)
                  }
                  className={FILTER_SELECT}
                >
                  <option value="">Anyone</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              </>
            )}
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </section>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {filtered.length} of {cases.length} case
            {cases.length === 1 ? "" : "s"}
          </p>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card">
              <EmptyState
                icon={ClipboardList}
                title="No cases match these filters."
                description="Try a different status, person, or search term."
                action={
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((portalCase) => (
                <CaseCard
                  key={portalCase.id}
                  orgId={orgId}
                  portalCase={portalCase}
                />
              ))}
            </div>
          )}
        </>
      )}

      {creatingCase && canManage && (
        <CreateCaseModal
          orgId={orgId}
          people={people}
          onClose={() => setCreatingCase(false)}
          onCreated={async () => {
            setCreatingCase(false);
            await refresh("Case created.");
          }}
        />
      )}

      {templateForCase && canManage && (
        <CreateCaseFromTemplateModal
          orgId={orgId}
          template={templateForCase}
          people={people}
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
