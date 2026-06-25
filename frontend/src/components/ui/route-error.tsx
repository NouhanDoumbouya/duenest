"use client";

// Shared, calm fallback for App Router error boundaries. Shows a reassuring
// message, a retry, and — when available — a SAFE reference id (Next's error
// `digest` or our `X-Request-ID`) so a user can quote it to support and a
// founder can find the matching server-side operational events/logs. It never
// renders a raw stack trace, internal path, token, or URL.

import Link from "next/link";
import { RefreshCw, TriangleAlert } from "lucide-react";

export function RouteError({
  title = "Something went wrong",
  description = "We hit an unexpected error. Please try again — your documents are safe.",
  reference,
  onRetry,
  homeHref = "/dashboard",
  homeLabel = "Go to dashboard",
}: {
  title?: string;
  description?: string;
  /** A safe reference id (Next error digest or correlation id). Optional. */
  reference?: string;
  onRetry?: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div
      role="alert"
      className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-6 py-16 text-center"
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <TriangleAlert className="size-7" aria-hidden />
      </span>
      <h1 className="mt-5 text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {reference ? (
        <p className="mt-4 text-xs text-muted-foreground">
          If this keeps happening, contact support with reference{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
            {reference}
          </code>
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </button>
        ) : null}
        <Link
          href={homeHref}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-5 text-sm font-medium transition hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
