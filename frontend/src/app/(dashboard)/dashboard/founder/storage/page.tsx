"use client";

// Founder support console — storage. Total usage + top users + upload failures.
// No storage keys, file URLs, document contents, or previews.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Database, FileWarning, Loader2 } from "lucide-react";

import { FounderPageHeader, FounderStatCard } from "@/components/founder/founder-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api";
import { getFounderStorage } from "@/lib/founder";
import { formatBytes } from "@/lib/plan";
import type { StorageOverview } from "@/types/founder";

export default function FounderStoragePage() {
  const [data, setData] = useState<StorageOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFounderStorage()
      .then((d) => active && (setData(d), setError(null)))
      .catch(
        (err) =>
          active && setError(err instanceof ApiError ? err.message : "Could not load."),
      );
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="Storage" description="Total usage and top users." />
        <ErrorState description={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="Storage" description="Total usage and top users." />
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FounderPageHeader
        title="Storage"
        description="Aggregate storage health. No file names, contents, or storage keys."
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <FounderStatCard
          label="Total storage"
          value={formatBytes(data.total_bytes)}
          hint="Across all users"
          icon={Database}
          tone="default"
        />
        <FounderStatCard
          label="Total files"
          value={data.total_files}
          hint="Non-trashed files"
          icon={Database}
          tone="default"
        />
        <FounderStatCard
          label="Upload failures (24h)"
          value={data.upload_failures_24h}
          hint="From operational events"
          icon={FileWarning}
          tone={data.upload_failures_24h ? "warn" : "good"}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top storage users</CardTitle>
        </CardHeader>
        <CardContent>
          {data.top_users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No storage in use yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.top_users.map((u) => (
                <li key={u.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/dashboard/founder/users/${u.id}`} className="truncate hover:underline">
                    {u.email}
                  </Link>
                  <span
                    className={
                      u.percent !== null && u.percent >= 90
                        ? "font-semibold text-brand-amber"
                        : "font-medium"
                    }
                  >
                    {formatBytes(u.used_bytes)}
                    {u.percent !== null ? ` (${u.percent}%)` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
