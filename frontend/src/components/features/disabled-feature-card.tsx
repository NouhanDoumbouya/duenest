import Link from "next/link";
import { PauseCircle } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Reason = "disabled" | "beta_only" | "founder_only";

const COPY: Record<Reason, { title: string; body: string }> = {
  disabled: {
    title: "Feature temporarily unavailable",
    body: "This feature is currently paused while we improve it for beta users.",
  },
  beta_only: {
    title: "Available to selected beta users",
    body: "This feature is currently available to selected beta users.",
  },
  founder_only: {
    title: "Restricted to founder testing",
    body: "This feature is currently restricted to founder testing.",
  },
};

/**
 * A calm, friendly state shown when a user reaches a paused feature. The backend
 * still enforces availability; this just avoids a broken/blank page.
 */
export function DisabledFeatureCard({
  reason = "disabled",
  message,
}: {
  reason?: Reason;
  message?: string;
}) {
  const copy = COPY[reason];
  return (
    <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-border bg-card p-8 text-center shadow-card">
      <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <PauseCircle className="size-6" />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{copy.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {message || copy.body}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link href="/dashboard" className={cn(buttonVariants())}>
          Back to dashboard
        </Link>
        <Link
          href="/dashboard/feedback"
          className={cn(buttonVariants({ variant: "outline" }))}
        >
          Send feedback
        </Link>
      </div>
    </div>
  );
}
