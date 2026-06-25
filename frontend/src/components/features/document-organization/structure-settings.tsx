"use client";

// Folder structure settings (organization portal, admins only). Binds to
// updateOrgStructurePreference: a structure_mode select plus the three
// auto-create / auto-file toggles. Auto-filing accepted uploads creates a vault
// copy owned by the organization owner — the helper copy says so plainly.

import { useState } from "react";
import { Loader2, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import {
  STRUCTURE_MODE_LABELS,
  updateOrgStructurePreference,
} from "@/lib/document-organization";
import { ApiError } from "@/lib/api";
import type {
  OrgStructurePreference,
  StructureMode,
  UpdateOrgStructureBody,
} from "@/types/document-organization";

const STRUCTURE_MODE_ORDER: StructureMode[] = [
  "by_person",
  "by_case",
  "by_document_type",
  "by_template",
  "custom",
];

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-3 rounded-lg border border-border p-3"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 rounded border-input"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export interface StructureSettingsProps {
  orgId: number;
  preference: OrgStructurePreference;
  onSaved: (preference: OrgStructurePreference) => void;
}

export function StructureSettings({
  orgId,
  preference,
  onSaved,
}: StructureSettingsProps) {
  const [mode, setMode] = useState<StructureMode>(preference.structure_mode);
  const [autoCase, setAutoCase] = useState(preference.auto_create_case_folder);
  const [autoPerson, setAutoPerson] = useState(
    preference.auto_create_person_folder,
  );
  const [autoFile, setAutoFile] = useState(
    preference.auto_file_accepted_uploads,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    mode !== preference.structure_mode ||
    autoCase !== preference.auto_create_case_folder ||
    autoPerson !== preference.auto_create_person_folder ||
    autoFile !== preference.auto_file_accepted_uploads;

  async function handleSave() {
    setSaving(true);
    setError(null);
    const body: UpdateOrgStructureBody = {
      structure_mode: mode,
      auto_create_case_folder: autoCase,
      auto_create_person_folder: autoPerson,
      auto_file_accepted_uploads: autoFile,
    };
    try {
      const next = await updateOrgStructurePreference(orgId, body);
      onSaved(next.preference);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("Only admins can change the folder structure.");
      } else {
        setError(
          err instanceof ApiError ? err.message : "Could not save settings.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Settings2 className="size-4 text-primary" aria-hidden />
        <h3 className="font-heading text-base font-semibold">
          Folder structure
        </h3>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="structure-mode">How should folders be organized?</Label>
        <select
          id="structure-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as StructureMode)}
          disabled={saving}
          className="h-9 w-full max-w-xs rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {STRUCTURE_MODE_ORDER.map((value) => (
            <option key={value} value={value}>
              {STRUCTURE_MODE_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <ToggleRow
          id="auto-person"
          label="Auto-create a folder for each person"
          description="When you add a person to the portal, create a matching folder for their documents."
          checked={autoPerson}
          onChange={setAutoPerson}
          disabled={saving}
        />
        <ToggleRow
          id="auto-case"
          label="Auto-create a folder for each case"
          description="When you create a case, create a matching folder so its documents stay together."
          checked={autoCase}
          onChange={setAutoCase}
          disabled={saving}
        />
        <ToggleRow
          id="auto-file"
          label="Auto-file accepted uploads"
          description="When a portal upload is accepted, file the resulting document into the case folder automatically."
          checked={autoFile}
          onChange={setAutoFile}
          disabled={saving}
        />
      </div>

      {autoFile && (
        <TrustNotice icon={Settings2} title="Where accepted uploads go">
          Auto-filing an accepted upload creates a vault copy owned by the
          organization owner and files it into the case folder. Recipients are
          never given a public link by this setting.
        </TrustNotice>
      )}

      {error && <InlineAlert>{error}</InlineAlert>}

      <div className="flex items-center justify-end">
        <Button onClick={() => void handleSave()} disabled={saving || !dirty}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Save settings
        </Button>
      </div>
    </section>
  );
}
