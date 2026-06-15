"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Check,
  Edit3,
  FileCheck2,
  FileText,
  Info,
  LifeBuoy,
  Loader2,
  Lock,
  Package,
  Paperclip,
  Pencil,
  RefreshCw,
  Share2,
  ShieldCheck,
  UploadCloud,
  X,
  type LucideIcon,
} from "lucide-react";

import { ConfidencePill } from "@/components/documents/confidence-indicator";
import { DocumentStatusBadge } from "@/components/documents/status-badge";
import { DocumentSummaryGrid } from "@/components/documents/document-summary-grid";
import { DocumentTabs, type TabDef } from "@/components/documents/document-tabs";
import { LifecycleBadge } from "@/components/documents/lifecycle-badge";
import { ActivityTab } from "@/components/documents/workspace/activity-tab";
import { FilesTab } from "@/components/documents/workspace/files-tab";
import { OverviewTab } from "@/components/documents/workspace/overview-tab";
import { ProofTab } from "@/components/documents/workspace/proof-tab";
import { RenewalTab } from "@/components/documents/workspace/renewal-tab";
import { SharingTab } from "@/components/documents/workspace/sharing-tab";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { formatDate, getDocument, updateDocument } from "@/lib/documents";
import { tagColorClass } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { isSensitiveDocument } from "@/lib/vault";
import type { DocumentRecord } from "@/types/documents";

type TabKey = "overview" | "files" | "renewal" | "proof" | "sharing" | "activity";

const TABS: TabDef[] = [
  { key: "overview", label: "Overview", icon: FileText },
  { key: "files", label: "Files", icon: UploadCloud },
  { key: "renewal", label: "Renewal", icon: RefreshCw },
  { key: "proof", label: "Proof", icon: FileCheck2 },
  { key: "sharing", label: "Sharing", icon: Share2 },
  { key: "activity", label: "Activity", icon: Activity },
];

const TAB_KEYS = new Set(TABS.map((tab) => tab.key));

function isTabKey(value: string | null): value is TabKey {
  return Boolean(value && TAB_KEYS.has(value));
}

function tabFromLocation(): TabKey {
  if (typeof window === "undefined") return "overview";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return isTabKey(tab) ? tab : "overview";
}

function daysCopy(days: number | null): string {
  if (days === null) return "No expiry date";
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

function reminderIsActive(doc: DocumentRecord): boolean {
  return doc.confidence_reasons.find((reason) => reason.key === "has_reminder")
    ?.met ?? false;
}

function nextStep(doc: DocumentRecord): string {
  if (doc.is_expired) return "Renew or archive this document after the renewal is complete.";
  if (doc.missing_file) return "Upload a scan or copy so this record is usable when needed.";
  if (doc.missing_expiry_date) return "Add the expiry date so DueNest can track risk accurately.";
  if (!reminderIsActive(doc)) return "Add a reminder rule before the next important date.";
  return "No urgent action. Keep the record current when details change.";
}

function WorkspaceSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    </div>
  );
}

