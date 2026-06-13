"use client";

import { ArrowRight, Sparkles } from "lucide-react";

import { ConfidenceBreakdown } from "@/components/documents/confidence-indicator";
import { SectionCard } from "@/components/ui/section-card";
import { formatDate, LIFECYCLE_STATUS_LABELS } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentAvailability, DocumentRecord } from "@/types/documents";

const LSA_STYLES: Record<string, string> = {
  passed: "bg-destructive/10 text-destructive",
  approaching: "bg-amber-100 text-amber-800",
  ok: "bg-brand-success/10 text-brand-success",
  unknown: "bg-muted text-muted-foreground",
};

const AVAILABILITY_LABELS: Record<DocumentAvailability, string> = {
  yes: "Yes",
  no: "No",
  unknown: "Not sure",
};

function lastSafeActionMessage(doc: DocumentRecord): string {
  const days = doc.days_until_last_safe_action;
  switch (doc.last_safe_action_status) {
    case "passed":
      return days === null
        ? "The last safe action date has passed."
        : `Last safe action passed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago.`;
    case "approaching":
      return `Act within ${days} day${days === 1 ? "" : "s"} — by ${formatDate(doc.last_safe_action_date)}.`;
    case "ok":
      return `On track — act by ${formatDate(doc.last_safe_action_date)}.`;
    default:
      return "Add a renewal or expiry date to estimate a last safe action date.";
  }
}

/** The single most useful next step, derived from the document's state. */
function nextAction(doc: DocumentRecord): { text: string; tab: "files" | "renewal" } | null {
  if (doc.computed_status === "expired")
    return {
      text: "This document has expired. Record a renewal once you have sorted it.",
      tab: "renewal",
    };
  if (doc.missing_file)
    return {
      text: "No file attached yet. Upload a scan or copy to keep this document usable.",
      tab: "files",
    };
  const unmet = doc.confidence_reasons.find((r) => !r.met);
  if (unmet) return { text: unmet.hint || unmet.label, tab: "renewal" };
  return null;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

export function OverviewTab({
  doc,
  onSelectTab,
}: {
  doc: DocumentRecord;
  onSelectTab: (tab: "files" | "renewal") => void;
}) {
  const action = nextAction(doc);
  const hasPhysical =
    doc.physical_location_label ||
    doc.physical_location_details ||
    doc.notes_about_original ||
    doc.original_available !== "unknown" ||
    doc.certified_copy_available !== "unknown" ||
    doc.translation_available !== "unknown";

  return (
    <div className="space-y-6">
      {action && (
        <button
          type="button"
          onClick={() => onSelectTab(action.tab)}
          className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 transition-colors hover:bg-primary/10"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </span>
          <span className="flex-1 text-sm font-medium">{action.text}</span>
          <ArrowRight className="size-4 shrink-0 text-primary" />
        </button>
      )}

      <SectionCard
        title="Confidence"
        description="How complete and current this document is."
      >
        <ConfidenceBreakdown
          score={doc.confidence_score}
          label={doc.confidence_label}
          reasons={doc.confidence_reasons}
        />
        <div
          className={cn(
            "mt-4 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm",
            LSA_STYLES[doc.last_safe_action_status] ?? LSA_STYLES.unknown,
          )}
        >
          <span className="font-medium">Last safe action:</span>
          <span>{lastSafeActionMessage(doc)}</span>
        </div>
      </SectionCard>

      <SectionCard title="Document details">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          <Fact label="Type" value={doc.document_type} />
          <Fact label="Category" value={doc.category_name ?? ""} />
          <Fact label="Stage" value={LIFECYCLE_STATUS_LABELS[doc.lifecycle_status]} />
          <Fact label="Issuer" value={doc.issuer} />
          <Fact label="Country" value={doc.country} />
          <Fact label="Reference" value={doc.reference_number ?? ""} />
          <Fact label="Issued" value={doc.issue_date ? formatDate(doc.issue_date) : ""} />
          <Fact label="Expires" value={doc.expiry_date ? formatDate(doc.expiry_date) : ""} />
          <Fact label="Renewal" value={doc.renewal_date ? formatDate(doc.renewal_date) : ""} />
        </dl>

        {Object.keys(doc.custom_fields).length > 0 && (
          <div className="mt-5 border-t border-border pt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Custom details
            </p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
              {Object.entries(doc.custom_fields).map(([key, value]) => (
                <Fact
                  key={key}
                  label={key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  value={value}
                />
              ))}
            </dl>
          </div>
        )}

        {doc.notes && (
          <div className="mt-5 border-t border-border pt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Notes
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
              {doc.notes}
            </p>
          </div>
        )}
      </SectionCard>

      {hasPhysical && (
        <SectionCard
          title="Where is the original?"
          description="The physical document and its copies."
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Fact label="Location" value={doc.physical_location_label} />
            <Fact label="Original held" value={AVAILABILITY_LABELS[doc.original_available]} />
            <Fact label="Certified copy" value={AVAILABILITY_LABELS[doc.certified_copy_available]} />
            <Fact label="Translation" value={AVAILABILITY_LABELS[doc.translation_available]} />
          </dl>
          {doc.physical_location_details && (
            <p className="mt-4 text-sm text-muted-foreground whitespace-pre-line">
              {doc.physical_location_details}
            </p>
          )}
          {doc.notes_about_original && (
            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">
              {doc.notes_about_original}
            </p>
          )}
        </SectionCard>
      )}
    </div>
  );
}
