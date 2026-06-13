"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Link2,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { ReadinessRing } from "@/components/bundles/readiness-ring";
import { TimelineList } from "@/components/timeline/timeline-list";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import { formatDate, getDocuments } from "@/lib/documents";
import {
  BUNDLE_STATUS_LABELS,
  BUNDLE_TYPE_LABELS,
  REQUIREMENT_STATUS_LABELS,
  createBundleExport,
  createBundleRequirement,
  deleteBundle,
  deleteBundleRequirement,
  downloadBundleExport,
  getBundle,
  getBundleExports,
  getTimeline,
  linkRequirementDocument,
  updateBundle,
  updateBundleRequirement,
} from "@/lib/renewal-workspace";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types/documents";
import type {
  Bundle,
  BundleExportRequest,
  BundleExportType,
  BundleRequirement,
  BundleStatus,
  RequirementStatus,
  TimelineEvent,
} from "@/types/renewal-workspace";

const BUNDLE_STATUSES: BundleStatus[] = [
  "draft",
  "in_progress",
  "ready",
  "submitted",
  "completed",
  "archived",
];

const REQUIREMENT_STATUSES: RequirementStatus[] = [
  "missing",
  "attached",
  "completed",
  "skipped",
];

const BUNDLE_EXPORT_LABELS: Record<BundleExportType, string> = {
  bundle_metadata_json: "Full bundle metadata (JSON)",
  bundle_requirements_csv: "Requirements checklist (CSV)",
};

const STATUS_STYLES: Record<RequirementStatus, string> = {
  missing: "bg-amber-100 text-amber-700",
  attached: "bg-primary/10 text-primary",
  completed: "bg-brand-success/10 text-brand-success",
  skipped: "bg-muted text-muted-foreground",
};

function RequirementRow({
  bundleId,
  requirement,
  documents,
  onChanged,
  onDeleted,
}: {
  bundleId: number;
  requirement: BundleRequirement;
  documents: DocumentRecord[];
  onChanged: (req: BundleRequirement) => void;
  onDeleted: (id: number) => void;
}) {
  const [pending, setPending] = useState(false);

  async function changeStatus(status: RequirementStatus) {
    setPending(true);
    try {
      const updated = await updateBundleRequirement(
        bundleId,
        requirement.id,
        { status },
      );
      onChanged(updated);
    } finally {
      setPending(false);
    }
  }

  async function linkDocument(documentId: number) {
    setPending(true);
    try {
      const updated = await linkRequirementDocument(
        bundleId,
        requirement.id,
        documentId,
      );
      onChanged(updated);
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    try {
      await deleteBundleRequirement(bundleId, requirement.id);
      onDeleted(requirement.id);
    } finally {
      setPending(false);
    }
  }

  const linkedDoc = documents.find((d) => d.id === requirement.linked_document);

  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{requirement.title}</p>
            {requirement.is_required ? (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Required
              </span>
            ) : (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Optional
              </span>
            )}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                STATUS_STYLES[requirement.status],
              )}
            >
              {REQUIREMENT_STATUS_LABELS[requirement.status]}
            </span>
          </div>
          {requirement.description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {requirement.description}
            </p>
          )}
          {linkedDoc && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Link2 className="size-3" />
              Linked to {linkedDoc.title}
            </p>
          )}
          {requirement.due_date && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Due {formatDate(requirement.due_date)}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={remove}
          disabled={pending}
          aria-label="Delete requirement"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="Requirement status"
          value={requirement.status}
          onChange={(e) => changeStatus(e.target.value as RequirementStatus)}
          disabled={pending}
          className="h-8 rounded-lg border border-input bg-card px-2 text-xs shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {REQUIREMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {REQUIREMENT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        {documents.length > 0 && (
          <select
            aria-label="Link a document"
            value={requirement.linked_document ?? ""}
            onChange={(e) =>
              e.target.value && linkDocument(Number(e.target.value))
            }
            disabled={pending}
            className="h-8 max-w-[200px] rounded-lg border border-input bg-card px-2 text-xs shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Link a document…</option>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title}
              </option>
            ))}
          </select>
        )}
        {pending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </div>
    </li>
  );
}

