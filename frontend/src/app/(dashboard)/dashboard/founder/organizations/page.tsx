"use client";

// Founder support console — organizations list. Safe aggregates only (no
// document contents, file URLs, tokens). Founder/staff only via the founder layout.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Loader2 } from "lucide-react";

import { FounderPageHeader } from "@/components/founder/founder-ui";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api";
import { getFounderOrganizations } from "@/lib/founder";
import type { FounderOrgListItem } from "@/types/founder";

export default function FounderOrganizationsPage() {
  const [orgs, setOrgs] = useState<FounderOrgListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getFounderOrganizations()
      .then((resp) => active && (setOrgs(resp.organizations), setError(null)))
      .catch(
        (err) =>
          active &&
          setError(err instanceof ApiError ? err.message : "Could not load organizations."),
      );
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    if (!orgs) return [];
    const q = search.trim().toLowerCase();
    return q
      ? orgs.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            (o.owner?.email ?? "").toLowerCase().includes(q),
        )
      : orgs;
  }, [orgs, search]);

  if (error) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="Organizations" description="Support view of every organization." />
        <ErrorState description={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    );
  }

  if (!orgs) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="Organizations" description="Support view of every organization." />
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FounderPageHeader
        title="Organizations"
        description="Plans, portal status, and usage for every organization. No document contents."
      />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by org name or owner email…"
        className="max-w-md"
      />
      <p className="text-xs text-muted-foreground">
        {filtered.length} of {orgs.length} organization
        {orgs.length === 1 ? "" : "s"}
      </p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No organizations match.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((org) => (
            <Link
              key={org.id}
              href={`/dashboard/founder/organizations/${org.id}`}
              className="block rounded-xl border border-border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2 className="size-4 text-primary" aria-hidden />
                    <span className="font-medium">{org.name}</span>
                    <Badge variant="secondary">{org.plan}</Badge>
                    {org.portal_enabled ? (
                      <Badge variant="secondary" className="bg-brand-success/15 text-brand-success">
                        Portal on
                      </Badge>
                    ) : (
                      <Badge variant="outline">Portal off</Badge>
                    )}
                    {org.has_demo_workspace && (
                      <Badge variant="outline" className="border-primary/40 text-primary">
                        Demo
                      </Badge>
                    )}
                    {org.is_archived && <Badge variant="outline">Archived</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {org.owner?.email ?? "no owner"}
                  </p>
                </div>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{org.members} members</span>
                  <span>{org.people} people</span>
                  <span>{org.active_cases} cases</span>
                  <span>{org.active_requests} requests</span>
                  <span>{org.active_rooms} rooms</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
