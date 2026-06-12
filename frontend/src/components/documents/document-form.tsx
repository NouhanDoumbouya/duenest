"use client";

import { useState } from "react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { STATUS_LABELS } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type {
  CreateDocumentRequest,
  DocumentRecord,
  DocumentStatus,
} from "@/types/documents";

const STATUS_OPTIONS = Object.keys(STATUS_LABELS) as DocumentStatus[];

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
  onSubmit,
}: {
  initial?: DocumentRecord;
  submitLabel: string;
  cancelHref?: string;
  onSubmit: (payload: CreateDocumentRequest) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(() => toFormState(initial));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    };

    setSubmitting(true);
    try {
      await onSubmit(payload);
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
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {formError && (
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {formError}
        </p>
      )}

      <Field
        id="title"
        label="Title"
        required
        error={fieldErrors.title}
      >
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

      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="document_type" label="Document type" error={fieldErrors.document_type}>
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
            className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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

      <div className="grid gap-6 sm:grid-cols-2">
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
          placeholder="Optional"
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-3">
        <Field id="issue_date" label="Issue date" error={fieldErrors.issue_date}>
          <Input
            id="issue_date"
            type="date"
            className="h-11"
            value={form.issue_date}
            onChange={(e) => update("issue_date", e.target.value)}
          />
        </Field>
        <Field id="expiry_date" label="Expiry date" error={fieldErrors.expiry_date}>
          <Input
            id="expiry_date"
            type="date"
            className="h-11"
            value={form.expiry_date}
            onChange={(e) => update("expiry_date", e.target.value)}
            aria-invalid={!!fieldErrors.expiry_date}
          />
        </Field>
        <Field id="renewal_date" label="Renewal date" error={fieldErrors.renewal_date}>
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

      <Field id="notes" label="Notes" error={fieldErrors.notes}>
        <Textarea
          id="notes"
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          placeholder="Anything you want to remember about this document."
        />
      </Field>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
        <Link
          href={cancelHref}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-10")}
        >
          Cancel
        </Link>
        <Button type="submit" className="h-10" disabled={submitting}>
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  required,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>
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
