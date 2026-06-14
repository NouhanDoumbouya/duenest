"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  KeyRound,
  Link2Off,
  LockKeyhole,
  LogIn,
  ShieldAlert,
  TimerOff,
} from "lucide-react";

import {
  FounderPageHeader,
  FounderStatCard,
} from "@/components/founder/founder-ui";
import { FounderInsightPanel } from "@/components/founder/insight-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getSecurityOverview } from "@/lib/founder";
import type { SecurityOverview } from "@/types/founder";

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

  // Decision-oriented read of the safe security signals.
  const insights = useMemo(() => {
    if (!data) return [];
    const items: { tone: "neutral" | "good" | "warn"; text: string }[] = [];
    if (data.failed_login_attempts_24h >= 10) {
      items.push({
        tone: "warn",
        text: `${data.failed_login_attempts_24h} failed login attempts in the last 24h — watch for credential stuffing.`,
      });
    }
    if (data.wrong_share_code_attempts_24h >= 5) {
      items.push({
        tone: "warn",
        text: `${data.wrong_share_code_attempts_24h} wrong share-code attempts in 24h — a share may be under guessing pressure.`,
      });
    }
    if (data.high_download_accounts_count > 0) {
      items.push({
        tone: "warn",
        text: `${data.high_download_accounts_count} account(s) show unusually high download volume — worth a glance.`,
      });
    }
    if (items.length === 0) {
      items.push({
        tone: "good",
        text: "No unusual behavior detected across logins, share codes, links, or downloads.",
      });
    }
    return items;
  }, [data]);

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
      <FounderPageHeader
        eyebrow="Operations"
        title="Security overview"
        description="A safe audit summary. Raw IP addresses, access codes, tokens, and document contents are never shown here."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FounderStatCard
          icon={LogIn}
          label="Failed logins, 24h"
          value={data.failed_login_attempts_24h}
          hint="Repeated failures can signal stuffing"
          tone={data.failed_login_attempts_24h >= 10 ? "warn" : "good"}
        />
        <FounderStatCard
          icon={KeyRound}
          label="Wrong share codes, 24h"
          value={data.wrong_share_code_attempts_24h}
          hint="Failed access-code attempts"
          tone={data.wrong_share_code_attempts_24h >= 5 ? "warn" : "good"}
        />
        <FounderStatCard
          icon={TimerOff}
          label="Expired link attempts, 24h"
          value={data.expired_link_access_attempts_24h}
          hint="Access tried after expiry"
        />
        <FounderStatCard
          icon={Link2Off}
          label="Revoked link attempts, 24h"
          value={data.revoked_link_access_attempts_24h}
          hint="Access tried after revoke"
        />
        <FounderStatCard
          icon={ShieldAlert}
          label="Suspicious events, 7d"
          value={data.suspicious_events_count_7d}
          hint="Aggregated safe signals"
          tone={data.suspicious_events_count_7d > 0 ? "warn" : "good"}
        />
        <FounderStatCard
          icon={Download}
          label="High-download accounts"
          value={data.high_download_accounts_count}
          hint="Unusually high volume"
          tone={data.high_download_accounts_count > 0 ? "warn" : "good"}
        />
      </div>

      <FounderInsightPanel title="Is there anything to review?" insights={insights} />

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
