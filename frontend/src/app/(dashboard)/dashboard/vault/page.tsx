"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  FileText,
  FolderOpen,
  Inbox,
  Info,
  Layers,
  Lock,
  Paperclip,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { useDashboardUser } from "@/components/dashboard/user-context";
import {
  CategoryCard,
  DocRow,
  HealthSkeleton,
  RowsSkeleton,
  VaultHealthStat,
  VaultSectionError,
} from "@/components/vault/pieces";
import { CategoryCreator } from "@/components/vault/category-creator";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatFileSize, getFileInbox } from "@/lib/document-files";
import {
  formatDate,
  getAttentionNeeded,
  getDocuments,
  listDocumentCategories,
} from "@/lib/documents";
import {
  computeVaultHealth,
  getFileInboxStatus,
  getVaultStatusSentence,
  type VaultHealth,
} from "@/lib/vault";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { DocumentFile } from "@/types/document-files";
import type { DocumentCategory, DocumentRecord } from "@/types/documents";

interface VaultState {
  total: number;
  expiringSoon: number;
  expired: number;
  missingFile: number;
  missingInfo: number;
  attention: DocumentRecord[];
  attentionCount: number;
  recent: DocumentRecord[];
  inbox: DocumentFile[];
  inboxCount: number;
  categories: DocumentCategory[];
  categoryCounts: Record<number, number>;
  errors: {
    counts: boolean;
    attention: boolean;
    recent: boolean;
    inbox: boolean;
    categories: boolean;
  };
}

function val<T>(r: PromiseSettledResult<T>): T | null {
  return r.status === "fulfilled" ? r.value : null;
}

const HEALTH_RING: Record<VaultHealth["tone"], string> = {
  good: "var(--color-brand-success)",
  warn: "var(--color-brand-amber)",
  danger: "var(--color-destructive)",
  neutral: "var(--color-primary)",
};

