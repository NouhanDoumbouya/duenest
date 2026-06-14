"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Globe2, MapPin, ShieldCheck, Users } from "lucide-react";

import {
  FounderPageHeader,
  FounderStatCard,
  RangePicker,
} from "@/components/founder/founder-ui";
import { FounderInsightPanel } from "@/components/founder/insight-panel";
import {
  WorldChoropleth,
  WORLD_MAP_AVAILABLE,
  type ChoroplethDatum,
} from "@/components/founder/world-choropleth";
import { canonicalCountryName } from "@/components/founder/country-iso";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { getCountryActivity } from "@/lib/founder";
import { cn } from "@/lib/utils";
import type {
  CountryActivityItem,
  CountryActivityResponse,
  FounderRange,
} from "@/types/founder";

const nf = new Intl.NumberFormat();

function lastSeen(value: string | null): string {
  return value ? new Date(value).toLocaleDateString() : "—";
}

export default function FounderMapPage() {
  const [range, setRange] = useState<FounderRange>("30d");
  const [data, setData] = useState<CountryActivityResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

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

  // Map canonical country name -> aggregate datum for the choropleth + lookups.
  const { choroData, byCanonical } = useMemo(() => {
    const choro = new Map<string, ChoroplethDatum>();
    const lookup = new Map<string, CountryActivityItem>();
    for (const c of data?.countries ?? []) {
      const canonical = canonicalCountryName(c.country);
      if (!canonical) continue;
      lookup.set(canonical, c);
      choro.set(canonical, {
        value: c.total_events + c.active_users,
        label: c.country,
        detail: [
          { label: "Active users", value: nf.format(c.active_users) },
          { label: "New signups", value: nf.format(c.new_signups) },
          { label: "Documents", value: nf.format(c.documents_created) },
          { label: "Share access", value: nf.format(c.share_access) },
          { label: "Security events", value: nf.format(c.security_events) },
        ],
      });
    }
    return { choroData: choro, byCanonical: lookup };
  }, [data]);

  const totals = useMemo(() => {
    const list = data?.countries ?? [];
    const events = list.reduce((sum, c) => sum + c.total_events, 0);
    const activeUsers = list.reduce((sum, c) => sum + c.active_users, 0);
    const top = [...list].sort((a, b) => b.total_events - a.total_events)[0];
    return { count: list.length, events, activeUsers, top };
  }, [data]);

  const insights = useMemo(() => {
    const list = data?.countries ?? [];
    if (list.length === 0) {
      return [
        {
          tone: "neutral" as const,
          text: "No country activity has been captured yet.",
        },
        {
          tone: "neutral" as const,
          text: "Once product events, waitlist entries, or beta activity carry privacy-safe country metadata, the map will shade those countries automatically.",
        },
      ];
    }
    const items: { tone: "neutral" | "good" | "warn"; text: string }[] = [];
    if (totals.top) {
      items.push({
        tone: "good",
        text: `${totals.top.country} has the strongest activity in this range (${nf.format(totals.top.total_events)} events).`,
      });
    }
    const withSignups = list.filter((c) => c.new_signups > 0).length;
    if (withSignups > 0) {
      items.push({
        tone: "neutral",
        text: `New signups came from ${withSignups} ${withSignups === 1 ? "country" : "countries"} — candidates for the next beta cohort.`,
      });
    }
    const security = list.filter((c) => c.security_events > 0);
    if (security.length > 0) {
      items.push({
        tone: "warn",
        text: `${security.length} ${security.length === 1 ? "country has" : "countries have"} logged security events — cross-check the Security page.`,
      });
    }
    items.push({
      tone: "neutral",
      text: "Country-based feature controls are not configured yet. This view is the foundation for future rollout and policy decisions.",
    });
    return items;
  }, [data, totals]);

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
        <Card className="h-[120px] animate-pulse" />
        <Card className="h-[420px] animate-pulse" />
      </div>
    );
  }

  const isEmpty = data.countries.length === 0;
  const selectedItem = selected ? byCanonical.get(selected) : null;

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Global activity"
        title="Global Map"
        description="Where privacy-safe interest and usage are coming from — at the country level only."
        actions={<RangePicker value={range} onChange={setRange} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FounderStatCard
          icon={Globe2}
          label="Countries with activity"
          value={totals.count}
          hint="Aggregate, country-level only"
        />
        <FounderStatCard
          icon={Activity}
          label="Product events"
          value={totals.events}
          hint="Country-tagged events in range"
        />
        <FounderStatCard
          icon={Users}
          label="Active users"
          value={totals.activeUsers}
          hint="Across all countries in range"
        />
        <FounderStatCard
          icon={MapPin}
          label="Top country"
          value={totals.top ? totals.top.country : "—"}
          hint={
            totals.top ? `${nf.format(totals.top.total_events)} events` : "No data yet"
          }
        />
      </div>

      {/* The map is always rendered — even with zero data — per the founder
          requirement that this page visually includes a world map. */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-lg">World activity map</CardTitle>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5 text-brand-success" />
            Country level only
          </span>
        </CardHeader>
        <CardContent>
          {WORLD_MAP_AVAILABLE ? (
            <>
              <div className="rounded-xl border border-border bg-muted/20 p-2">
                <WorldChoropleth
                  data={choroData}
                  selected={selected}
                  onSelect={setSelected}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-sm bg-muted" />
                  No activity
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-3 rounded-sm"
                    style={{
                      background:
                        "color-mix(in srgb, var(--brand-teal) 45%, var(--card))",
                    }}
                  />
                  Some activity
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-3 rounded-sm"
                    style={{ background: "var(--brand-teal)" }}
                  />
                  High activity
                </span>
                {!isEmpty && (
                  <span className="ml-auto">
                    Tap or hover a shaded country for details.
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">
              The map could not be rendered in this environment. The country
              table below still shows all activity.
            </p>
          )}

          {selectedItem && (
            <div className="mt-4 rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">{selectedItem.country}</p>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <Stat label="Active users" value={nf.format(selectedItem.active_users)} />
                <Stat label="New signups" value={nf.format(selectedItem.new_signups)} />
                <Stat label="Documents" value={nf.format(selectedItem.documents_created)} />
                <Stat label="Share access" value={nf.format(selectedItem.share_access)} />
                <Stat label="Security events" value={nf.format(selectedItem.security_events)} />
                <Stat label="Last seen" value={lastSeen(selectedItem.last_seen_at)} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isEmpty && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Globe2 className="size-6" />
            </span>
            <div className="max-w-xl space-y-2">
              <h2 className="font-heading text-xl font-semibold">
                No country activity yet
              </h2>
              <p className="text-sm text-muted-foreground">
                Country-level activity will appear here once DueNest receives
                privacy-safe country metadata from product events, waitlist
                entries, or beta activity.
              </p>
            </div>
            <div className="grid w-full max-w-2xl gap-2 text-left sm:grid-cols-2">
              {[
                "Regional rollout planning",
                "Localization priorities",
                "Beta cohort demand",
                "Country policy controls",
                "Feature availability by country",
                "Regional launch strategy",
              ].map((useCase) => (
                <div
                  key={useCase}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground"
                >
                  {useCase}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Country activity</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {isEmpty ? (
              <p className="py-8 text-sm text-muted-foreground">
                No country metadata has been captured yet.
              </p>
            ) : (
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Country</th>
                    <th className="py-2 pr-4 font-medium">Active users</th>
                    <th className="py-2 pr-4 font-medium">New signups</th>
                    <th className="py-2 pr-4 font-medium">Documents</th>
                    <th className="py-2 pr-4 font-medium">Share access</th>
                    <th className="py-2 pr-4 font-medium">Security</th>
                    <th className="py-2 font-medium">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.countries.map((country) => {
                    const canonical = canonicalCountryName(country.country);
                    const isSel = canonical !== null && canonical === selected;
                    return (
                      <tr
                        key={country.country}
                        onClick={() =>
                          canonical && setSelected(isSel ? null : canonical)
                        }
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-muted/40",
                          isSel && "bg-primary/5",
                        )}
                      >
                        <td className="py-3 pr-4 font-medium">{country.country}</td>
                        <td className="py-3 pr-4 tabular-nums">
                          {nf.format(country.active_users)}
                        </td>
                        <td className="py-3 pr-4 tabular-nums">
                          {nf.format(country.new_signups)}
                        </td>
                        <td className="py-3 pr-4 tabular-nums">
                          {nf.format(country.documents_created)}
                        </td>
                        <td className="py-3 pr-4 tabular-nums">
                          {nf.format(country.share_access)}
                        </td>
                        <td className="py-3 pr-4 tabular-nums">
                          {nf.format(country.security_events)}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {lastSeen(country.last_seen_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <FounderInsightPanel insights={insights} />
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 py-4 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-success" />
          <p>
            {data.privacy_note} Country activity is aggregated from privacy-safe
            metadata. DueNest does not show GPS, street-level location, raw IP
            addresses, document contents, access codes, or share tokens here.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium tabular-nums">{value}</p>
    </div>
  );
}
