"use client";

import { useEffect, useState } from "react";

/**
 * A small live countdown used inside the marketing mockups to make the product
 * feel alive (e.g. a share that's expiring). It renders a stable initial label
 * on the server and first client render to avoid hydration mismatch, then
 * starts ticking after mount. Informational, so it keeps ticking even under
 * reduced-motion (a clock isn't decorative movement).
 */
export function LiveCountdown({
  hoursFromNow = 18,
  className,
}: {
  hoursFromNow?: number;
  className?: string;
}) {
  // Stable first paint: whole hours, no seconds — matches on server + client.
  const initial = `${hoursFromNow}h 00m`;
  const [label, setLabel] = useState(initial);

  useEffect(() => {
    const target = Date.now() + hoursFromNow * 60 * 60 * 1000;
    const tick = () => {
      const ms = Math.max(0, target - Date.now());
      const totalSeconds = Math.floor(ms / 1000);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      setLabel(
        `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`,
      );
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [hoursFromNow]);

  return (
    <span className={className} suppressHydrationWarning aria-live="off">
      {label}
    </span>
  );
}
