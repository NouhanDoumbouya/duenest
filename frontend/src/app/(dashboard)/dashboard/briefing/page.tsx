"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AiActivationCard } from "@/components/ai/ai-activation-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { ApiError } from "@/lib/api";
import { getBriefing, type BriefingItem, type BriefingResult } from "@/lib/ai";
import { cn } from "@/lib/utils";

const URGENCY_META: Record<
  BriefingItem["urgency"],
  { label: string; dot: string; badge: string; order: number }
> = {
  high: {
    label: "High",
    dot: "bg-destructive",
    badge: "text-destructive bg-destructive/10 border-destructive/20",
    order: 0,
  },
  medium: {
    label: "Medium",
    dot: "bg-amber-500",
    badge: "text-amber-700 bg-amber-500/10 border-amber-500/20",
    order: 1,
  },
  low: {
    label: "Low",
    dot: "bg-emerald-500",
    badge: "text-emerald-700 bg-emerald-500/10 border-emerald-500/20",
    order: 2,
  },
};

export default function BriefingPage() {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<BriefingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notEnabled, setNotEnabled] = useState(false);

  // `spinner` is only set from the Refresh button (an event handler); the mount
  // effect passes false so no state is set synchronously inside the effect.
  const load = useCallback(async (spinner: boolean) => {
    if (spinner) setLoading(true);
    try {
      const res = await getBriefing();
      setResult(res);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 503) {
        setNotEnabled(true);
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount. setState lives in the promise callbacks (not the synchronous
  // effect body), matching the app's fetch-on-mount pattern.
  useEffect(() => {
    let active = true;
    getBriefing()
      .then((res) => {
        if (active) {
          setResult(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 503) {
          setNotEnabled(true);
        } else {
          setError(
            err instanceof ApiError
              ? err.message
              : "Something went wrong. Please try again.",
          );
        }
      })
      .then(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (notEnabled) {
    return (
      <PageContainer width="narrow">
        <PageHeader
          eyebrow="Assistant"
          title="Your briefing"
          description="A calm summary of what's worth doing now."
        />
        <Card>
          <CardContent>
            <EmptyState
              icon={Sparkles}
              title="Not enabled yet"
              description="Your AI briefing isn't switched on for your account yet."
            />
          </CardContent>
        </Card>
      </PageContainer>
    );
  }

  const items = result?.items
    ? [...result.items].sort(
        (a, b) => URGENCY_META[a.urgency].order - URGENCY_META[b.urgency].order,
      )
    : [];

  return (
    <PageContainer width="narrow">
      <PageHeader
        eyebrow="Assistant"
        title="Your briefing"
        description="A calm, prioritized summary of what's worth doing now — drawn from your real document deadlines and gaps."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load(true)}
            disabled={loading}
          >
            <RefreshCw className={cn(loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      <AiActivationCard onActivated={() => void load(true)} />

      {loading && (
        <Card>
          <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Reviewing your documents…
          </CardContent>
        </Card>
      )}

      {error && !loading && (
        <Card>
          <CardContent className="flex items-start gap-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {result?.available && !loading && (
        <>
          {result.summary && (
            <Card>
              <CardContent className="flex items-start gap-3">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-sm leading-relaxed">{result.summary}</p>
              </CardContent>
            </Card>
          )}

          {items.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState
                  icon={CheckCircle2}
                  title="You're all caught up"
                  description="Nothing needs your attention right now. We'll surface things here as deadlines approach."
                />
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {items.map((item, i) => (
                <BriefingCard key={`${item.title}-${i}`} item={item} />
              ))}
            </div>
          )}

          <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            Deadlines and statuses are taken from your documents; the wording and
            priority are AI-assisted. Review before acting.
          </p>
        </>
      )}
    </PageContainer>
  );
}

function BriefingCard({ item }: { item: BriefingItem }) {
  const meta = URGENCY_META[item.urgency];
  return (
    <Card size="sm">
      <CardContent className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", meta.dot)} />
            <div className="min-w-0">
              <p className="font-medium">{item.title}</p>
              {item.detail && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {item.detail}
                </p>
              )}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
              meta.badge,
            )}
          >
            {meta.label}
          </span>
        </div>

        {item.document_id && (
          <div className="pl-[18px]">
            <Link
              href={`/dashboard/documents/${item.document_id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {item.action_label || "Open document"}
              <ChevronRight />
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
