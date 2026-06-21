"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Settings2, Sparkles } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import {
  getAiPreferences,
  updateAiPreferences,
  type AiPreferences,
} from "@/lib/ai";

/**
 * The AI "magic moment" front door. Self-contained: fetches the user's AI
 * preferences and renders the right activation state — nothing once AI is on.
 *
 *   * AI not set up on the workspace -> a calm "being set up" note.
 *   * Available but not opted in     -> the consent CTA (turn on inline).
 *   * Enabled                        -> renders null (host page proceeds).
 *
 * ``onActivated`` fires after the user turns AI on, so the host can refresh.
 */
export function AiActivationCard({
  onActivated,
}: {
  onActivated?: () => void;
}) {
  const [prefs, setPrefs] = useState<AiPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getAiPreferences()
      .then((p) => {
        if (active) setPrefs(p);
      })
      .catch(() => {
        /* non-fatal: the host page still works */
      })
      .then(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    setEnabling(true);
    setError(null);
    try {
      const updated = await updateAiPreferences({ ai_enabled: true });
      setPrefs(updated);
      onActivated?.();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't turn on AI. Try again.",
      );
    } finally {
      setEnabling(false);
    }
  }

  // Invisible while loading, and once AI is enabled.
  if (loading || !prefs || prefs.ai_enabled) return null;

  if (prefs.ai_available === false) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <span>
            AI features aren&apos;t switched on for this workspace yet. An admin
            needs to enable them before you can turn them on here.
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </span>
          <div>
            <p className="font-medium">Turn on your AI assistant</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Let DueNest read your own documents to answer questions, draft
              letters, build application packs, and tell you what needs attention.
              It&apos;s powered by Claude, your documents aren&apos;t used to train
              AI, and you can turn it off any time.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={enable} disabled={enabling}>
            {enabling ? (
              <>
                <Loader2 className="animate-spin" /> Turning on…
              </>
            ) : (
              <>
                <Sparkles /> Turn on AI
              </>
            )}
          </Button>
          <Link
            href="/dashboard/settings/ai"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <Settings2 /> Privacy details
          </Link>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
