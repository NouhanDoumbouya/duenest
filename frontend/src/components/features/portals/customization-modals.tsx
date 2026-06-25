"use client";

// B2B Custom Fields and Statuses (B2B Portals) — the two settings modals:
//   • CustomFieldFormModal: define or edit a custom field on a person or case,
//     including an options builder for the select field types.
//   • CaseStatusFormModal: define or edit a custom case status, mapped back to a
//     system status so the rest of the portal keeps working.
//
// Both mirror the TemplateFormModal's DrawerPanel shell. Managing customization
// is admin/owner only (a 403 surfaces a clear message). V1 custom fields are
// INTERNAL — even fields stored with a non-internal visibility must never be
// shown on public pages.

import { FormEvent, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/product-ui";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  FIELD_TYPE_LABELS,
  FIELD_TYPE_ORDER,
  FIELD_VISIBILITY_LABELS,
  STATUS_CATEGORY_LABELS,
  STATUS_CATEGORY_ORDER,
  PORTAL_CASE_STATUS_LABELS,
  PORTAL_CASE_STATUS_ORDER,
  createCaseStatus,
  createCustomField,
  isPortalForbiddenError,
  isSelectFieldType,
  slugifyKey,
  updateCaseStatus,
  updateCustomField,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type {
  CaseStatus,
  CustomField,
  CustomFieldOption,
  CustomFieldTarget,
  CustomFieldType,
  FieldVisibility,
  PortalCaseStatus,
  StatusCategory,
} from "@/types/portals";

function selectClass() {
  return "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
}

function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/** Friendly copy for a customization action error (admin-gated). */
function customizationErrorMessage(err: unknown, fallback: string): string {
  if (isPortalForbiddenError(err)) {
    return "Only organization owners and admins can change customization.";
  }
  if (err instanceof ApiError) return err.message;
  return fallback;
}

function ModalHeader({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
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
  );
}

// ---- Custom field form modal ------------------------------------------------

// An option row in the select builder. `rowKey` is a stable client id for React
// keys and reordering; `key` is the stored option key (slugified from label).
interface OptionDraft {
  rowKey: string;
  label: string;
}

let optionKeySeq = 0;
function nextOptionKey(): string {
  optionKeySeq += 1;
  return `opt-${optionKeySeq}`;
}

function optionFromField(option: CustomFieldOption): OptionDraft {
  return { rowKey: nextOptionKey(), label: option.label };
}

export interface CustomFieldFormModalProps {
  orgId: number;
  target: CustomFieldTarget;
  /** When set, edit this field; otherwise create a new one for `target`. */
  field?: CustomField;
  onClose: () => void;
  onSaved: (field: CustomField) => void;
}

export function CustomFieldFormModal({
  orgId,
  target,
  field,
  onClose,
  onSaved,
}: CustomFieldFormModalProps) {
  const isEdit = Boolean(field);

  const [label, setLabel] = useState(field?.label ?? "");
  const [description, setDescription] = useState(field?.description ?? "");
  const [fieldType, setFieldType] = useState<CustomFieldType>(
    field?.field_type ?? "short_text",
  );
  const [required, setRequired] = useState(field?.required ?? false);
  const [visibility, setVisibility] = useState<FieldVisibility>(
    field?.visibility ?? "internal",
  );
  const [options, setOptions] = useState<OptionDraft[]>(
    field && field.options.length > 0
      ? field.options.map(optionFromField)
      : [{ rowKey: nextOptionKey(), label: "" }],
  );

  const [labelTouched, setLabelTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(onClose);

  const labelEmpty = label.trim().length === 0;
  const keyPreview = field?.key ?? slugifyKey(label);
  const needsOptions = isSelectFieldType(fieldType);
  const filledOptions = options.filter((opt) => opt.label.trim().length > 0);
  const optionsMissing = needsOptions && filledOptions.length === 0;

  function updateOption(rowKey: string, value: string) {
    setOptions((prev) =>
      prev.map((opt) => (opt.rowKey === rowKey ? { ...opt, label: value } : opt)),
    );
  }

  function removeOption(rowKey: string) {
    setOptions((prev) => prev.filter((opt) => opt.rowKey !== rowKey));
  }

  function addOption() {
    setOptions((prev) => [...prev, { rowKey: nextOptionKey(), label: "" }]);
  }

  function moveOption(index: number, direction: -1 | 1) {
    setOptions((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  function buildOptions(): CustomFieldOption[] {
    return filledOptions.map((opt, index) => ({
      key: slugifyKey(opt.label) || `option_${index + 1}`,
      label: opt.label.trim(),
      sort_order: index,
    }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (labelEmpty) {
      setLabelTouched(true);
      return;
    }
    if (optionsMissing) {
      setError("Add at least one option for a select field.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const optionsPayload = needsOptions ? buildOptions() : undefined;
      const saved =
        isEdit && field
          ? await updateCustomField(orgId, field.id, {
              label: label.trim(),
              description: description.trim() || undefined,
              required,
              visibility,
              ...(optionsPayload ? { options: optionsPayload } : {}),
            })
          : await createCustomField(orgId, {
              label: label.trim(),
              description: description.trim() || undefined,
              target,
              field_type: fieldType,
              required,
              visibility,
              ...(optionsPayload ? { options: optionsPayload } : {}),
            });
      onSaved(saved);
    } catch (err) {
      setError(
        customizationErrorMessage(
          err,
          isEdit ? "Could not save this field." : "Could not create this field.",
        ),
      );
      setSubmitting(false);
    }
  }

  const targetLabel = target === "person" ? "person" : "case";

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label={isEdit ? "Edit custom field" : "New custom field"}
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <ModalHeader
          title={isEdit ? "Edit custom field" : "New custom field"}
          description={`An extra attribute your team fills in on each ${targetLabel}.`}
          onClose={onClose}
        />

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-label">
              Field label <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cf-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => setLabelTouched(true)}
              placeholder={
                target === "case"
                  ? "e.g. Visa reference number"
                  : "e.g. Date of birth"
              }
              aria-invalid={labelTouched && labelEmpty}
              disabled={submitting}
            />
            {labelTouched && labelEmpty ? (
              <p className="text-xs text-destructive">
                Give the field a clear label.
              </p>
            ) : keyPreview ? (
              <p className="text-xs text-muted-foreground">
                Key:{" "}
                <code className="rounded bg-muted px-1">{keyPreview}</code>
                {!isEdit && " (set automatically, can't change later)"}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-description">Description (optional)</Label>
            <Textarea
              id="cf-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="A short hint so your team fills it in consistently."
              disabled={submitting}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-type">Field type</Label>
              <select
                id="cf-type"
                value={fieldType}
                onChange={(e) =>
                  setFieldType(e.target.value as CustomFieldType)
                }
                className={selectClass()}
                disabled={submitting || isEdit}
              >
                {FIELD_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>
                    {FIELD_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              {isEdit && (
                <p className="text-xs text-muted-foreground">
                  Type can&apos;t change after a field is created.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-visibility">Visibility</Label>
              <select
                id="cf-visibility"
                value={visibility}
                onChange={(e) =>
                  setVisibility(e.target.value as FieldVisibility)
                }
                className={selectClass()}
                disabled={submitting}
              >
                {(
                  Object.keys(FIELD_VISIBILITY_LABELS) as FieldVisibility[]
                ).map((value) => (
                  <option key={value} value={value}>
                    {FIELD_VISIBILITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {visibility !== "internal" && (
            <InlineAlert tone="secure">
              Custom fields stay internal to your team for now. This setting is
              saved for a future update — it is never shown on public pages.
            </InlineAlert>
          )}

          {/* Options builder — only for the select field types. */}
          {needsOptions && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Options</Label>
                <span className="text-xs text-muted-foreground">
                  {filledOptions.length} with a label
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {options.map((option, index) => (
                  <li
                    key={option.rowKey}
                    className="flex items-center gap-2 rounded-xl border border-border p-2"
                  >
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => moveOption(index, -1)}
                        disabled={submitting || index === 0}
                        aria-label="Move option up"
                        className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowUp className="size-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveOption(index, 1)}
                        disabled={submitting || index === options.length - 1}
                        aria-label="Move option down"
                        className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                      >
                        <ArrowDown className="size-3.5" aria-hidden />
                      </button>
                    </div>
                    <Input
                      value={option.label}
                      onChange={(e) =>
                        updateOption(option.rowKey, e.target.value)
                      }
                      placeholder={`Option ${index + 1}`}
                      disabled={submitting}
                      className="h-9"
                    />
                    <button
                      type="button"
                      onClick={() => removeOption(option.rowKey)}
                      disabled={submitting || options.length === 1}
                      aria-label="Remove option"
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addOption}
                disabled={submitting}
                className="w-fit"
              >
                <Plus className="size-4" aria-hidden /> Add option
              </Button>
            </div>
          )}

          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              disabled={submitting}
              className="mt-0.5 size-4 shrink-0 rounded border-input"
            />
            <span>
              Required
              <span className="block text-xs text-muted-foreground">
                Your team must fill this in when editing the {targetLabel}.
              </span>
            </span>
          </label>

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
            <Button type="submit" disabled={submitting || labelEmpty}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Save changes" : "Create field"}
            </Button>
          </div>
        </form>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

// ---- Case status form modal -------------------------------------------------

// A calm default palette so a new status starts with a sensible color.
const STATUS_COLORS = [
  "#64748b",
  "#0ea5e9",
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
];

export interface CaseStatusFormModalProps {
  orgId: number;
  /** When set, edit this status; otherwise create a new one. */
  status?: CaseStatus;
  onClose: () => void;
  onSaved: (status: CaseStatus) => void;
}

export function CaseStatusFormModal({
  orgId,
  status,
  onClose,
  onSaved,
}: CaseStatusFormModalProps) {
  const isEdit = Boolean(status);

  const [label, setLabel] = useState(status?.label ?? "");
  const [description, setDescription] = useState(status?.description ?? "");
  const [category, setCategory] = useState<StatusCategory>(
    status?.category ?? "planning",
  );
  const [mapsTo, setMapsTo] = useState<PortalCaseStatus>(
    (status?.maps_to_system_status as PortalCaseStatus) ?? "draft",
  );
  const [color, setColor] = useState(status?.color || STATUS_COLORS[1]);
  const [icon, setIcon] = useState(status?.icon ?? "");
  const [isTerminal, setIsTerminal] = useState(status?.is_terminal ?? false);
  const [isDefault, setIsDefault] = useState(status?.is_default ?? false);

  const [labelTouched, setLabelTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(onClose);

  const labelEmpty = label.trim().length === 0;
  const keyPreview = status?.key ?? slugifyKey(label);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (labelEmpty) {
      setLabelTouched(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const saved =
        isEdit && status
          ? await updateCaseStatus(orgId, status.id, {
              label: label.trim(),
              description: description.trim() || undefined,
              category,
              maps_to_system_status: mapsTo,
              color,
              icon: icon.trim() || undefined,
              is_terminal: isTerminal,
              is_default: isDefault,
            })
          : await createCaseStatus(orgId, {
              label: label.trim(),
              description: description.trim() || undefined,
              category,
              maps_to_system_status: mapsTo,
              color,
              icon: icon.trim() || undefined,
              is_terminal: isTerminal,
              is_default: isDefault,
            });
      onSaved(saved);
    } catch (err) {
      setError(
        customizationErrorMessage(
          err,
          isEdit
            ? "Could not save this status."
            : "Could not create this status.",
        ),
      );
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label={isEdit ? "Edit case status" : "New case status"}
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <ModalHeader
          title={isEdit ? "Edit case status" : "New case status"}
          description="Your own stage name for a case. It maps to a system status so readiness and queues keep working."
          onClose={onClose}
        />

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-label">
              Status label <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cs-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => setLabelTouched(true)}
              placeholder="e.g. Awaiting embassy"
              aria-invalid={labelTouched && labelEmpty}
              disabled={submitting}
            />
            {labelTouched && labelEmpty ? (
              <p className="text-xs text-destructive">
                Give the status a clear label.
              </p>
            ) : keyPreview ? (
              <p className="text-xs text-muted-foreground">
                Key: <code className="rounded bg-muted px-1">{keyPreview}</code>
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-description">Description (optional)</Label>
            <Textarea
              id="cs-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this stage means, so your team uses it consistently."
              disabled={submitting}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cs-category">Category</Label>
              <select
                id="cs-category"
                value={category}
                onChange={(e) =>
                  setCategory(e.target.value as StatusCategory)
                }
                className={selectClass()}
                disabled={submitting}
              >
                {STATUS_CATEGORY_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_CATEGORY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cs-maps">Maps to system status</Label>
              <select
                id="cs-maps"
                value={mapsTo}
                onChange={(e) =>
                  setMapsTo(e.target.value as PortalCaseStatus)
                }
                className={selectClass()}
                disabled={submitting}
              >
                {PORTAL_CASE_STATUS_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {PORTAL_CASE_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Keeps readiness and queues in sync.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_COLORS.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setColor(value)}
                  aria-label={`Use color ${value}`}
                  aria-pressed={color.toLowerCase() === value.toLowerCase()}
                  disabled={submitting}
                  className={cn(
                    "size-7 rounded-full border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    color.toLowerCase() === value.toLowerCase()
                      ? "border-foreground ring-2 ring-foreground/30"
                      : "border-border",
                  )}
                  style={{ backgroundColor: value }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Custom color"
                disabled={submitting}
                className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent p-0.5"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-icon">Icon name (optional)</Label>
            <Input
              id="cs-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="e.g. clock"
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 size-4 shrink-0 rounded border-input"
              />
              <span>
                Default for new cases
                <span className="block text-xs text-muted-foreground">
                  New cases start in this status.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={isTerminal}
                onChange={(e) => setIsTerminal(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 size-4 shrink-0 rounded border-input"
              />
              <span>
                Terminal status
                <span className="block text-xs text-muted-foreground">
                  Closes the case&apos;s active workflow (e.g. submitted, closed).
                </span>
              </span>
            </label>
          </div>

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
            <Button type="submit" disabled={submitting || labelEmpty}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Save changes" : "Create status"}
            </Button>
          </div>
        </form>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}
