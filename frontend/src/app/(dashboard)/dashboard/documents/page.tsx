"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Archive,
  CheckSquare,
  ChevronDown,
  Download,
  FileText,
  Filter,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  Table2,
  Trash2,
  X,
} from "lucide-react";

import { DocumentCard } from "@/components/documents/document-card";
import { DocumentsTable } from "@/components/documents/documents-table";
import { useFeature } from "@/components/features/feature-flags-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Toast, type ToastState } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import {
  createDocumentReminderRule,
  deleteDocument,
  getDocuments,
  listDocumentCategories,
  restoreDocument,
  updateDocument,
} from "@/lib/documents";
import {
  addDocumentsToBundle,
  exportSelectedDocuments,
  getBundles,
} from "@/lib/renewal-workspace";
import { getTags } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { getDeleteWarning, sortDocumentsByRisk } from "@/lib/vault";
import type {
  DocumentCategory,
  DocumentListParams,
  DocumentOrdering,
  DocumentRecord,
  DocumentTag,
} from "@/types/documents";
import type { Bundle } from "@/types/renewal-workspace";

type QuickFilter =
  | "all"
  | "needs_attention"
  | "expiring_soon"
  | "expired"
  | "missing_file"
  | "missing_expiry_date"
  | "shared"
  | "not_in_bundle"
  | "pinned"
  | "archived";

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "expiring_soon", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
  { value: "missing_file", label: "Missing file" },
  { value: "missing_expiry_date", label: "Missing expiry date" },
  { value: "pinned", label: "Pinned" },
  { value: "shared", label: "Shared" },
  { value: "not_in_bundle", label: "Not in bundle" },
  { value: "archived", label: "Archived" },
];

const ORDER_OPTIONS: { value: DocumentOrdering; label: string }[] = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "expiry_date", label: "Expiry date, soonest" },
  { value: "-expiry_date", label: "Expiry date, latest" },
  { value: "title", label: "Title A-Z" },
  { value: "-title", label: "Title Z-A" },
  { value: "-updated_at", label: "Recently updated" },
];

function isQuickFilter(value: string | null): value is QuickFilter {
  return QUICK_FILTERS.some((filter) => filter.value === value);
}

/** Inbound `?status=` aliases (e.g. from links) mapped to internal quick filters. */
const STATUS_ALIASES: Record<string, QuickFilter> = {
  expiring: "expiring_soon",
  expiring_soon: "expiring_soon",
  "expiring-soon": "expiring_soon",
  expired: "expired",
  "missing-file": "missing_file",
  missing_file: "missing_file",
  "missing-expiry": "missing_expiry_date",
  missing_expiry: "missing_expiry_date",
  missing_expiry_date: "missing_expiry_date",
  "needs-attention": "needs_attention",
  needs_attention: "needs_attention",
};

/**
 * Debounce a rapidly-changing value (e.g. a text input) so dependent work —
 * here, the documents fetch and URL sync — only runs after typing settles.
 */
function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Read a single query param from the current URL (client-only; "" on server). */
function readParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

function initialQuickFilter(): QuickFilter {
  if (typeof window === "undefined") return "all";
  const params = new URLSearchParams(window.location.search);
  if (params.get("attention") === "1") return "needs_attention";
  const quick = params.get("quick");
  if (isQuickFilter(quick)) return quick;
  const status = params.get("status");
  if (status) {
    if (STATUS_ALIASES[status]) return STATUS_ALIASES[status];
    if (isQuickFilter(status)) return status;
  }
  return "all";
}

function isOrdering(value: string): value is DocumentOrdering {
  return ORDER_OPTIONS.some((option) => option.value === value);
}

function initialOrdering(): DocumentOrdering {
  const raw = readParam("ordering");
  return isOrdering(raw) ? raw : "-created_at";
}

/** Parse a positive-integer id from a query param, or "" when absent/invalid. */
function initialId(name: string): number | "" {
  const raw = readParam(name);
  const n = Number(raw);
  return raw && Number.isInteger(n) && n > 0 ? n : "";
}

/** A selected category: a category id, "none" (uncategorized), or "" (all). */
type CategorySelection = number | "none" | "";

/** Read the initial category filter from the `?category=` query param. */
function initialCategory(): CategorySelection {
  const raw = readParam("category");
  if (!raw) return "";
  if (raw === "none" || raw === "uncategorized") return "none";
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : "";
}