function WorkspaceSidePanel({ doc }: { doc: DocumentRecord }) {
  const hasReminder = reminderIsActive(doc);

  return (
    <aside className="space-y-4 lg:sticky lg:top-6">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Workspace health</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <DocumentStatusBadge status={doc.computed_status} />
            <ConfidencePill
              score={doc.confidence_score}
              label={doc.confidence_label}
            />
          </div>
          {doc.status_reason && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {doc.status_reason}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <p className="text-xs text-muted-foreground">Expiry</p>
              <p className="mt-1 font-medium">{daysCopy(doc.days_until_expiry)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <p className="text-xs text-muted-foreground">Files</p>
              <p className="mt-1 font-medium">
                {doc.has_file ? "Attached" : "Missing"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <p className="text-xs text-muted-foreground">Reminders</p>
              <p className="mt-1 font-medium">{hasReminder ? "Active" : "None"}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <p className="text-xs text-muted-foreground">Last safe action</p>
              <p className="mt-1 font-medium">
                {formatDate(doc.last_safe_action_date)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Next recommended action</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {nextStep(doc)}
          </p>
        </CardContent>
      </Card>
    </aside>
  );
}

export default function DocumentWorkspacePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const validId = Number.isFinite(id);
  const basePath = validId ? `/dashboard/documents/${id}` : "/dashboard/documents";

  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(
    validId ? null : "Invalid document.",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(() => tabFromLocation());
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  function startTitleEdit() {
    if (!doc) return;
    setTitleDraft(doc.title);
    setTitleError(null);
    setEditingTitle(true);
  }

  async function saveTitle() {
    if (!doc) return;
    const next = titleDraft.trim();
    if (!next || next === doc.title) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    setTitleError(null);
    try {
      const updated = await updateDocument(doc.id, { title: next });
      setDoc(updated);
      setEditingTitle(false);
    } catch (err) {
      setTitleError(
        err instanceof ApiError ? err.message : "Could not rename. Try again.",
      );
    } finally {
      setSavingTitle(false);
    }
  }

  const tags = doc?.tags ?? [];
  const meta = useMemo(
    () =>
      [doc?.document_type, doc?.category_name, doc?.issuer, doc?.country]
        .filter(Boolean)
        .join(" · "),
    [doc],
  );

  async function refreshDocument() {
    if (!validId) return;
    setRefreshing(true);
    try {
      const updated = await getDocument(id);
      setDoc(updated);
      setLoadError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setLoadError("This document could not be found.");
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!validId) return;
    let active = true;
    getDocument(id)
      .then((result) => {
        if (!active) return;
        setDoc(result);
        setLoadError(null);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) {
          setLoadError("This document could not be found.");
        } else {
          setLoadError(
            err instanceof ApiError ? err.message : "Unable to load document.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [id, validId]);

  useEffect(() => {
    function handlePopState() {
      setActiveTab(tabFromLocation());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function selectTab(tab: string) {
    const next = isTabKey(tab) ? tab : "overview";
    setActiveTab(next);
    const href = next === "overview" ? basePath : `${basePath}?tab=${next}`;
    router.replace(href, { scroll: false });
  }

  function renderTab() {
    if (!doc) return null;
    switch (activeTab) {
      case "files":
        return <FilesTab documentId={doc.id} onChanged={refreshDocument} />;
      case "renewal":
        return <RenewalTab doc={doc} onDocumentUpdated={setDoc} />;
      case "proof":
        return <ProofTab documentId={doc.id} />;
      case "sharing":
        return <SharingTab documentId={doc.id} />;
      case "activity":
        return <ActivityTab documentId={doc.id} />;
      default:
        return (
          <OverviewTab
            doc={doc}
            onSelectTab={(tab) => selectTab(tab)}
          />
        );
    }
  }

  return (
    <PageContainer width="wide">
      <div>
        <Link
          href="/dashboard/documents"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to vault
        </Link>
      </div>

      {!validId || loadError ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={FileText}
              title="Document unavailable"
              description={loadError ?? "This document could not be loaded."}
              action={
                <Link
                  href="/dashboard/documents"
                  className={cn(buttonVariants({ size: "lg" }))}
                >
                  Back to documents
                </Link>
              }
            />
          </CardContent>
        </Card>
      ) : doc === null ? (
        <WorkspaceSkeleton />
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DocumentStatusBadge status={doc.computed_status} />
                  <LifecycleBadge status={doc.lifecycle_status} />
                  {refreshing && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Updating
                    </span>
                  )}
                </div>
                {editingTitle ? (
                  <div className="mt-3">
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveTitle();
                          if (e.key === "Escape") setEditingTitle(false);
                        }}
                        aria-label="Document name"
                        className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1.5 font-heading text-2xl font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-ring/50 sm:text-3xl"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void saveTitle()}
                        disabled={savingTitle}
                      >
                        {savingTitle ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )}
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingTitle(false)}
                        disabled={savingTitle}
                        aria-label="Cancel rename"
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    {titleError && (
                      <p className="mt-1 text-sm text-destructive">{titleError}</p>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-2">
                    <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                      {doc.title}
                    </h1>
                    <button
                      type="button"
                      onClick={startTitleEdit}
                      aria-label="Rename document"
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <Pencil className="size-4" aria-hidden />
                    </button>
                  </div>
                )}
                {meta && (
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    {meta}
                  </p>
                )}
                {tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag.id}
                        className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          tagColorClass(tag.color),
                        )}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* At-a-glance status: sensitivity, sharing, completeness, privacy. */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {isSensitiveDocument(doc) && (
                    <GlanceChip icon={Lock} label="Sensitive" tone="slate" />
                  )}
                  {doc.is_shared_externally && (
                    <GlanceChip icon={Share2} label="Shared" tone="blue" />
                  )}
                  {doc.in_bundle && (
                    <GlanceChip icon={Package} label="In bundle" tone="slate" />
                  )}
                  {doc.in_emergency && (
                    <GlanceChip icon={LifeBuoy} label="Emergency access" tone="amber" />
                  )}
                  {doc.missing_file && (
                    <GlanceChip icon={Paperclip} label="No file attached" tone="amber" />
                  )}
                  {doc.missing_expiry_date && (
                    <GlanceChip icon={Info} label="No expiry date" tone="amber" />
                  )}
                  <GlanceChip icon={ShieldCheck} label="Private by default" tone="green" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => selectTab("files")}
                >
                  <UploadCloud className="size-4" />
                  Upload file
                </Button>
                <Link
                  href={`${basePath}/edit`}
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  <Edit3 className="size-4" />
                  Edit metadata
                </Link>
              </div>
            </div>

            <div className="mt-6">
              <DocumentSummaryGrid doc={doc} />
            </div>
          </section>

          <DocumentTabs
            tabs={TABS}
            active={activeTab}
            onSelect={selectTab}
          />

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="min-w-0">{renderTab()}</div>
            <WorkspaceSidePanel doc={doc} />
          </div>
        </>
      )}
    </PageContainer>
  );
}

function GlanceChip({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "slate" | "blue" | "amber" | "green";
}) {
  const cls = {
    slate: "bg-muted text-muted-foreground",
    blue: "bg-primary/10 text-primary",
    amber: "bg-brand-amber/10 text-brand-amber",
    green: "bg-brand-success/10 text-brand-success",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-medium",
        cls,
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}
