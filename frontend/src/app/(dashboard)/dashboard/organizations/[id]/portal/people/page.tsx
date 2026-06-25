"use client";

// Organization portal — People. The dedicated, filterable list of everyone the
// org serves (clients, students, applicants, employees, family members). Each
// person holds one or more document cases. Lives under the shared portal nav.
//
// Same access model as the rest of the portal: behind the `b2b_portals` flag
// (503 → "coming soon"), gated by a Teams entitlement (403 portal_not_enabled →
// paywall). Reads are open to any member; adding people is admin/owner only.

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Inbox,
  ShieldAlert,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast, type ToastState } from "@/components/ui/toast";
import { LimitWarningBanners } from "@/components/features/portals/plan-usage-card";
import { PersonCard } from "@/components/features/portals/person-card";
import { PortalNav } from "@/components/features/portals/portal-nav";
import { AddPersonModal } from "@/components/features/portals/portal-modals";
import { useFeature } from "@/components/features/feature-flags-provider";
import { ApiError } from "@/lib/api";
import { canManageOrganization, getOrganization } from "@/lib/organizations";
import {
  PORTAL_PERSON_STATUS_LABELS,
  PORTAL_PERSON_STATUS_ORDER,
  PORTAL_PERSON_TYPE_LABELS,
  PORTAL_PERSON_TYPE_ORDER,
  filterPortalPeople,
  getPortalLimits,
  getPortalPeople,
  isPortalNotEnabledError,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type { Organization } from "@/types/organizations";
import type {
  PortalLimits,
  PortalPerson,
  PortalPersonStatus,
  PortalPersonType,
} from "@/types/portals";

type BlockKind = "coming_soon" | "paywall" | "view_only" | null;

const FILTER_SELECT =
  "h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export default function PortalPeoplePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const orgId = Number(id);
  const portalsEnabled = useFeature("b2b_portals");

  const [org, setOrg] = useState<Organization | null>(null);
  const [people, setPeople] = useState<PortalPerson[]>([]);
  const [limits, setLimits] = useState<PortalLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [block, setBlock] = useState<BlockKind>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PortalPersonStatus | "">("");
  const [personType, setPersonType] = useState<PortalPersonType | "">("");

  const canManage = org ? canManageOrganization(org.user_role) : false;

  async function refresh(message?: string) {
    const [nextPeople, nextLimits] = await Promise.all([
      getPortalPeople(orgId),
      getPortalLimits(orgId),
    ]);
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
        const nextPeople = await getPortalPeople(orgId);
        if (active) setPeople(nextPeople.people);
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
        setLoadError("Unable to load people.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orgId]);

  const filtered = useMemo(
    () => filterPortalPeople(people, { search, status, personType }),
    [people, search, status, personType],
  );

  const hasFilters =
    search.trim() !== "" || status !== "" || personType !== "";

  function clearFilters() {
    setSearch("");
    setStatus("");
    setPersonType("");
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
        <PageHeader eyebrow="Organization" title="People" />
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={Inbox}
            title="Portals are coming soon."
            description="People are the clients, students, and applicants you serve. This isn't enabled for your account yet."
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
          Loading people…
        </span>
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-40" />
        </div>
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      </PageContainer>
    );
  }

  if (block === "paywall") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow={org ? org.name : "Organization"} title="People" />
        <section className="rounded-2xl border border-border bg-card p-6 shadow-card sm:p-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <Sparkles className="size-3.5" aria-hidden />
            Teams
          </span>
          <h2 className="mt-3 font-heading text-xl font-semibold">
            People are part of B2B Portals on Teams.
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Keep everyone you serve in one place and attach the document cases
            each of them needs. This organization isn&apos;t on a Teams plan yet.
          </p>
        </section>
      </PageContainer>
    );
  }

  if (block === "view_only") {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="People" />
        <InlineAlert>
          You don&apos;t have access to this portal&apos;s people.
        </InlineAlert>
      </PageContainer>
    );
  }

  if (loadError) {
    return (
      <PageContainer width="wide">
        {backLink}
        <PageHeader eyebrow="Organization" title="People" />
        <InlineAlert>{loadError}</InlineAlert>
      </PageContainer>
    );
  }

  const noPeopleAtAll = people.length === 0;

  return (
    <PageContainer width="wide">
      {backLink}
      <PortalNav orgId={orgId} active="people" />
      <PageHeader
        eyebrow={org?.name || "Organization"}
        title="People"
        description="Everyone you serve — clients, students, applicants, and employees — each with their own document cases."
        actions={
          canManage ? (
            <Button onClick={() => setAddingPerson(true)}>
              <UserPlus className="size-4" /> Add person
            </Button>
          ) : undefined
        }
      />

      {limits && <LimitWarningBanners data={limits} />}

      {!canManage && (
        <TrustNotice icon={ShieldAlert} title="View-only access">
          You can browse people and their details. Adding people is limited to
          organization owners and admins.
        </TrustNotice>
      )}

      {noPeopleAtAll ? (
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={Users}
            title="No people yet."
            description="Add the clients, students, applicants, or employees you're helping. Each person can hold one or more document cases."
            action={
              canManage ? (
                <Button onClick={() => setAddingPerson(true)}>
                  <UserPlus className="size-4" /> Add person
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <section
            aria-label="Filter people"
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="person-search" className="sr-only">
                Search people by name or email
              </label>
              <Input
                id="person-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="h-9"
              />
            </div>
            <label htmlFor="person-status" className="sr-only">
              Status
            </label>
            <select
              id="person-status"
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as PortalPersonStatus | "")
              }
              className={FILTER_SELECT}
            >
              <option value="">Any status</option>
              {PORTAL_PERSON_STATUS_ORDER.map((value) => (
                <option key={value} value={value}>
                  {PORTAL_PERSON_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
            <label htmlFor="person-type" className="sr-only">
              Type
            </label>
            <select
              id="person-type"
              value={personType}
              onChange={(e) =>
                setPersonType(e.target.value as PortalPersonType | "")
              }
              className={FILTER_SELECT}
            >
              <option value="">Any type</option>
              {PORTAL_PERSON_TYPE_ORDER.map((value) => (
                <option key={value} value={value}>
                  {PORTAL_PERSON_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </section>

          <p className="text-xs text-muted-foreground" aria-live="polite">
            {filtered.length} of {people.length}{" "}
            {people.length === 1 ? "person" : "people"}
          </p>

          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card">
              <EmptyState
                icon={Users}
                title="No people match these filters."
                description="Try a different status, type, or search term."
                action={
                  <Button variant="outline" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid gap-3">
              {filtered.map((person) => (
                <PersonCard
                  key={person.id}
                  orgId={orgId}
                  person={person}
                  canManage={canManage}
                />
              ))}
            </div>
          )}
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

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </PageContainer>
  );
}