export default function VaultPage() {
  const user = useDashboardUser();
  const [state, setState] = useState<VaultState | null>(null);
  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    let results;
    try {
      results = await Promise.allSettled([
        getDocuments({ page_size: 1 }),
        getDocuments({ computed_status: "expiring_soon", page_size: 1 }),
        getDocuments({ computed_status: "expired", page_size: 1 }),
        getDocuments({ missing_file: true, page_size: 1 }),
        getDocuments({ missing_expiry_date: true, page_size: 1 }),
        getAttentionNeeded(),
        getDocuments({ ordering: "-updated_at", page_size: 5 }),
        getFileInbox(),
        listDocumentCategories(),
      ]);
    } catch {
      return;
    }
    if (!mountedRef.current) return;
    const [
      total,
      expiringSoon,
      expired,
      missingFile,
      missingInfo,
      attention,
      recent,
      inbox,
      categories,
    ] = results;

    const countsError =
      total.status === "rejected" ||
      expiringSoon.status === "rejected" ||
      expired.status === "rejected" ||
      missingFile.status === "rejected" ||
      missingInfo.status === "rejected";

    setState({
      total: val(total)?.count ?? 0,
      expiringSoon: val(expiringSoon)?.count ?? 0,
      expired: val(expired)?.count ?? 0,
      missingFile: val(missingFile)?.count ?? 0,
      missingInfo: val(missingInfo)?.count ?? 0,
      attention: val(attention)?.items ?? [],
      attentionCount: val(attention)?.count ?? 0,
      recent: (val(recent)?.results ?? []).slice(0, 5),
      inbox: (val(inbox)?.results ?? []).slice(0, 3),
      inboxCount: val(inbox)?.count ?? 0,
      categories: val(categories) ?? [],
      categoryCounts: {},
      errors: {
        counts: countsError,
        attention: attention.status === "rejected",
        recent: recent.status === "rejected",
        inbox: inbox.status === "rejected",
        categories: categories.status === "rejected",
      },
    });

    // Lazily fetch per-category document counts for the shown categories
    // (bounded to 6 lightweight count queries) and merge them in once ready.
    const shownCategories = (val(categories) ?? []).slice(0, 6);
    if (shownCategories.length > 0) {
      const countResults = await Promise.allSettled(
        shownCategories.map((c) =>
          getDocuments({ category: c.id, page_size: 1 }),
        ),
      );
      if (!mountedRef.current) return;
      const map: Record<number, number> = {};
      shownCategories.forEach((c, i) => {
        const r = countResults[i];
        if (r.status === "fulfilled") map[c.id] = r.value.count;
      });
      setState((prev) => (prev ? { ...prev, categoryCounts: map } : prev));
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    trackEvent("vault_viewed");
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const loading = state === null;
  const greetingName = user.first_name?.trim() || user.username;

  const health = useMemo(
    () =>
      computeVaultHealth({
        total: state?.total ?? 0,
        needsAttention: state?.attentionCount ?? 0,
        expired: state?.expired ?? 0,
        expiringSoon: state?.expiringSoon ?? 0,
        missingFile: state?.missingFile ?? 0,
        missingInfo: state?.missingInfo ?? 0,
      }),
    [state],
  );

  const isEmptyVault = !loading && state.total === 0;
  const inboxStatus = getFileInboxStatus(state?.inboxCount ?? 0);
  function handleCategoryCreated(category: DocumentCategory) {
    setState((prev) =>
      prev
        ? {
            ...prev,
            categories: [category, ...prev.categories],
            categoryCounts: { ...prev.categoryCounts, [category.id]: 0 },
          }
        : prev,
    );
  }

  function handleCategoryUpdated(category: DocumentCategory) {
    setState((prev) =>
      prev
        ? {
            ...prev,
            categories: prev.categories.map((c) =>
              c.id === category.id ? category : c,
            ),
          }
        : prev,
    );
  }

  function handleCategoryDeleted(id: number) {
    setState((prev) =>
      prev
        ? { ...prev, categories: prev.categories.filter((c) => c.id !== id) }
        : prev,
    );
  }

  return (
    <PageContainer width="wide">
      {/* Hero */}
      {loading ? (
        <VaultHeroSkeleton />
      ) : (
        <section
          aria-labelledby="vault-title"
          className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-primary">
                <Lock className="size-5" aria-hidden />
                <h1
                  id="vault-title"
                  className="font-heading text-3xl font-semibold tracking-tight text-foreground"
                >
                  Vault
                </h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Welcome back, {greetingName}
              </p>
              <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-foreground">
                {getVaultStatusSentence(state.total, state.attentionCount)}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard/documents/new"
                  className={cn(buttonVariants({ size: "lg" }))}
                >
                  <Plus className="size-4" aria-hidden />
                  Upload document
                </Link>
                <Link
                  href="/dashboard/files"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                >
                  <Inbox className="size-4" aria-hidden />
                  Organize File Inbox
                </Link>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="size-3.5 text-brand-success" aria-hidden />
                Your important files stay organized, private, and ready.
              </p>
            </div>

            {state.total > 0 && (
              <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                <div
                  className="flex size-12 items-center justify-center rounded-full text-base font-semibold"
                  style={{
                    background: `conic-gradient(${HEALTH_RING[health.tone]} ${health.score}%, var(--color-border) 0)`,
                  }}
                  aria-hidden
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-card text-sm">
                    {health.score}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-semibold">Vault health</p>
                  <p className="text-xs text-muted-foreground">{health.label}</p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {isEmptyVault ? (
        <SectionCard title="Start your vault">
          <EmptyState
            icon={FileText}
            title="Start with the documents you can't afford to lose"
            description="Add your passport, ID, visa, insurance, certificate, or any document you need to keep safe. DueNest tracks expiry dates, flags what needs attention, and keeps everything private."
            action={
              <Link
                href="/dashboard/documents/new"
                className={cn(buttonVariants({ size: "lg" }))}
              >
                <Plus className="size-4" aria-hidden />
                Add your first document
              </Link>
            }
          />
        </SectionCard>
      ) : (
        <>
          {/* Health cards */}
          {loading ? (
            <HealthSkeleton />
          ) : state.errors.counts ? (
            <VaultSectionError
              message="Vault health could not load. Try again."
              onRetry={load}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <VaultHealthStat
                label="Protected"
                value={state.total}
                subtitle="Private, encrypted documents"
                icon={ShieldCheck}
                tone="green"
                href="/dashboard/documents"
              />
              <VaultHealthStat
                label="Needs attention"
                value={state.attentionCount}
                subtitle="Most urgent first"
                icon={AlertTriangle}
                tone={state.attentionCount > 0 ? "amber" : "slate"}
                href="/dashboard/attention"
              />
              <VaultHealthStat
                label="Expiring soon"
                value={state.expiringSoon}
                subtitle="Within 90 days"
                icon={CalendarClock}
                tone={state.expiringSoon > 0 ? "amber" : "slate"}
                href="/dashboard/documents?quick=expiring_soon"
              />
              <VaultHealthStat
                label="Expired"
                value={state.expired}
                subtitle="May no longer be accepted"
                icon={AlertTriangle}
                tone={state.expired > 0 ? "red" : "slate"}
                href="/dashboard/documents?quick=expired"
              />
              <VaultHealthStat
                label="Missing file"
                value={state.missingFile}
                subtitle="No file attached yet"
                icon={Paperclip}
                tone={state.missingFile > 0 ? "blue" : "slate"}
                href="/dashboard/documents?quick=missing_file"
              />
              <VaultHealthStat
                label="Missing info"
                value={state.missingInfo}
                subtitle="No expiry date set"
                icon={Info}
                tone={state.missingInfo > 0 ? "blue" : "slate"}
                href="/dashboard/documents?quick=missing_expiry_date"
              />
            </div>
          )}

          {/* Main grid */}
          <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
            <div className="flex min-w-0 flex-col gap-6">
              <SectionCard
                title="Needs attention"
                description="Expired, expiring, or missing key details — most urgent first."
                action={
                  <Link
                    href="/dashboard/attention"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    View all
                  </Link>
                }
              >
                {loading ? (
                  <RowsSkeleton rows={4} />
                ) : state.errors.attention ? (
                  <VaultSectionError
                    message="Attention list could not load. Try again."
                    onRetry={load}
                  />
                ) : state.attention.length === 0 ? (
                  <CalmEmpty
                    icon={ShieldCheck}
                    title="Nothing needs attention"
                    description="All documents have the important details DueNest needs."
                  />
                ) : (
                  <ul className="space-y-2.5">
                    {state.attention.slice(0, 5).map((doc) => (
                      <DocRow key={doc.id} doc={doc} />
                    ))}
                  </ul>
                )}
              </SectionCard>

              <SectionCard
                title="Recently updated"
                action={
                  <Link
                    href="/dashboard/documents"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    All documents
                  </Link>
                }
              >
                {loading ? (
                  <RowsSkeleton rows={3} />
                ) : state.errors.recent ? (
                  <VaultSectionError message="Recent documents could not load." onRetry={load} />
                ) : state.recent.length === 0 ? (
                  <CalmEmpty
                    icon={FileText}
                    title="No documents yet"
                    description="Documents you add or edit will show up here."
                  />
                ) : (
                  <ul className="divide-y divide-border">
                    {state.recent.map((doc) => (
                      <li key={doc.id}>
                        <Link
                          href={`/dashboard/documents/${doc.id}`}
                          className="flex items-center justify-between gap-2 py-2.5 text-sm transition-colors hover:text-primary"
                        >
                          <span className="min-w-0 truncate">{doc.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatDate(doc.updated_at)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>

            {/* Right rail */}
            <div className="flex min-w-0 flex-col gap-6">
              <SectionCard
                title="File Inbox"
                action={
                  <Link
                    href="/dashboard/files"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Open
                  </Link>
                }
              >
                {loading ? (
                  <RowsSkeleton rows={2} />
                ) : state.errors.inbox ? (
                  <VaultSectionError
                    message="File Inbox could not load. Your uploaded files are still protected."
                    onRetry={load}
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3 rounded-lg bg-muted/40 px-3 py-2.5">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                        <Inbox className="size-4" aria-hidden />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{inboxStatus.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {inboxStatus.description}
                        </p>
                      </div>
                    </div>
                    {state.inbox.length > 0 && (
                      <ul className="space-y-1.5">
                        {state.inbox.map((file) => (
                          <li
                            key={file.id}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <FileText
                                className="size-3.5 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                              <span className="truncate">{file.original_filename}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatFileSize(file.file_size)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {state.inboxCount > 0 && (
                      <Link
                        href="/dashboard/files"
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "w-full",
                        )}
                      >
                        Finish organizing
                      </Link>
                    )}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Categories"
                action={
                  <Link
                    href="/dashboard/documents"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Browse
                  </Link>
                }
              >
                {loading ? (
                  <RowsSkeleton rows={3} />
                ) : state.errors.categories ? (
                  <VaultSectionError message="Categories could not load." onRetry={load} />
                ) : (
                  <div>
                    {state.categories.length === 0 ? (
                      <CalmEmpty
                        icon={FolderOpen}
                        title="No categories yet"
                        description="Create categories for travel, school, finance, work, and identity."
                      />
                    ) : (
                      <div className="space-y-2">
                        {state.categories.slice(0, 6).map((category) => (
                          <CategoryCard
                            key={category.id}
                            category={category}
                            count={state.categoryCounts[category.id]}
                          />
                        ))}
                      </div>
                    )}
                    <Link
                      href="/dashboard/documents?category=none"
                      className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      <span className="flex items-center gap-2">
                        <FolderOpen className="size-4" aria-hidden />
                        Uncategorized documents
                      </span>
                      <span className="text-xs">Organize</span>
                    </Link>
                    <CategoryCreator
                      categories={state.categories}
                      onCreated={handleCategoryCreated}
                      onUpdated={handleCategoryUpdated}
                      onDeleted={handleCategoryDeleted}
                    />
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Quick actions">
                <div className="grid grid-cols-2 gap-2.5">
                  <QuickLink href="/dashboard/documents/new" icon={Plus} label="Upload" />
                  <QuickLink href="/dashboard/documents" icon={Layers} label="All documents" />
                  <QuickLink href="/dashboard/files" icon={Inbox} label="File Inbox" />
                  <QuickLink href="/dashboard/trash" icon={Trash2} label="Trash" />
                </div>
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Plus;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-4" aria-hidden />
      </span>
      {label}
    </Link>
  );
}

function CalmEmpty({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof FileText;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-8 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-brand-success/10 text-brand-success">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function VaultHeroSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="mt-3 h-4 w-full max-w-xl" />
      <div className="mt-5 flex gap-3">
        <Skeleton className="h-10 w-44 rounded-lg" />
        <Skeleton className="h-10 w-44 rounded-lg" />
      </div>
    </div>
  );
}
