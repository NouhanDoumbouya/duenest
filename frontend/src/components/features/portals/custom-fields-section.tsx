"use client";

// Custom-fields display + edit (B2B Custom Fields and Statuses V1). A reusable
// section for a case or person:
//   • CustomFieldsView — read-only list of the org's custom fields + the
//     record's values, formatted per field type.
//   • CustomFieldsEditModal — an admin form to set those values, validated on
//     the client (the backend remains the source of truth).
//
// Internal-only in V1: these values are never rendered on public request/room
// pages. Edits are admin/owner only; a 403 surfaces a clear message.

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Pencil, X } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/product-ui";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  formatCustomFieldValue,
  isPortalForbiddenError,
  validateCustomFieldValueClient,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type {
  CustomField,
  CustomFieldValue,
  CustomFieldValues,
} from "@/types/portals";

function selectClass() {
  return "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
}

// ---- Read-only view ---------------------------------------------------------

export function CustomFieldsView({
  schema,
  values,
}: {
  schema: CustomField[];
  values: CustomFieldValues;
}) {
  if (schema.length === 0) return null;
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {schema.map((field) => (
        <div key={field.id} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{field.label}</dt>
          <dd className="mt-0.5 break-words text-sm font-medium">
            {formatCustomFieldValue(field, values[field.key] ?? null)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ---- Empty state ------------------------------------------------------------

export function CustomFieldsEmpty({
  canManage,
  settingsHref,
}: {
  canManage: boolean;
  settingsHref: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-border px-3 py-6 text-center">
      <p className="text-sm text-muted-foreground">No custom fields yet.</p>
      {canManage && (
        <Link
          href={settingsHref}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "mt-3",
          )}
        >
          Add custom fields
        </Link>
      )}
    </div>
  );
}

// ---- Edit modal -------------------------------------------------------------

/** Normalize a raw stored value into the editor's draft shape per field type. */
function draftFromValue(
  field: CustomField,
  value: CustomFieldValue,
): CustomFieldValue {
  if (field.field_type === "boolean") return value === true;
  if (field.field_type === "multi_select") {
    return Array.isArray(value) ? value : [];
  }
  if (value === null || value === undefined) return "";
  return value;
}

export function CustomFieldsEditModal({
  title,
  description,
  schema,
  values,
  onClose,
  onSave,
}: {
  title: string;
  description: string;
  schema: CustomField[];
  values: CustomFieldValues;
  onClose: () => void;
  /** Persist the values. Throws to surface an inline error. */
  onSave: (values: CustomFieldValues) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CustomFieldValues>(() => {
    const initial: CustomFieldValues = {};
    for (const field of schema) {
      initial[field.key] = draftFromValue(field, values[field.key] ?? null);
    }
    return initial;
  });
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setValue(key: string, value: CustomFieldValue) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // First failing field error, used to block submit + show inline hints.
  const fieldErrors = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const field of schema) {
      map[field.key] = validateCustomFieldValueClient(
        field,
        draft[field.key] ?? null,
      );
    }
    return map;
  }, [schema, draft]);

  const hasError = Object.values(fieldErrors).some(Boolean);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (hasError) {
      setTouched(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Send the cleaned values: drop empty strings to null, keep arrays.
      const payload: CustomFieldValues = {};
      for (const field of schema) {
        const value = draft[field.key];
        if (typeof value === "string" && value.trim() === "") {
          payload[field.key] = null;
        } else {
          payload[field.key] = value ?? null;
        }
      }
      await onSave(payload);
    } catch (err) {
      setError(
        isPortalForbiddenError(err)
          ? "Only organization owners and admins can edit custom fields."
          : err instanceof ApiError
            ? err.message
            : "Could not save these fields.",
      );
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-semibold">{title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          {schema.map((field) => (
            <FieldInput
              key={field.id}
              field={field}
              value={draft[field.key] ?? null}
              error={touched ? fieldErrors[field.key] : null}
              disabled={submitting}
              onChange={(value) => setValue(field.key, value)}
            />
          ))}

          {error && <InlineAlert>{error}</InlineAlert>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Save fields
            </Button>
          </div>
        </form>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function FieldInput({
  field,
  value,
  error,
  disabled,
  onChange,
}: {
  field: CustomField;
  value: CustomFieldValue;
  error: string | null;
  disabled: boolean;
  onChange: (value: CustomFieldValue) => void;
}) {
  const inputId = `cfv-${field.id}`;
  const requiredMark = field.required ? (
    <span className="text-destructive"> *</span>
  ) : null;

  function renderControl() {
    switch (field.field_type) {
      case "long_text":
        return (
          <Textarea
            id={inputId}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            disabled={disabled}
          />
        );
      case "boolean":
        return (
          <label className="flex items-center gap-2.5 text-sm">
            <input
              id={inputId}
              type="checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
              disabled={disabled}
              className="size-4 rounded border-input"
            />
            <span className="text-muted-foreground">Yes</span>
          </label>
        );
      case "date":
        return (
          <Input
            id={inputId}
            type="date"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        );
      case "number":
        return (
          <Input
            id={inputId}
            type="number"
            inputMode="decimal"
            value={
              typeof value === "number"
                ? String(value)
                : typeof value === "string"
                  ? value
                  : ""
            }
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        );
      case "single_select":
        return (
          <select
            id={inputId}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className={selectClass()}
            disabled={disabled}
          >
            <option value="">— None —</option>
            {field.options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        );
      case "multi_select": {
        const selected = Array.isArray(value) ? value : [];
        return (
          <div className="flex flex-wrap gap-2">
            {field.options.length === 0 ? (
              <p className="text-xs text-muted-foreground">No options defined.</p>
            ) : (
              field.options.map((option) => {
                const checked = selected.includes(option.key);
                return (
                  <label
                    key={option.key}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm",
                      checked
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...selected, option.key]
                          : selected.filter((key) => key !== option.key);
                        onChange(next);
                      }}
                      disabled={disabled}
                      className="size-4 rounded border-input"
                    />
                    {option.label}
                  </label>
                );
              })
            )}
          </div>
        );
      }
      default:
        return (
          <Input
            id={inputId}
            type={
              field.field_type === "email"
                ? "email"
                : field.field_type === "url"
                  ? "url"
                  : field.field_type === "phone"
                    ? "tel"
                    : "text"
            }
            inputMode={
              field.field_type === "email"
                ? "email"
                : field.field_type === "phone"
                  ? "tel"
                  : field.field_type === "url"
                    ? "url"
                    : undefined
            }
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        );
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={inputId}>
        {field.label}
        {requiredMark}
      </Label>
      {renderControl()}
      {field.description && !error && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ---- A compact "Edit fields" trigger button ---------------------------------

export function EditFieldsButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button size="sm" variant="outline" onClick={onClick} disabled={disabled}>
      <Pencil className="size-3.5" aria-hidden /> Edit fields
    </Button>
  );
}
