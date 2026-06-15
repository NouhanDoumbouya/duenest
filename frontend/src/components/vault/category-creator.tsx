"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import {
  createDocumentCategory,
  deleteDocumentCategory,
  updateDocumentCategory,
} from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentCategory } from "@/types/documents";

// Common starting points; only those not already present are offered as chips.
const TEMPLATES = [
  "Identity",
  "Education",
  "Travel",
  "Finance",
  "Health",
  "Work",
  "Legal",
];

// A small, calm palette for tagging categories with a colour.
const SWATCHES = [
  "#2563EB",
  "#14B8A6",
  "#059669",
  "#D97706",
  "#DC2626",
  "#4F46E5",
  "#64748B",
];

function ColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category colour">
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(value === color ? "" : color)}
          aria-label={`Colour ${color}`}
          aria-pressed={value === color}
          className={cn(
            "size-5 rounded-full ring-offset-2 transition-all focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
            value === color ? "ring-2 ring-foreground" : "ring-0",
          )}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  );
}

export function CategoryCreator({
  categories,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  categories: DocumentCategory[];
  onCreated: (category: DocumentCategory) => void;
  onUpdated: (category: DocumentCategory) => void;
  onDeleted: (id: number) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [newColor, setNewColor] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Inline management state for the user's own categories.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const existingNames = new Set(categories.map((c) => c.name.toLowerCase()));
  const ownCategories = categories.filter((c) => !c.is_system);

  async function create(name: string, color = "") {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(trimmed);
    setError(null);
    try {
      const category = await createDocumentCategory({
        name: trimmed,
        ...(color ? { color } : {}),
      });
      onCreated(category);
      setCustom("");
      setNewColor("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create the category.",
      );
    } finally {
      setBusy(null);
    }
  }

  function startEdit(category: DocumentCategory) {
    setEditingId(category.id);
    setEditName(category.name);
    setEditColor(category.color);
    setError(null);
  }

  async function saveEdit(id: number) {
    const name = editName.trim();
    if (!name) return;
    setBusy(`edit-${id}`);
    setError(null);
    try {
      const updated = await updateDocumentCategory(id, { name, color: editColor });
      onUpdated(updated);
      setEditingId(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not update the category.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: number) {
    setBusy(`del-${id}`);
    setError(null);
    try {
      await deleteDocumentCategory(id);
      onDeleted(id);
      setConfirmDeleteId(null);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete the category.",
      );
    } finally {
      setBusy(null);
    }
  }

  const suggestions = TEMPLATES.filter(
    (t) => !existingNames.has(t.toLowerCase()),
  );

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {/* Manage the user's own categories */}
      {ownCategories.length > 0 && (
        <ul className="space-y-1.5">
          {ownCategories.map((cat) =>
            editingId === cat.id ? (
              <li key={cat.id} className="rounded-lg border border-border p-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  aria-label="Category name"
                  className="h-8"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <ColorSwatches value={editColor} onChange={setEditColor} />
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => saveEdit(cat.id)}
                      disabled={busy === `edit-${cat.id}`}
                    >
                      {busy === `edit-${cat.id}` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                      aria-label="Cancel"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ) : (
              <li
                key={cat.id}
                className="flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: cat.color || "var(--color-border)" }}
                    aria-hidden
                  />
                  <span className="truncate">{cat.name}</span>
                </span>
                {confirmDeleteId === cat.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => remove(cat.id)}
                      disabled={busy === `del-${cat.id}`}
                      className="rounded-md px-1.5 py-0.5 text-xs font-medium text-destructive hover:underline"
                    >
                      {busy === `del-${cat.id}` ? "Deleting…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-md px-1.5 py-0.5 text-xs text-muted-foreground hover:underline"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => startEdit(cat)}
                      aria-label={`Rename ${cat.name}`}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(cat.id)}
                      aria-label={`Delete ${cat.name}`}
                      className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </span>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      <p className="text-xs font-medium text-muted-foreground">Add a category</p>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => create(name)}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {busy === name ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                <Plus className="size-3" aria-hidden />
              )}
              {name}
            </button>
          ))}
        </div>
      )}
      <ColorSwatches value={newColor} onChange={setNewColor} />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create(custom, newColor);
        }}
      >
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Custom category name"
          aria-label="New category name"
          className="h-9"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={busy !== null || custom.trim().length === 0}
        >
          <Plus className="size-4" />
          Add
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
