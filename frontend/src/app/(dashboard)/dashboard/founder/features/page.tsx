"use client";

import { useEffect, useState } from "react";
import { Activity, TrendingDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getFeatureAdoption } from "@/lib/founder";
import type { FeatureAdoption } from "@/types/founder";

const nf = new Intl.NumberFormat();

export default function FounderFeaturesPage() {
  const [data, setData] = useState<FeatureAdoption | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFeatureAdoption()
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load feature adoption.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (!data) {
    return <Card className="h-[360px] animate-pulse" />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-2xl font-semibold">
          Feature adoption
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Usage by major document feature, including users reached, event
          volume, and recent activity windows.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="size-5 text-primary" />
            Adoption table
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4 font-medium">Feature</th>
                <th className="py-2 pr-4 font-medium">Users</th>
                <th className="py-2 pr-4 font-medium">Adoption</th>
                <th className="py-2 pr-4 font-medium">Events</th>
                <th className="py-2 pr-4 font-medium">Last 7d</th>
                <th className="py-2 pr-4 font-medium">Last 30d</th>
                <th className="py-2 font-medium">Signal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.features.map((feature) => {
                const low = feature.adoption_percent < 20;
                return (
                  <tr key={feature.feature_key}>
                    <td className="py-3 pr-4 font-medium">{feature.label}</td>
                    <td className="py-3 pr-4">
                      {nf.format(feature.users_count)}
                    </td>
                    <td className="py-3 pr-4">
                      {feature.adoption_percent}%
                    </td>
                    <td className="py-3 pr-4">
                      {nf.format(feature.total_events_count)}
                    </td>
                    <td className="py-3 pr-4">
                      {nf.format(feature.last_7d_count)}
                    </td>
                    <td className="py-3 pr-4">
                      {nf.format(feature.last_30d_count)}
                    </td>
                    <td className="py-3">
                      {low ? (
                        <Badge variant="outline" className="gap-1 text-amber-700">
                          <TrendingDown className="size-3" />
                          Needs UX attention
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Healthy</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
