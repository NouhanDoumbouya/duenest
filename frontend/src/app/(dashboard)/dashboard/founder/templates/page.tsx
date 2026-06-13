"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  createChecklistTemplate,
  deactivateChecklistTemplate,
  getChecklistTemplates,
  updateChecklistTemplate,
} from "@/lib/founder";
import type { ChecklistTemplate, ChecklistTemplateItem } from "@/types/founder";

interface TemplateDraft {
  id?: number;
  title: string;
  description: string;
  checklist_type: string;
  document_type: string;
  use_case: string;
  country: string;
  is_system_template: boolean;
  is_active: boolean;
  sort_order: number;
  items: ChecklistTemplateItem[];
}

const emptyDraft: TemplateDraft = {
  title: "",
  description: "",
  checklist_type: "renewal",
  document_type: "",
  use_case: "",
  country: "",
  is_system_template: true,
  is_active: true,
  sort_order: 0,
  items: [],
};

function toDraft(template: ChecklistTemplate): TemplateDraft {
  return {
    id: template.id,
    title: template.title,
    description: template.description,
    checklist_type: template.checklist_type,
    document_type: template.document_type,
    use_case: template.use_case,
    country: template.country,
    is_system_template: template.is_system_template,
    is_active: template.is_active,
    sort_order: template.sort_order,
    items: template.items,
  };
}

export default function FounderTemplatesPage() {
  const [templates, setTemplates] = useState<ChecklistTemplate[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = useCallback((preferredId?: number | null) => {
    getChecklistTemplates()
      .then((page) => {
        const nextSelectedId = preferredId ?? page.results[0]?.id ?? null;
        const nextSelected =
          page.results.find((template) => template.id === nextSelectedId) ?? null;
        setTemplates(page.results);
        setSelectedId(nextSelectedId);
        if (nextSelected) setDraft(toDraft(nextSelected));
        setError(null);
      })
      .catch((err) => {
        setTemplates([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load templates.",
        );
      });
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  function updateItem(index: number, patch: Partial<ChecklistTemplateItem>) {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, i) =>
        i === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  async function saveTemplate() {
    setSaving(true);
    setError(null);
    try {
      if (draft.id) {
        await updateChecklistTemplate(draft.id, draft);
        loadTemplates(draft.id);
      } else {
        const created = await createChecklistTemplate(draft);
        setSelectedId(created.id);
        loadTemplates(created.id);
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to save template.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivateSelected() {
    if (!draft.id) return;
    setSaving(true);
    try {
      await deactivateChecklistTemplate(draft.id);
      loadTemplates(draft.id);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Unable to deactivate template.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-2xl font-semibold">
          Checklist templates
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage system checklist blueprints. Editing a template changes future
          checklist creation only; existing user checklists are not rewritten.
        </p>
      </div>

      {error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="size-5 text-primary" />
              Templates
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedId(null);
                setDraft(emptyDraft);
              }}
            >
              <Plus className="size-4" />
              New
            </Button>
          </CardHeader>
          <CardContent>
            {templates === null ? (
              <div className="h-[360px] animate-pulse rounded-lg bg-muted" />
            ) : templates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No checklist templates yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {templates.map((template) => (
                  <li key={template.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(template.id);
                        setDraft(toDraft(template));
                      }}
                      className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                        selectedId === template.id
                          ? "border-primary/30 bg-primary/5"
                          : "border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium">{template.title}</p>
                        <Badge variant={template.is_active ? "secondary" : "outline"}>
                          {template.is_active ? "active" : "inactive"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {template.items.length} item templates
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {draft.id ? "Edit template" : "Create template"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 sm:col-span-2">
                <Label>Title</Label>
                <Input
                  value={draft.title}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1 sm:col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={draft.description}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={3}
                />
              </label>
              <label className="space-y-1">
                <Label>Checklist type</Label>
                <select
                  value={draft.checklist_type}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      checklist_type: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {["renewal", "application", "travel", "insurance", "custom"].map(
                    (item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="space-y-1">
                <Label>Document type</Label>
                <Input
                  value={draft.document_type}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      document_type: event.target.value,
                    }))
                  }
                  placeholder="passport, visa, insurance"
                />
              </label>
              <label className="space-y-1">
                <Label>Use case</Label>
                <Input
                  value={draft.use_case}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      use_case: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="space-y-1">
                <Label>Country</Label>
                <Input
                  value={draft.country}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      country: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Item templates</p>
                  <p className="text-xs text-muted-foreground">
                    These become user-owned checklist items when a user creates
                    a checklist from this template.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      items: [
                        ...current.items,
                        {
                          title: "",
                          description: "",
                          is_required: true,
                          sort_order: current.items.length + 1,
                          suggested_due_offset_days: null,
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="size-4" />
                  Add item
                </Button>
              </div>

              {draft.items.map((item, index) => (
                <div
                  key={index}
                  className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_0.35fr_auto]"
                >
                  <label className="space-y-1">
                    <Label>Item title</Label>
                    <Input
                      value={item.title}
                      onChange={(event) =>
                        updateItem(index, { title: event.target.value })
                      }
                    />
                  </label>
                  <label className="space-y-1">
                    <Label>Sort</Label>
                    <Input
                      type="number"
                      value={item.sort_order}
                      onChange={(event) =>
                        updateItem(index, {
                          sort_order: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    className="self-end text-destructive hover:text-destructive"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        items: current.items.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <label className="space-y-1 sm:col-span-3">
                    <Label>Description</Label>
                    <Textarea
                      value={item.description}
                      onChange={(event) =>
                        updateItem(index, { description: event.target.value })
                      }
                      rows={2}
                    />
                  </label>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={saveTemplate} disabled={saving || !draft.title.trim()}>
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save template
              </Button>
              {draft.id && draft.is_active && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={deactivateSelected}
                  disabled={saving}
                >
                  Deactivate
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
