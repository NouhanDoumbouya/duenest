"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, Plus } from "lucide-react";

import { ReadinessRing } from "@/components/bundles/readiness-ring";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

  useEffect(() => {
    let active = true;
    getBundles()
      .then((page) => active && setBundles(page.results))
      .catch((err) => {
        if (!active) return;
        setBundles([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load bundles.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Renewal workspace
          </p>
          <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Application &amp; renewal bundles
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
          New bundle
        </Link>
      </div>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {bundles === null ? (
        <div
          className="grid gap-3 sm:grid-cols-2"
          aria-busy="true"
          aria-label="Loading bundles"
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
          <p className="mt-3 text-sm font-medium">No bundles yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Create your first bundle to start preparing a renewal or application
            pack with a clear readiness score.
          </p>
          <Link
            href="/dashboard/bundles/new"
            className={cn(buttonVariants(), "mt-4")}
          >
            <Plus className="size-4" />
            New bundle
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
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-700">
                      {bundle.missing_required_count} missing
                    </span>
                  ) : (
                    <span className="rounded-full bg-brand-success/10 px-2 py-0.5 font-medium text-brand-success">
                      Ready
                    </span>
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
