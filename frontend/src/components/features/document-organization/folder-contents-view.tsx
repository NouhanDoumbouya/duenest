"use client";

// FolderContentsView — the right-hand panel for Custom Document Organization.
// Renders a breadcrumb and the resolved document list for the active selection
// (a folder, an unfiled view, a smart view, a tag, or a collection), with calm
// per-document actions. Surface-agnostic: the parent loads documents and wires
// the actions. NEVER renders a raw file URL — these payloads carry none.

import {
  CalendarClock,
  FileText,
  FolderInput,
  Layers,
  Loader2,
  Tag as TagIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDate } from "@/lib/documents";
import type {
  DocOrg,
  FolderBreadcrumbItem,
} from "@/types/document-organization";

export interface DocActions {
  onMove?: (doc: DocOrg) => void;
  onTags?: (doc: DocOrg) => void;
  onCollection?: (doc: DocOrg) => void;
}

export interface FolderContentsViewProps {
  title: string;
  description?: string;
  breadcrumb?: FolderBreadcrumbItem[];
  documents: DocOrg[];
  count: number;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  /** Per-row actions; omit to render a read-only list (e.g. members). */
  actions?: DocActions;
  /** Link builder for a document title (defaults to no link). */
  hrefForDoc?: (doc: DocOrg) => string | undefined;
  emptyTitle?: string;
  emptyDescription?: string;
  onBreadcrumbSelect?: (id: number) => void;
}

export function FolderContentsView({
  title,
  description,
  breadcrumb,
  documents,
  count,
  loading,
  error,
  onRetry,
  actions,
  hrefForDoc,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Documents you add to this view will show up here.",
  onBreadcrumbSelect,
}: FolderContentsViewProps) {
  return (
    <section className="min-w-0 space-y-3">
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Folder path" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {breadcrumb.map((item, i) => (
            <span key={item.id} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden>/</span>}
              {onBreadcrumbSelect ? (
                <button
                  type="button"
                  onClick={() => onBreadcrumbSelect(item.id)}
                  className="hover:text-foreground hover:underline"
                >
                  {item.name}
                </button>
              ) : (
                <span>{item.name}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-heading text-lg font-semibold">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {!loading && !error && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {count} document{count === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading documents…
        </div>
      ) : error ? (
        <ErrorState description={error} onRetry={onRetry} />
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card">
          <EmptyState
            icon={FileText}
            title={emptyTitle}
            description={emptyDescription}
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              actions={actions}
              href={hrefForDoc?.(doc)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function DocumentRow({
  doc,
  actions,
  href,
}: {
  doc: DocOrg;
  actions?: DocActions;
  href?: string;
}) {
  const hasActions =
    actions && (actions.onMove || actions.onTags || actions.onCollection);

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <FileText className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {href ? (
            <a
              href={href}
              className="min-w-0 truncate text-sm font-medium hover:text-primary hover:underline"
            >
              {doc.title}
            </a>
          ) : (
            <span className="min-w-0 truncate text-sm font-medium">
              {doc.title}
            </span>
          )}
          {doc.status && (
            <StatusBadge tone="neutral" withDot={false}>
              {doc.status}
            </StatusBadge>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {doc.document_type && <span>{doc.document_type}</span>}
          {doc.expiry_date && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3" aria-hidden />
              {formatDate(doc.expiry_date)}
            </span>
          )}
          {doc.tags.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <TagIcon className="size-3" aria-hidden />
              {doc.tags.join(", ")}
            </span>
          )}
        </div>
      </div>

      {hasActions && (
        <div className="flex shrink-0 items-center gap-1">
          {actions?.onMove && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => actions.onMove?.(doc)}
              title="Move to folder"
            >
              <FolderInput className="size-3.5" aria-hidden />
              <span className="sr-only sm:not-sr-only">Move</span>
            </Button>
          )}
          {actions?.onTags && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => actions.onTags?.(doc)}
              title="Add tags"
            >
              <TagIcon className="size-3.5" aria-hidden />
              <span className="sr-only sm:not-sr-only">Tags</span>
            </Button>
          )}
          {actions?.onCollection && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => actions.onCollection?.(doc)}
              title="Add to collection"
            >
              <Layers className="size-3.5" aria-hidden />
              <span className="sr-only sm:not-sr-only">Collect</span>
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
