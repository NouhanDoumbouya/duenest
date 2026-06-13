"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Tag as TagIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { createTag, getTags, tagColorClass } from "@/lib/tags";
import { cn } from "@/lib/utils";
import type { DocumentTag } from "@/types/documents";

/**
 * Controlled multi-select for the owner's tags, with inline create. Emits the
 * selected tag ids; new tags are created on the backend before being selected.
 */
export function TagSelector({
  selectedIds,
  onChange,
}: {
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const [tags, setTags] = useState<DocumentTag[] | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getTags()
      .then((page) => active && setTags(page.results))
      .catch(() => active && setTags([]));
    return () => {
      active = false;
    };
  }, []);

  function toggle(id: number) {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const tag = await createTag({ name });
      setTags((prev) => [...(prev ?? []), tag]);
      onChange([...selectedIds, tag.id]);
      setNewName("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create the tag.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      {tags === null ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>Loading tags…</span>
        </div>
      ) : tags.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tags yet — create one below.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => {
            const active = selectedIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id)}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? tagColorClass(tag.color)
                    : "border border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {active ? (
                  <Check className="size-3" />
                ) : (
                  <TagIcon className="size-3" />
                )}
                {tag.name}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Input
          className="h-9"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreate();
            }
          }}
          placeholder="New tag name"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add tag
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
