"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useFocusTrap } from "@/lib/use-focus-trap";
import type { DocumentCategory } from "@/types/documents";

/**
 * Move selected File Inbox files into the Vault as documents, optionally under a
 * category. Each file becomes its own document (existing create-document flow);
 * nothing is deleted. Category is optional — organizing can always happen later.
 */
export function MoveToVaultDialog({
  open,
  count,
  categories,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  count: number;
  categories: DocumentCategory[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: (categoryId: number | null) => void;
}) {
  // Parent remounts this dialog when it opens (via key), so state is fresh.
  const [categoryId, setCategoryId] = useState<string>("");
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-vault-title"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="fixed inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
        onClick={() => !busy && onCancel()}
      />
      <div className="relative my-auto w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl shadow-foreground/10">
        <h2 id="move-vault-title" className="font-heading text-lg font-semibold">
          Move to Vault
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {count} file{count === 1 ? "" : "s"} will become document
          {count === 1 ? "" : "s"} in your Vault. You can organize the rest later.
        </p>

        <div className="mt-4 grid gap-2">
          <label
            htmlFor="move-vault-category"
            className="text-xs font-medium text-muted-foreground"
          >
            Category (optional)
          </label>
          <select
            id="move-vault-category"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(categoryId ? Number(categoryId) : null)}
            disabled={busy}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Move {count} to Vault
          </Button>
        </div>
      </div>
    </div>
  );
}
