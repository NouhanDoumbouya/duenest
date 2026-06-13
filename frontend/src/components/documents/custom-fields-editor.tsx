"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Preset {
  key: string;
  label: string;
}

// Suggested fields per document type. Matched by substring against the type.
const PRESETS: { match: string; fields: Preset[] }[] = [
  {
    match: "passport",
    fields: [
      { key: "passport_number", label: "Passport number" },
      { key: "nationality", label: "Nationality" },
      { key: "place_of_issue", label: "Place of issue" },
    ],
  },
  {
    match: "visa",
    fields: [
      { key: "visa_number", label: "Visa number" },
      { key: "visa_type", label: "Visa type" },
      { key: "sponsor", label: "Sponsor" },
    ],
  },
  {
    match: "insurance",
    fields: [
      { key: "policy_number", label: "Policy number" },
      { key: "provider", label: "Provider" },
      { key: "coverage_start", label: "Coverage start" },
      { key: "coverage_end", label: "Coverage end" },
    ],
  },
  {
    match: "contract",
    fields: [
      { key: "start_date", label: "Start date" },
      { key: "end_date", label: "End date" },
      { key: "notice_period", label: "Notice period" },
    ],
  },
  {
    match: "licen",
    fields: [
      { key: "license_number", label: "Licence number" },
      { key: "class", label: "Class" },
    ],
  },
];

function presetFor(documentType: string): Preset[] {
  const type = documentType.toLowerCase();
  return PRESETS.find((p) => type.includes(p.match))?.fields ?? [];
}

function humanize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Controlled editor for a document's type-specific custom fields. Shows
 * suggested fields for the document type plus any existing custom keys, and
 * lets the user add arbitrary key/value pairs.
 */
export function CustomFieldsEditor({
  documentType,
  value,
  onChange,
}: {
  documentType: string;
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const [newKey, setNewKey] = useState("");

  const suggested = presetFor(documentType);
  const suggestedKeys = suggested.map((s) => s.key);
  // Existing keys that aren't part of the suggested set (custom additions).
  const extraKeys = Object.keys(value).filter((k) => !suggestedKeys.includes(k));

  function setField(key: string, fieldValue: string) {
    onChange({ ...value, [key]: fieldValue });
  }

  function removeField(key: string) {
    const next = { ...value };
    delete next[key];
    onChange(next);
  }

  function addField() {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key || key in value) {
      setNewKey("");
      return;
    }
    onChange({ ...value, [key]: "" });
    setNewKey("");
  }

  return (
    <div className="space-y-4">
      {suggested.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {suggested.map((field) => (
            <div key={field.key} className="flex flex-col gap-2">
              <Label htmlFor={`cf-${field.key}`}>{field.label}</Label>
              <Input
                id={`cf-${field.key}`}
                className="h-10"
                value={value[field.key] ?? ""}
                onChange={(e) => setField(field.key, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      {extraKeys.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {extraKeys.map((key) => (
            <div key={key} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`cf-${key}`}>{humanize(key)}</Label>
                <button
                  type="button"
                  onClick={() => removeField(key)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${humanize(key)}`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <Input
                id={`cf-${key}`}
                className="h-10"
                value={value[key] ?? ""}
                onChange={(e) => setField(key, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="cf-new">Add a custom field</Label>
          <Input
            id="cf-new"
            className="h-10"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addField();
              }
            }}
            placeholder="e.g. Reference office"
          />
        </div>
        <Button type="button" variant="outline" onClick={addField} disabled={!newKey.trim()}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>
    </div>
  );
}
