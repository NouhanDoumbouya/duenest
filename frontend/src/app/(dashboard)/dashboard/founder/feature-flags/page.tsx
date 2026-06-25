"use client";

// Founder support console — feature flags. Lists every flag and lets a founder
// change its visibility (enabled / beta-only / founder-only / disabled).
// Founder/staff only. Disabling a flag asks for confirmation (it gates features).

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { FounderPageHeader } from "@/components/founder/founder-ui";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { ApiError } from "@/lib/api";
import { getFounderFeatureFlags, updateFounderFeatureFlag } from "@/lib/founder";
import type { FeatureFlag, FeatureFlagVisibility } from "@/types/founder";

const VISIBILITIES: FeatureFlagVisibility[] = [
  "enabled",
  "beta_only",
  "founder_only",
  "disabled",
];

const VISIBILITY_TONE: Record<FeatureFlagVisibility, string> = {
  enabled: "bg-brand-success/15 text-brand-success",
  beta_only: "bg-primary/10 text-primary",
  founder_only: "bg-muted text-muted-foreground",
  disabled: "bg-destructive/10 text-destructive",
};

export default function FounderFeatureFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getFounderFeatureFlags()
      .then((data) => active && (setFlags(data), setError(null)))
      .catch(
        (err) =>
          active &&
          setError(err instanceof ApiError ? err.message : "Could not load flags."),
      );
    return () => {
      active = false;
    };
  }, []);

  async function setVisibility(flag: FeatureFlag, visibility: FeatureFlagVisibility) {
    if (
      visibility === "disabled" &&
      !window.confirm(`Disable "${flag.name}"? This turns the feature off for everyone.`)
    ) {
      return;
    }
    setBusyKey(flag.key);
    try {
      const updated = await updateFounderFeatureFlag(flag.key, { visibility });
      setFlags((prev) =>
        prev ? prev.map((f) => (f.key === flag.key ? updated : f)) : prev,
      );
    } finally {
      setBusyKey(null);
    }
  }

  const filtered = useMemo(() => {
    if (!flags) return [];
    const q = search.trim().toLowerCase();
    return q
      ? flags.filter(
          (f) =>
            f.key.toLowerCase().includes(q) || f.name.toLowerCase().includes(q),
        )
      : flags;
  }, [flags, search]);

  if (error) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="Feature flags" description="Control which features are live." />
        <ErrorState description={error} />
      </div>
    );
  }

  if (!flags) {
    return (
      <div className="space-y-6">
        <FounderPageHeader title="Feature flags" description="Control which features are live." />
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FounderPageHeader
        title="Feature flags"
        description="Each flag's rollout gate. Disabling a flag turns the feature off for everyone."
      />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search flags…"
        className="max-w-md"
      />

      <div className="space-y-2">
        {filtered.map((flag) => (
          <Card key={flag.key}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{flag.name}</span>
                  <Badge variant="secondary" className={VISIBILITY_TONE[flag.visibility]}>
                    {flag.visibility}
                  </Badge>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    {flag.key}
                  </code>
                </div>
                {flag.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {flag.description}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {busyKey === flag.key && <Loader2 className="size-4 animate-spin" />}
                <select
                  value={flag.visibility}
                  onChange={(e) =>
                    setVisibility(flag, e.target.value as FeatureFlagVisibility)
                  }
                  disabled={busyKey === flag.key}
                  className="h-9 rounded-lg border border-input bg-card px-2.5 text-sm"
                  aria-label={`Visibility for ${flag.name}`}
                >
                  {VISIBILITIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
