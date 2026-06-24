"use client";

import { useEffect, useState } from "react";
import {
  Gauge,
  Loader2,
  Lock,
  PauseCircle,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { ApiError } from "@/lib/api";
import {
  getAiPreferences,
  updateAiPreferences,
  type AiCredits,
  type AiPreferences,
} from "@/lib/ai";
import { cn } from "@/lib/utils";

export default function AiSettingsPage() {
  const [prefs, setPrefs] = useState<AiPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAiPreferences()
      .then((p) => {
        if (active) setPrefs(p);
      })
      .catch(() => {
        if (active) setError("Couldn't load your AI settings.");
      })
      .then(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function update(patch: Partial<AiPreferences>, key: string) {
    setSaving(key);
    setError(null);
    try {
      setPrefs(await updateAiPreferences(patch));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save. Please try again.",
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Settings"
        title="AI settings"
        description="CertaNest's AI features are off until you turn them on — and you stay in control of what's shared."
      />

      {loading ? (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading…
          </CardContent>
        </Card>
      ) : prefs ? (
        <>
          {prefs.disclosure && (
            <Card>
              <CardContent className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="space-y-1">
                  <p className="text-sm leading-relaxed">{prefs.disclosure.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    Provider: {prefs.disclosure.provider} · Used to train AI
                    models: {prefs.disclosure.used_for_training ? "Yes" : "No"}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {prefs.ai_available === false && (
            <Card>
              <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                AI isn&apos;t fully set up on this account yet. You can still set
                your preference here — it takes effect once AI is available.
              </CardContent>
            </Card>
          )}

          <ToggleRow
            icon={Sparkles}
            title="Enable AI features"
            description="Let CertaNest use Claude to read your documents and power Ask, Draft, Briefing, Pack Copilot, and Smart Intake. When off, none of your document content is ever sent to the AI provider."
            checked={prefs.ai_enabled}
            saving={saving === "ai_enabled"}
            onChange={(v) => update({ ai_enabled: v }, "ai_enabled")}
          />

          <ToggleRow
            icon={Lock}
            title="Privacy Mode (mask sensitive details)"
            description="Before any AI request, mask emails and long ID / card / policy numbers in your document text. More private, but questions about those exact values won't work."
            checked={prefs.redact_sensitive}
            disabled={!prefs.ai_enabled}
            saving={saving === "redact_sensitive"}
            onChange={(v) => update({ redact_sensitive: v }, "redact_sensitive")}
          />

          {prefs.credits && (
            <CreditsCard credits={prefs.credits} />
          )}

          {prefs.usage && prefs.usage.daily_token_cap > 0 && (
            <UsageCard usage={prefs.usage} />
          )}

          {error && (
            <p className="flex items-start gap-2 px-1 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="flex items-start gap-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            {error ?? "Couldn't load your AI settings."}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}

function UsageCard({
  usage,
}: {
  usage: NonNullable<AiPreferences["usage"]>;
}) {
  const used = Math.max(0, usage.daily_tokens_used);
  const cap = Math.max(1, usage.daily_token_cap);
  const pct = Math.min(100, Math.round((used / cap) * 100));
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <Gauge className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Today&apos;s AI usage</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Today: {used.toLocaleString()} / {cap.toLocaleString()} used
            </p>
          </div>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Daily AI usage"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all",
              usage.paused ? "bg-brand-amber" : "bg-primary",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        {usage.paused && (
          <p className="flex items-start gap-2 text-sm text-brand-amber">
            <PauseCircle className="mt-0.5 size-4 shrink-0" />
            AI is paused for today to protect usage limits. It resumes
            automatically.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CreditsCard({ credits }: { credits: AiCredits }) {
  const used = Math.max(0, credits.used);
  const limit = credits.limit;
  const remaining = credits.remaining;
  const pct =
    limit != null && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const limitLabel = limit != null ? limit.toLocaleString() : "Unlimited";
  const remainingLabel =
    remaining != null ? remaining.toLocaleString() : "Unlimited";
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">AI credits</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {used.toLocaleString()} / {limitLabel} used this month
              {remaining != null && (
                <> &mdash; {remainingLabel} remaining</>
              )}
            </p>
          </div>
        </div>
        {limit != null && limit > 0 && (
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Monthly AI credits used"
          >
            <div
              className={cn(
                "h-full rounded-full transition-all",
                pct >= 90 ? "bg-brand-amber" : "bg-primary",
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  saving,
  onChange,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  saving?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">{title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={title}
          disabled={disabled || saving}
          onClick={() => onChange(!checked)}
          className={cn(
            "relative mt-1 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
            checked ? "bg-primary" : "bg-muted",
          )}
        >
          <span
            className={cn(
              "inline-block size-5 transform rounded-full bg-white shadow transition-transform",
              checked ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
      </CardContent>
    </Card>
  );
}
