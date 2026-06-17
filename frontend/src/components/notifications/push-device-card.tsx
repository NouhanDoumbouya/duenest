"use client";

import { useEffect, useState } from "react";
import { BellRing, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/ui/section-card";
import { updateNotificationPreferences } from "@/lib/notifications";
import {
  getPushPublicKey,
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";
import { supportsPush } from "@/lib/pwa";

type Status = "loading" | "unsupported" | "unconfigured" | "ready";

const REASON_COPY: Record<string, string> = {
  denied:
    "Notifications are blocked for DueNest in this browser. Enable them in your browser settings, then try again.",
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

  return (
    <SectionCard
      title="Push notifications on this device"
      description="Get a gentle nudge on your device when something needs attention — even when DueNest isn't open."
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <ShieldCheck className="size-4" />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Lock-screen previews stay generic — they never show document names,
            who opened a share, or any private detail. The actual update is shown
            only after you open DueNest and sign in.
          </p>
        </div>

        {status === "loading" && (
          <p className="text-sm text-muted-foreground">Checking this device…</p>
        )}
        {status === "unsupported" && (
          <p className="text-sm text-muted-foreground">
            {REASON_COPY.unsupported} On iPhone or iPad, install DueNest to your
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
      </div>
    </SectionCard>
  );
}
