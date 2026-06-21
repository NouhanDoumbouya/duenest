"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Package, Plus } from "lucide-react";

import { ReadinessRing } from "@/components/bundles/readiness-ring";
import { buttonVariants } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import {
  BUNDLE_STATUS_LABELS,
  BUNDLE_TYPE_LABELS,
  getBundles,
} from "@/lib/renewal-workspace";
import { cn } from "@/lib/utils";
import type { Bundle } from "@/types/renewal-workspace";

export default function BundlesPage() {
  const [bundles, setBundles] = useState<Bundle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getBundles()
      .then((page) => {
        setBundles(page.results);
        setError(null);
      })
      .catch((err) =>
        setError(
          err instanceof ApiError ? err.message : "Unable to load application packs.",
        ),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const retry = useCallback(() => {
    setError(null);
    setBundles(null);
    load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Renewal workspace
          </p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Application &amp; renewal packs
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Group the documents and requirements for a renewal, application, or
            trip — and see exactly what’s still missing.
          </p>
        </div>
        <Link
          href="/dashboard/bundles/new"
          className={cn(buttonVariants())}
        >
          <Plus className="size-4" />
          New pack
        </Link>
      </div>

      {error ? (
        <ErrorState description={error} onRetry={retry} />
      ) : bundles === null ? (
        <div
          className="grid gap-3 sm:grid-cols-2"
          aria-busy="true"
          aria-label="Loading application packs"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
            >
              <Skeleton className="size-12 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-4 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : bundles.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-12 text-center">
          <Package className="mx-auto size-7 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">No application packs yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Create your first pack to start preparing a renewal, application, or
            trip with a clear readiness score.
          </p>
          <Link
            href="/dashboard/bundles/new"
            className={cn(buttonVariants(), "mt-4")}
          >
            <Plus className="size-4" />
            New pack
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {bundles.map((bundle) => (
            <Link
              key={bundle.id}
              href={`/dashboard/bundles/${bundle.id}`}
              className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <ReadinessRing score={bundle.readiness_score} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{bundle.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {BUNDLE_TYPE_LABELS[bundle.bundle_type]} ·{" "}
                  {BUNDLE_STATUS_LABELS[bundle.status]}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {bundle.target_date && (
                    <span className="text-muted-foreground">
                      Target {formatDate(bundle.target_date)}
                    </span>
                  )}
                  {bundle.missing_required_count > 0 ? (
                    <StatusBadge tone="warning">
                      {bundle.missing_required_count} missing
                    </StatusBadge>
                  ) : (
                    <StatusBadge status="ready" />
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
