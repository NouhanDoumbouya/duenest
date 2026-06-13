import {
  BellRing,
  CalendarClock,
  FileText,
  Hourglass,
  RefreshCw,
} from "lucide-react";

import { formatDate } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types/documents";

function Tile({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof FileText;
  label: string;
  value: string;
  tone?: "default" | "warn" | "danger" | "good";
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-brand-amber"
        : tone === "good"
          ? "text-brand-success"
          : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className={cn("mt-2 text-sm font-semibold", toneClass)}>{value}</p>
    </div>
  );
}

/** Compact at-a-glance summary of the key facts for one document. */
export function DocumentSummaryGrid({ doc }: { doc: DocumentRecord }) {
  const days = doc.days_until_expiry;
  const daysValue =
    days === null
      ? "No expiry"
      : days < 0
        ? `${Math.abs(days)}d overdue`
        : days === 0
          ? "Today"
          : `${days} days`;
  const daysTone =
    days === null
      ? "default"
      : days < 0
        ? "danger"
        : days <= 30
          ? "warn"
          : "good";

  const hasReminder =
    doc.confidence_reasons.find((r) => r.key === "has_reminder")?.met ?? false;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Tile
        icon={CalendarClock}
        label="Expires"
        value={doc.expiry_date ? formatDate(doc.expiry_date) : "Not set"}
        tone={doc.is_expired ? "danger" : "default"}
      />
      <Tile
        icon={RefreshCw}
        label="Renewal"
        value={doc.renewal_date ? formatDate(doc.renewal_date) : "Not set"}
      />
      <Tile icon={Hourglass} label="Time left" value={daysValue} tone={daysTone} />
      <Tile
        icon={FileText}
        label="Files"
        value={doc.has_file ? "Attached" : "None yet"}
        tone={doc.has_file ? "good" : "warn"}
      />
      <Tile
        icon={BellRing}
        label="Reminders"
        value={hasReminder ? "Active" : "None"}
        tone={hasReminder ? "good" : "default"}
      />
    </div>
  );
}
