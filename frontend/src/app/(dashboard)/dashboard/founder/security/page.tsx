"use client";

import { useEffect, useState } from "react";
import { LockKeyhole, ShieldAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getSecurityOverview } from "@/lib/founder";
import type { SecurityOverview } from "@/types/founder";

const nf = new Intl.NumberFormat();

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">
          {nf.format(value)}
        </p>
      </CardContent>
    </Card>
  );
}

export default function FounderSecurityPage() {
  const [data, setData] = useState<SecurityOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getSecurityOverview()
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
            : "Unable to load security overview.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index} className="h-[120px] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-2xl font-semibold">
          Security overview
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Safe audit summary for private beta. Raw IP addresses, access codes,
          tokens, and document contents are not shown here.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Metric
          label="Failed login attempts, 24h"
          value={data.failed_login_attempts_24h}
        />
        <Metric
          label="Wrong share codes, 24h"
          value={data.wrong_share_code_attempts_24h}
        />
        <Metric
          label="Expired link attempts, 24h"
          value={data.expired_link_access_attempts_24h}
        />
        <Metric
          label="Revoked link attempts, 24h"
          value={data.revoked_link_access_attempts_24h}
        />
        <Metric
          label="Suspicious events, 7d"
          value={data.suspicious_events_count_7d}
        />
        <Metric
          label="High-download accounts"
          value={data.high_download_accounts_count}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="size-5 text-primary" />
            Recent safe security events
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.recent_security_events.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-border p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-success/10 text-brand-success">
                <LockKeyhole className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium">No recent security events</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Share-code failures, revoked-link attempts, expired-link
                  attempts, and failed logins will appear here as safe metadata.
                </p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2">
              {data.recent_security_events.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{event.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {event.object_type || "security"} ·{" "}
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {event.country || "country unavailable"}
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
