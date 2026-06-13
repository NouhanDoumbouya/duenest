import { cn } from "@/lib/utils";
import type { DocumentUrgencyLevel } from "@/types/documents";

const STYLES: Record<DocumentUrgencyLevel, { wrap: string; label: string } | null> = {
  none: null,
  low: {
    wrap: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
    label: "Low",
  },
  medium: {
    wrap: "bg-brand-amber/15 text-brand-amber ring-1 ring-inset ring-brand-amber/25",
    label: "Soon",
  },
  high: {
    wrap: "bg-brand-amber/15 text-brand-amber ring-1 ring-inset ring-brand-amber/25",
    label: "Act now",
  },
  critical: {
    wrap: "bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20",
    label: "Urgent",
  },
};

/** Compact urgency pill; renders nothing for the calm "none" level. */
export function UrgencyBadge({
  level,
  className,
}: {
  level: DocumentUrgencyLevel;
  className?: string;
}) {
  const style = STYLES[level];
  if (!style) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide",
        style.wrap,
        className,
      )}
    >
      {style.label}
    </span>
  );
}
