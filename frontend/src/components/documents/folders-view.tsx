"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Folder, FolderOpen, Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getDocuments } from "@/lib/documents";
import { cn } from "@/lib/utils";
import type { DocumentCategory } from "@/types/documents";

/** A category id, "none" (uncategorized), or "" (all). Mirrors the vault page. */
type CategorySelection = number | "none" | "";

/**
 * Folders view: the user's categories shown as familiar folder tiles, with live
 * document counts. It's the calm "browse by folder" entry point — opening a
 * folder drills into the status-rich document list for that category. Folders
 * are a lens here, not the spine: the vault still organizes by status.
 */
export function FoldersView({
  categories,
  onOpen,
}: {
  categories: DocumentCategory[];
  onOpen: (selection: CategorySelection) => void;
}) {
  // null = loading; a missing key = that count failed to load (shown as "—").
  const [counts, setCounts] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    let active = true;
    const reqs: { key: string; params: Record<string, unknown> }[] = [
      { key: "all", params: {} },
      ...categories.map((c) => ({ key: `c${c.id}`, params: { category: c.id } })),
      { key: "none", params: { category: "none" } },
    ];
    Promise.allSettled(
      reqs.map((r) => getDocuments({ ...r.params, page_size: 1 })),
    ).then((results) => {
      if (!active) return;
      const next: Record<string, number> = {};
      results.forEach((res, i) => {
        if (res.status === "fulfilled") next[reqs[i].key] = res.value.count;
      });
      setCounts(next);
    });
    return () => {
      active = false;
    };
  }, [categories]);

  const countFor = (key: string) => counts?.[key];
  const total = countFor("all");

  // Truly empty vault (no categories, no documents): guide the first add.
  if (counts && categories.length === 0 && (total ?? 0) === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={FileText}
            title="Start your document vault"
            description="Add a document and DueNest tracks its status and dates for you — no folders to keep tidy. Your vault surfaces what's expiring and what needs attention."
            action={
              <Link
                href="/dashboard/documents/new"
                className={cn(buttonVariants({ size: "lg" }))}
              >
                <Plus className="size-4" />
                Add your first document
              </Link>
            }
          />
        </CardContent>
      </Card>
    );
  }

  const tiles: {
    key: string;
    label: string;
    selection: CategorySelection;
    all?: boolean;
  }[] = [
    { key: "all", label: "All documents", selection: "", all: true },
    ...categories.map((c) => ({
      key: `c${c.id}`,
      label: c.name,
      selection: c.id as CategorySelection,
    })),
  ];
  // Only surface the Uncategorized bucket when it actually holds something.
  if ((countFor("none") ?? 0) > 0) {
    tiles.push({ key: "none", label: "Uncategorized", selection: "none" });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map((tile) => {
        const c = countFor(tile.key);
        const Icon = tile.all ? FolderOpen : Folder;
        return (
          <button
            key={tile.key}
            type="button"
            onClick={() => onOpen(tile.selection)}
            className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-card transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-xl",
                tile.all
                  ? "bg-brand-navy text-brand-teal"
                  : "bg-accent text-accent-foreground",
              )}
            >
              <Icon className="size-6" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-heading text-base font-semibold">
                {tile.label}
              </span>
              <span className="mt-0.5 block text-sm text-muted-foreground">
                {counts == null
                  ? "Counting…"
                  : c === undefined
                    ? "—"
                    : `${c} document${c === 1 ? "" : "s"}`}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
