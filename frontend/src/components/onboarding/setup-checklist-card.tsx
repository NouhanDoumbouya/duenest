"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ListChecks,
  ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { markAttentionReviewed } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import type { DocumentSetupChecklist, SetupChecklistStep } from "@/types/onboarding";

function statusLabel(step: SetupChecklistStep) {
  if (step.completed) return "Done";
  if (step.status === "current") return "Next";
  if (step.status === "optional") return "Optional";
  return "Pending";
}

function StepIcon({ step }: { step: SetupChecklistStep }) {
  if (step.completed) {
    return <CheckCircle2 className="size-4 text-brand-success" />;
  }
  return <Circle className="size-4 text-muted-foreground/70" />;
}

async function handleStepClick(step: SetupChecklistStep) {
  if (step.key === "review_attention_needed") {
    try {
      await markAttentionReviewed();
    } catch {
      return;
    }
  }
}

export function SetupChecklistCard({
  checklist,
  compact = false,
}: {
  checklist: DocumentSetupChecklist;
  compact?: boolean;
}) {
  const nextStep = checklist.steps.find((step) => step.status === "current");
  const complete = checklist.is_complete;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-navy text-brand-teal">
              {complete ? (
                <ShieldCheck className="size-4" />
              ) : (
                <ListChecks className="size-4" />
              )}
            </span>
            <CardTitle className="text-lg">Document setup</CardTitle>
          </div>
          <CardDescription className="mt-2">
            {complete
              ? "The required setup steps are complete."
              : nextStep
                ? `Next: ${nextStep.title}`
                : "Finish the remaining optional trust and sharing checks."}
          </CardDescription>
        </div>
        <div className="min-w-36">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Required</span>
            <span>{checklist.required_percent}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand-teal"
              style={{ width: `${checklist.required_percent}%` }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn(
            "grid gap-2",
            compact ? "md:grid-cols-2" : "lg:grid-cols-2",
          )}
        >
          {checklist.steps.map((step) => (
            <Link
              key={step.key}
              href={step.href}
              onClick={() => void handleStepClick(step)}
              className={cn(
                "flex min-h-[76px] items-start gap-3 rounded-lg border border-border bg-card px-3 py-3 transition-colors hover:bg-muted/40",
                step.status === "current" && "border-primary/40 bg-primary/5",
              )}
            >
              <span className="mt-0.5 shrink-0">
                <StepIcon step={step} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{step.title}</span>
                  <Badge
                    variant={step.completed ? "secondary" : "outline"}
                    className="shrink-0"
                  >
                    {statusLabel(step)}
                  </Badge>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {step.description}
                </span>
              </span>
            </Link>
          ))}
        </div>

        {!compact && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {checklist.required_completed_steps} of {checklist.required_steps} required
              steps complete.
            </p>
            <Link
              href="/dashboard/onboarding"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Continue setup
              <ArrowRight className="size-4" />
            </Link>
          </div>
        )}

        {compact && !complete && nextStep && (
          <Link href={nextStep.href} className={cn(buttonVariants())}>
            Continue
            <ArrowRight className="size-4" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
