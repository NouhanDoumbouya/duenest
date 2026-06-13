"use client";

import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";

import {
  FounderPageHeader,
  FounderStatCard,
  RangePicker,
} from "@/components/founder/founder-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getCountryActivity } from "@/lib/founder";
import type { CountryActivityResponse, FounderRange } from "@/types/founder";

const nf = new Intl.NumberFormat();

export default function FounderMapPage() {
  const [range, setRange] = useState<FounderRange>("30d");
  const [data, setData] = useState<CountryActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getCountryActivity({ range })
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
            : "Unable to load country activity.",
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
    return <Card className="h-[420px] animate-pulse" />;
  }

  const totalEvents = data.countries.reduce(
    (total, country) => total + country.total_events,
    0,
  );

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Global activity"
        title="Country Activity"
        description={data.privacy_note}
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <FounderStatCard
          icon={Globe2}
          label="Countries"
          value={data.countries.length}
          hint="With aggregate activity"
        />
        <FounderStatCard
          icon={Globe2}
          label="Product events"
          value={totalEvents}
          hint="Country-tagged only"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Country activity table</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.countries.length === 0 ? (
            <p className="py-10 text-sm text-muted-foreground">
              No country metadata has been captured yet.
            </p>
          ) : (
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4 font-medium">Country</th>
                  <th className="py-2 pr-4 font-medium">Active users</th>
                  <th className="py-2 pr-4 font-medium">New signups</th>
                  <th className="py-2 pr-4 font-medium">Documents</th>
                  <th className="py-2 pr-4 font-medium">Share access</th>
                  <th className="py-2 pr-4 font-medium">Security events</th>
                  <th className="py-2 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.countries.map((country) => (
                  <tr key={country.country}>
                    <td className="py-3 pr-4 font-medium">{country.country}</td>
                    <td className="py-3 pr-4">{nf.format(country.active_users)}</td>
                    <td className="py-3 pr-4">{nf.format(country.new_signups)}</td>
                    <td className="py-3 pr-4">
                      {nf.format(country.documents_created)}
                    </td>
                    <td className="py-3 pr-4">{nf.format(country.share_access)}</td>
                    <td className="py-3 pr-4">
                      {nf.format(country.security_events)}
                    </td>
                    <td className="py-3">
                      {country.last_seen_at
                        ? new Date(country.last_seen_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
