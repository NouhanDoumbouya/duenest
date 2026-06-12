import { STATUS_LABELS } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentStatus } from "@/types/documents";

const styles: Record<DocumentStatus, { wrap: string; dot: string }> = {
  active: {
    wrap: "bg-brand-success/10 text-brand-success",
    dot: "bg-brand-success",
  },
  renewal_due: {
    wrap: "bg-brand-amber/15 text-brand-amber",
    dot: "bg-brand-amber",
  },
  expired: {
    wrap: "bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
  archived: {
    wrap: "bg-muted text-muted-foreground",
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