export default function BundleDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const bundleId = Number(params.id);
  const validId = Number.isFinite(bundleId);

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [bundleExports, setBundleExports] = useState<BundleExportRequest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(
    validId ? null : "Invalid bundle.",
  );
  const [error, setError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  const [newTitle, setNewTitle] = useState("");
  const [newRequired, setNewRequired] = useState(true);
  const [exportType, setExportType] = useState<BundleExportType>(
    "bundle_metadata_json",
  );
  const [adding, setAdding] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [exportBusy, setExportBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!validId) return;
    let active = true;
    getBundle(bundleId)
      .then((result) => active && setBundle(result))
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "This bundle could not be found."
            : "Unable to load this bundle.",
        );
      });
    getDocuments({ ordering: "title" })
      .then((page) => active && setDocuments(page.results))
      .catch(() => active && setDocuments([]));
    getTimeline({ bundle_id: bundleId })
      .then((res) => active && setEvents(res.items))
      .catch(() => active && setEvents([]));
    getBundleExports(bundleId)
      .then((page) => active && setBundleExports(page.results))
      .catch(() => active && setBundleExports([]));
    return () => {
      active = false;
    };
  }, [bundleId, validId]);

  async function refreshReadiness() {
    // Re-fetch the bundle so the readiness score + counts stay in sync.
    try {
      const fresh = await getBundle(bundleId);
      setBundle(fresh);
    } catch {
      /* non-fatal: the row state is already updated locally */
    }
  }

  async function addRequirement() {
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    setError(null);
    try {
      await createBundleRequirement(bundleId, {
        title,
        is_required: newRequired,
      });
      setNewTitle("");
      setNewRequired(true);
      await refreshReadiness();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not add the requirement.",
      );
    } finally {
      setAdding(false);
    }
  }

  async function changeBundleStatus(status: BundleStatus) {
    setSavingStatus(true);
    try {
      const updated = await updateBundle(bundleId, { status });
      setBundle((prev) => (prev ? { ...prev, status: updated.status } : prev));
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteBundle(bundleId);
      router.push("/dashboard/bundles");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete.");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function handleCreateExport() {
    setExportBusy("create");
    setExportError(null);
    setExportMessage(null);
    try {
      const created = await createBundleExport(bundleId, exportType);
      setBundleExports((prev) => [
        created,
        ...prev.filter((item) => item.id !== created.id),
      ]);
      setExportMessage("Bundle export is ready.");
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? err.message
          : "Could not create the bundle export.",
      );
    } finally {
      setExportBusy(null);
    }
  }

  async function handleDownloadExport(exportRequest: BundleExportRequest) {
    setExportBusy(`download-${exportRequest.id}`);
    setExportError(null);
    setExportMessage(null);
    try {
      await downloadBundleExport(bundleId, exportRequest);
      setExportMessage("Export download started.");
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? err.message
          : "Could not download this export.",
      );
    } finally {
      setExportBusy(null);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Link
          href="/dashboard/bundles"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to bundles
        </Link>
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {loadError}
        </p>
      </div>
    );
  }

  if (bundle === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        <span>Loading bundle…</span>
      </div>
    );
  }

  const readiness = bundle.readiness;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/dashboard/bundles"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to bundles
      </Link>

      {/* Overview + readiness */}
      <Card>
        <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {BUNDLE_TYPE_LABELS[bundle.bundle_type]} bundle
            </p>
            <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
              {bundle.title}
            </h1>
            {bundle.description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {bundle.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {bundle.target_date && (
                <span>Target {formatDate(bundle.target_date)}</span>
              )}
              {bundle.authority_or_provider && (
                <span>{bundle.authority_or_provider}</span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2">
            <ReadinessRing score={bundle.readiness_score} size={72} />
            <span className="text-xs text-muted-foreground">
              {readiness.required_satisfied}/{readiness.required_total} required
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Status + missing summary */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <label htmlFor="bundle-status" className="text-sm text-muted-foreground">
            Status
          </label>
          <select
            id="bundle-status"
            value={bundle.status}
            onChange={(e) => changeBundleStatus(e.target.value as BundleStatus)}
            disabled={savingStatus}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {BUNDLE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {BUNDLE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        {readiness.required_missing > 0 ? (
          <p className="text-sm text-amber-600">
            {readiness.required_missing} required item
            {readiness.required_missing === 1 ? "" : "s"} still missing
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-brand-success">
            <CheckCircle2 className="size-4" />
            All required items are ready
          </p>
        )}
      </div>

      {/* Requirements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Requirements</CardTitle>
          <CardDescription>
            Track each document, proof, or step this bundle needs. Linking a
            document marks the requirement as attached.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}

          {bundle.requirements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <p className="text-sm font-medium">No requirements yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Add what this bundle needs below to start tracking readiness.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {bundle.requirements.map((requirement) => (
                <RequirementRow
                  key={requirement.id}
                  bundleId={bundleId}
                  requirement={requirement}
                  documents={documents}
                  onChanged={(updated) => {
                    setBundle((prev) =>
                      prev
                        ? {
                            ...prev,
                            requirements: prev.requirements.map((r) =>
                              r.id === updated.id ? updated : r,
                            ),
                          }
                        : prev,
                    );
                    refreshReadiness();
                  }}
                  onDeleted={(id) => {
                    setBundle((prev) =>
                      prev
                        ? {
                            ...prev,
                            requirements: prev.requirements.filter(
                              (r) => r.id !== id,
                            ),
                          }
                        : prev,
                    );
                    refreshReadiness();
                  }}
                />
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/25 p-3 sm:flex-row sm:items-center">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRequirement();
                }
              }}
              placeholder="Add a requirement…"
              className="h-9"
            />
            <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={newRequired}
                onChange={(e) => setNewRequired(e.target.checked)}
                className="size-4 rounded border-input"
              />
              Required
            </label>
            <Button
              onClick={addRequirement}
              disabled={adding || !newTitle.trim()}
              className="shrink-0"
            >
              {adding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline for this bundle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bundle timeline</CardTitle>
          <CardDescription>
            Upcoming dates tied to this bundle and its requirements.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TimelineList events={events} />
        </CardContent>
      </Card>

      {/* Bundle export */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Download className="size-4" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-lg">Export bundle</CardTitle>
              <CardDescription>
                Download a bundle-specific metadata file for applications,
                renewals, or handoff review.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {exportError && (
            <p
              className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {exportError}
            </p>
          )}
          {exportMessage && (
            <p className="rounded-lg bg-brand-success/10 px-3 py-2 text-sm text-brand-success">
              {exportMessage}
            </p>
          )}

          <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/25 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <label
                htmlFor="bundle-export-type"
                className="text-sm font-medium"
              >
                Export format
              </label>
              <select
                id="bundle-export-type"
                value={exportType}
                onChange={(e) =>
                  setExportType(e.target.value as BundleExportType)
                }
                disabled={exportBusy !== null}
                className="mt-1 h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-[260px]"
              >
                {Object.entries(BUNDLE_EXPORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                JSON includes readiness, requirements, linked document/file
                summaries, checklist progress, and proof records. CSV focuses on
                requirement rows.
              </p>
            </div>
            <Button
              type="button"
              onClick={handleCreateExport}
              disabled={exportBusy !== null}
              className="w-full sm:w-auto"
            >
              {exportBusy === "create" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              Create export
            </Button>
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="flex items-start gap-2 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-muted-foreground">
                Exports are owner-only, expire after 7 days, and exclude raw
                files, share tokens, access codes, raw OCR text, and internal
                storage paths.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Recent exports</p>
            {bundleExports.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No bundle exports yet.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {bundleExports.slice(0, 4).map((exportRequest) => {
                  const canDownload =
                    exportRequest.status === "completed" &&
                    !exportRequest.is_expired &&
                    Boolean(exportRequest.download_url);
                  return (
                    <li
                      key={exportRequest.id}
                      className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {BUNDLE_EXPORT_LABELS[exportRequest.export_type]}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {exportRequest.status} · Requested{" "}
                          {formatDate(exportRequest.requested_at)}
                        </p>
                        {exportRequest.expires_at && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Expires {formatDate(exportRequest.expires_at)}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownloadExport(exportRequest)}
                        disabled={!canDownload || exportBusy !== null}
                        className="w-full sm:w-auto"
                      >
                        {exportBusy === `download-${exportRequest.id}` ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Download className="size-4" />
                        )}
                        Download
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <div className="flex justify-end">
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="size-4" />
          Delete bundle
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete bundle?"
        description={`“${bundle.title}” and its requirements will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
