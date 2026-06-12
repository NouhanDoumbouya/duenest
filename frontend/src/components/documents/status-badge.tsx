import { STATUS_LABELS } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentStatus } from "@/types/documents";

const styles: Record<DocumentStatus, { wrap: string; dot: string }> = {
  active: {
    wrap: "bg-brand-success/10 text-brand-success ring-1 ring-inset ring-brand-success/20",
    dot: "bg-brand-success",
  },
  renewal_due: {
    wrap: "bg-brand-amber/15 text-brand-amber ring-1 ring-inset ring-brand-amber/25",
    dot: "bg-brand-amber",
  },
  expired: {
    wrap: "bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20",
    dot: "bg-destructive",
  },
  archived: {
    wrap: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
    dot: "bg-muted-foreground",
  },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const style = styles[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        style.wrap,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}
