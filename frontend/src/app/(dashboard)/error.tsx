"use client";

// Route-level error boundary for the whole authenticated dashboard. Catches
// render/runtime errors in any /dashboard page and shows a calm fallback with a
// safe reference (Next's error `digest`) and a retry, instead of a blank screen.

import { useEffect } from "react";

import { RouteError } from "@/components/ui/route-error";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Safe dev-only diagnostic; never logs tokens, URLs, or document content.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[dashboard] route error:", error.message);
    }
  }, [error]);

  return (
    <RouteError
      reference={error.digest}
      onRetry={reset}
      description="We hit an unexpected error loading this page. Your documents are safe — please try again."
    />
  );
}
