"use client";

import { useEffect, useState } from "react";
import { Activity, Loader2 } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { SectionCard } from "@/components/ui/section-card";
import { ApiError } from "@/lib/api";
import { getBundleActivity } from "@/lib/renewal-workspace";
import type { DocumentActivityEvent } from "@/types/documents";

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Owner-only activity feed for a bundle (created, template applied, items
 * added/removed/updated, documents attached, status changed, exported). Reuses
 * the document activity-event shape. Gated by the caller via the
 * `application_pack_timeline` feature, so this is only mounted when available.
 */
export function BundleActivityTab({ bundleId }: { bundleId: number }) {
  const [events, setEvents] = useState<DocumentActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getBundleActivity(bundleId)
      .then((res) => active && setEvents(res.items))
      .catch((err) => {
        if (!active) return;
        setEvents([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load activity.",
        );
      });
    return () => {
      active = false;
    };
  }, [bundleId]);

  return (
    <SectionCard
      title="Pack activity"
      description="Everything that's happened with this pack. Private to you — file contents are never shown here."
    >
      {error && (
        <p
          className="mb-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {events === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading activity…</span>
        </div>
      ) : events.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No activity yet"
          description="As you add items, attach documents, change status, and export, the history will appear here."
        />
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-5">
          {events.map((event) => (
            <li key={event.id} className="relative">
              <span className="absolute -left-[1.4rem] top-1 size-2.5 rounded-full bg-primary/60 ring-4 ring-card" />
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">{event.title}</p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {relativeTime(event.timestamp)}
                </span>
              </div>
              {event.description && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {event.description}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
