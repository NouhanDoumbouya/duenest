"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Edit3,
  FileCheck2,
  FileText,
  Loader2,
  RefreshCw,
  Share2,
  UploadCloud,
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
import { formatDate, getDocument } from "@/lib/documents";
import { tagColorClass } from "@/lib/tags";
import { cn } from "@/lib/utils";
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
                <h1 className="mt-3 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                  {doc.title}
                </h1>
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
