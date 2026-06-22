"use client";

import { useEffect, useState } from "react";
import { Loader2, Lock, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { ApiError } from "@/lib/api";
import {
  getAiPreferences,
  updateAiPreferences,
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
