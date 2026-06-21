import type { ComponentType } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Calm, recoverable error state. Mirrors {@link EmptyState} but uses a
 * destructive-toned icon and offers a retry so a failed load is never a dead
 * end (see docs/design/interaction-principles.md). `role="alert"` announces it
 * to assistive tech. Hookless, so it stays server-component compatible.
 */
export function ErrorState({
  icon: Icon = TriangleAlert,
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  title?: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-4 px-6 py-14 text-center",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <Icon className="size-6" />
      </span>
      <div>
        <p className="font-heading text-base font-semibold">{title}</p>
        <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <RotateCcw className="size-4" aria-hidden />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
