"use client";

import { WifiOff } from "lucide-react";

/**
 * Subtle top banner shown while the device is offline. Carries no private data —
 * just a calm connectivity notice. Network-only actions (upload, share, billing)
 * surface their own errors when attempted offline.
 */
export function OfflineBanner({ online }: { online: boolean }) {
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-center text-xs font-medium text-amber-950 shadow-sm"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <WifiOff className="size-3.5" aria-hidden />
      You are offline. Your vault stays private — reconnect to access it.
    </div>
  );
}
