"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Paperclip, UploadCloud } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CustomFieldsEditor } from "@/components/documents/custom-fields-editor";
import { TagSelector } from "@/components/documents/tag-selector";
import { ApiError } from "@/lib/api";
import { ACCEPT_ATTR, validateFile } from "@/lib/document-files";
import { LIFECYCLE_STATUS_LABELS, STATUS_LABELS } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type {
  CreateDocumentRequest,
  DocumentAvailability,
  DocumentLifecycleStatus,
  DocumentRecord,
  DocumentStatus,
} from "@/types/documents";

const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as DocumentStatus[];
const LIFECYCLE_OPTIONS = Object.keys(
  LIFECYCLE_STATUS_LABELS,
) as DocumentLifecycleStatus[];

const AVAILABILITY_OPTIONS: { value: DocumentAvailability; label: string }[] = [
  { value: "unknown", label: "Not sure" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

type FieldErrors = Partial<Record<keyof CreateDocumentRequest, string>>;

interface FormState {
  title: string;
  document_type: string;
  issuer: string;
  country: string;
  reference_number: string;
  status: DocumentStatus;
  issue_date: string;
  expiry_date: string;
  renewal_date: string;
  notes: string;
  lifecycle_status: DocumentLifecycleStatus;
  last_safe_action_override: string;
  tag_ids: number[];
  custom_fields: Record<string, string>;
  physical_location_label: string;
  physical_location_details: string;
  original_available: DocumentAvailability;
  certified_copy_available: DocumentAvailability;
  translation_available: DocumentAvailability;
  notes_about_original: string;
}

function toFormState(doc?: Partial<DocumentRecord>): FormState {
  return {
    title: doc?.title ?? "",
    document_type: doc?.document_type ?? "",
    issuer: doc?.issuer ?? "",
    country: doc?.country ?? "",
    reference_number: doc?.reference_number ?? "",
    status: doc?.status ?? "active",
    issue_date: doc?.issue_date ?? "",
    expiry_date: doc?.expiry_date ?? "",
    renewal_date: doc?.renewal_date ?? "",
    notes: doc?.notes ?? "",
    lifecycle_status: doc?.lifecycle_status ?? "collected",
    last_safe_action_override: doc?.last_safe_action_override ?? "",
    tag_ids: doc?.tags?.map((tag) => tag.id) ?? [],
    custom_fields: doc?.custom_fields ?? {},
    physical_location_label: doc?.physical_location_label ?? "",
    physical_location_details: doc?.physical_location_details ?? "",
    original_available: doc?.original_available ?? "unknown",
    certified_copy_available: doc?.certified_copy_available ?? "unknown",
    translation_available: doc?.translation_available ?? "unknown",
    notes_about_original: doc?.notes_about_original ?? "",
  };
}

/** Empty string → null for nullable fields the backend expects. */
function nullable(value: string): string | null {
  return value.trim() === "" ? null : value;
}

export function DocumentForm({
  initial,
  submitLabel,
  cancelHref = "/dashboard/documents",
  attachFile = false,
  onSubmit,
}: {
  initial?: DocumentRecord;
  submitLabel: string;
  cancelHref?: string;
  /** When true, show an optional file picker and pass the file to onSubmit. */
  attachFile?: boolean;
  onSubmit: (
    payload: CreateDocumentRequest,
    file?: File | null,
  ) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Optional file to attach on create (only used when attachFile is true).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!selected) return;
    const validationError = validateFile(selected);
    if (validationError) {
      setFileError(validationError);
      setFile(null);
      return;
    }
    setFileError(null);
    setFile(selected);
  }

  function clearFile() {
    setFile(null);
    setFileError(null);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!form.title.trim()) {
      errors.title = "Title is required.";
    }
    if (
      form.issue_date &&
      form.expiry_date &&
      form.expiry_date < form.issue_date
    ) {
      errors.expiry_date = "Expiry date cannot be earlier than the issue date.";
    }
    if (
      form.renewal_date &&
      form.expiry_date &&
      form.renewal_date > form.expiry_date
    ) {
      errors.renewal_date = "Renewal date cannot be later than the expiry date.";
    }
    return errors;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    const payload: CreateDocumentRequest = {
      title: form.title.trim(),
      document_type: form.document_type.trim(),
      issuer: form.issuer.trim(),
      country: form.country.trim(),
      reference_number: nullable(form.reference_number),
      status: form.status,
      issue_date: nullable(form.issue_date),
      expiry_date: nullable(form.expiry_date),
      renewal_date: nullable(form.renewal_date),
      notes: form.notes.trim(),
      lifecycle_status: form.lifecycle_status,
      last_safe_action_override: nullable(form.last_safe_action_override),
      tag_ids: form.tag_ids,
      custom_fields: form.custom_fields,
      physical_location_label: form.physical_location_label.trim(),
      physical_location_details: form.physical_location_details.trim(),
      original_available: form.original_available,
      certified_copy_available: form.certified_copy_available,
      translation_available: form.translation_available,
      notes_about_original: form.notes_about_original.trim(),
    };

    setSubmitting(true);
    try {
      await onSubmit(payload, attachFile ? file : undefined);
      // Navigation/refresh is handled by the caller on success.
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === "object") {
        // Map DRF field errors (e.g. { expiry_date: ["..."] }) onto the form.
        const data = err.data as Record<string, unknown>;
        const mapped: FieldErrors = {};
        for (const [key, value] of Object.entries(data)) {
          const message = Array.isArray(value) ? String(value[0]) : String(value);
          if (key in form) mapped[key as keyof CreateDocumentRequest] = message;
        }
        setFieldErrors(mapped);
        setFormError(
          err.message && Object.keys(mapped).length === 0 ? err.message : null,
        );
      } else {
        setFormError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong. Please try again.",
        );
      }
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      {formError && (
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {formError}
        </p>
      )}

      <FormSection
        title="Basic details"
        description="What the document is and where it stands."
      >
        <Field id="title" label="Title" required error={fieldErrors.title}>
          <Input
            id="title"
            className="h-11"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="e.g. Passport"
            aria-invalid={!!fieldErrors.title}
            required
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="document_type"
            label="Document type"
            error={fieldErrors.document_type}
          >
            <Input
              id="document_type"
              className="h-11"
              value={form.document_type}
              onChange={(e) => update("document_type", e.target.value)}
              placeholder="passport, visa, insurance…"
            />
          </Field>
          <Field id="status" label="Status" error={fieldErrors.status}>
            <select
              id="status"
              className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={form.status}
              onChange={(e) => update("status", e.target.value as DocumentStatus)}
            >
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          id="lifecycle_status"
          label="Stage"
          error={fieldErrors.lifecycle_status}
        >
          <select
            id="lifecycle_status"
            className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={form.lifecycle_status}
            onChange={(e) =>
              update("lifecycle_status", e.target.value as DocumentLifecycleStatus)
            }
          >
            {LIFECYCLE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {LIFECYCLE_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Where this is in your process — separate from the expiry status
            DueNest calculates.
          </p>
        </Field>
      </FormSection>

      <FormSection
        title="Tags"
        description="Organise documents with your own tags."
      >
        <TagSelector
          selectedIds={form.tag_ids}
          onChange={(ids) => update("tag_ids", ids)}
        />
      </FormSection>

      <FormSection
        title="Issuer & reference"
        description="Who issued it and any identifying number."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="issuer" label="Issuer" error={fieldErrors.issuer}>
            <Input
              id="issuer"
              className="h-11"
              value={form.issuer}
              onChange={(e) => update("issuer", e.target.value)}
              placeholder="Issuing authority"
            />
          </Field>
          <Field id="country" label="Country" error={fieldErrors.country}>
            <Input
              id="country"
              className="h-11"
              value={form.country}
              onChange={(e) => update("country", e.target.value)}
              placeholder="Issuing country"
            />
          </Field>
        </div>
        <Field
          id="reference_number"
          label="Reference number"
          error={fieldErrors.reference_number}
        >
          <Input
            id="reference_number"
            className="h-11"
            value={form.reference_number}
            onChange={(e) => update("reference_number", e.target.value)}
            placeholder="Optional — e.g. document or policy number"
          />
        </Field>
      </FormSection>

      <FormSection
        title="Important dates"
        description="DueNest uses these to flag what needs attention. Leave blank if a date doesn’t apply."
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="issue_date" label="Issue date" error={fieldErrors.issue_date}>
            <Input
              id="issue_date"
              type="date"
              className="h-11"
              value={form.issue_date}
              onChange={(e) => update("issue_date", e.target.value)}
            />
          </Field>
          <Field
            id="expiry_date"
            label="Expiry date"
            error={fieldErrors.expiry_date}
          >
            <Input
              id="expiry_date"
              type="date"
              className="h-11"
              value={form.expiry_date}
              onChange={(e) => update("expiry_date", e.target.value)}
              aria-invalid={!!fieldErrors.expiry_date}
            />
          </Field>
          <Field
            id="renewal_date"
            label="Renewal date"
            error={fieldErrors.renewal_date}
          >
            <Input
              id="renewal_date"
              type="date"
              className="h-11"
              value={form.renewal_date}
              onChange={(e) => update("renewal_date", e.target.value)}
              aria-invalid={!!fieldErrors.renewal_date}
            />
          </Field>
        </div>
        <Field
          id="last_safe_action_override"
          label="Last safe action date (optional)"
          error={fieldErrors.last_safe_action_override}
        >
          <Input
            id="last_safe_action_override"
            type="date"
            className="h-11"
            value={form.last_safe_action_override}
            onChange={(e) => update("last_safe_action_override", e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            The last date you can still act safely. Leave blank to let DueNest
            estimate it from your renewal or expiry date.
          </p>
        </Field>
      </FormSection>

      <FormSection
        title="Custom details"
        description="Extra fields for this document type — passport number, policy number, and so on."
      >
        <CustomFieldsEditor
          documentType={form.document_type}
          value={form.custom_fields}
          onChange={(next) => update("custom_fields", next)}
        />
      </FormSection>

      <FormSection
        title="Notes"
        description="Anything you’ll want to remember at renewal time."
      >
        <Field id="notes" label="Notes" srLabel error={fieldErrors.notes}>
          <Textarea
            id="notes"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            placeholder="Renewal steps, where the original is kept, who to contact…"
          />
        </Field>
      </FormSection>

      <FormSection
        title="Where is the original?"
        description="Track the physical document so you can find the original — or know what you’re missing — when it’s needed in person."
      >
        <Field
          id="physical_location_label"
          label="Physical location"
          error={fieldErrors.physical_location_label}
        >
          <Input
            id="physical_location_label"
            className="h-11"
            value={form.physical_location_label}
            onChange={(e) => update("physical_location_label", e.target.value)}
            placeholder="e.g. Home safe, filing cabinet, with solicitor…"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field id="original_available" label="Have the original?">
            <AvailabilitySelect
              id="original_available"
              value={form.original_available}
              onChange={(v) => update("original_available", v)}
            />
          </Field>
          <Field id="certified_copy_available" label="Certified copy?">
            <AvailabilitySelect
              id="certified_copy_available"
              value={form.certified_copy_available}
              onChange={(v) => update("certified_copy_available", v)}
            />
          </Field>
          <Field id="translation_available" label="Translation?">
            <AvailabilitySelect
              id="translation_available"
              value={form.translation_available}
              onChange={(v) => update("translation_available", v)}
            />
          </Field>
        </div>

        <Field
          id="physical_location_details"
          label="Location details"
          error={fieldErrors.physical_location_details}
        >
          <Textarea
            id="physical_location_details"
            value={form.physical_location_details}
            onChange={(e) =>
              update("physical_location_details", e.target.value)
            }
            placeholder="Exact spot, who holds it, how to retrieve it…"
          />
        </Field>

        <Field
          id="notes_about_original"
          label="Notes about the original"
          error={fieldErrors.notes_about_original}
        >
          <Textarea
            id="notes_about_original"
            value={form.notes_about_original}
            onChange={(e) => update("notes_about_original", e.target.value)}
            placeholder="Condition, certification details, anything to remember…"
          />
        </Field>
      </FormSection>

      {attachFile && (
        <FormSection
          title="Attach a file"
          description="Attach the file connected to this document so it’s easier to find when renewal time comes."
        >
          <input
            ref={fileInputRef}
            id="attach-file"
            type="file"
            accept={ACCEPT_ATTR}
            onChange={handleFileSelect}
            disabled={submitting}
            className="hidden"
          />
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <UploadCloud className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              {file ? (
                <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                  <Paperclip className="size-3.5 shrink-0" />
                  {file.name}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Optional · PDF, JPG, PNG, DOC, DOCX · up to 10 MB
                </p>
              )}
            </div>
            {file ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFile}
                disabled={submitting}
              >
                Remove
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={submitting}
              >
                Choose file
              </Button>
            )}
          </div>
          {fileError && (
            <p className="text-sm text-destructive" role="alert">
              {fileError}
            </p>
          )}
        </FormSection>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
        <Link
          href={cancelHref}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
        >
          Cancel
        </Link>
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function AvailabilitySelect({
  id,
  value,
  onChange,
}: {
  id: string;
  value: DocumentAvailability;
  onChange: (value: DocumentAvailability) => void;
}) {
  return (
    <select
      id={id}
      className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      value={value}
      onChange={(e) => onChange(e.target.value as DocumentAvailability)}
    >
      {AVAILABILITY_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-5 border-t border-border pt-6 first:border-t-0 first:pt-0 sm:grid-cols-[200px_1fr]">
      <div className="sm:pt-1">
        <h3 className="font-heading text-sm font-semibold">{title}</h3>
        {description && (
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  required,
  srLabel,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  srLabel?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className={cn(srLabel && "sr-only")}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
