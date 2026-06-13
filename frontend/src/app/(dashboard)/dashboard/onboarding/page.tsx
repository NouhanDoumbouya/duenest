"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";

import { SetupChecklistCard } from "@/components/onboarding/setup-checklist-card";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import {
  clearDocumentDemoData,
  completeOnboarding,
  createDocumentDemoData,
  dismissOnboarding,
  getDocumentSetupChecklist,
  getOnboardingState,
} from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import type {
  DocumentSetupChecklist,
  OnboardingState,
} from "@/types/onboarding";

export default function OnboardingPage() {
  const [checklist, setChecklist] = useState<DocumentSetupChecklist | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([getDocumentSetupChecklist(), getOnboardingState()])
      .then(([setup, onboarding]) => {
        setChecklist(setup);
        setState(onboarding);
        setError(null);
      })
      .catch((err) => {
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load onboarding progress.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(action: string, fn: () => Promise<unknown>) {
    setBusy(action);
    setMessage(null);
    setError(null);
    try {
      await fn();
      load();
      if (action === "demo") setMessage("Demo data has been added to your vault.");
      if (action === "clear") setMessage("Demo data has been removed.");
      if (action === "complete") setMessage("Document setup has been marked complete.");
      if (action === "dismiss") setMessage("Setup has been dismissed from the dashboard.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The action could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Setup
          </p>
          <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
            Document onboarding
          </h1>
          <p className="mt-1.5 max-w-2xl text-muted-foreground">
            Build the first useful version of your vault: a document, a file, a
            date, a reminder, and a renewal checklist.
          </p>
        </div>
        <Link
          href="/dashboard/documents/new"
          className={cn(buttonVariants({ size: "lg" }))}
        >
          Add document
          <ArrowRight className="size-4" />
        </Link>
      </div>

      {message && (
        <p className="rounded-lg bg-brand-success/10 px-4 py-3 text-sm text-brand-success">
          {message}
        </p>
      )}
      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card className="h-[430px] animate-pulse" />
          <Card className="h-[430px] animate-pulse" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          {checklist && <SetupChecklistCard checklist={checklist} compact />}

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Sparkles className="size-4" />
                  </span>
                  <CardTitle>Demo data</CardTitle>
                </div>
                <CardDescription>
                  Add clearly labeled fake documents to preview the full module.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    void runAction("demo", () => createDocumentDemoData())
                  }
                  disabled={busy !== null}
                >
                  {busy === "demo" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Database className="size-4" />
                  )}
                  Create demo data
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    void runAction("clear", () => clearDocumentDemoData())
                  }
                  disabled={busy !== null}
                >
                  <X className="size-4" />
                  Clear demo data
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-brand-success/10 text-brand-success">
                    <CheckCircle2 className="size-4" />
                  </span>
                  <CardTitle>Status</CardTitle>
                </div>
                <CardDescription>
                  {state?.has_completed_document_onboarding
                    ? "Document setup is marked complete."
                    : "Keep the dashboard focused by completing or dismissing setup."}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    void runAction("complete", () => completeOnboarding())
                  }
                  disabled={busy !== null}
                >
                  <ShieldCheck className="size-4" />
                  Mark complete
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    void runAction("dismiss", () => dismissOnboarding())
                  }
                  disabled={busy !== null}
                >
                  Dismiss from dashboard
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
