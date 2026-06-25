"use client";

// Founder support console — user detail. Safe support info only: plan + storage
// + AI usage, org memberships, recent operational events, and support notes.
// Intentionally excludes document titles, filenames, OCR text, file URLs, and
// tokens (see the privacy_note from the backend).

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";

import { FounderPageHeader, FounderStatCard } from "@/components/founder/founder-ui";
import { SupportNotes } from "@/components/founder/support-notes";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Database, FileText, Sparkles } from "lucide-react";
import { ApiError } from "@/lib/api";
import { getFounderUserDetail } from "@/lib/founder";
import { formatBytes } from "@/lib/plan";
import { cn } from "@/lib/utils";
import type { FounderUserDetail } from "@/types/founder";

export default function FounderUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = use(params);
  const id = Number(userId);
  const [data, setData] = useState<FounderUserDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getFounderUserDetail(id)
      .then((d) => active && (setData(d), setError(null)))
      .catch(
        (err) =>
          active &&
          setError(err instanceof ApiError ? err.message : "Could not load user."),
      );
    return () => {
      active = false;
    };
  }, [id, reloadKey]);

  const back = (
    <Link
      href="/dashboard/founder/users"
      className={cn(buttonVariants({ variant: "ghost" }), "w-fit")}
    >
      <ArrowLeft className="size-4" /> Back to users
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

  if (!data) {
    return (
      <div className="space-y-6">
        {back}
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }

  const storage = data.plan_usage.storage;
  const storagePercent = storage.limit_bytes
    ? Math.round((storage.used_bytes / storage.limit_bytes) * 100)
    : null;

  return (
    <div className="space-y-6">
      {back}
      <FounderPageHeader
        eyebrow="User"
        title={data.user.email}
        description={`Joined ${new Date(data.user.date_joined).toLocaleDateString()} · ${data.plan_usage.plan_label}${data.user.is_staff ? " · staff" : ""}`}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FounderStatCard
          label="Documents"
          value={data.counts.documents ?? 0}
          hint={`${data.counts.files ?? 0} files`}
          icon={FileText}
          tone="default"
        />
        <FounderStatCard
          label="Storage used"
          value={formatBytes(storage.used_bytes)}
          hint={
            storage.unlimited
              ? "unlimited"
              : `${storagePercent ?? 0}% of ${formatBytes(storage.limit_bytes ?? 0)}`
          }
          icon={Database}
          tone={storagePercent !== null && storagePercent >= 90 ? "danger" : "default"}
        />
        <FounderStatCard
          label="AI tokens (month)"
          value={data.ai.month_tokens}
          hint={`$${data.ai.month_cost_usd.toFixed(2)} · ${data.ai.month_requests} requests`}
          icon={Sparkles}
          tone={data.ai.paused ? "warn" : "default"}
        />
        <FounderStatCard
          label="Organizations"
          value={data.organizations.length}
          hint={data.user.last_login ? `Last login ${new Date(data.user.last_login).toLocaleDateString()}` : "Never logged in"}
          icon={FileText}
          tone="default"
        />
      </section>

      {/* Plan resources at/near limit */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan resources</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.values(data.plan_usage.resources).map((r) => (
              <div
                key={r.resource}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span className="truncate text-muted-foreground">{r.label}</span>
                <span className={r.at_limit ? "font-semibold text-brand-amber" : "font-medium"}>
                  {r.used}
                  {r.unlimited ? " / ∞" : ` / ${r.limit}`}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Organizations */}
      {data.organizations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Organization memberships</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {data.organizations.map((o) => (
                <li key={o.organization_id} className="flex items-center justify-between py-2 text-sm">
                  <Link
                    href={`/dashboard/founder/organizations/${o.organization_id}`}
                    className="truncate hover:underline"
                  >
                    {o.name}
                  </Link>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline">{o.role}</Badge>
                    <span className="text-xs text-muted-foreground">{o.plan}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Recent operational events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent operational events</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent_events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent events.</p>
          ) : (
            <ul className="space-y-1.5">
              {data.recent_events.map((e) => (
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

      <SupportNotes targetUser={id} initialNotes={data.support_notes} />

      <p className="text-xs text-muted-foreground">{data.privacy_note}</p>
    </div>
  );
}
