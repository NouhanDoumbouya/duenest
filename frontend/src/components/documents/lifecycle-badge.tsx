import { LIFECYCLE_STATUS_LABELS } from "@/lib/documents";
import { cn } from "@/lib/utils";
import { TONE_CLASS, type StatusTone } from "@/lib/status-badge";
import type { DocumentLifecycleStatus } from "@/types/documents";

// Lifecycle stage -> canonical badge tone (see lib/status-badge). Replaces the
// previous off-brand Tailwind palette (slate/blue/amber/teal) with brand tokens
// while preserving each stage's intent.
const TONE: Record<DocumentLifecycleStatus, StatusTone> = {
  draft: "neutral",
  collected: "neutral",
  submitted: "info",
  under_review: "warning",
  approved: "success",
  rejected: "danger",
  renewed: "trust",
  archived: "neutral",
};

/** Owner-set lifecycle status badge (distinct from computed expiry status). */
export function LifecycleBadge({
  status,
  className,
}: {
  status: DocumentLifecycleStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        TONE_CLASS[TONE[status]].badge,
        className,
      )}
    >
      {LIFECYCLE_STATUS_LABELS[status]}
    </span>
  );
}
