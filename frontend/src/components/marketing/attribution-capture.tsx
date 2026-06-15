"use client";

import { useEffect } from "react";

import { captureUtmToSession } from "@/lib/attribution";

/**
 * Renders nothing — captures first-touch UTM/referral params on landing so they
 * survive navigation to /register. Mounted on public entry pages.
 */
export function AttributionCapture() {
  useEffect(() => {
    captureUtmToSession();
  }, []);
  return null;
}
