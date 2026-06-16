"use client";

import { useEffect, useState } from "react";
import { BellOff, CheckCircle2, Smartphone, WifiOff } from "lucide-react";

import { getPwaCapabilities, type PwaCapabilities } from "@/lib/pwa";

/**
 * Subtle, reusable PWA status card for the settings/help area. Shows install /
 * standalone / offline state and a DISABLED notifications opt-in — push delivery
 * ships after the security + scale-ready (Redis/Celery/VAPID) foundations are
 * merged. It never requests notification permission here.
 */
export function PwaStatusCard() {
  const [caps, setCaps] = useState<PwaCapabilities | null>(null);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let active = true;
    const update = () => setOnline(navigator.onLine);
    // Defer the initial reads to a microtask so we never setState synchronously
    // inside the effect body (matches the app's effect conventions).
    Promise.resolve().then(() => {
      if (!active) return;
      setCaps(getPwaCapabilities());
      update();
    });
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      active = false;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!caps) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Smartphone className="size-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold">App &amp; device</h3>
      </div>

      <dl className="mt-4 space-y-2 text-sm">
        <Row
          label="Installed app"
          value={caps.standalone ? "Running as installed app" : "In browser"}
          good={caps.standalone}
        />
        <Row
          label="Connection"
          value={online ? "Online" : "Offline"}
          good={online}
          icon={online ? undefined : <WifiOff className="size-3.5" />}
        />
        <Row
          label="Installable"
          value={
            caps.serviceWorker ? "Supported on this device" : "Not supported here"
          }
          good={caps.serviceWorker}
        />
      </dl>

      {/* Disabled notifications opt-in — push arrives in a later sprint. */}
      <div className="mt-4 flex items-start gap-3 rounded-xl bg-muted/50 p-3">
        <BellOff className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">Push notifications</p>
          <p className="text-xs text-muted-foreground">
            Reminder and security alerts are coming after account setup. We&apos;ll
            ask for permission only when it&apos;s ready — never automatically.
          </p>
        </div>
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="ml-auto inline-flex h-8 shrink-0 cursor-not-allowed items-center rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground opacity-60"
        >
          Coming soon
        </button>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  good,
  icon,
}: {
  label: string;
  value: string;
  good: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`inline-flex items-center gap-1.5 font-medium ${
          good ? "text-emerald-600" : "text-muted-foreground"
        }`}
      >
        {icon ?? (good ? <CheckCircle2 className="size-3.5" aria-hidden /> : null)}
        {value}
      </dd>
    </div>
  );
}
