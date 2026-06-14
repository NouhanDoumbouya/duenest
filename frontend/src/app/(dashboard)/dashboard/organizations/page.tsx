"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarClock,
  FileText,
  Plus,
  ShieldAlert,
  UsersRound,
} from "lucide-react";

import { ProductMetric } from "@/components/ui/product-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import {
  ORGANIZATION_TYPE_LABELS,
  ROLE_LABELS,
  getOrganizations,
  getOrganizationSummary,
} from "@/lib/organizations";
import { cn } from "@/lib/utils";
import type { Organization, OrganizationSummary } from "@/types/organizations";

interface OrganizationsState {
  organizations: Organization[];
  summaries: Record<number, OrganizationSummary>;
}

export default function OrganizationsPage() {
  const [state, setState] = useState<OrganizationsState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getOrganizations()
      .then(async (page) => {
        const entries = await Promise.all(
          page.results.map(async (organization) => [
            organization.id,
            await getOrganizationSummary(organization.id),
          ] as const),
        );
        if (!active) return;
        setState({
          organizations: page.results,
          summaries: Object.fromEntries(entries),
        });
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setState({ organizations: [], summaries: {} });
        setError(
          err instanceof ApiError ? err.message : "Unable to load organizations.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const organizations = state?.organizations ?? [];
  const totals = organizations.reduce(
    (acc, organization) => {
      const summary = state?.summaries[organization.id];
      acc.members += summary?.member_count ?? organization.member_count;
      acc.documents += summary?.document_count ?? 0;
      acc.openRequests += summary?.open_requests_count ?? 0;
      acc.deadlines += summary?.upcoming_deadlines_count ?? 0;
      acc.overdue += summary?.overdue_requests_count ?? 0;
      return acc;
    },
    { members: 0, documents: 0, openRequests: 0, deadlines: 0, overdue: 0 },
  );

  return (
    <PageContainer width="wide">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Team workspace
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Organizations
          </h1>
          <p className="mt-1.5 max-w-2xl text-muted-foreground">
            Manage shared documents, requests, bundles, and deadlines with your
            team.
          </p>
        </div>
        <Link
          href="/dashboard/organizations/new"
          className={cn(buttonVariants({ size: "lg" }))}
        >
          <Plus className="size-4" />
          Create organization
        </Link>
      </div>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {state === null ? (
        <div
          className="grid gap-4 lg:grid-cols-2"
          aria-busy="true"
          aria-label="Loading organizations"
        >
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card p-5 shadow-card"
            >
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="mt-2 h-4 w-1/3" />
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, j) => (
                  <Skeleton key={j} className="h-12 w-full rounded-lg" />
                ))}
              </div>
              <Skeleton className="mt-4 h-4 w-3/4" />
            </div>
          ))}
        </div>
      ) : organizations.length === 0 ? (
        <Card>
          <CardContent className="space-y-5">
            <EmptyState
              icon={Building2}
              title="Create a shared workspace"
              description="Collect documents from members, track missing files, and prepare team bundles without WhatsApp chaos. Members only see what you request — never the rest of your vault."
              action={
                <Link
                  href="/dashboard/organizations/new"
                  className={cn(buttonVariants({ size: "lg" }))}
                >
                  <Plus className="size-4" />
                  Create organization
                </Link>
              }
            />
            <div className="mx-auto max-w-xl">
              <p className="text-center text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Great for
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {[
                  "Student association",
                  "Scholarship team",
                  "NGO",
                  "Club",
                  "Small business",
                  "Event team",
                ].map((example) => (
                  <span
                    key={example}
                    className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground"
                  >
                    {example}
                  </span>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <ProductMetric
              label="Organizations"
              value={organizations.length}
              hint="active workspaces"
              icon={Building2}
              tone="secure"
            />
            <ProductMetric
              label="Members"
              value={totals.members}
              hint="active across teams"
              icon={UsersRound}
            />
            <ProductMetric
              label="Documents"
              value={totals.documents}
              hint="organization-scoped"
              icon={FileText}
            />
            <ProductMetric
              label="Open requests"
              value={totals.openRequests}
              hint={`${totals.overdue} overdue`}
              icon={ShieldAlert}
              tone={totals.overdue ? "danger" : "warn"}
            />
            <ProductMetric
              label="Deadlines"
              value={totals.deadlines}
              hint="next 30 days"
              icon={CalendarClock}
              tone="warn"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {organizations.map((organization) => {
              const summary = state.summaries[organization.id];
              return (
                <Link
                  key={organization.id}
                  href={`/dashboard/organizations/${organization.id}`}
                  className="group rounded-xl border border-border bg-card p-5 shadow-card transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-heading text-xl font-semibold">
                          {organization.name}
                        </h2>
                        {organization.user_role && (
                          <Badge variant="outline">
                            {ROLE_LABELS[organization.user_role]}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {ORGANIZATION_TYPE_LABELS[organization.organization_type]}
                        {organization.country ? ` - ${organization.country}` : ""}
                      </p>
                    </div>
                    <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-4">
                    <MiniMetric label="Members" value={summary?.member_count ?? 0} />
                    <MiniMetric label="Docs" value={summary?.document_count ?? 0} />
                    <MiniMetric
                      label="Open"
                      value={summary?.open_requests_count ?? 0}
                    />
                    <MiniMetric
                      label="Ready"
                      value={`${summary?.readiness.score ?? 0}%`}
                    />
                  </div>

                  <p className="mt-4 line-clamp-2 text-sm text-muted-foreground">
                    {summary?.next_recommended_action ||
                      "Open this workspace to manage shared document operations."}
                  </p>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </PageContainer>
  );
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
