"use client";

// Owner dashboard for Audit Logs V1. A read-only, owner-only history of the
// important document and sharing events on the account — who opened a room, who
// downloaded a file, when a protected copy was generated, and so on.
//
// SECURITY: every value shown here comes from the backend's safe fields. There
// are no raw file URLs, tokens, IPs, or user-agent strings in the payload, and
// this page never constructs any. Read-only — no mutations.

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardList,
  FileText,
  FileUp,
  Inbox,
  Package,
  ScrollText,
  ServerCog,
  ShieldCheck,
  ShieldAlert,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ApiError } from "@/lib/api";
import {
  ACTOR_TYPE_LABELS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  SEVERITY_LABELS,
  SEVERITY_ORDER,
  SEVERITY_TONE,
  describeAuditEvent,
  getAuditLogSummary,
  getAuditLogs,
  humanizeKey,
  summarizeMetadata,
} from "@/lib/audit-logs";
import type {
  AuditLogCategory,
  AuditLogEntry,
  AuditLogFilters,
  AuditLogSeverity,
  AuditLogSummary,
} from "@/types/audit-logs";

const PAGE_SIZE = 25;

/** Icon per category for the list rows. */
const CATEGORY_ICON: Record<AuditLogCategory, LucideIcon> = {
  document: FileText,
  file: Inbox,
  document_request: ClipboardList,
  sharing_room: FileUp,
  protected_copy: ShieldCheck,
  application: ClipboardList,
  pack: Package,
  security: ShieldAlert,
  system: ServerCog,
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Local UI filter state (strings, so the selects can be "all" / empty). */
interface FilterState {
  category: "" | AuditLogCategory;
  severity: "" | AuditLogSeverity;
  eventType: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

const EMPTY_FILTERS: FilterState = {
  category: "",
  severity: "",
  eventType: "",
  dateFrom: "",
  dateTo: "",
  search: "",
};

/** Turn UI filter state + page into the API filter object. */
function toApiFilters(state: FilterState, page: number): AuditLogFilters {
  const filters: AuditLogFilters = { page, page_size: PAGE_SIZE };
  if (state.category) filters.category = state.category;
  if (state.severity) filters.severity = state.severity;
  if (state.eventType.trim()) filters.event_type = state.eventType.trim();
  // <input type="date"> gives YYYY-MM-DD; widen to a full-day ISO range.
  if (state.dateFrom) filters.date_from = `${state.dateFrom}T00:00:00`;
  if (state.dateTo) filters.date_to = `${state.dateTo}T23:59:59`;
  if (state.search.trim()) filters.search = state.search.trim();
  return filters;
}

function AuditLogsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Context links (e.g. from a sharing room) deep-link with object_type +
  // object_id. We read them once and pin them as a sticky filter shown to the
  // user, since they aren't part of the editable filter controls.
  const objectType = searchParams.get("object_type") ?? "";
  const objectId = searchParams.get("object_id") ?? "";
  const hasObjectFilter = objectType.length > 0 && objectId.length > 0;

  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);

  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [count, setCount] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [summary, setSummary] = useState<AuditLogSummary | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  // Bumping this re-runs the load effect without changing filters/page (retry).
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    const apiFilters = toApiFilters(filters, page);
    if (hasObjectFilter) {
      apiFilters.object_type = objectType;
      apiFilters.object_id = objectId;
    }

    getAuditLogs(apiFilters)
      .then((res) => {
        if (!active) return;
        setEntries(res.results);
        setCount(res.count);
        setHasNext(Boolean(res.next));
        setHasPrev(Boolean(res.previous));
      })
      .catch((err) => {
        if (!active) return;
        setEntries(null);
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Could not load your audit history.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters, page, hasObjectFilter, objectType, objectId, reloadToken]);

  // Summary is best-effort: a failure here must not block the list.
  useEffect(() => {
    let active = true;
    getAuditLogSummary()
      .then((res) => active && setSummary(res))
      .catch(() => active && setSummary(null));
    return () => {
      active = false;
    };
  }, []);

  const activeEntry = useMemo(
    () => (entries ?? []).find((e) => e.id === activeId) ?? null,
    [entries, activeId],
  );

  // Mark a fetch as pending. Called from the user actions that change filters /
  // page so the loading + error state is updated in an event handler, never
  // synchronously inside the load effect.
  function markPending() {
    setLoading(true);
    setLoadError(null);
  }

  function updateFilter<K extends keyof FilterState>(
    key: K,
    value: FilterState[K],
  ) {
    markPending();
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }

  function goToPage(next: number) {
    markPending();
    setPage(next);
  }

  function clearFilters() {
    markPending();
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function clearObjectFilter() {
    // Drop the deep-link params from the URL, keeping the user on the page.
    markPending();
    router.replace("/dashboard/security/audit");
    setPage(1);
  }

  function retry() {
    markPending();
    setReloadToken((t) => t + 1);
  }

  const filtersActive =
    filters.category !== "" ||
    filters.severity !== "" ||
    filters.eventType.trim() !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "" ||
    filters.search.trim() !== "";

  const fromIndex = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const toIndex = (page - 1) * PAGE_SIZE + (entries?.length ?? 0);

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Protect"
        title="Audit Logs"
        description="Track important document and sharing activity. This is a read-only record — nothing here can be edited."
      />

      {/* Summary strip */}
      {summary && (
        <section
          aria-label="Last 30 days"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          <SummaryCard label="Events (30d)" value={summary.total_events_30d} />
          <SummaryCard
            label="Public link events"
            value={summary.public_link_events_30d}
          />
          <SummaryCard label="Downloads" value={summary.downloads_30d} />
          <SummaryCard label="Uploads" value={summary.uploads_30d} />
          <SummaryCard
            label="Critical events"
            value={summary.critical_events_30d}
            emphasize={summary.critical_events_30d > 0}
          />
        </section>
      )}

      {/* Sticky object filter from a context deep-link */}
      {hasObjectFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Showing activity for</span>
          <span className="font-medium">
            {objectType} #{objectId}
          </span>
          <button
            type="button"
            onClick={clearObjectFilter}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden /> Clear
          </button>
        </div>
      )}

      {/* Filters */}
      <section
        aria-label="Filters"
        className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="al-category">Category</Label>
          <select
            id="al-category"
            value={filters.category}
            onChange={(e) =>
              updateFilter("category", e.target.value as FilterState["category"])
            }
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">All categories</option>
            {CATEGORY_ORDER.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="al-severity">Severity</Label>
          <select
            id="al-severity"
            value={filters.severity}
            onChange={(e) =>
              updateFilter("severity", e.target.value as FilterState["severity"])
            }
            className="h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">All severities</option>
            {SEVERITY_ORDER.map((severity) => (
              <option key={severity} value={severity}>
                {SEVERITY_LABELS[severity]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="al-search">Search</Label>
          <Input
            id="al-search"
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            placeholder="Search activity"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="al-event">Event type</Label>
          <Input
            id="al-event"
            value={filters.eventType}
            onChange={(e) => updateFilter("eventType", e.target.value)}
            placeholder="e.g. sharing_room_opened"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="al-from">From</Label>
          <Input
            id="al-from"
            type="date"
            value={filters.dateFrom}
            onChange={(e) => updateFilter("dateFrom", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="al-to">To</Label>
          <Input
            id="al-to"
            type="date"
            value={filters.dateTo}
            onChange={(e) => updateFilter("dateTo", e.target.value)}
          />
        </div>

        {filtersActive && (
          <div className="sm:col-span-2 lg:col-span-3">
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="size-4" /> Clear filters
            </Button>
          </div>
        )}
      </section>

      {/* List */}
      {loading ? (
        <section
          className="grid gap-2"
          aria-busy="true"
          aria-label="Loading audit events"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="size-9 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : loadError ? (
        <div className="rounded-2xl border border-border bg-card">
          <ErrorState description={loadError} onRetry={retry} />
        </div>
      ) : (entries ?? []).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={ScrollText}
            title="No audit events yet."
            description="Important sharing and document actions will appear here — like when a room is opened, a file is downloaded, or a protected copy is generated."
          />
        </div>
      ) : (
        <div className="grid gap-2">
          {(entries ?? []).map((entry) => (
            <AuditRow
              key={entry.id}
              entry={entry}
              onOpen={() => setActiveId(entry.id)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !loadError && (entries ?? []).length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-sm text-muted-foreground">
            Showing {fromIndex}–{toIndex} of {count}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(Math.max(1, page - 1))}
              disabled={!hasPrev || page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page + 1)}
              disabled={!hasNext}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {activeEntry && (
        <AuditDetailDrawer
          key={activeEntry.id}
          entry={activeEntry}
          onClose={() => setActiveId(null)}
        />
      )}
    </PageContainer>
  );
}

export default function AuditLogsPage() {
  // useSearchParams requires a Suspense boundary in the App Router.
  return (
    <Suspense
      fallback={
        <PageContainer width="wide">
          <PageHeader
            eyebrow="Protect"
            title="Audit Logs"
            description="Track important document and sharing activity."
          />
        </PageContainer>
      }
    >
      <AuditLogsPageInner />
    </Suspense>
  );
}

// ---- Summary card ----------------------------------------------------------

function SummaryCard({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <p
        className={
          emphasize
            ? "text-2xl font-semibold text-destructive"
            : "text-2xl font-semibold"
        }
      >
        {value}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// ---- List row --------------------------------------------------------------

function AuditRow({
  entry,
  onOpen,
}: {
  entry: AuditLogEntry;
  onOpen: () => void;
}) {
  const Icon = CATEGORY_ICON[entry.category] ?? ScrollText;
  const sentence = describeAuditEvent(entry);
  const metaSummary = summarizeMetadata(entry.metadata);

  return (
    <article className="rounded-xl border border-border bg-card transition-colors hover:bg-muted/30">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 p-4 text-left focus-visible:outline-none"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4.5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 font-medium break-words">{sentence}</p>
            <StatusBadge tone={SEVERITY_TONE[entry.severity]} withDot={false}>
              {SEVERITY_LABELS[entry.severity]}
            </StatusBadge>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span>{entry.actor_label || ACTOR_TYPE_LABELS[entry.actor_type]}</span>
            <span aria-hidden>·</span>
            <span>{CATEGORY_LABELS[entry.category]}</span>
            <span aria-hidden>·</span>
            <span>{formatDateTime(entry.created_at)}</span>
          </p>
          {metaSummary && (
            <p className="mt-1 truncate text-xs text-muted-foreground/80">
              {metaSummary}
            </p>
          )}
        </div>
      </button>
    </article>
  );
}

// ---- Detail drawer ---------------------------------------------------------

function AuditDetailDrawer({
  entry,
  onClose,
}: {
  entry: AuditLogEntry;
  onClose: () => void;
}) {
  const Icon = CATEGORY_ICON[entry.category] ?? ScrollText;
  const metaEntries = Object.entries(entry.metadata ?? {}).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label="Audit event detail"
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={SEVERITY_TONE[entry.severity]}
                  withDot={false}
                >
                  {SEVERITY_LABELS[entry.severity]}
                </StatusBadge>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {CATEGORY_LABELS[entry.category]}
                </span>
              </div>
              <h2 className="mt-2 font-heading text-base font-semibold break-words">
                {describeAuditEvent(entry)}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <dl className="mt-5 grid gap-2.5 text-sm">
          <DetailRow label="Event">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {entry.event_type}
            </code>
          </DetailRow>
          <DetailRow label="Severity">{SEVERITY_LABELS[entry.severity]}</DetailRow>
          <DetailRow label="Actor">
            {entry.actor_label || ACTOR_TYPE_LABELS[entry.actor_type]}{" "}
            <span className="text-muted-foreground">
              ({ACTOR_TYPE_LABELS[entry.actor_type]})
            </span>
          </DetailRow>
          {entry.object_label && (
            <DetailRow label={entry.object_type || "Object"}>
              {entry.object_label}
            </DetailRow>
          )}
          {entry.related_object_label && (
            <DetailRow label={entry.related_object_type || "Related"}>
              {entry.related_object_label}
            </DetailRow>
          )}
          {entry.country_code && (
            <DetailRow label="Country">{entry.country_code}</DetailRow>
          )}
          <DetailRow label="When">{formatDateTime(entry.created_at)}</DetailRow>
        </dl>

        {/* Metadata */}
        <div className="mt-5">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Details
          </h3>
          {metaEntries.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No extra details recorded for this event.
            </p>
          ) : (
            <dl className="mt-2 grid gap-2 rounded-xl border border-border bg-muted/20 p-3.5 text-sm">
              {metaEntries.map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{humanizeKey(key)}</dt>
                  <dd className="min-w-0 text-right font-medium break-words">
                    {Array.isArray(value) ? value.join(", ") : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <InlineAlert tone="secure" className="mt-5">
          This is a read-only record. CertaNest logs only safe activity details —
          never file contents, links, or tokens.
        </InlineAlert>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}
