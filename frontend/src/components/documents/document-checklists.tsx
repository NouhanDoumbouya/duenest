"use client";

import { useEffect, useState } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  ListChecks,
  Loader2,
  Plus,
  SkipForward,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import {
  createChecklistFromTemplate,
  createChecklistItem,
  createDocumentChecklist,
  deleteChecklistItem,
  deleteDocumentChecklist,
  getChecklistTemplates,
  getDocumentChecklists,
  updateChecklistItem,
} from "@/lib/renewal-workspace";
import { cn } from "@/lib/utils";
import type {
  Checklist,
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistTemplate,
} from "@/types/renewal-workspace";

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all",
          percent >= 100 ? "bg-brand-success" : "bg-primary",
        )}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function ChecklistItemRow({
  documentId,
  checklistId,
  item,
  onChanged,
  onDeleted,
}: {
  documentId: number;
  checklistId: number;
  item: ChecklistItem;
  onChanged: (item: ChecklistItem) => void;
  onDeleted: (itemId: number) => void;
}) {
  const [pending, setPending] = useState(false);

  async function setStatus(status: ChecklistItemStatus) {
    setPending(true);
    try {
      const updated = await updateChecklistItem(
        documentId,
        checklistId,
        item.id,
        { status },
      );
      onChanged(updated);
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    try {
      await deleteChecklistItem(documentId, checklistId, item.id);
      onDeleted(item.id);
    } finally {
      setPending(false);
    }
  }

  const done = item.status === "completed";
  const skipped = item.status === "skipped";

  return (
    <li className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
      <button
        type="button"
        onClick={() => setStatus(done ? "pending" : "completed")}
        disabled={pending}
        aria-label={done ? "Mark as pending" : "Mark as complete"}
        className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-primary disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : done ? (
          <CheckCircle2 className="size-4 text-brand-success" />
        ) : (
          <Circle className="size-4" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p
            className={cn(
              "text-sm font-medium",
              (done || skipped) && "text-muted-foreground line-through",
            )}
          >
            {item.title}
          </p>
          {item.is_required ? (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              Required
            </span>
          ) : (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Optional
            </span>
          )}
          {skipped && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              Skipped
            </span>
          )}
        </div>
        {item.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.description}
          </p>
        )}
        {item.due_date && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Due {formatDate(item.due_date)}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!skipped && !done && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setStatus("skipped")}
            disabled={pending}
            aria-label="Skip item"
            title="Skip"
          >
            <SkipForward className="size-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={remove}
          disabled={pending}
          aria-label="Delete item"
          title="Delete"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}

function ChecklistCard({
  documentId,
  checklist,
  onItemsChanged,
  onDeleted,
}: {
  documentId: number;
  checklist: Checklist;
  onItemsChanged: (checklist: Checklist) => void;
  onDeleted: (checklistId: number) => void;
}) {
  const [items, setItems] = useState<ChecklistItem[]>(checklist.items);
  const [progress, setProgress] = useState(checklist.progress);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-derive progress locally so the bar updates instantly. The backend is the
  // source of truth; we recompute from the items we currently hold.
  function recompute(nextItems: ChecklistItem[]) {
    const total = nextItems.length;
    const resolved = nextItems.filter(
      (i) => i.status === "completed" || i.status === "skipped",
    ).length;
    const requiredIncomplete = nextItems.filter(
      (i) =>
        i.is_required &&
        i.status !== "completed" &&
        i.status !== "skipped",
    ).length;
    const percent = total ? Math.round((resolved / total) * 100) : 0;
    setProgress((prev) => ({
      ...prev,
      percent,
      total_items: total,
      required_incomplete: requiredIncomplete,
    }));
  }

  function handleItemChanged(updated: ChecklistItem) {
    setItems((prev) => {
      const next = prev.map((i) => (i.id === updated.id ? updated : i));
      recompute(next);
      onItemsChanged({ ...checklist, items: next });
      return next;
    });
  }

  function handleItemDeleted(itemId: number) {
    setItems((prev) => {
      const next = prev.filter((i) => i.id !== itemId);
      recompute(next);
      return next;
    });
  }

  async function addItem() {
    const title = newItemTitle.trim();
    if (!title) return;
    setAdding(true);
    setError(null);
    try {
      const created = await createChecklistItem(documentId, checklist.id, {
        title,
      });
      setItems((prev) => {
        const next = [...prev, created];
        recompute(next);
        return next;
      });
      setNewItemTitle("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not add the item.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function removeChecklist() {
    if (!window.confirm(`Delete the checklist “${checklist.title}”?`)) return;
    await deleteDocumentChecklist(documentId, checklist.id);
    onDeleted(checklist.id);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{checklist.title}</p>
          {checklist.due_date && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Due {formatDate(checklist.due_date)}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={removeChecklist}
          aria-label="Delete checklist"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <ProgressBar percent={progress.percent} />
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
          {progress.percent}%
        </span>
      </div>
      {progress.required_incomplete > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          {progress.required_incomplete} required item
          {progress.required_incomplete === 1 ? "" : "s"} left
        </p>
      )}

      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <ChecklistItemRow
            key={item.id}
            documentId={documentId}
            checklistId={checklist.id}
            item={item}
            onChanged={handleItemChanged}
            onDeleted={handleItemDeleted}
          />
        ))}
        {items.length === 0 && (
          <li className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No items yet. Add the first task below.
          </li>
        )}
      </ul>

      {error && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <Input
          value={newItemTitle}
          onChange={(e) => setNewItemTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder="Add a task…"
          className="h-9"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={addItem}
          disabled={adding || !newItemTitle.trim()}
        >
          {adding ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Plus className="size-3.5" />
          )}
          Add
        </Button>
      </div>
    </div>
  );
}

