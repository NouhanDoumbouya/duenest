"use client";

import { useEffect, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  Mail,
  MailWarning,
  SkipForward,
} from "lucide-react";

import { FounderPageHeader, FounderStatCard } from "@/components/founder/founder-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getFounderNotificationHealth } from "@/lib/founder";
import type { NotificationDeliveryHealth } from "@/types/founder";

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export default function FounderNotificationsPage() {
  const [data, setData] = useState<NotificationDeliveryHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFounderNotificationHealth()
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load notification health.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const today = data?.today;
  const failureRate = data ? Math.round(data.email_failure_rate_7d * 100) : 0;

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Founder Ops"
        title="Notification delivery health"
        description="Reminder/notification generation and email delivery, including scheduled run history. Aggregate counts only — no user data."
      />

      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card className={data?.email.configured ? "" : "border-brand-amber/30 bg-brand-amber/5"}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4 text-sm">
          <div>
            <span className="font-semibold">Email provider:</span>{" "}
            {data?.email.provider ?? "—"}{" "}
            <span className="text-muted-foreground">({data?.email.from_email})</span>
          </div>
          <div className={data?.email.configured ? "text-brand-success" : "text-brand-amber"}>
            {data?.email.configured
              ? "Configured — emails will be sent"
              : "Not configured — emails are recorded as skipped (not sent)"}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FounderStatCard label="Generated today" value={today?.generated ?? 0} hint="Notifications created today" icon={BellRing} />
        <FounderStatCard label="In-app delivered" value={today?.in_app_delivered ?? 0} hint="Delivered in-app today" icon={CheckCircle2} tone="good" />
        <FounderStatCard label="Emails sent" value={today?.emails_sent ?? 0} hint="Emails sent today" icon={Mail} tone="good" />
        <FounderStatCard label="Emails skipped" value={today?.emails_skipped ?? 0} hint="Not configured / skipped today" icon={SkipForward} tone="warn" />
        <FounderStatCard label="Emails failed" value={today?.emails_failed ?? 0} hint="Failed sends today" icon={MailWarning} tone={today?.emails_failed ? "danger" : "default"} />
        <FounderStatCard label="Email failure rate (7d)" value={`${failureRate}%`} hint={`${data?.emails_attempted_7d ?? 0} attempted in 7 days`} icon={MailWarning} tone={failureRate > 10 ? "danger" : "default"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Last run</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            <p>Finished: {formatTime(data?.last_run?.finished_at)}</p>
            <p>Status: {data?.last_run?.status ?? "—"}</p>
            <p>
              Last successful: {formatTime(data?.last_successful_run?.finished_at)}
            </p>
            <p>Pending / undelivered: {data?.pending_undelivered ?? 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent failures</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {data && data.recent_failures.length > 0 ? (
              <ul className="space-y-1">
                {data.recent_failures.map((f, i) => (
                  <li key={i} className="flex justify-between gap-3 text-muted-foreground">
                    <span className="truncate">{f.type}</span>
                    <span className="shrink-0">
                      {f.email_last_error} · {f.email_attempts}x
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No recent email failures.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {data && data.recent_runs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Finished</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Trigger</th>
                    <th className="py-2 pr-3">Eval</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2 pr-3">Sent</th>
                    <th className="py-2 pr-3">Skipped</th>
                    <th className="py-2 pr-3">Failed</th>
                    <th className="py-2">ms</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_runs.map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-2 pr-3 whitespace-nowrap">{formatTime(r.finished_at)}</td>
                      <td className="py-2 pr-3">{r.status}</td>
                      <td className="py-2 pr-3">{r.trigger}</td>
                      <td className="py-2 pr-3">{r.evaluated}</td>
                      <td className="py-2 pr-3">{r.created}</td>
                      <td className="py-2 pr-3">{r.emails_sent}</td>
                      <td className="py-2 pr-3">{r.emails_skipped}</td>
                      <td className="py-2 pr-3">{r.emails_failed}</td>
                      <td className="py-2">{r.duration_ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No runs recorded yet. Runs appear after the first real
              process_due_notifications execution.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
