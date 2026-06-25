"use client";

// Founder support console — plans & limits. Plan distribution + who's at/over a
// limit. Read-only visibility; safe aggregates only.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { FounderPageHeader } from "@/components/founder/founder-ui";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api";
import { getFounderPlansLimits } from "@/lib/founder";
import { formatBytes } from "@/lib/plan";
import type { PlansLimitsOverview } from "@/types/founder";

function Distribution({ title, counts }: { title: string; counts: Record<string, number> }) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data.</p>
        ) : (
          <ul className="space-y-1.5">
            {entries.map(([plan, n]) => (
              <li key={plan} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{plan}</span>
                <span className="font-medium">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function FounderPlansLimitsPage() {
  const [data, setData] = useState<PlansLimitsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFounderPlansLimits()
      .then((d) => active && (setData(d), setError(null)))
      .catch(
        (err) =>
          active && setError(err instanceof ApiError ? err.message : "Could not load."),
      );
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="Plans & limits" description="Plan distribution and limit pressure." />
        <ErrorState description={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="Plans & limits" description="Plan distribution and limit pressure." />
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FounderPageHeader
        title="Plans & limits"
        description="Who is on which plan, and who is at or over a limit. Personal billing is read-only."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Distribution title="User plans" counts={data.user_plans} />
        <Distribution title="Organization plans" counts={data.organization_plans} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Users over storage limit ({data.users_over_storage.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.users_over_storage.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users over their storage limit.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.users_over_storage.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/dashboard/founder/users/${u.id}`} className="truncate hover:underline">
                    {u.email}
                  </Link>
                  <span className="text-brand-amber">
                    {formatBytes(u.used_bytes)} / {formatBytes(u.limit_bytes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Organizations at a limit ({data.organizations_at_limit.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.organizations_at_limit.length === 0 ? (
            <p className="text-sm text-muted-foreground">No organizations at a limit.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.organizations_at_limit.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <Link href={`/dashboard/founder/organizations/${o.id}`} className="truncate hover:underline">
                    {o.name}
                  </Link>
                  <span className="flex flex-wrap items-center gap-1">
                    <Badge variant="secondary">{o.plan}</Badge>
                    {o.at_limit.map((k) => (
                      <Badge key={k} variant="outline" className="border-brand-amber/40 text-brand-amber">
                        {k.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
