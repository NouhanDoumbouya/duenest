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
  ScanLine,
  Share2,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { BundleActivityTab } from "@/components/bundles/bundle-activity-tab";
import { BundleFilesSection } from "@/components/bundles/bundle-files-section";
import { BundleReviewTab } from "@/components/bundles/bundle-review-tab";
import { ReadinessRing } from "@/components/bundles/readiness-ring";
import { BundleShareReadiness } from "@/components/bundles/bundle-share-readiness";
import { useFeature } from "@/components/features/feature-flags-provider";
import { DocumentAppointments } from "@/components/documents/document-appointments";
import { DocumentPayments } from "@/components/documents/document-payments";
import { DocumentProofRecords } from "@/components/documents/document-proof-records";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  InlineAlert,
  ProductMetric,
  SegmentedControl,
  TrustNotice,
} from "@/components/ui/product-ui";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { TimelineList } from "@/components/timeline/timeline-list";
import { Button, buttonVariants } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { TONE_CLASS, type StatusTone } from "@/lib/status-badge";
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
import { getFileInbox } from "@/lib/document-files";
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
  linkRequirementFile,
  updateBundle,
  updateBundleRequirement,
} from "@/lib/renewal-workspace";
import { cn } from "@/lib/utils";
import type { DocumentFile } from "@/types/document-files";
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
  bundle_metadata_json: "Full application pack metadata (JSON)",
  bundle_requirements_csv: "Requirements checklist (CSV)",
};

type BundleTab =
  | "review"
  | "requirements"
  | "files"
  | "timeline"
  | "proofs"
  | "exports"
  | "activity";

const BUNDLE_TABS: { value: BundleTab; label: string }[] = [
  { value: "requirements", label: "Requirements" },
  { value: "files", label: "Files" },
  { value: "timeline", label: "Timeline" },
  { value: "proofs", label: "Proofs" },
  { value: "exports", label: "Exports" },
];

// The Review and Activity tabs are appended only when their pack features are
// enabled, so they never appear as dead tabs.
const REVIEW_TAB: { value: BundleTab; label: string } = {
  value: "review",
  label: "Review",
};
const ACTIVITY_TAB: { value: BundleTab; label: string } = {
  value: "activity",
  label: "Activity",
};

/** Read the initial bundle tab from `?tab=` (e.g. a calendar deep-link). */
function initialBundleTab(): BundleTab {
  if (typeof window === "undefined") return "requirements";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return BUNDLE_TABS.some((t) => t.value === tab)
    ? (tab as BundleTab)
    : "requirements";
}

// Requirement lifecycle → canonical status tone (see `lib/status-badge` and the
// status colour map in `docs/design/design-system.md`). Keeps pack checklist
// pills consistent with Vault, SafeSend, and Requests instead of drifting into
// one-off palette colours.
const REQUIREMENT_TONES: Record<RequirementStatus, StatusTone> = {
  missing: "warning",
  attached: "info",
  completed: "success",
  skipped: "neutral",
};

