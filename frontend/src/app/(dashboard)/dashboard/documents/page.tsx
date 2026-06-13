"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Filter,
  Loader2,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

import { DocumentCard } from "@/components/documents/document-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { deleteDocument, getDocuments } from "@/lib/documents";
import { getTags } from "@/lib/tags";
import { cn } from "@/lib/utils";
import type {
  DocumentListParams,
  DocumentOrdering,
  DocumentRecord,
  DocumentTag,
} from "@/types/documents";

type QuickFilter =
  | "all"
  | "needs_attention"
  | "expiring_soon"
  | "expired"
  | "missing_file"
  | "missing_expiry_date"
  | "archived";

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "expiring_soon", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
  { value: "missing_file", label: "Missing file" },
  { value: "missing_expiry_date", label: "Missing expiry date" },
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

function initialQuickFilter(): QuickFilter {
  if (typeof window === "undefined") return "all";
  const params = new URLSearchParams(window.location.search);
  if (params.get("attention") === "1") return "needs_attention";
  const quick = params.get("quick");
  return isQuickFilter(quick) ? quick : "all";
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

  if (quickFilter === "needs_attention") params.needs_attention = true;
  if (quickFilter === "expiring_soon") params.computed_status = "expiring_soon";
  if (quickFilter === "expired") params.computed_status = "expired";
  if (quickFilter === "missing_file") params.missing_file = true;
  if (quickFilter === "missing_expiry_date") params.missing_expiry_date = true;
  if (quickFilter === "archived") params.computed_status = "archived";

  return params;
}

export default function DocumentsPage() {
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] =
    useState<QuickFilter>(initialQuickFilter);
  const [documentType, setDocumentType] = useState("");
  const [country, setCountry] = useState("");
  const [issuer, setIssuer] = useState("");
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");
  const [tag, setTag] = useState<number | "">("");
  const [tags, setTags] = useState<DocumentTag[]>([]);
  const [ordering, setOrdering] = useState<DocumentOrdering>("-created_at");

  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [pendingDelete, setPendingDelete] = useState<DocumentRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const listParams = useMemo(
    () =>
      buildListParams({
        search,
        quickFilter,
        documentType,
        country,
        issuer,
        expiryFrom,
        expiryTo,
        tag,
        ordering,
      }),
    [
      search,
      quickFilter,
      documentType,
      country,
      issuer,
      expiryFrom,
      expiryTo,
      tag,
      ordering,
    ],
  );
  const queryKey = useMemo(() => JSON.stringify(listParams), [listParams]);

  useEffect(() => {
    let active = true;
    getDocuments(listParams)
      .then((page) => {
        if (!active) return;
        setDocuments(page.results);
        setTotal(page.count);
        setError(null);
        setLoadedQueryKey(queryKey);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Unable to load documents.",
        );
        setDocuments([]);
        setLoadedQueryKey(queryKey);
      });
    return () => {
      active = false;
    };
  }, [listParams, queryKey]);

  useEffect(() => {
    let active = true;
    getTags()
      .then((page) => active && setTags(page.results))
      .catch(() => active && setTags([]));
    return () => {
      active = false;
    };
  }, []);

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteDocument(pendingDelete.id);
      setDocuments((prev) =>
        (prev ?? []).filter((d) => d.id !== pendingDelete.id),
      );
      setTotal((n) => Math.max(0, n - 1));
      setPendingDelete(null);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not delete the document. Please try again.",
      );
      setPendingDelete(null);
    } finally {
      setDeleting(false);
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
    ordering !== "-created_at";
  const initialLoading = documents === null;
  const refreshing = documents !== null && loadedQueryKey !== queryKey;
  const docs = documents ?? [];

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
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <SlidersHorizontal className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium">Vault controls</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  DueNest uses dates, files, and renewal rules to show what
                  needs attention before it becomes urgent.
                </p>
              </div>
            </div>
            {refreshing && (
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Updating results
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Document quick filters">
            {QUICK_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                type="button"
                size="sm"
                variant={quickFilter === filter.value ? "default" : "outline"}
                onClick={() => setQuickFilter(filter.value)}
              >
                {filter.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
            <label className="relative block">
              <span className="sr-only">Search documents</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search title, issuer, country, reference..."
              />
            </label>

            <label className="block">
              <span className="sr-only">Document type</span>
              <Input
                className="h-11"
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value)}
                placeholder="Type, e.g. passport"
              />
            </label>

            <label className="block">
              <span className="sr-only">Issuer</span>
              <Input
                className="h-11"
                value={issuer}
                onChange={(event) => setIssuer(event.target.value)}
                placeholder="Issuer"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1.1fr_auto]">
            <label className="block">
              <span className="sr-only">Country</span>
              <Input
                className="h-10"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                placeholder="Country"
              />
            </label>
            <label className="block">
              <span className="sr-only">Filter by tag</span>
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
            <label className="block">
              <span className="sr-only">Expiry from</span>
              <Input
                type="date"
                className="h-10"
                value={expiryFrom}
                onChange={(event) => setExpiryFrom(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="sr-only">Expiry to</span>
              <Input
                type="date"
                className="h-10"
                value={expiryTo}
                onChange={(event) => setExpiryTo(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="sr-only">Sort documents</span>
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
            <Button
              type="button"
              variant="ghost"
              className="justify-center text-muted-foreground"
              onClick={clearFilters}
              disabled={!filtersActive}
            >
              <X className="size-4" />
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

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
                filtersActive
                  ? "No documents match these filters"
                  : "Start your document vault"
              }
              description={
                filtersActive
                  ? "Try clearing filters or adjusting your search."
                  : "Track passports, visas, licences, certificates, and important records around the dates that matter."
              }
              action={
                filtersActive ? (
                  <Button type="button" size="lg" onClick={clearFilters}>
                    <X className="size-4" />
                    Clear filters
                  </Button>
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
          </div>
          <div className="flex flex-col gap-4">
            {docs.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                onRequestDelete={setPendingDelete}
              />
            ))}
          </div>
          {total > docs.length && (
            <p className="text-center text-sm text-muted-foreground">
              Showing the first {docs.length} of {total} matching documents.
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Move document to trash?"
        description={
          pendingDelete
            ? `"${pendingDelete.title}" will be moved to Trash. You can restore it later, or delete it permanently from there.`
            : ""
        }
        confirmLabel="Move to trash"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </PageContainer>
  );
}
