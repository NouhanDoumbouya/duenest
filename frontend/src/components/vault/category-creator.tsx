"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { createDocumentCategory } from "@/lib/documents";
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

export function CategoryCreator({
  existingNames,
  onCreated,
}: {
  /** Lowercased set of category names that already exist (system + own). */
  existingNames: Set<string>;
  onCreated: (category: DocumentCategory) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function create(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(trimmed);
    setError(null);
    try {
      const category = await createDocumentCategory({ name: trimmed });
      onCreated(category);
      setCustom("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create the category.",
      );
    } finally {
      setBusy(null);
    }
  }

  const suggestions = TEMPLATES.filter(
    (t) => !existingNames.has(t.toLowerCase()),
  );

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Add a category
      </p>
      {suggestions.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
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
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create(custom);
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
          {busy === custom.trim() ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Add
        </Button>
      </form>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