function buildListParams({
  search,
  quickFilter,
  documentType,
  country,
  issuer,
  expiryFrom,
  expiryTo,
  tag,
  category,
  ordering,
}: {
  search: string;
  quickFilter: QuickFilter;
  documentType: string;
  country: string;
  issuer: string;
  expiryFrom: string;
  expiryTo: string;
  tag: number | "";
  category: CategorySelection;
  ordering: DocumentOrdering;
}): DocumentListParams {
  const params: DocumentListParams = { ordering };
  const trimmedSearch = search.trim();
  if (trimmedSearch) params.search = trimmedSearch;
  if (documentType.trim()) params.document_type = documentType.trim();
  if (country.trim()) params.country = country.trim();
  if (issuer.trim()) params.issuer = issuer.trim();
  if (expiryFrom) params.expiry_from = expiryFrom;
  if (expiryTo) params.expiry_to = expiryTo;
  if (tag !== "") params.tag = tag;
  if (category !== "") params.category = category;

  if (quickFilter === "needs_attention") params.needs_attention = true;
  if (quickFilter === "expiring_soon") params.computed_status = "expiring_soon";
  if (quickFilter === "expired") params.computed_status = "expired";
  if (quickFilter === "missing_file") params.missing_file = true;
  if (quickFilter === "missing_expiry_date") params.missing_expiry_date = true;
  if (quickFilter === "pinned") params.pinned = true;
  if (quickFilter === "shared") params.shared = true;
  if (quickFilter === "not_in_bundle") params.in_bundle = false;
  if (quickFilter === "archived") params.computed_status = "archived";

  return params;
}

