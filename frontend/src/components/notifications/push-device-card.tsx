"use client";

import { useEffect, useState } from "react";
import { BellRing, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notifications";
import {
  getPushPublicKey,
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";
import { supportsPush } from "@/lib/pwa";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

function formatHour(h: number): string {
  const hour = ((h + 11) % 12) + 1;
  const suffix = h < 12 ? "AM" : "PM";
  return `${hour}:00 ${suffix}`;
}

type Status = "loading" | "unsupported" | "unconfigured" | "ready";

const REASON_COPY: Record<string, string> = {
  denied:
    "Notifications are blocked for CertaNest in this browser. Enable them in your browser settings, then try again.",
  unconfigured: "Push delivery isn't configured on this server yet.",
  unsupported: "This browser or device doesn't support push notifications.",
  error: "We couldn't enable push on this device. Please try again.",
};

/**
 * Device-level Web Push opt-in. Permission is only ever requested from the
 * Enable button below — never automatically. Copy explains the lock-screen
 * privacy guarantee so users can trust it.
 */
export function PushDeviceCard() {
  const [status, setStatus] = useState<Status>("loading");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Quiet hours (push only — in-app notifications are never suppressed).
  const [quietEnabled, setQuietEnabled] = useState(false);
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(7);
  const [quietSaving, setQuietSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getNotificationPreferences()
      .then((prefs) => {
        if (!active) return;
        setQuietEnabled(prefs.push_quiet_hours_enabled);
        setQuietStart(prefs.push_quiet_start_hour);
        setQuietEnd(prefs.push_quiet_end_hour);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!supportsPush()) {
        if (active) setStatus("unsupported");
        return;
      }
      const key = await getPushPublicKey().catch(() => null);
      if (!active) return;
      if (!key || !key.enabled) {
        setStatus("unconfigured");
        return;
      }
      setSubscribed(await getPushSubscriptionState());
      setStatus("ready");
    })();
    return () => {
      active = false;
    };
  }, []);

  async function handleEnable() {
    setBusy(true);
    setMessage(null);
    const result = await subscribeToPush();
    if (result.ok) {
      await updateNotificationPreferences({ push_enabled: true }).catch(
        () => undefined,
      );
      setSubscribed(true);
      setMessage("Push notifications are on for this device.");
    } else {
      setMessage(REASON_COPY[result.reason] ?? REASON_COPY.error);
    }
    setBusy(false);
  }

  async function handleDisable() {
    setBusy(true);
    setMessage(null);
    await unsubscribeFromPush();
    setSubscribed(false);
    setMessage("Push notifications are off for this device.");
    setBusy(false);
  }

  async function saveQuietHours(next: {
    enabled?: boolean;
    start?: number;
    end?: number;
  }) {
    const enabled = next.enabled ?? quietEnabled;
    const start = next.start ?? quietStart;
    const end = next.end ?? quietEnd;
    setQuietEnabled(enabled);
    setQuietStart(start);
    setQuietEnd(end);
    setQuietSaving(true);
    await updateNotificationPreferences({
      push_quiet_hours_enabled: enabled,
      push_quiet_start_hour: start,
      push_quiet_end_hour: end,
    }).catch(() => undefined);
    setQuietSaving(false);
  }

  return (
    <SectionCard
      title="Push notifications on this device"
      description="Get a gentle nudge on your device when something needs attention — even when CertaNest isn't open."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <ShieldCheck className="size-4" />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Lock-screen previews stay generic — they never show document names,
            who opened a share, or any private detail. The actual update is shown
            only after you open CertaNest and sign in.
          </p>
        </div>

        {status === "loading" && (
          <p className="text-sm text-muted-foreground">Checking this device…</p>
        )}
        {status === "unsupported" && (
          <p className="text-sm text-muted-foreground">
            {REASON_COPY.unsupported} On iPhone or iPad, install CertaNest to your
            Home Screen first.
          </p>
        )}
        {status === "unconfigured" && (
          <p className="text-sm text-muted-foreground">{REASON_COPY.unconfigured}</p>
        )}

        {status === "ready" && (
          <div className="flex flex-wrap items-center gap-3">
            {subscribed ? (
              <Button variant="outline" onClick={handleDisable} disabled={busy}>
                <BellRing className="size-4" />
                {busy ? "Turning off…" : "Turn off on this device"}
              </Button>
            ) : (
              <Button onClick={handleEnable} disabled={busy}>
                <BellRing className="size-4" />
                {busy ? "Enabling…" : "Enable on this device"}
              </Button>
            )}
            <span className="text-xs font-medium text-muted-foreground">
              {subscribed ? "Enabled on this device" : "Not enabled on this device"}
            </span>
          </div>
        )}

        {message && (
          <p className="text-sm text-muted-foreground" role="status">
            {message}
          </p>
        )}

        {status === "ready" && subscribed && (
          <div className="space-y-3 rounded-xl border border-border bg-card px-4 py-3">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={quietEnabled}
                onChange={(event) =>
                  saveQuietHours({ enabled: event.target.checked })
                }
                disabled={quietSaving}
                className="mt-1 size-4 rounded border-input accent-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">Quiet hours</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  Hold back device pushes overnight. Notifications still appear
                  in CertaNest — only the lock-screen nudge waits until quiet hours
                  end.
                </span>
              </span>
            </label>

            {quietEnabled && (
              <div className="flex flex-wrap items-center gap-3 pl-7">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">From</span>
                  <select
                    value={quietStart}
                    onChange={(event) =>
                      saveQuietHours({ start: Number(event.target.value) })
                    }
                    disabled={quietSaving}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {formatHour(h)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">to</span>
                  <select
                    value={quietEnd}
                    onChange={(event) =>
                      saveQuietHours({ end: Number(event.target.value) })
                    }
                    disabled={quietSaving}
                    className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                  >
                    {HOURS.map((h) => (
                      <option key={h} value={h}>
                        {formatHour(h)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-xs text-muted-foreground">
                  in your notification timezone
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}