function RequirementRow({
  bundleId,
  requirement,
  documents,
  inboxFiles,
  scanEnabled,
  onChanged,
  onDeleted,
}: {
  bundleId: number;
  requirement: BundleRequirement;
  documents: DocumentRecord[];
  inboxFiles: DocumentFile[];
  scanEnabled: boolean;
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

  async function linkFile(fileId: number) {
    setPending(true);
    try {
      const updated = await linkRequirementFile(
        bundleId,
        requirement.id,
        fileId,
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
            <StatusBadge tone={REQUIREMENT_TONES[requirement.status]}>
              {REQUIREMENT_STATUS_LABELS[requirement.status]}
            </StatusBadge>
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
          className="h-9 w-full rounded-lg border border-input bg-card px-2 text-xs shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8 sm:w-auto"
        >
          {REQUIREMENT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {REQUIREMENT_STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        {documents.length > 0 && (
          <select
            aria-label="Attach a document from your Vault"
            value={requirement.linked_document ?? ""}
            onChange={(e) =>
              e.target.value && linkDocument(Number(e.target.value))
            }
            disabled={pending}
            className="h-9 w-full rounded-lg border border-input bg-card px-2 text-xs shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8 sm:w-auto sm:max-w-[200px]"
          >
            <option value="">Attach from Vault…</option>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title}
              </option>
            ))}
          </select>
        )}

        {inboxFiles.length > 0 && (
          <select
            aria-label="Attach a file from your File Inbox"
            value=""
            onChange={(e) =>
              e.target.value && linkFile(Number(e.target.value))
            }
            disabled={pending}
            className="h-9 w-full rounded-lg border border-input bg-card px-2 text-xs shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:h-8 sm:w-auto sm:max-w-[200px]"
          >
            <option value="">Attach from Inbox…</option>
            {inboxFiles.map((file) => (
              <option key={file.id} value={file.id}>
                {file.original_filename}
              </option>
            ))}
          </select>
        )}

        {/* Quick actions for items still missing a document. Calm, optional —
            nothing here forces the user to complete the pack now. */}
        {requirement.status === "missing" && (
          <>
            {scanEnabled && (
              <Link
                href="/dashboard/scanner"
                className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-input bg-card px-2 text-xs transition-colors hover:bg-muted/50 sm:h-8 sm:flex-none"
              >
                <ScanLine className="size-3.5" />
                Scan
              </Link>
            )}
            <button
              type="button"
              onClick={() => changeStatus("skipped")}
              disabled={pending}
              className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-input bg-card px-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 sm:h-8 sm:flex-none"
            >
              Mark not needed
            </button>
          </>
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
  const [inboxFiles, setInboxFiles] = useState<DocumentFile[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [bundleExports, setBundleExports] = useState<BundleExportRequest[]>([]);
  const [loadError, setLoadError] = useState<string | null>(
    validId ? null : "Invalid application pack.",
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
  const [activeTab, setActiveTab] = useState<BundleTab>(initialBundleTab);

  const timelineEnabled = useFeature("application_pack_timeline");
  const scanToBundleEnabled = useFeature("scan_to_bundle");
  const safeSendEnabled = useFeature("application_pack_safesend");
  const packPrepEnabled = useFeature("application_pack_preparation");
  const shareReadinessEnabled = useFeature("ai_share_readiness");
  const visibleTabs = [
    ...(packPrepEnabled ? [REVIEW_TAB] : []),
    ...BUNDLE_TABS,
    ...(timelineEnabled ? [ACTIVITY_TAB] : []),
  ];
  // A deep-link to a hidden tab (?tab=review/activity) must not strand the user.
  const resolvedTab = visibleTabs.some((t) => t.value === activeTab)
    ? activeTab
    : "requirements";

  useEffect(() => {
    if (!validId) return;
    let active = true;
    getBundle(bundleId)
      .then((result) => active && setBundle(result))
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError && err.status === 404
            ? "This application pack could not be found."
            : "Unable to load this application pack.",
        );
      });
    getDocuments({ ordering: "title" })
      .then((page) => active && setDocuments(page.results))
      .catch(() => active && setDocuments([]));
    getFileInbox()
      .then((page) => active && setInboxFiles(page.results))
      .catch(() => active && setInboxFiles([]));
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

  // Calendar "Open appointment" deep-link (?tab=timeline#appointments): once the
  // bundle has loaded and the Timeline tab is active, scroll to the section.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!bundle || activeTab !== "timeline") return;
    if (window.location.hash !== "#appointments") return;
    const timer = window.setTimeout(() => {
      document
        .getElementById("appointments")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [bundle, activeTab]);

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
      setExportMessage("Application pack export is ready.");
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? err.message
          : "Could not create the application pack export.",
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
      <PageContainer width="narrow" className="space-y-4">
        <Link
          href="/dashboard/bundles"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to application packs
        </Link>
        <InlineAlert>{loadError}</InlineAlert>
      </PageContainer>
    );
  }

  if (bundle === null) {
    return (
      <PageContainer width="wide" className="space-y-6">
        <span className="sr-only" role="status">
          Loading application pack…
        </span>
        <Skeleton className="h-4 w-40" />
        <div className="space-y-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-8 w-2/3 max-w-md" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-10 w-full max-w-md rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageContainer>
    );
  }

  const readiness = bundle.readiness;

  return (
    <PageContainer width="wide">
      <Link
        href="/dashboard/bundles"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to application packs
      </Link>

      <PageHeader
        eyebrow={`${BUNDLE_TYPE_LABELS[bundle.bundle_type]} pack`}
        title={bundle.title}
        description={
          bundle.description ||
          "Track requirements, files, timeline, proof, and safe exports for this application pack."
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ProductMetric
              icon={ShieldCheck}
              label="Readiness"
              value={`${bundle.readiness_score}%`}
              hint={`${readiness.required_satisfied}/${readiness.required_total} required ready`}
              tone={readiness.required_missing > 0 ? "warn" : "good"}
            />
            <ProductMetric
              icon={FileText}
              label="Requirements"
              value={readiness.total_requirements}
              hint={`${readiness.optional_total} optional`}
              tone="secure"
            />
            <ProductMetric
              icon={CheckCircle2}
              label="Missing required"
              value={readiness.required_missing}
              hint={
                readiness.required_missing > 0
                  ? "Review before submission"
                  : "All required items ready"
              }
              tone={readiness.required_missing > 0 ? "warn" : "good"}
            />
            <ProductMetric
              icon={Download}
              label="Exports"
              value={bundleExports.length}
              hint="Owner-only handoff files"
            />
          </div>

          <SegmentedControl
            label="Pack workspace"
            value={resolvedTab}
            options={visibleTabs}
            onChange={setActiveTab}
            className="max-w-full overflow-x-auto"
          />

          {resolvedTab === "review" && (
            <BundleReviewTab
              bundle={bundle}
              bundleId={bundleId}
              safeSendEnabled={safeSendEnabled}
              onExport={() => setActiveTab("files")}
            />
          )}

          {resolvedTab === "requirements" && (
            <Card className="content-fade-in">
              <CardHeader>
                <CardTitle className="text-lg">Requirements</CardTitle>
                <CardDescription>
                  Track each document, proof, or step this bundle needs. Linking
                  a document marks the requirement as attached.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && <InlineAlert>{error}</InlineAlert>}

                {bundle.requirements.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
                    <p className="text-sm font-medium">No requirements yet</p>
                    <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                      Add what this bundle needs below to start tracking
                      readiness.
                    </p>
                  </div>
                ) : (
                  (() => {
                    // Render the existing row unchanged, but group requirements
                    // so what needs action surfaces first: Missing (required
                    // before optional) → Needs review → Ready → Skipped. Empty
                    // groups are omitted so the checklist never shows dead
                    // headers.
                    const renderRow = (requirement: BundleRequirement) => (
                      <RequirementRow
                        key={requirement.id}
                        bundleId={bundleId}
                        requirement={requirement}
                        documents={documents}
                        inboxFiles={inboxFiles}
                        scanEnabled={scanToBundleEnabled}
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
                    );

                    const byStatus = (status: RequirementStatus) =>
                      bundle.requirements.filter((r) => r.status === status);
                    const missing = byStatus("missing").sort(
                      (a, b) => Number(b.is_required) - Number(a.is_required),
                    );
                    const groups: {
                      key: RequirementStatus;
                      label: string;
                      tone: StatusTone;
                      items: BundleRequirement[];
                    }[] = [
                      { key: "missing", label: "Missing", tone: "warning", items: missing },
                      { key: "attached", label: "Needs review", tone: "info", items: byStatus("attached") },
                      { key: "completed", label: "Ready", tone: "success", items: byStatus("completed") },
                      { key: "skipped", label: "Skipped", tone: "neutral", items: byStatus("skipped") },
                    ];

                    return (
                      <div className="space-y-5">
                        {groups
                          .filter((g) => g.items.length > 0)
                          .map((g) => (
                            <div key={g.key} className="space-y-2">
                              <div className="flex items-center gap-2 px-0.5">
                                <span
                                  aria-hidden
                                  className={cn(
                                    "size-1.5 rounded-full",
                                    TONE_CLASS[g.tone].dot,
                                  )}
                                />
                                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                  {g.label}
                                </p>
                                <span className="text-xs tabular-nums text-muted-foreground/60">
                                  {g.items.length}
                                </span>
                              </div>
                              <ul className="space-y-2">{g.items.map(renderRow)}</ul>
                            </div>
                          ))}
                      </div>
                    );
                  })()
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
                    placeholder="Add a requirement..."
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
          )}

          {resolvedTab === "files" && (
            <div className="content-fade-in">
              <BundleFilesSection
                bundleId={bundle.id}
                bundleTitle={bundle.title}
                targetDate={bundle.target_date}
              />
            </div>
          )}

          {resolvedTab === "timeline" && (
            <div className="space-y-6 content-fade-in">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Pack timeline</CardTitle>
                  <CardDescription>
                    Upcoming dates tied to this bundle and its requirements.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <TimelineList events={events} />
                </CardContent>
              </Card>

              <div id="appointments" className="scroll-mt-24">
                <SectionCard title="Appointments">
                  <DocumentAppointments bundleId={bundleId} />
                </SectionCard>
              </div>

              <SectionCard
                title="Application costs"
                description="Track expected and actual costs for this application or renewal."
              >
                <DocumentPayments bundleId={bundleId} />
              </SectionCard>
            </div>
          )}

          {resolvedTab === "proofs" && (
            <Card className="content-fade-in">
              <CardHeader>
                <CardTitle className="text-lg">Proof of submission</CardTitle>
                <CardDescription>
                  Record confirmations and receipts for what you submitted as
                  part of this bundle.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DocumentProofRecords bundleId={bundleId} />
              </CardContent>
            </Card>
          )}

          {resolvedTab === "exports" && (
            <Card className="content-fade-in">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Download className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <CardTitle className="text-lg">Export pack</CardTitle>
                    <CardDescription>
                      Download a pack-specific metadata file for applications,
                      renewals, or handoff review.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {exportError && <InlineAlert>{exportError}</InlineAlert>}
                {exportMessage && (
                  <InlineAlert tone="good">{exportMessage}</InlineAlert>
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
                      {Object.entries(BUNDLE_EXPORT_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                    <p className="mt-1 text-xs text-muted-foreground">
                      JSON includes readiness, requirements, linked
                      document/file summaries, checklist progress, and proof
                      records. CSV focuses on requirement rows.
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

                <TrustNotice icon={ShieldCheck} title="Safe export contents">
                  Exports are owner-only, expire after 7 days, and exclude raw
                  files, share tokens, access codes, raw OCR text, and internal
                  storage paths.
                </TrustNotice>

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
                                {exportRequest.status} - Requested{" "}
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
          )}

          {resolvedTab === "activity" && (
            <div className="content-fade-in">
              <BundleActivityTab bundleId={bundleId} />
            </div>
          )}
        </main>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <Card>
            <CardContent className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Readiness</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Required item coverage
                  </p>
                </div>
                <ReadinessRing score={bundle.readiness_score} size={76} />
              </div>

              {shareReadinessEnabled && (
                <BundleShareReadiness bundleId={bundle.id} />
              )}

              <div className="space-y-2">
                <label
                  htmlFor="bundle-status"
                  className="text-sm font-medium"
                >
                  Bundle status
                </label>
                <select
                  id="bundle-status"
                  value={bundle.status}
                  onChange={(e) =>
                    changeBundleStatus(e.target.value as BundleStatus)
                  }
                  disabled={savingStatus}
                  className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {BUNDLE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {BUNDLE_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>

              {readiness.required_missing > 0 ? (
                <InlineAlert tone="warn">
                  {readiness.required_missing} required item
                  {readiness.required_missing === 1 ? "" : "s"} still missing.
                </InlineAlert>
              ) : (
                <p className="flex items-center gap-1.5 rounded-lg border border-brand-success/25 bg-brand-success/10 px-3 py-2 text-sm text-brand-success">
                  <CheckCircle2 className="size-4" />
                  All required items are ready.
                </p>
              )}

              {safeSendEnabled && (
                <div className="space-y-1.5">
                  <Link
                    href={`/dashboard/quick-share/new?bundle=${bundleId}`}
                    className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                  >
                    <Share2 className="size-4" />
                    Share pack safely
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Opens SafeSend with this pack selected. No public link is
                    created until you confirm access there.
                  </p>
                </div>
              )}

              <dl className="space-y-2 text-sm">
                {bundle.target_date && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Target</dt>
                    <dd className="font-medium">{formatDate(bundle.target_date)}</dd>
                  </div>
                )}
                {bundle.authority_or_provider && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Authority</dt>
                    <dd className="truncate font-medium">
                      {bundle.authority_or_provider}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <TrustNotice icon={ShieldCheck} title="Owner-only workspace">
            Bundle exports and linked files stay private to the owner. Public
            sharing still happens through secure rooms or explicit file shares.
          </TrustNotice>

          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" />
            Delete pack
          </Button>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete application pack?"
        description={`"${bundle.title}" and its requirements will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </PageContainer>
  );
}
