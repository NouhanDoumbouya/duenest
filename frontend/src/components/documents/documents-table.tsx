"use client";

import Link from "next/link";
import { Check, Trash2 } from "lucide-react";

import { formatDate } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentComputedStatus, DocumentRecord } from "@/types/documents";

/** Calm dot colour per computed status — mirrors the status-badge semantics. */
const STATUS_DOT: Partial<Record<DocumentComputedStatus, string>> = {
  active: "bg-brand-success",
  expiring_soon: "bg-brand-amber",
  renewal_due: "bg-brand-amber",
  expired: "bg-destructive",
  archived: "bg-muted-foreground",
  missing_file: "bg-primary",
  missing_expiry_date: "bg-brand-teal",
  needs_attention: "bg-destructive",
};

/**
 * Compact table view of the documents list. A serious-data alternative to
 * cards/list: name, category, type, expiry, and status in scannable columns.
 * Horizontally scrollable on small screens. Selection + trash reuse the same
 * handlers as the cards, so behavior stays identical across views.
 */
export function DocumentsTable({
  docs,
  selectable = false,
  selectedIds,
  onToggleSelect,
  onRequestDelete,
}: {
  docs: DocumentRecord[];
  selectable?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (doc: DocumentRecord) => void;
  onRequestDelete: (doc: DocumentRecord) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
            {selectable && <th className="w-10 px-3 py-2" aria-label="Select" />}
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Expiry</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="w-12 px-3 py-2" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {docs.map((doc) => {
            const selected = selectedIds?.has(doc.id) ?? false;
            return (
              <tr
                key={doc.id}
                className={cn(
                  "border-b border-border/60 last:border-0 transition-colors hover:bg-muted/30",
                  selected && "bg-primary/5",
                )}
              >
                {selectable && (
                  <td className="px-3 py-2 align-middle">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      aria-label={selected ? "Deselect" : "Select"}
                      onClick={() => onToggleSelect?.(doc)}
                      className={cn(
                        "flex size-5 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-card hover:border-primary/60",
                      )}
                    >
                      {selected && <Check className="size-3.5" aria-hidden />}
                    </button>
                  </td>
                )}
                <td className="max-w-[18rem] px-3 py-2 align-middle">
                  <Link
                    href={`/dashboard/documents/${doc.id}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {doc.title}
                  </Link>
                </td>
                <td className="px-3 py-2 align-middle text-muted-foreground">
                  {doc.category_name ?? "—"}
                </td>
                <td className="px-3 py-2 align-middle text-muted-foreground">
                  {doc.document_type || "—"}
                </td>
                <td className="px-3 py-2 align-middle text-muted-foreground">
                  {doc.expiry_date ? formatDate(doc.expiry_date) : "—"}
                </td>
                <td className="px-3 py-2 align-middle">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        STATUS_DOT[doc.computed_status] ?? "bg-muted-foreground",
                      )}
                    />
                    {doc.status_label}
                  </span>
                </td>
                <td className="px-3 py-2 text-right align-middle">
                  <button
                    type="button"
                    onClick={() => onRequestDelete(doc)}
                    aria-label="Move to trash"
                    className="rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