export function DocumentChecklists({ documentId }: { documentId: number }) {
  const [checklists, setChecklists] = useState<Checklist[] | null>(null);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  useEffect(() => {
    let active = true;
    getDocumentChecklists(documentId)
      .then((page) => active && setChecklists(page.results))
      .catch((err) => {
        if (!active) return;
        setChecklists([]);
        setError(
          err instanceof ApiError ? err.message : "Unable to load checklists.",
        );
      });
    getChecklistTemplates()
      .then((page) => active && setTemplates(page.results))
      .catch(() => active && setTemplates([]));
    return () => {
      active = false;
    };
  }, [documentId]);

  async function createBlank() {
    const title = newTitle.trim();
    if (!title) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createDocumentChecklist(documentId, { title });
      setChecklists((prev) => [created, ...(prev ?? [])]);
      setNewTitle("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create the checklist.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function createFromTemplate() {
    if (!templateId) return;
    setApplyingTemplate(true);
    setError(null);
    try {
      const created = await createChecklistFromTemplate(documentId, {
        template: Number(templateId),
      });
      setChecklists((prev) => [created, ...(prev ?? [])]);
      setTemplateId("");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not create the checklist from the template.",
      );
    } finally {
      setApplyingTemplate(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/25 p-4">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ListChecks className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium">Preparation checklists</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Track exactly what you need to get ready before a renewal or
              application deadline.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {/* Create from template */}
              <div className="flex gap-2">
                <select
                  aria-label="Checklist template"
                  className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  <option value="">Start from a template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.item_count})
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  onClick={createFromTemplate}
                  disabled={!templateId || applyingTemplate}
                >
                  {applyingTemplate ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Use
                </Button>
              </div>

              {/* Create blank */}
              <div className="flex gap-2">
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      createBlank();
                    }
                  }}
                  placeholder="…or name a custom checklist"
                  className="h-10"
                />
                <Button onClick={createBlank} disabled={creating || !newTitle.trim()}>
                  {creating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                  Create
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {checklists === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading checklists…</span>
        </div>
      ) : checklists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium">No checklists yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Pick a template above or create a custom checklist to start
            preparing for this document’s renewal.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {checklists.map((checklist) => (
            <ChecklistCard
              key={checklist.id}
              documentId={documentId}
              checklist={checklist}
              onItemsChanged={(updated) =>
                setChecklists((prev) =>
                  (prev ?? []).map((c) =>
                    c.id === updated.id ? updated : c,
                  ),
                )
              }
              onDeleted={(id) =>
                setChecklists((prev) =>
                  (prev ?? []).filter((c) => c.id !== id),
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
