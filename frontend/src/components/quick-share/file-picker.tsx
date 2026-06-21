"use client";

// A compact, mobile-friendly file picker for the SafeSend wizard.
//
// Documents load first; a document's files load lazily when it is expanded.
// Selection is tracked by file id and surfaced back to the parent wizard.

import { useEffect, useState } from "react";
import {
  ChevronDown,
  FileText,
  Inbox,
  Layers,
  Loader2,
  Search,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { getDocuments } from "@/lib/documents";
import {
  getDocumentFiles,
  getFileInbox,
  formatFileSize,
} from "@/lib/document-files";
import { getBundles } from "@/lib/renewal-workspace";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types/documents";
import type { DocumentFile } from "@/types/document-files";
import type { Bundle } from "@/types/renewal-workspace";

export interface SelectedFile {
  id: number;
  name: string;
  size: number;
  documentTitle: string;
  // Optional parent-document context, used for share readiness warnings. Inbox
  // files have no parent document, so these stay undefined.
  documentType?: string;
  documentExpired?: boolean;
  documentMissingExpiry?: boolean;
}

export interface SelectedBundle {
  id: number;
  title: string;
  requirementCount: number;
  // True when the bundle is not fully ready (some requirements have no file yet).
  incomplete?: boolean;
}

export function FilePicker({
  selected,
  onToggle,
  selectedBundles,
  onToggleBundle,
}: {
  selected: Map<number, SelectedFile>;
  onToggle: (file: SelectedFile) => void;
  selectedBundles?: Map<number, SelectedBundle>;
  onToggleBundle?: (bundle: SelectedBundle) => void;
}) {
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [inboxFiles, setInboxFiles] = useState<DocumentFile[] | null>(null);
  const [bundles, setBundles] = useState<Bundle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filesByDoc, setFilesByDoc] = useState<Record<number, DocumentFile[]>>(
    {},
  );
  const [loadingDoc, setLoadingDoc] = useState<number | null>(null);

  const bundlesEnabled = Boolean(onToggleBundle);

  useEffect(() => {
    let active = true;
    Promise.all([
      getDocuments({ has_file: true }),
      getFileInbox(),
      bundlesEnabled
        ? getBundles().then((r) => r.results)
        : Promise.resolve([] as Bundle[]),
    ])
      .then(([documentResult, inboxResult, bundleResult]) => {
        if (!active) return;
        setDocuments(documentResult.results);
        setInboxFiles(inboxResult.results);
        setBundles(bundleResult);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof ApiError ? err.message : "Could not load your documents.",
          );
      });
    return () => {
      active = false;
    };
  }, [bundlesEnabled]);

  async function toggleExpand(doc: DocumentRecord) {
    if (expanded === doc.id) {
      setExpanded(null);
      return;
    }
    setExpanded(doc.id);
    if (!filesByDoc[doc.id]) {
      setLoadingDoc(doc.id);
      try {
        const res = await getDocumentFiles(doc.id);
        setFilesByDoc((prev) => ({ ...prev, [doc.id]: res.results }));
      } catch {
        setFilesByDoc((prev) => ({ ...prev, [doc.id]: [] }));
      } finally {
        setLoadingDoc(null);
      }
    }
  }

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (documents === null || inboxFiles === null) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const filtered = query
    ? documents.filter((d) =>
        d.title.toLowerCase().includes(query.toLowerCase()),
      )
    : documents;
  const filteredInboxFiles = query
    ? inboxFiles.filter((file) =>
        file.original_filename.toLowerCase().includes(query.toLowerCase()),
      )
    : inboxFiles;
  const allBundles = bundles ?? [];
  const filteredBundles = query
    ? allBundles.filter((b) =>
        b.title.toLowerCase().includes(query.toLowerCase()),
      )
    : allBundles;

  if (
    documents.length === 0 &&
    inboxFiles.length === 0 &&
    allBundles.length === 0
  ) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        You have no files yet. Upload to File Inbox or add a document file,
        then come back to share it.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents"
          className="pl-9"
        />
      </div>

      <ul className="space-y-2">
        {bundlesEnabled && filteredBundles.length > 0 && (
          <li className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Layers className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">Bundles</p>
                <p className="text-xs text-muted-foreground">
                  Share a whole pack — its attached files go together
                </p>
              </div>
            </div>
            <div className="bg-muted/20 p-2">
              <ul className="space-y-1">
                {filteredBundles.map((bundle) => {
                  const checked = selectedBundles?.has(bundle.id) ?? false;
                  return (
                    <li key={bundle.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors",
                          checked ? "bg-primary/10" : "hover:bg-card",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            onToggleBundle?.({
                              id: bundle.id,
                              title: bundle.title,
                              requirementCount: bundle.requirement_count,
                              incomplete: bundle.readiness_score < 100,
                            })
                          }
                          className="size-4 accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {bundle.title}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {bundle.requirement_count} item
                            {bundle.requirement_count === 1 ? "" : "s"} ·{" "}
                            {bundle.readiness_score}% ready
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        )}

        {filteredInboxFiles.length > 0 && (
          <li className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Inbox className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">File Inbox</p>
                <p className="text-xs text-muted-foreground">
                  Files uploaded before choosing a document
                </p>
              </div>
            </div>
            <div className="bg-muted/20 p-2">
              <ul className="space-y-1">
                {filteredInboxFiles.map((file) => {
                  const checked = selected.has(file.id);
                  return (
                    <li key={file.id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors",
                          checked ? "bg-primary/10" : "hover:bg-card",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            onToggle({
                              id: file.id,
                              name: file.original_filename,
                              size: file.file_size,
                              documentTitle: "File Inbox",
                            })
                          }
                          className="size-4 accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">
                            {file.original_filename}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatFileSize(file.file_size)}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        )}

        {filtered.map((doc) => {
          const isOpen = expanded === doc.id;
          const files = filesByDoc[doc.id] ?? [];
          const selectedCount = files.filter((f) =>
            selected.has(f.id),
          ).length;
          return (
            <li
              key={doc.id}
              className="overflow-hidden rounded-xl border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => toggleExpand(doc)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <FileText className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {doc.title}
                    </span>
                    {doc.document_type && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {doc.document_type}
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {selectedCount > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      {selectedCount} selected
                    </span>
                  )}
                  <ChevronDown
                    className={cn(
                      "size-4 text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180",
                    )}
                  />
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-border bg-muted/20 p-2">
                  {loadingDoc === doc.id ? (
                    <p className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> Loading files…
                    </p>
                  ) : files.length === 0 ? (
                    <p className="p-2 text-sm text-muted-foreground">
                      No files in this document.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {files.map((file) => {
                        const checked = selected.has(file.id);
                        return (
                          <li key={file.id}>
                            <label
                              className={cn(
                                "flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors",
                                checked
                                  ? "bg-primary/10"
                                  : "hover:bg-card",
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() =>
                                  onToggle({
                                    id: file.id,
                                    name: file.original_filename,
                                    size: file.file_size,
                                    documentTitle: doc.title,
                                    documentType: doc.document_type,
                                    documentExpired: doc.is_expired,
                                    documentMissingExpiry: doc.missing_expiry_date,
                                  })
                                }
                                className="size-4 accent-primary"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm">
                                  {file.original_filename}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {formatFileSize(file.file_size)}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
