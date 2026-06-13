import { COMPUTED_STATUS_LABELS, STATUS_LABELS } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentComputedStatus, DocumentStatus } from "@/types/documents";

type BadgeStatus = DocumentStatus | DocumentComputedStatus;

const styles: Record<DocumentComputedStatus, { wrap: string; dot: string }> = {
  active: {
    wrap: "bg-brand-success/10 text-brand-success ring-1 ring-inset ring-brand-success/20",
    dot: "bg-brand-success",
  },
  expiring_soon: {
    wrap: "bg-brand-amber/15 text-brand-amber ring-1 ring-inset ring-brand-amber/25",
    dot: "bg-brand-amber",
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
  missing_file: {
    wrap: "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20",
    dot: "bg-primary",
  },
  missing_expiry_date: {
    wrap: "bg-brand-teal/10 text-brand-teal ring-1 ring-inset ring-brand-teal/20",
    dot: "bg-brand-teal",
  },
  needs_attention: {
    wrap: "bg-destructive/10 text-destructive ring-1 ring-inset ring-destructive/20",
    dot: "bg-destructive",
  },
};

export function DocumentStatusBadge({ status }: { status: BadgeStatus }) {
  const computedStatus = status as DocumentComputedStatus;
  const style = styles[computedStatus] ?? styles.active;
  const label =
    COMPUTED_STATUS_LABELS[computedStatus] ??
    STATUS_LABELS[status as DocumentStatus] ??
    "Active";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        style.wrap,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} />
      {label}
    </span>
  );
}
