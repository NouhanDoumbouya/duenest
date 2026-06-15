"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";

import { FounderPageHeader } from "@/components/founder/founder-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import {
  getFounderFeatureFlags,
  updateFounderFeatureFlag,
} from "@/lib/founder";
import { cn } from "@/lib/utils";
import type { FeatureFlag, FeatureFlagVisibility } from "@/types/founder";

const VISIBILITY_OPTIONS: {
  value: FeatureFlagVisibility;
  label: string;
}[] = [
  { value: "enabled", label: "Enabled (everyone)" },
  { value: "beta_only", label: "Beta users only" },
  { value: "founder_only", label: "Founder/admin only" },
  { value: "disabled", label: "Disabled (off)" },
];

const VISIBILITY_LABEL: Record<FeatureFlagVisibility, string> =
  Object.fromEntries(
    VISIBILITY_OPTIONS.map((o) => [o.value, o.label]),
  ) as Record<FeatureFlagVisibility, string>;

function visibilityBadgeVariant(
  visibility: FeatureFlagVisibility,
): "default" | "secondary" | "destructive" | "outline" {
  if (visibility === "enabled") return "default";
  if (visibility === "disabled") return "destructive";
  return "secondary"; // beta_only / founder_only
}

function FlagRow({ flag }: { flag: FeatureFlag }) {
  const [visibility, setVisibility] = useState<FeatureFlagVisibility>(
    flag.visibility,
  );
  const [message, setMessage] = useState(flag.maintenance_message);
  const [saved, setSaved] = useState<FeatureFlag>(flag);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const dirty =
    visibility !== saved.visibility || message !== saved.maintenance_message;

  async function handleSave() {
    setSaving(true);
    setError(null);
    setJustSaved(false);
    try {
      const updated = await updateFounderFeatureFlag(flag.key, {
        visibility,
        maintenance_message: message,
      });
      setSaved(updated);
      setVisibility(updated.visibility);
      setMessage(updated.maintenance_message);
      setJustSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not save. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setVisibility(saved.visibility);
    setMessage(saved.maintenance_message);
    setError(null);
    setJustSaved(false);
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{flag.name || flag.key}</p>
              <Badge variant={visibilityBadgeVariant(saved.visibility)}>
                {VISIBILITY_LABEL[saved.visibility]}
              </Badge>
            </div>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {flag.key}
            </p>
            {flag.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {flag.description}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,220px)_1fr]">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Visibility
            </span>
            <select
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as FeatureFlagVisibility)
              }
              disabled={saving}
            >
              {VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">
              Maintenance message (shown to users who can&apos;t use the feature)
            </span>
            <Input
              className="h-10"
              value={message}
              maxLength={255}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Optional — e.g. Temporarily paused while we investigate an issue."
              disabled={saving}
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={handleSave} disabled={!dirty || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
          {dirty && !saving && (
            <Button type="button" variant="ghost" onClick={handleReset}>
              Reset
            </Button>
          )}
          {error && <span className="text-sm text-destructive">{error}</span>}
          {justSaved && !dirty && !error && (
            <span className="text-sm text-brand-success">Saved.</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FounderFeatureControlsPage() {
  const [flags, setFlags] = useState<FeatureFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    getFounderFeatureFlags()
      .then((result) => {
        if (active) {
          setFlags(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Could not load feature flags.",
          );
          setFlags((current) => current ?? []);
        }
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [reloadKey]);

  function handleRefresh() {
    setRefreshing(true);
    setReloadKey((value) => value + 1);
  }

  const loading = flags === null;

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Founder Ops"
        title="Feature Control Center"
        description="Runtime kill switches for each feature. Changes are enforced on the backend and recorded in the founder audit log."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={handleRefresh}
            disabled={loading || refreshing}
          >
            <RefreshCw
              className={cn("size-4", (loading || refreshing) && "animate-spin")}
            />
            Refresh
          </Button>
        }
      />

      <Card className="border-brand-navy/20 bg-brand-navy/5">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-brand-navy" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">How visibility works</p>
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Enabled</span> — on
              for everyone.{" "}
              <span className="font-medium text-foreground">Beta users only</span>{" "}
              and{" "}
              <span className="font-medium text-foreground">Founder/admin only</span>{" "}
              limit access while a feature stabilizes.{" "}
              <span className="font-medium text-foreground">Disabled</span> turns
              it off product-wide. Disabled features return a 503 server-side, not
              just a hidden button.
            </p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-44 w-full rounded-xl" />
          ))}
        </div>
      ) : error && flags.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="Couldn't load feature flags"
          description={error}
          action={
            <Button type="button" variant="outline" onClick={handleRefresh}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
          }
        />
      ) : flags.length === 0 ? (
        <EmptyState
          icon={ShieldAlert}
          title="No feature flags yet"
          description="Flags are created automatically from the feature registry. Refresh to seed them."
        />
      ) : (
        <div className="space-y-4">
          {flags.map((flag) => (
            <FlagRow key={flag.key} flag={flag} />
          ))}
        </div>
      )}
    </div>
  );
}