function DocumentsPageInner() {
  // All filter state is seeded from the URL query string so links are shareable
  // and a refresh restores exactly what the user was looking at.
  const [search, setSearch] = useState(() => readParam("q"));
  const [quickFilter, setQuickFilter] =
    useState<QuickFilter>(initialQuickFilter);
  const [documentType, setDocumentType] = useState(() => readParam("type"));
  const [country, setCountry] = useState(() => readParam("country"));
  const [issuer, setIssuer] = useState(() => readParam("issuer"));
  const [expiryFrom, setExpiryFrom] = useState(() => readParam("expiry_from"));
  const [expiryTo, setExpiryTo] = useState(() => readParam("expiry_to"));
  const [tag, setTag] = useState<number | "">(() => initialId("tag"));
  const [tags, setTags] = useState<DocumentTag[]>([]);
  const [category, setCategory] = useState<CategorySelection>(initialCategory);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [ordering, setOrdering] = useState<DocumentOrdering>(initialOrdering);

  // Free-text inputs are debounced so we don't fetch (or rewrite the URL) on
  // every keystroke. Discrete controls (chips, selects, dates) apply instantly.
  const debouncedSearch = useDebouncedValue(search);
  const debouncedType = useDebouncedValue(documentType);
  const debouncedCountry = useDebouncedValue(country);
  const debouncedIssuer = useDebouncedValue(issuer);

  // Advanced filters collapse on small screens to keep the controls calm; they
  // are always visible from `lg` up regardless of this toggle.
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Grid/list toggle, remembered locally (item 176/197). Lazy init reads the
  // saved choice on the client; this inner component renders under Suspense so
  // there is no SSR/hydration mismatch.
  const tableViewEnabled = useFeature("vault_table_view");
  const [view, setView] = useState<"list" | "grid" | "table">(() => {
    if (typeof window === "undefined") return "list";
    const saved = window.localStorage.getItem("duenest.documentsView");
    if (saved === "grid" || saved === "table") return saved;
    return "list";
  });
  function changeView(next: "list" | "grid" | "table") {
    setView(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("duenest.documentsView", next);
    }
  }
  // If the table view was persisted but the feature is now off, fall back so the
  // user never lands on a hidden view.
  const effectiveView = view === "table" && !tableViewEnabled ? "list" : view;
  // Client-side "most urgent first" sort over the loaded results (kept separate
  // from the server `ordering` param, which has a fixed set of values).
  const [riskSort, setRiskSort] = useState(false);

  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Pagination: the list accumulates pages via "Load more". `hasNext` mirrors
  // the DRF `next` link; `loadingMore` guards the append request.
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // --- Vault bulk-select + undo (founder-gated) ---------------------------
  const bulkEnabled = useFeature("vault_bulk_actions");
  const undoEnabled = useFeature("vault_trash_undo");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // Pending destructive bulk action awaiting confirmation.
  const [bulkConfirm, setBulkConfirm] = useState<null | "trash" | "archive">(
    null,
  );
  const [toast, setToast] = useState<ToastState | null>(null);
  // Bumped to force a fresh reload of the current list after a bulk action.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);
  // Bundles for the "Add to pack" picker — only loaded when bulk is available.
  const [bundles, setBundles] = useState<Bundle[]>([]);
  // Secondary bulk actions live under a "More" popover to keep the bar calm.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    function onDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [moreOpen]);

  function toggleSelected(doc: DocumentRecord) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(doc.id)) next.delete(doc.id);
      else next.add(doc.id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  const listParams = useMemo(
    () =>
      buildListParams({
        search: debouncedSearch,
        quickFilter,
        documentType: debouncedType,
        country: debouncedCountry,
        issuer: debouncedIssuer,
        expiryFrom,
        expiryTo,
        tag,
        category,
        ordering,
      }),
    [
      debouncedSearch,
      quickFilter,
      debouncedType,
      debouncedCountry,
      debouncedIssuer,
      expiryFrom,
      expiryTo,
      tag,
      category,
      ordering,
    ],
  );
  const queryKey = useMemo(() => JSON.stringify(listParams), [listParams]);

  // Filters changed: reset to page 1 and load a fresh result set.
  useEffect(() => {
    let active = true;
    getDocuments({ ...listParams, page: 1 })
      .then((result) => {
        if (!active) return;
        setDocuments(result.results);
        setTotal(result.count);
        setHasNext(Boolean(result.next));
        setPage(1);
        setError(null);
        setLoadedQueryKey(queryKey);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Unable to load documents.",
        );
        setDocuments([]);
        setHasNext(false);
        setLoadedQueryKey(queryKey);
      });
    return () => {
      active = false;
    };
  }, [listParams, queryKey, reloadKey]);

  async function loadMore() {
    const nextPage = page + 1;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await getDocuments({ ...listParams, page: nextPage });
      setDocuments((prev) => [...(prev ?? []), ...result.results]);
      setHasNext(Boolean(result.next));
      setPage(nextPage);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to load more documents.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    let active = true;
    getTags()
      .then((page) => active && setTags(page.results))
      .catch(() => active && setTags([]));
    listDocumentCategories()
      .then((result) => active && setCategories(result))
      .catch(() => active && setCategories([]));
    return () => {
      active = false;
    };
  }, []);

  // Bundles power the bulk "Add to pack" picker; only fetched when the feature
  // is available so normal users never pay for it.
  useEffect(() => {
    if (!bulkEnabled) return;
    let active = true;
    getBundles()
      .then((page) => active && setBundles(page.results))
      .catch(() => active && setBundles([]));
    return () => {
      active = false;
    };
  }, [bulkEnabled]);

  // Keep the URL query string in sync with the active filters so the view is
  // shareable and survives a refresh. The canonical param set is rebuilt from
  // state, which also normalizes legacy params (e.g. a stale `?view=categories`
  // from the old Categories page) away. replaceState avoids polluting history.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    if (quickFilter !== "all") params.set("status", quickFilter);
    if (debouncedType.trim()) params.set("type", debouncedType.trim());
    if (debouncedCountry.trim()) params.set("country", debouncedCountry.trim());
    if (debouncedIssuer.trim()) params.set("issuer", debouncedIssuer.trim());
    if (expiryFrom) params.set("expiry_from", expiryFrom);
    if (expiryTo) params.set("expiry_to", expiryTo);
    if (tag !== "") params.set("tag", String(tag));
    if (category !== "") params.set("category", String(category));
    if (ordering !== "-created_at") params.set("ordering", ordering);

    const qs = params.toString();
    const next = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) {
      window.history.replaceState(null, "", next);
    }
  }, [
    debouncedSearch,
    quickFilter,
    debouncedType,
    debouncedCountry,
    debouncedIssuer,
    expiryFrom,
    expiryTo,
    tag,
    category,
    ordering,
  ]);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    const doc = pendingDelete;
    setDeleting(true);
    setError(null);
    try {
      await deleteDocument(doc.id);
      setDocuments((prev) => (prev ?? []).filter((d) => d.id !== doc.id));
      setTotal((n) => Math.max(0, n - 1));
      setPendingDelete(null);
      if (undoEnabled) {
        setToast({
          message: `“${doc.title}” moved to Trash.`,
          kind: "success",
          action: {
            label: "Undo",
            onClick: () => {
              void restoreDocument(doc.id)
                .then(() => {
                  setToast({ message: "Restored to Vault.", kind: "success" });
                  reload();
                })
                .catch(() =>
                  setToast({
                    message: "Could not restore. Try again from Trash.",
                    kind: "error",
                  }),
                );
            },
          },
        });
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not move the document to Trash. Your document is unchanged.",
      );
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  // --- Bulk actions over the current selection ----------------------------
  const selectedDocs = useMemo(
    () => (documents ?? []).filter((d) => selected.has(d.id)),
    [documents, selected],
  );

  async function runBulkMoveCategory(categoryId: number | null) {
    if (selectedDocs.length === 0) return;
    // Snapshot prior categories so the move is undoable.
    const prior = selectedDocs.map((d) => ({ id: d.id, category: d.category }));
    setBulkBusy(true);
    setError(null);
    try {
      await Promise.all(
        prior.map((p) => updateDocument(p.id, { category: categoryId })),
      );
      const name =
        categoryId === null
          ? "Uncategorized"
          : (categories.find((c) => c.id === categoryId)?.name ?? "category");
      exitSelectMode();
      reload();
      setToast({
        message: `Moved ${prior.length} document${prior.length === 1 ? "" : "s"} to ${name}.`,
        kind: "success",
        action: undoEnabled
          ? {
              label: "Undo",
              onClick: () => {
                void Promise.all(
                  prior.map((p) => updateDocument(p.id, { category: p.category })),
                )
                  .then(() => {
                    setToast({ message: "Move undone.", kind: "success" });
                    reload();
                  })
                  .catch(() =>
                    setToast({ message: "Could not undo the move.", kind: "error" }),
                  );
              },
            }
          : undefined,
      });
    } catch {
      setError(
        "Could not move the selected documents. They are unchanged in your Vault.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkAddTag(tagId: number) {
    if (selectedDocs.length === 0) return;
    // Snapshot prior tag sets so the change is undoable; append (never replace).
    const prior = selectedDocs.map((d) => ({
      id: d.id,
      tag_ids: d.tags.map((t) => t.id),
    }));
    setBulkBusy(true);
    setError(null);
    try {
      await Promise.all(
        prior.map((p) =>
          updateDocument(p.id, {
            tag_ids: Array.from(new Set([...p.tag_ids, tagId])),
          }),
        ),
      );
      const tagName = tags.find((t) => t.id === tagId)?.name ?? "tag";
      const count = prior.length;
      exitSelectMode();
      reload();
      setToast({
        message: `Tagged ${count} document${count === 1 ? "" : "s"} with “${tagName}”.`,
        kind: "success",
        action: undoEnabled
          ? {
              label: "Undo",
              onClick: () => {
                void Promise.all(
                  prior.map((p) => updateDocument(p.id, { tag_ids: p.tag_ids })),
                )
                  .then(() => {
                    setToast({ message: "Tag change undone.", kind: "success" });
                    reload();
                  })
                  .catch(() =>
                    setToast({ message: "Could not undo tagging.", kind: "error" }),
                  );
              },
            }
          : undefined,
      });
    } catch {
      setError(
        "Could not tag the selected documents. They are unchanged in your Vault.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkExport() {
    if (selectedDocs.length === 0) return;
    const ids = selectedDocs.map((d) => d.id);
    setBulkBusy(true);
    setError(null);
    try {
      await exportSelectedDocuments(ids);
      setToast({
        message: `Preparing a ZIP of ${ids.length} document${ids.length === 1 ? "" : "s"}. Originals are unchanged.`,
        kind: "success",
      });
      exitSelectMode();
    } catch (err) {
      const msg =
        err instanceof ApiError && err.status === 400
          ? "None of the selected documents have a file to export."
          : "Could not export the selected documents. They are unchanged.";
      setError(msg);
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkAddToPack(bundleId: number) {
    if (selectedDocs.length === 0) return;
    const ids = selectedDocs.map((d) => d.id);
    setBulkBusy(true);
    setError(null);
    try {
      const res = await addDocumentsToBundle(bundleId, ids);
      const name = bundles.find((b) => b.id === bundleId)?.title ?? "pack";
      exitSelectMode();
      setToast({
        message: `Added ${res.created} document${res.created === 1 ? "" : "s"} to ${name}. Original files are unchanged.`,
        kind: "success",
      });
    } catch {
      setError(
        "Could not add the selected documents to the pack. They are unchanged.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkSetReminder(daysBefore: number) {
    // Reminders only make sense for documents that have an expiry date.
    const withExpiry = selectedDocs.filter((d) => d.expiry_date);
    const skipped = selectedDocs.length - withExpiry.length;
    if (withExpiry.length === 0) {
      setToast({
        message: "None of the selected documents have an expiry date to remind on.",
        kind: "error",
      });
      return;
    }
    setBulkBusy(true);
    setError(null);
    try {
      await Promise.all(
        withExpiry.map((d) =>
          createDocumentReminderRule(d.id, {
            trigger_type: "before_expiry",
            days_before: daysBefore,
          }),
        ),
      );
      exitSelectMode();
      setToast({
        message:
          `Reminder set ${daysBefore} days before expiry for ${withExpiry.length} document${withExpiry.length === 1 ? "" : "s"}.` +
          (skipped > 0 ? ` ${skipped} skipped (no expiry date).` : ""),
        kind: "success",
      });
    } catch {
      setError("Could not set reminders for the selected documents.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkArchive() {
    if (selectedDocs.length === 0) return;
    const prior = selectedDocs.map((d) => ({
      id: d.id,
      lifecycle_status: d.lifecycle_status,
    }));
    setBulkBusy(true);
    setBulkConfirm(null);
    setError(null);
    try {
      await Promise.all(
        prior.map((p) => updateDocument(p.id, { lifecycle_status: "archived" })),
      );
      const count = prior.length;
      exitSelectMode();
      reload();
      setToast({
        message: `Archived ${count} document${count === 1 ? "" : "s"}.`,
        kind: "success",
        action: undoEnabled
          ? {
              label: "Undo",
              onClick: () => {
                void Promise.all(
                  prior.map((p) =>
                    updateDocument(p.id, { lifecycle_status: p.lifecycle_status }),
                  ),
                )
                  .then(() => {
                    setToast({ message: "Archive undone.", kind: "success" });
                    reload();
                  })
                  .catch(() =>
                    setToast({ message: "Could not undo archive.", kind: "error" }),
                  );
              },
            }
          : undefined,
      });
    } catch {
      setError(
        "Could not archive the selected documents. They are unchanged in your Vault.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function runBulkTrash() {
    if (selectedDocs.length === 0) return;
    const ids = selectedDocs.map((d) => d.id);
    setBulkBusy(true);
    setBulkConfirm(null);
    setError(null);
    try {
      await Promise.all(ids.map((id) => deleteDocument(id)));
      const count = ids.length;
      exitSelectMode();
      reload();
      setToast({
        message: `Moved ${count} document${count === 1 ? "" : "s"} to Trash.`,
        kind: "success",
        action: undoEnabled
          ? {
              label: "Undo",
              onClick: () => {
                void Promise.all(ids.map((id) => restoreDocument(id)))
                  .then(() => {
                    setToast({ message: "Restored to Vault.", kind: "success" });
                    reload();
                  })
                  .catch(() =>
                    setToast({
                      message: "Could not restore. Try again from Trash.",
                      kind: "error",
                    }),
                  );
              },
            }
          : undefined,
      });
    } catch {
      setError(
        "Could not move the selected documents to Trash. They are unchanged.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setQuickFilter("all");
    setDocumentType("");
    setCountry("");
    setIssuer("");
    setExpiryFrom("");
    setExpiryTo("");
    setTag("");
    setCategory("");
    setOrdering("-created_at");
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState(null, "", "/dashboard/documents");
    }
  }

  const filtersActive =
    search.trim() !== "" ||
    quickFilter !== "all" ||
    documentType.trim() !== "" ||
    country.trim() !== "" ||
    issuer.trim() !== "" ||
    expiryFrom !== "" ||
    expiryTo !== "" ||
    tag !== "" ||
    category !== "" ||
    ordering !== "-created_at";
  const categoryActive = category !== "";
  const selectedCategoryName =
    category === "none"
      ? "Uncategorized"
      : (categories.find((c) => c.id === category)?.name ?? null);

  // Removable summary of every active filter, so users can see and drop each one
  // individually without hunting through the controls (and without expanding the
  // advanced section on mobile).
  const activeChips: { key: string; label: string; onClear: () => void }[] = [];
  if (search.trim())
    activeChips.push({
      key: "q",
      label: `Search: "${search.trim()}"`,
      onClear: () => setSearch(""),
    });
  if (quickFilter !== "all")
    activeChips.push({
      key: "status",
      label: `Status: ${QUICK_FILTERS.find((f) => f.value === quickFilter)?.label ?? quickFilter}`,
      onClear: () => setQuickFilter("all"),
    });
  if (category !== "")
    activeChips.push({
      key: "category",
      label: `Category: ${selectedCategoryName ?? "Selected"}`,
      onClear: () => setCategory(""),
    });
  if (documentType.trim())
    activeChips.push({
      key: "type",
      label: `Type: ${documentType.trim()}`,
      onClear: () => setDocumentType(""),
    });
  if (country.trim())
    activeChips.push({
      key: "country",
      label: `Country: ${country.trim()}`,
      onClear: () => setCountry(""),
    });
  if (issuer.trim())
    activeChips.push({
      key: "issuer",
      label: `Issuer: ${issuer.trim()}`,
      onClear: () => setIssuer(""),
    });
  if (tag !== "")
    activeChips.push({
      key: "tag",
      label: `Tag: ${tags.find((t) => t.id === tag)?.name ?? tag}`,
      onClear: () => setTag(""),
    });
  if (expiryFrom)
    activeChips.push({
      key: "expiry_from",
      label: `From: ${expiryFrom}`,
      onClear: () => setExpiryFrom(""),
    });
  if (expiryTo)
    activeChips.push({
      key: "expiry_to",
      label: `To: ${expiryTo}`,
      onClear: () => setExpiryTo(""),
    });
  if (ordering !== "-created_at")
    activeChips.push({
      key: "ordering",
      label: `Sort: ${ORDER_OPTIONS.find((o) => o.value === ordering)?.label ?? ordering}`,
      onClear: () => setOrdering("-created_at"),
    });

  const initialLoading = documents === null;
  const refreshing = documents !== null && loadedQueryKey !== queryKey;
  const docs = documents ?? [];
  const displayedDocs = useMemo(() => {
    const list = documents ?? [];
    return riskSort ? sortDocumentsByRisk(list) : list;
  }, [documents, riskSort]);

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Vault"
        title="Document vault"
        description="A calm workspace for passports, visas, licences, certificates, policies, and the dates that make them risky."
        actions={
          <Link
            href="/dashboard/documents/new"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            <Plus className="size-4" />
            Add document
          </Link>
        }
      />

      <Card>
        <CardContent className="space-y-4">
          {/* Search is the single primary control; everything else is secondary
              (status chips) or tucked behind the "More filters" disclosure. */}
          <label className="relative block">
            <span className="sr-only">Search documents</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-11 pr-10 pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, issuer, country, reference..."
            />
            {refreshing && (
              <Loader2
                className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
                aria-label="Updating results"
              />
            )}
          </label>

          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
            role="group"
            aria-label="Filter by status"
          >
            {QUICK_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                type="button"
                size="sm"
                variant={quickFilter === filter.value ? "default" : "outline"}
                aria-pressed={quickFilter === filter.value}
                onClick={() => setQuickFilter(filter.value)}
                className="shrink-0"
              >
                {filter.label}
              </Button>
            ))}
          </div>

          {(categories.length > 0 || categoryActive) && (
            <div className="space-y-2">
              <p
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
                id="category-filter-label"
              >
                Browse by category
              </p>
              <div
                className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
                role="group"
                aria-labelledby="category-filter-label"
              >
                <Button
                  type="button"
                  size="sm"
                  variant={category === "" ? "default" : "outline"}
                  aria-pressed={category === ""}
                  onClick={() => setCategory("")}
                  className="shrink-0"
                >
                  All categories
                </Button>
                {categories.map((c) => (
                  <Button
                    key={c.id}
                    type="button"
                    size="sm"
                    variant={category === c.id ? "default" : "outline"}
                    aria-pressed={category === c.id}
                    onClick={() => setCategory(c.id)}
                    className="shrink-0"
                  >
                    {c.name}
                  </Button>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant={category === "none" ? "default" : "outline"}
                  aria-pressed={category === "none"}
                  onClick={() => setCategory("none")}
                  className="shrink-0"
                >
                  Uncategorized
                </Button>
              </div>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              aria-controls="advanced-filters"
              className="flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Filter className="size-4" aria-hidden />
              More filters
              <ChevronDown
                className={cn(
                  "size-4 transition-transform",
                  showAdvanced && "rotate-180",
                )}
                aria-hidden
              />
            </button>

            <div
              id="advanced-filters"
              className={cn(
                "mt-3 gap-3 sm:grid-cols-2 lg:grid-cols-4",
                showAdvanced ? "grid" : "hidden",
              )}
            >
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Type
                </span>
                <Input
                  className="h-10"
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value)}
                  placeholder="e.g. passport"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Issuer
                </span>
                <Input
                  className="h-10"
                  value={issuer}
                  onChange={(event) => setIssuer(event.target.value)}
                  placeholder="e.g. HMPO"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Country
                </span>
                <Input
                  className="h-10"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  placeholder="e.g. UK"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Tag
                </span>
                <select
                  className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={tag}
                  onChange={(event) =>
                    setTag(event.target.value === "" ? "" : Number(event.target.value))
                  }
                  disabled={tags.length === 0}
                >
                  <option value="">All tags</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Expiry from
                </span>
                <Input
                  type="date"
                  className="h-10"
                  value={expiryFrom}
                  onChange={(event) => setExpiryFrom(event.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Expiry to
                </span>
                <Input
                  type="date"
                  className="h-10"
                  value={expiryTo}
                  onChange={(event) => setExpiryTo(event.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Sort
                </span>
                <select
                  className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={ordering}
                  onChange={(event) =>
                    setOrdering(event.target.value as DocumentOrdering)
                  }
                >
                  {ORDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-10 w-full justify-center text-muted-foreground"
                  onClick={clearFilters}
                  disabled={!filtersActive}
                >
                  <X className="size-4" />
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {activeChips.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Active filters"
        >
          <span className="text-sm text-muted-foreground">Filters:</span>
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onClear}
              aria-label={`Remove filter: ${chip.label}`}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 py-1 pr-1.5 pl-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {chip.label}
              <X className="size-3.5 text-muted-foreground" aria-hidden />
            </button>
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Clear all
          </button>
        </div>
      )}

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {initialLoading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[150px] w-full rounded-xl" />
          ))}
        </div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={filtersActive ? Filter : FileText}
              title={
                categoryActive
                  ? selectedCategoryName
                    ? `No documents in ${selectedCategoryName}`
                    : "No documents found in this category"
                  : filtersActive
                    ? "No documents match these filters"
                    : "Start your document vault"
              }
              description={
                categoryActive
                  ? "Try another category, clear filters, or add a document."
                  : filtersActive
                    ? "Try clearing filters or adjusting your search."
                    : "Track passports, visas, licences, certificates, and important records around the dates that matter."
              }
              action={
                filtersActive ? (
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <Button type="button" size="lg" onClick={clearFilters}>
                      <X className="size-4" />
                      Clear filters
                    </Button>
                    {categoryActive && (
                      <Link
                        href="/dashboard/documents/new"
                        className={cn(
                          buttonVariants({ size: "lg", variant: "outline" }),
                        )}
                      >
                        <Plus className="size-4" />
                        Add document
                      </Link>
                    )}
                  </div>
                ) : (
                  <Link
                    href="/dashboard/documents/new"
                    className={cn(buttonVariants({ size: "lg" }))}
                  >
                    <Plus className="size-4" />
                    Add your first document
                  </Link>
                )
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <p>
              Showing {docs.length} of {total}{" "}
              {filtersActive ? "matching documents" : "documents"}
            </p>
            <div className="flex items-center gap-2">
              {bulkEnabled &&
                (selectMode ? (
                  <button
                    type="button"
                    onClick={exitSelectMode}
                    className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSelectMode(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <CheckSquare className="size-3.5" aria-hidden />
                    Select
                  </button>
                ))}
              <button
                type="button"
                onClick={() => setRiskSort((v) => !v)}
                aria-pressed={riskSort}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  riskSort
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
                title="Sort the loaded documents with the most urgent first"
              >
                Most urgent first
              </button>
              <div
                className="inline-flex items-center rounded-lg border border-border p-0.5"
                role="group"
                aria-label="Document view"
              >
              <button
                type="button"
                onClick={() => changeView("list")}
                aria-pressed={effectiveView === "list"}
                aria-label="List view"
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  effectiveView === "list"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => changeView("grid")}
                aria-pressed={effectiveView === "grid"}
                aria-label="Grid view"
                className={cn(
                  "flex size-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                  effectiveView === "grid"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-4" aria-hidden />
              </button>
              {tableViewEnabled && (
                <button
                  type="button"
                  onClick={() => changeView("table")}
                  aria-pressed={effectiveView === "table"}
                  aria-label="Table view"
                  className={cn(
                    "flex size-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                    effectiveView === "table"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Table2 className="size-4" aria-hidden />
                </button>
              )}
              </div>
            </div>
          </div>
          {effectiveView === "table" ? (
            <DocumentsTable
              docs={displayedDocs}
              selectable={selectMode}
              selectedIds={selected}
              onToggleSelect={toggleSelected}
              onRequestDelete={setPendingDelete}
            />
          ) : (
            <div
              className={cn(
                effectiveView === "grid"
                  ? "grid gap-4 lg:grid-cols-2"
                  : "flex flex-col gap-4",
              )}
            >
              {displayedDocs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onRequestDelete={setPendingDelete}
                  selectable={selectMode}
                  selected={selected.has(doc.id)}
                  onToggleSelect={toggleSelected}
                />
              ))}
            </div>
          )}
          {hasNext && (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Loading
                  </>
                ) : (
                  <>Load more ({total - docs.length} remaining)</>
                )}
              </Button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Move document to trash?"
        description={
          pendingDelete
            ? [
                `"${pendingDelete.title}" will be moved to Trash. You can restore it later, or delete it permanently from there.`,
                getDeleteWarning(pendingDelete),
              ]
                .filter(Boolean)
                .join(" ")
            : ""
        }
        confirmLabel="Move to trash"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* Bulk action bar — only in select mode with a non-empty selection. */}
      {bulkEnabled && selectMode && selected.size > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="vault-bar-in pointer-events-auto flex w-full max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-lg shadow-foreground/10">
            <span className="px-1 text-sm font-medium">
              {selected.size} selected
            </span>
            <button
              type="button"
              onClick={() =>
                setSelected(new Set(displayedDocs.map((d) => d.id)))
              }
              className="rounded-lg px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Select all
            </button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {/* Primary actions stay inline; everything else lives under More. */}
              <select
                aria-label="Move selected to category"
                value=""
                disabled={bulkBusy}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  void runBulkMoveCategory(v === "none" ? null : Number(v));
                }}
                className="h-9 rounded-lg border border-input bg-card px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="">Move to category…</option>
                <option value="none">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <div className="relative" ref={moreRef}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bulkBusy}
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  onClick={() => setMoreOpen((v) => !v)}
                >
                  {bulkBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <ChevronDown className="size-4" />
                  )}
                  More
                </Button>
                {moreOpen && (
                  <div
                    role="menu"
                    className="vault-bar-in absolute right-0 bottom-full z-10 mb-2 flex w-56 flex-col gap-2 rounded-xl border border-border bg-card p-2 shadow-lg shadow-foreground/10"
                  >
                    {tags.length > 0 && (
                      <select
                        aria-label="Add a tag to selected"
                        value=""
                        disabled={bulkBusy}
                        onChange={(e) => {
                          if (e.target.value)
                            void runBulkAddTag(Number(e.target.value));
                        }}
                        className="h-9 w-full rounded-lg border border-input bg-card px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <option value="">Add tag…</option>
                        {tags.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    )}
                    {bundles.length > 0 && (
                      <select
                        aria-label="Add selected to a pack"
                        value=""
                        disabled={bulkBusy}
                        onChange={(e) => {
                          if (e.target.value)
                            void runBulkAddToPack(Number(e.target.value));
                        }}
                        className="h-9 w-full rounded-lg border border-input bg-card px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <option value="">Add to pack…</option>
                        {bundles.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.title}
                          </option>
                        ))}
                      </select>
                    )}
                    <select
                      aria-label="Set a reminder for selected"
                      value=""
                      disabled={bulkBusy}
                      onChange={(e) => {
                        if (e.target.value)
                          void runBulkSetReminder(Number(e.target.value));
                      }}
                      className="h-9 w-full rounded-lg border border-input bg-card px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <option value="">Set reminder…</option>
                      <option value="30">30 days before expiry</option>
                      <option value="60">60 days before expiry</option>
                      <option value="90">90 days before expiry</option>
                    </select>
                    <button
                      type="button"
                      disabled={bulkBusy}
                      onClick={() => {
                        setMoreOpen(false);
                        void runBulkExport();
                      }}
                      className="flex h-9 items-center gap-2 rounded-lg px-2 text-left text-xs hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <Download className="size-4" />
                      Export selected
                    </button>
                  </div>
                )}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulkBusy}
                onClick={() => setBulkConfirm("archive")}
              >
                <Archive className="size-4" />
                Archive
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bulkBusy}
                onClick={() => setBulkConfirm("trash")}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Trash
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={bulkConfirm !== null}
        title={
          bulkConfirm === "archive"
            ? `Archive ${selected.size} document${selected.size === 1 ? "" : "s"}?`
            : `Move ${selected.size} document${selected.size === 1 ? "" : "s"} to Trash?`
        }
        description={
          bulkConfirm === "archive"
            ? "Archived documents leave your active views but stay in your Vault. You can undo this."
            : "They will be moved to Trash. You can restore them later, or delete them permanently from there. This will not remove them from packs automatically."
        }
        confirmLabel={bulkConfirm === "archive" ? "Archive" : "Move to trash"}
        loading={bulkBusy}
        onConfirm={bulkConfirm === "archive" ? runBulkArchive : runBulkTrash}
        onCancel={() => setBulkConfirm(null)}
      />

      <Toast toast={toast} onDismiss={() => setToast(null)} duration={6000} />
    </PageContainer>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={null}>
      <DocumentsPageInner />
    </Suspense>
  );
}
