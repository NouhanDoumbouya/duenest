import { LIFECYCLE_STATUS_LABELS } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentLifecycleStatus } from "@/types/documents";

const STYLES: Record<DocumentLifecycleStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  collected: "bg-slate-100 text-slate-700",
  submitted: "bg-blue-100 text-blue-700",
  under_review: "bg-amber-100 text-amber-700",
  approved: "bg-brand-success/10 text-brand-success",
  rejected: "bg-destructive/10 text-destructive",
  renewed: "bg-teal-100 text-teal-700",
  archived: "bg-muted text-muted-foreground",
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
        STYLES[status],
        className,
      )}
    >
      {LIFECYCLE_STATUS_LABELS[status]}
    </span>
  );
}
