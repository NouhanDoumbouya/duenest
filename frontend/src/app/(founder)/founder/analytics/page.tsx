"use client";

import { useEffect, useState } from "react";

import {
  FounderBarList,
  FounderLineChart,
  FounderPageHeader,
  RangePicker,
} from "@/components/founder/founder-ui";
import { Card } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getFounderAnalytics } from "@/lib/founder";
import type { FounderAnalytics, FounderRange } from "@/types/founder";

export default function FounderAnalyticsPage() {
  const [range, setRange] = useState<FounderRange>("30d");
  const [data, setData] = useState<FounderAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFounderAnalytics({ range })
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Unable to load analytics.",
        );
      });
    return () => {
      active = false;
    };
  }, [range]);

  if (error) {
    return (
      <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <FounderPageHeader
          eyebrow="Product analytics"
          title="Analytics"
          description="Loading privacy-safe product trends."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="h-[280px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Product analytics"
        title="Analytics"
        description={data.privacy_note}
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <FounderLineChart
          title="User growth over time"
          data={data.series.user_growth}
        />
        <FounderLineChart
          title="Active users over time"
          data={data.series.active_users}
          color="var(--chart-2)"
        />
        <FounderLineChart
          title="Documents created over time"
          data={data.series.documents_created}
          color="var(--chart-3)"
        />
        <FounderLineChart
          title="Files uploaded over time"
          data={data.series.files_uploaded}
          color="var(--chart-4)"
        />
        <FounderLineChart
          title="Error/failure trend"
          data={data.series.errors}
          color="var(--destructive)"
        />
        <FounderLineChart
          title="Security events"
          data={data.series.security_events}
          color="var(--chart-5)"
        />
        <FounderBarList
          title="Attention Needed breakdown"
          items={data.attention_breakdown}
        />
        <FounderBarList
          title="Feedback categories"
          items={data.feedback_categories}
        />
        <FounderBarList
          title="Failure categories"
          description="Grouped by safe error type only."
          items={data.failure_breakdown}
        />
      </div>
    </div>
  );
}
