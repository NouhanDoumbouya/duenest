"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, Loader2 } from "lucide-react";

import { SectionCard } from "@/components/ui/section-card";
import { ApiError } from "@/lib/api";
import { getOrganizations, getOrganizationSummary } from "@/lib/organizations";
import type { Organization, OrganizationSummary } from "@/types/organizations";

interface OrganizationWidgetState {
  organizations: Organization[];
  summaries: Record<number, OrganizationSummary>;
}

export function OrganizationsWidget() {
  const [state, setState] = useState<OrganizationWidgetState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getOrganizations()
      .then(async (page) => {
        const organizations = page.results.slice(0, 3);
        const entries = await Promise.all(
          organizations.map(async (organization) => [
            organization.id,
            await getOrganizationSummary(organization.id),
          ] as const),
        );
        if (!active) return;
        setState({ organizations, summaries: Object.fromEntries(entries) });
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

  return (
    <SectionCard
      title="Organizations"
      action={
        <Link
          href="/dashboard/organizations"
          className="text-sm font-medium text-primary hover:underline"
        >
          All
        </Link>
      }
    >
      {error && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {state === null ? (
        <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading organizations...
        </div>
      ) : state.organizations.length === 0 ? (
        <div className="py-2 text-sm text-muted-foreground">
          <p>No team workspaces yet.</p>
          <Link
            href="/dashboard/organizations/new"
            className="mt-2 inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            Create organization
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {state.organizations.map((organization) => {
            const summary = state.summaries[organization.id];
            return (
              <li key={organization.id}>
                <Link
                  href={`/dashboard/organizations/${organization.id}`}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-primary/40"
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {organization.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {summary
                        ? `${summary.open_requests_count} open requests - ${summary.upcoming_deadlines_count} deadlines`
                        : "Open workspace"}
                    </span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
