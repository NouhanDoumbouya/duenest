"use client";

import { useState } from "react";
import { AlertTriangle, FileSearch, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  EXTRACTABLE_FIELD_LABELS,
  applyExtraction,
  createFileExtraction,
  updateExtractionFields,
} from "@/lib/renewal-workspace";
import type { DocumentRecord } from "@/types/documents";
import type { DocumentFile } from "@/types/document-files";
import type {
  DocumentExtraction,
  ExtractableField,
  ExtractedFields,
} from "@/types/renewal-workspace";

const FIELD_ORDER: ExtractableField[] = [
  "title",
  "document_type",
  "issuer",
  "country",
  "reference_number",
  "issue_date",
  "expiry_date",
  "renewal_date",
];

const DATE_FIELDS = new Set<ExtractableField>([
  "issue_date",
  "expiry_date",
  "renewal_date",
]);

export function DocumentFileExtraction({
  documentId,
  files,
  onApplied,
}: {
  documentId: number;
  files: DocumentFile[];
  onApplied?: (document: DocumentRecord) => void;
}) {
  const [selectedFileId, setSelectedFileId] = useState<string>(
    files[0] ? String(files[0].id) : "",
  );
  const [extraction, setExtraction] = useState<DocumentExtraction | null>(null);
  const [fields, setFields] = useState<ExtractedFields>({});
  const [selected, setSelected] = useState<Set<ExtractableField>>(new Set());
  const [extracting, setExtracting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function runExtraction() {
    if (!selectedFileId) return;
    setExtracting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await createFileExtraction(
        documentId,
        Number(selectedFileId),
      );
      setExtraction(result);
      setFields(result.extracted_fields ?? {});
      setSelected(
        new Set(Object.keys(result.extracted_fields ?? {}) as ExtractableField[]),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not extract details from this file.",
      );
    } finally {
      setExtracting(false);
    }
  }

  function setField(field: ExtractableField, value: string) {
    setFields((prev) => ({ ...prev, [field]: value }));
  }

  function toggleSelected(field: ExtractableField) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  }

  async function applyReviewed() {
    if (!extraction) return;
    const chosen = FIELD_ORDER.filter(
      (f) => selected.has(f) && (fields[f] ?? "").trim() !== "",
    );
    if (chosen.length === 0) {
      setError("Select at least one field with a value to apply.");
      return;
    }
    setApplying(true);
    setError(null);
    setSuccess(null);
    try {
      // Persist the reviewed values first, then apply the chosen ones.
      const reviewedPayload: ExtractedFields = {};
      for (const f of chosen) reviewedPayload[f] = fields[f];
      await updateExtractionFields(
        documentId,
        extraction.file,
        extraction.id,
        reviewedPayload,
      );
      const result = await applyExtraction(
        documentId,
        extraction.file,
        extraction.id,
        chosen,
      );
      setExtraction(result.extraction);
      setSuccess(
        `Applied ${result.applied_fields.length} field${
          result.applied_fields.length === 1 ? "" : "s"
        } to this document.`,
      );
      onApplied?.(result.document);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not apply the reviewed details.",
      );
    } finally {
      setApplying(false);
    }
  }

  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
        <p className="text-sm font-medium">No files to extract from</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Upload a PDF or image above, then come back to extract its details.
        </p>
      </div>
    );
  }

  const hasFields = Object.keys(fields).length > 0;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/25 p-4">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileSearch className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium">Extract details from a file</p>
            <p className="mt-1 text-sm text-muted-foreground">
              DueNest reads what it can from the file and stages suggestions for
              you to review. Nothing is sent to any third-party service, and
              your document is only updated once you apply reviewed details.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <select
                aria-label="File to extract from"
                className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={selectedFileId}
                onChange={(e) => setSelectedFileId(e.target.value)}
              >
                {files.map((file) => (
                  <option key={file.id} value={file.id}>
                    {file.original_filename}
                  </option>
                ))}
              </select>
              <Button onClick={runExtraction} disabled={extracting || !selectedFileId}>
                {extracting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Extract details
              </Button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
      {success && (
        <p className="rounded-lg bg-brand-success/10 px-3 py-2 text-sm text-brand-success">
          {success}
        </p>
      )}

      {extraction && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">Review extracted details</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {extraction.extraction_status.replace("_", " ")}
              {extraction.confidence_score != null &&
                ` · ${Math.round(extraction.confidence_score * 100)}% confidence`}
            </span>
          </div>

          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Automatic extraction can be imperfect. Check every value and edit
              it before applying — only ticked fields are written to your
              document.
            </span>
          </div>

          {!hasFields && (
            <p className="mt-3 text-sm text-muted-foreground">
              No fields could be read automatically. You can still type values
              below and apply the ones you want.
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {FIELD_ORDER.map((field) => (
              <div key={field} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    id={`apply-${field}`}
                    type="checkbox"
                    checked={selected.has(field)}
                    onChange={() => toggleSelected(field)}
                    className="size-4 rounded border-input"
                  />
                  <Label htmlFor={`extract-${field}`} className="text-xs">
                    {EXTRACTABLE_FIELD_LABELS[field]}
                  </Label>
                </div>
                <Input
                  id={`extract-${field}`}
                  type={DATE_FIELDS.has(field) ? "date" : "text"}
                  value={fields[field] ?? ""}
                  onChange={(e) => setField(field, e.target.value)}
                  className="h-9"
                />
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={applyReviewed} disabled={applying}>
              {applying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Apply reviewed details
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
