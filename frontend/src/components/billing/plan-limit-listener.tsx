"use client";

import { useEffect, useState } from "react";

import { UpgradeModal } from "@/components/billing/upgrade-modal";

/**
 * Listens for the global `duenest:plan-limit` event (dispatched by apiFetch when
 * the backend returns a `plan_limit_exceeded` 403) and shows the upgrade modal.
 * Mounted once in the dashboard layout so every create flow gets the paywall
 * for free, without individual wiring.
 */
export function PlanLimitListener() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();

  useEffect(() => {
    function onLimit(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { detail?: string; resource?: string }
        | undefined;
      const label = detail?.resource?.replace(/_/g, " ");
      setReason(
        detail?.detail ||
          (label
            ? `You've reached your plan limit for ${label}. Upgrade to Pro to add more.`
            : undefined),
      );
      setOpen(true);
    }
    window.addEventListener("duenest:plan-limit", onLimit);
    return () => window.removeEventListener("duenest:plan-limit", onLimit);
  }, []);

  return <UpgradeModal open={open} onClose={() => setOpen(false)} reason={reason} />;
}
