import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  LifeBuoy,
  Package,
  Share2,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { RiskType, Severity } from "@/lib/life-radar";

const SEVERITY_META: Record<
  Severity,
  { label: string; icon: LucideIcon; className: string }
> = {
  critical: {
    label: "Critical",
    icon: AlertTriangle,
    className: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
  },
  soon: {
    label: "Soon",
    icon: Clock,
    className: "bg-brand-amber/10 text-brand-amber ring-1 ring-brand-amber/25",
  },
  review: {
    label: "Review",
    icon: CalendarClock,
    className: "bg-primary/10 text-primary ring-1 ring-primary/20",
  },
  safe: {
    label: "Safe",
    icon: CheckCircle2,
    className: "bg-brand-success/10 text-brand-success ring-1 ring-brand-success/25",
  },
};

const RISK_TYPE_META: Record<RiskType, { label: string; icon: LucideIcon }> = {
  document: { label: "Document", icon: FileText },
  share: { label: "Share", icon: Share2 },
  emergency: { label: "Emergency", icon: LifeBuoy },
  bundle: { label: "Pack", icon: Package },
  organization: { label: "Organization", icon: Building2 },
  reminder: { label: "Reminder", icon: CalendarClock },
};

/** Severity shown with icon + label (never color alone — accessibility). */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const meta = SEVERITY_META[severity];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold",
        meta.className,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  );
}

export function RiskTypeBadge({ type }: { type: RiskType }) {
  const meta = RISK_TYPE_META[type];
  const Icon = meta.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {meta.label}
    </span>
  );
}

/** Render a risk-type icon from the static map (avoids creating a component
 * from a function-call result during render). */
export function RiskTypeIcon({
  type,
  className,
}: {
  type: RiskType;
  className?: string;
}) {
  const Icon = RISK_TYPE_META[type].icon;
  return <Icon className={className} aria-hidden />;
}
