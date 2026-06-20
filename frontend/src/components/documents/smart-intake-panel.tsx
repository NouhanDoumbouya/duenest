"use client";

import { useState } from "react";
import Link from "next/link";
import {
  FilePlus2,
  Loader2,
  PenLine,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useFeature } from "@/components/features/feature-flags-provider";
import { ApiError } from "@/lib/api";
import {
  getFileIntake,
  type IntakeResult,
  type IntakeSuggestion,
} from "@/lib/ai";

/**
 * Smart Intake — a self-contained, feature-gated affordance for a single file.
 *
 * Renders nothing unless the `ai_intake` flag is on, so dropping it into a file
 * row is invisible until a founder enables the feature (the backend stays the
 * real gate). On request it fetches an AI summary + suggested fields + confirm-
 * gated next actions and renders them as buttons into existing flows. It performs
 * no writes itself.
 */
export function SmartIntakePanel({ fileId }: { fileId: number }) {
  const enabled = useFeature("ai_intake");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<IntakeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;

  async function analyze() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      setResult(await getFileIntake(fileId));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't analyze this file. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  const fields = result?.suggested_fields;
  const fieldChips = fields
    ? ([
        fields.document_type,
        fields.expiry_date ? `expires ${fields.expiry_date}` : null,
        fields.reference_number,
      ].filter(Boolean) as string[])
    : [];

  return (
    <div className="mt-2 border-t border-border pt-2">
      {!result && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={analyze}
          disabled={loading}
          className="text-primary"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          <span>Smart suggestions</span>
        </Button>
      )}

      {error && (
        <p className="flex items-start gap-2 px-2 py-1 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      {result && result.available && (
        <div className="space-y-2 px-2 py-1">
          {result.summary && <p className="text-sm">{result.summary}</p>}
          {fieldChips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {fieldChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
          {result.suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {result.suggestions.map((s, i) => (
                <SuggestionButton key={i} suggestion={s} />
              ))}
            </div>
          )}
        </div>
      )}

      {result && !result.available && (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          {result.reason === "not_configured"
            ? "The assistant isn't set up yet."
            : "No suggestions for this file right now."}
        </p>
      )}
    </div>
  );
}

function SuggestionButton({ suggestion }: { suggestion: IntakeSuggestion }) {
  const cls = buttonVariants({ variant: "outline", size: "sm" });
  if (suggestion.type === "draft") {
    const href = suggestion.goal
      ? `/dashboard/draft?goal=${encodeURIComponent(suggestion.goal)}`
      : "/dashboard/draft";
    return (
      <Link href={href} className={cls}>
        <PenLine /> {suggestion.label}
      </Link>
    );
  }
  if (suggestion.type === "add_to_pack") {
    return (
      <Link href="/dashboard/pack-copilot" className={cls}>
        <Target /> {suggestion.label}
      </Link>
    );
  }
  if (suggestion.type === "create_document") {
    return (
      <Link href="/dashboard/documents/new" className={cls}>
        <FilePlus2 /> {suggestion.label}
      </Link>
    );
  }
  // set_reminder has no standalone target from here — show it as guidance.
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-[0.8rem] text-muted-foreground">
      {suggestion.label}
    </span>
  );
}
