import { cn } from "@/lib/utils";
import { TONE_CLASS, type StatusTone } from "@/lib/status-badge";
import type { DocumentUrgencyLevel } from "@/types/documents";

// Urgency level -> canonical tone + label. Keeps the deliberately distinct
// compact uppercase shape, but pulls colours from the shared tone map so it
// stays on-brand and contrast-safe.
const LEVELS: Record<
  DocumentUrgencyLevel,
  { tone: StatusTone; label: string } | null
> = {
  none: null,
  low: { tone: "neutral", label: "Low" },
  medium: { tone: "warning", label: "Soon" },
  high: { tone: "warning", label: "Act now" },
  critical: { tone: "danger", label: "Urgent" },
};

/** Compact urgency pill; renders nothing for the calm "none" level. */
export function UrgencyBadge({
  level,
  className,
}: {
  level: DocumentUrgencyLevel;
  className?: string;
}) {
  const config = LEVELS[level];
  if (!config) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide",
        TONE_CLASS[config.tone].badge,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
