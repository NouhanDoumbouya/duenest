import { StatusBadge } from "@/components/ui/status-badge";
import { COMPUTED_STATUS_LABELS, STATUS_LABELS } from "@/lib/documents";
import type { StatusTone } from "@/lib/status-badge";
import type { DocumentComputedStatus, DocumentStatus } from "@/types/documents";

type BadgeStatus = DocumentStatus | DocumentComputedStatus;

// Computed expiry status -> canonical badge tone (see lib/status-badge).
const TONE: Record<DocumentComputedStatus, StatusTone> = {
  active: "success",
  expiring_soon: "warning",
  renewal_due: "warning",
  expired: "danger",
  archived: "neutral",
  missing_file: "info",
  missing_expiry_date: "trust",
  needs_attention: "danger",
};

export function DocumentStatusBadge({ status }: { status: BadgeStatus }) {
  const computedStatus = status as DocumentComputedStatus;
  const label =
    COMPUTED_STATUS_LABELS[computedStatus] ??
    STATUS_LABELS[status as DocumentStatus] ??
    "Active";
  return <StatusBadge tone={TONE[computedStatus] ?? "success"}>{label}</StatusBadge>;
}
