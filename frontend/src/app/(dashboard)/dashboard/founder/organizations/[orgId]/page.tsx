"use client";

// Founder support console — organization detail. Safe support info only: plan +
// limits/usage, members, recent operational events, support notes, and a safe
// plan/portal action (reuses the existing no-Stripe service). No document
// contents, file URLs, or tokens.

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

import { FounderPageHeader } from "@/components/founder/founder-ui";
import { SupportNotes } from "@/components/founder/support-notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api";
import {
  getFounderOrganizationDetail,
  setFounderOrganizationPlan,
} from "@/lib/founder";
import { cn } from "@/lib/utils";
import type { FounderOrgDetail } from "@/types/founder";

const ORG_PLANS = ["free", "pro", "teams_beta", "teams", "enterprise"];

export default function FounderOrganizationDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const id = Number(orgId);
  const [org, setOrg] = useState<FounderOrgDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [plan, setPlan] = useState<string>("");
  const [savingPlan, setSavingPlan] = useState(false);

  useEffect(() => {
    let active = true;
    getFounderOrganizationDetail(id)
      .then((data) => {
        if (active) {
          setOrg(data);
          setPlan(data.plan);
          setError(null);
        }
      })
      .catch(
        (err) =>
          active &&
          setError(err instanceof ApiError ? err.message : "Could not load organization."),
      );
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  async function savePlan() {
    setSavingPlan(true);
    try {
      const updated = await setFounderOrganizationPlan(id, { plan });
      setOrg(updated);
    } finally {
      setSavingPlan(false);
    }
  }

  const back = (
    <Link
      href="/dashboard/founder/organizations"
      className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}
    >
      <ArrowLeft className="size-4" /> Back to organizations
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-6">
        {back}
        <ErrorState description={error} onRetry={() => setReloadKey((k) => k + 1)} />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="space-y-6">
        {back}
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }

  const limitKeys = Object.keys(org.usage);

  return (
    <div className="space-y-6">
      {back}
      <FounderPageHeader
        eyebrow="Organization"
        title={org.name}
        description={`${org.owner?.email ?? "no owner"} · ${org.plan}${org.portal_enabled ? " · portal on" : ""}`}
        actions={
          org.has_demo_workspace ? (
            <Badge variant="outline" className="border-primary/40 text-primary">
              Demo data
            </Badge>
          ) : undefined
        }
      />

      {/* Safe plan/portal action */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan &amp; portal</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm"
            aria-label="Organization plan"
          >
            {ORG_PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <Button onClick={savePlan} disabled={savingPlan || plan === org.plan}>
            {savingPlan ? <Loader2 className="size-4 animate-spin" /> : null}
            Set plan
          </Button>
          <span className="text-xs text-muted-foreground">
            Local entitlement only — no Stripe / billing change.
          </span>
        </CardContent>
      </Card>

      {/* Limits & usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limits &amp; usage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {limitKeys.map((key) => {
              const used = org.usage[key] ?? 0;
              const limit = org.limits[key];
              const atLimit = typeof limit === "number" && used >= limit;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">{key.replace(/_/g, " ")}</span>
                  <span className={atLimit ? "font-semibold text-brand-amber" : "font-medium"}>
                    {used}
                    {limit === null ? " / ∞" : ` / ${limit}`}
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members ({org.members_list.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {org.members_list.length === 0 ? (
            <p className="text-sm text-muted-foreground">No members.</p>
          ) : (
            <ul className="divide-y divide-border">
              {org.members_list.map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="truncate">{m.email}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{m.role}</Badge>
                    <span className="text-xs text-muted-foreground">{m.status}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Recent operational events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent operational events</CardTitle>
        </CardHeader>
        <CardContent>
          {org.recent_events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent events.</p>
          ) : (
            <ul className="space-y-1.5">
              {org.recent_events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant={e.severity === "error" || e.severity === "critical" ? "destructive" : "outline"}>
                    {e.severity}
                  </Badge>
                  <span className="text-muted-foreground">{e.category}</span>
                  <span>{e.source}</span>
                  <span className="text-muted-foreground">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <SupportNotes targetOrganization={id} initialNotes={org.support_notes} />
    </div>
  );
}
