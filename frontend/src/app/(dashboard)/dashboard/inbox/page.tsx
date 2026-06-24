"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Download,
  FileText,
  Inbox as InboxIcon,
  Link2,
  Loader2,
  Lock,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Trash2,
  Type,
  Upload,
  X,
} from "lucide-react";

import { useFeature } from "@/components/features/feature-flags-provider";
import { AiActivationCard } from "@/components/ai/ai-activation-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert, SegmentedControl, TrustNotice } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Toast, type ToastState } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import {
  formatFileSize,
  getInboxFileDownloadBlob,
  saveBlob,
} from "@/lib/document-files";
import {
  INBOX_STATUS_LABELS,
  INBOX_STATUS_ORDER,
  SUGGESTION_PRIORITY_LABELS,
  analyzeMagicInboxItem,
  analyzeReasonMessage,
  applyMagicInboxSuggestions,
  applySkippedReasonMessage,
  archiveMagicInboxItem,
  createLinkItem,
  createTextItem,
  deleteMagicInboxItem,
  getMagicInbox,
  groupSuggestionsByPriority,
  isAnalyzeUpgradeReason,
  isAnalyzeUsageReason,
  magicInboxCreditNotice,
  routeDestination,
  uploadFileItemWithProgress,
} from "@/lib/magic-inbox";
import { cn } from "@/lib/utils";
import type {
  ApplyResult,
  MagicInboxItem,
  MagicInboxStatus,
  Suggestion,
  SuggestionPriority,
} from "@/types/magic-inbox";

type IntakeMode = "file" | "text" | "link";

const ACCEPT_ATTR = "image/*,application/pdf,.doc,.docx";

const ITEM_TYPE_META: Record<
  MagicInboxItem["item_type"],
  { icon: typeof FileText; label: string }
> = {
  file: { icon: Paperclip, label: "File" },
  text: { icon: Type, label: "Pasted text" },
  link: { icon: Link2, label: "Link" },
};

const STATUS_TONE: Record<
  MagicInboxStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  new: "neutral",
  analyzed: "info",
  applied: "success",
  archived: "neutral",
  failed: "danger",
};

const PRIORITY_BADGE_TONE: Record<SuggestionPriority, "info" | "neutral"> = {
  high: "info",
  medium: "neutral",
  low: "neutral",
};

export default function MagicInboxPage() {
  const inboxEnabled = useFeature("magic_inbox");
  const smartEnabled = useFeature("magic_inbox_triage");

  const [items, setItems] = useState<MagicInboxItem[] | null>(null);
  // When the feature is gated off we never fetch, so start un-loading there.
  const [loading, setLoading] = useState(inboxEnabled);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<MagicInboxStatus | "all">(
    "all",
  );

  // Intake panel.
  const [mode, setMode] = useState<IntakeMode>("file");
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Detail drawer.
  const [activeId, setActiveId] = useState<number | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);

  useEffect(() => {
    // When gated off we never fetch; `loading` already starts false there.
    if (!inboxEnabled) return;
    let active = true;
    getMagicInbox()
      .then((res) => active && setItems(res.items))
      .catch((err) => {
        if (!active) return;
        setLoadError(
          err instanceof ApiError
            ? err.message
            : "Could not load your inbox.",
        );
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [inboxEnabled]);

  const activeItem = useMemo(
    () => (items ?? []).find((i) => i.id === activeId) ?? null,
    [items, activeId],
  );

  // Group items by status for the list, in a stable order.
  const grouped = useMemo(() => {
    const list = items ?? [];
    const visible =
      statusFilter === "all"
        ? list
        : list.filter((i) => i.status === statusFilter);
    return INBOX_STATUS_ORDER.map((status) => ({
      status,
      items: visible.filter((i) => i.status === status),
    })).filter((g) => g.items.length > 0);
  }, [items, statusFilter]);

  function upsertItem(updated: MagicInboxItem) {
    setItems((current) =>
      (current ?? []).map((i) => (i.id === updated.id ? updated : i)),
    );
  }

  function prependItem(created: MagicInboxItem) {
    setItems((current) => [created, ...(current ?? [])]);
  }

  async function captureFile(file: File) {
    setCapturing(true);
    setIntakeError(null);
    setUploadPercent(0);
    try {
      const created = await uploadFileItemWithProgress(file, setUploadPercent);
      prependItem(created);
      setActiveId(created.id);
    } catch (err) {
      setIntakeError(
        err instanceof ApiError ? err.message : "Could not capture this file.",
      );
    } finally {
      setCapturing(false);
      setUploadPercent(null);
    }
  }

  async function captureText() {
    const value = text.trim();
    if (!value) return;
    setCapturing(true);
    setIntakeError(null);
    try {
      const created = await createTextItem({ pasted_text: value });
      prependItem(created);
      setText("");
      setActiveId(created.id);
    } catch (err) {
      setIntakeError(
        err instanceof ApiError ? err.message : "Could not capture this text.",
      );
    } finally {
      setCapturing(false);
    }
  }

  async function captureLink() {
    const value = link.trim();
    if (!value) return;
    setCapturing(true);
    setIntakeError(null);
    try {
      const created = await createLinkItem({ source_url: value });
      prependItem(created);
      setLink("");
      setActiveId(created.id);
    } catch (err) {
      setIntakeError(
        err instanceof ApiError ? err.message : "Could not capture this link.",
      );
    } finally {
      setCapturing(false);
    }
  }

  async function handleArchive(item: MagicInboxItem) {
    try {
      const updated = await archiveMagicInboxItem(item.id);
      upsertItem(updated);
      setToast({ message: "Moved to Archived.", kind: "success" });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "Could not archive this item.",
        kind: "error",
      });
    }
  }

  async function handleDelete(item: MagicInboxItem) {
    try {
      await deleteMagicInboxItem(item.id);
      setItems((current) => (current ?? []).filter((i) => i.id !== item.id));
      if (activeId === item.id) setActiveId(null);
      setToast({ message: "Item deleted.", kind: "success" });
    } catch (err) {
      setToast({
        message:
          err instanceof ApiError ? err.message : "Could not delete this item.",
        kind: "error",
      });
    }
  }

  // --- Feature-gated full page ---
  if (!inboxEnabled) {
    return (
      <PageContainer width="narrow">
        <PageHeader
          eyebrow="Prepare & share"
          title="Magic Inbox"
          description="Turn incoming information into documents, reminders, packs, and applications."
        />
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={Lock}
            title="Not enabled yet"
            description="Magic Inbox isn't switched on for your account yet."
          />
        </div>
      </PageContainer>
    );
  }

  const hasItems = (items ?? []).length > 0;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Prepare & share"
        title="Magic Inbox"
        description="Drop documents, paste emails, and turn incoming information into documents, reminders, packs, and applications."
      />

      <IntakePanel
        mode={mode}
        onModeChange={setMode}
        text={text}
        onTextChange={setText}
        link={link}
        onLinkChange={setLink}
        capturing={capturing}
        uploadPercent={uploadPercent}
        dragging={dragging}
        onDraggingChange={setDragging}
        error={intakeError}
        onFile={captureFile}
        onCaptureText={captureText}
        onCaptureLink={captureLink}
      />

      {loadError && <InlineAlert>{loadError}</InlineAlert>}

      {/* Status filter */}
      {hasItems && (
        <div className="-mb-2 flex flex-wrap items-center gap-2">
          <FilterChip
            active={statusFilter === "all"}
            label="All"
            onClick={() => setStatusFilter("all")}
          />
          {INBOX_STATUS_ORDER.filter((s) =>
            (items ?? []).some((i) => i.status === s),
          ).map((status) => (
            <FilterChip
              key={status}
              active={statusFilter === status}
              label={INBOX_STATUS_LABELS[status]}
              onClick={() => setStatusFilter(status)}
            />
          ))}
        </div>
      )}

      {loading ? (
        <section className="grid gap-3" aria-busy="true" aria-label="Loading inbox">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="size-10 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : !hasItems ? (
        <div className="rounded-2xl border border-dashed border-border bg-card">
          <EmptyState
            icon={InboxIcon}
            title="Drop your first document or paste an application email."
            description="Anything you capture stays private until you choose to act on it. Nothing is applied automatically."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button onClick={() => setMode("file")}>
                  <Upload className="size-4" /> Upload document
                </Button>
                <Button variant="outline" onClick={() => setMode("text")}>
                  <Type className="size-4" /> Paste email
                </Button>
                <Button variant="outline" onClick={() => setMode("link")}>
                  <Link2 className="size-4" /> Paste requirement text
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.map((group) => (
            <section key={group.status} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {INBOX_STATUS_LABELS[group.status]}
                </h2>
                <span className="text-xs text-muted-foreground/70">
                  {group.items.length}
                </span>
              </div>
              <div className="grid gap-3">
                {group.items.map((item) => (
                  <InboxCard
                    key={item.id}
                    item={item}
                    onOpen={() => setActiveId(item.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {activeItem && (
        <ItemDetailDrawer
          key={activeItem.id}
          item={activeItem}
          smartEnabled={smartEnabled}
          onClose={() => setActiveId(null)}
          onUpdated={upsertItem}
          onArchive={() => handleArchive(activeItem)}
          onDelete={() => handleDelete(activeItem)}
          onToast={setToast}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </PageContainer>
  );
}

// ---- Intake panel ----------------------------------------------------------

function IntakePanel({
  mode,
  onModeChange,
  text,
  onTextChange,
  link,
  onLinkChange,
  capturing,
  uploadPercent,
  dragging,
  onDraggingChange,
  error,
  onFile,
  onCaptureText,
  onCaptureLink,
}: {
  mode: IntakeMode;
  onModeChange: (m: IntakeMode) => void;
  text: string;
  onTextChange: (v: string) => void;
  link: string;
  onLinkChange: (v: string) => void;
  capturing: boolean;
  uploadPercent: number | null;
  dragging: boolean;
  onDraggingChange: (v: boolean) => void;
  error: string | null;
  onFile: (file: File) => void;
  onCaptureText: () => void;
  onCaptureLink: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-semibold">
            Capture something
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Private until shared. We&apos;ll suggest what to do next — you decide.
          </p>
        </div>
        <SegmentedControl<IntakeMode>
          label="What to capture"
          value={mode}
          onChange={onModeChange}
          options={[
            { value: "file", label: "Upload file" },
            { value: "text", label: "Paste text" },
            { value: "link", label: "Paste link" },
          ]}
        />
      </div>

      <div className="mt-4">
        {mode === "file" && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragging) onDraggingChange(true);
            }}
            onDragLeave={() => onDraggingChange(false)}
            onDrop={(e) => {
              e.preventDefault();
              onDraggingChange(false);
              const file = e.dataTransfer.files?.[0];
              if (file) onFile(file);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
              {capturing ? (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-5" aria-hidden />
              )}
            </span>
            <div>
              <p className="font-heading text-sm font-semibold">
                {dragging ? "Drop to capture" : "Drag & drop a file here"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                PDF, image, or Word file up to 10 MB.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={capturing}
            >
              <Upload className="size-4" /> Choose a file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              accept={ACCEPT_ATTR}
              disabled={capturing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFile(file);
                e.target.value = "";
              }}
            />
            {uploadPercent !== null && (
              <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            )}
          </div>
        )}

        {mode === "text" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="intake-text">Paste an email or requirement text</Label>
            <Textarea
              id="intake-text"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              placeholder="Paste the body of an application email, a list of required documents, or any text you want to act on…"
              rows={5}
              disabled={capturing}
            />
            <div className="flex justify-end">
              <Button onClick={onCaptureText} disabled={capturing || !text.trim()}>
                {capturing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Type className="size-4" />
                )}
                Capture text
              </Button>
            </div>
          </div>
        )}

        {mode === "link" && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="intake-link">Paste a link</Label>
            <Input
              id="intake-link"
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => onLinkChange(e.target.value)}
              placeholder="https://example.com/application-requirements"
              disabled={capturing}
            />
            <div className="flex justify-end">
              <Button onClick={onCaptureLink} disabled={capturing || !link.trim()}>
                {capturing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Link2 className="size-4" />
                )}
                Capture link
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3">
          <InlineAlert>{error}</InlineAlert>
        </div>
      )}
    </section>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

// ---- List card -------------------------------------------------------------

function InboxCard({
  item,
  onOpen,
}: {
  item: MagicInboxItem;
  onOpen: () => void;
}) {
  const meta = ITEM_TYPE_META[item.item_type];
  const Icon = meta.icon;
  const summary = item.extracted_payload?.summary;
  const suggestionCount = item.suggestions?.length ?? 0;

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elevated motion-reduce:transform-none motion-reduce:transition-none">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 text-left focus-visible:outline-none"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-medium">
              {item.title || meta.label}
            </h3>
            <StatusBadge tone={STATUS_TONE[item.status]} withDot={false}>
              {INBOX_STATUS_LABELS[item.status]}
            </StatusBadge>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {summary ||
              item.source_label ||
              (item.item_type === "link"
                ? item.source_url
                : item.pasted_text) ||
              "Not analyzed yet."}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground/80">
            {meta.label}
            {suggestionCount > 0 && (
              <> · {suggestionCount} suggestion{suggestionCount === 1 ? "" : "s"}</>
            )}
            {" · "}
            {new Date(item.created_at).toLocaleDateString()}
          </p>
        </div>
        <ArrowUpRight
          className="mt-1 size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>
    </article>
  );
}

// ---- Detail drawer ---------------------------------------------------------

function ItemDetailDrawer({
  item,
  smartEnabled,
  onClose,
  onUpdated,
  onArchive,
  onDelete,
  onToast,
}: {
  item: MagicInboxItem;
  smartEnabled: boolean;
  onClose: () => void;
  onUpdated: (item: MagicInboxItem) => void;
  onArchive: () => void;
  onDelete: () => void;
  onToast: (t: ToastState) => void;
}) {
  const meta = ITEM_TYPE_META[item.item_type];

  const [useSmart, setUseSmart] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeBlock, setAnalyzeBlock] = useState<{
    message: string;
    upgrade: boolean;
    usage: boolean;
  } | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<ApplyResult | null>(null);

  const [downloading, setDownloading] = useState(false);

  // The drawer is keyed by item.id in the parent, so it remounts fresh per item
  // — no reset effect needed.

  const suggestionGroups = groupSuggestionsByPriority(item.suggestions);
  const hasSuggestions = (item.suggestions?.length ?? 0) > 0;

  function toggleSuggestion(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runAnalyze() {
    setAnalyzing(true);
    setAnalyzeBlock(null);
    try {
      const res = await analyzeMagicInboxItem(item.id, { use_ai: useSmart });
      if (useSmart && !res.available) {
        setAnalyzeBlock({
          message: analyzeReasonMessage(res.reason),
          upgrade: isAnalyzeUpgradeReason(res.reason),
          usage: isAnalyzeUsageReason(res.reason),
        });
        // The standard analysis still applies — keep whatever the backend
        // returned on the item.
      }
      onUpdated(res.item);
      // Clear selections so the user reviews the fresh suggestions.
      setSelected(new Set());
      setApplyResult(null);
      if (res.ai_used && res.credits_charged > 0) {
        onToast({
          message: `Smart analysis done. ${res.credits_charged} AI credits used.`,
          kind: "success",
        });
      }
    } catch (err) {
      setAnalyzeBlock({
        message:
          err instanceof ApiError
            ? err.status === 503
              ? "Magic Inbox analysis isn't enabled yet."
              : err.message
            : "We couldn't analyze this item. Please try again.",
        upgrade: false,
        usage: false,
      });
    } finally {
      setAnalyzing(false);
    }
  }

  async function runApply() {
    const chosen = (item.suggestions ?? []).filter((s) => selected.has(s.id));
    if (chosen.length === 0) return;
    setApplying(true);
    setApplyResult(null);
    try {
      const res = await applyMagicInboxSuggestions(
        item.id,
        chosen.map((s) => ({ id: s.id, type: s.type, data: s.data })),
      );
      onUpdated(res.item);
      setApplyResult(res);
      setSelected(new Set());
    } catch (err) {
      onToast({
        message:
          err instanceof ApiError
            ? err.message
            : "Could not apply your choices.",
        kind: "error",
      });
    } finally {
      setApplying(false);
    }
  }

  async function downloadFile() {
    if (!item.file) return;
    setDownloading(true);
    try {
      const blob = await getInboxFileDownloadBlob(item.file.id);
      saveBlob(blob, item.file.original_filename);
    } catch (err) {
      onToast({
        message:
          err instanceof ApiError ? err.message : "Could not download the file.",
        kind: "error",
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label={item.title || meta.label}
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={STATUS_TONE[item.status]} withDot={false}>
                {INBOX_STATUS_LABELS[item.status]}
              </StatusBadge>
              <span className="text-xs text-muted-foreground">{meta.label}</span>
            </div>
            <h2 className="mt-2 font-heading text-lg font-semibold break-words">
              {item.title || meta.label}
            </h2>
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

        {/* Source preview */}
        <div className="mt-4">
          <SourcePreview
            item={item}
            downloading={downloading}
            onDownload={downloadFile}
          />
        </div>

        {/* Linked context */}
        <LinkedContext item={item} />

        {/* Summary */}
        {item.extracted_payload?.summary && (
          <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3.5">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Summary
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
              {item.extracted_payload.summary}
            </p>
            {item.extracted_payload.detected_dates &&
              item.extracted_payload.detected_dates.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Dates found:{" "}
                  {item.extracted_payload.detected_dates.join(", ")}
                </p>
              )}
          </div>
        )}

        {/* Warnings */}
        <WarningsView warnings={item.warnings} />

        {/* Analyze controls */}
        <div className="mt-5 rounded-xl border border-border bg-card p-3.5">
          <h3 className="text-sm font-medium">
            {hasSuggestions ? "Re-analyze" : "Analyze"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Standard analysis is instant, free, and works on every plan.
          </p>

          {smartEnabled && (
            <label className="mt-3 flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4"
                checked={useSmart}
                onChange={(e) => setUseSmart(e.target.checked)}
                disabled={analyzing}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <Sparkles className="size-3.5 text-primary" aria-hidden />
                  Smart analysis
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Deeper understanding with AI. {magicInboxCreditNotice()}
                </span>
              </span>
            </label>
          )}

          {useSmart && smartEnabled && (
            <div className="mt-3">
              <AiActivationCard />
            </div>
          )}

          {analyzeBlock && (
            <div className="mt-3">
              <AnalyzeBlockedNotice {...analyzeBlock} />
            </div>
          )}

          <div className="mt-3">
            <Button onClick={runAnalyze} disabled={analyzing} className="w-full">
              {analyzing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : useSmart && smartEnabled ? (
                <Sparkles className="size-4" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {analyzing
                ? "Analyzing…"
                : useSmart && smartEnabled
                  ? "Run Smart analysis"
                  : hasSuggestions
                    ? "Re-run standard analysis"
                    : "Analyze"}
            </Button>
          </div>
        </div>

        {/* Suggestions */}
        {hasSuggestions && (
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Suggestions</h3>
              <span className="text-xs text-muted-foreground">
                {selected.size} selected
              </span>
            </div>

            {suggestionGroups.map(({ priority, items }) => (
              <div key={priority} className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {SUGGESTION_PRIORITY_LABELS[priority]}
                </p>
                {items.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    checked={selected.has(s.id)}
                    onToggle={() => toggleSuggestion(s.id)}
                  />
                ))}
              </div>
            ))}

            <TrustNotice icon={ShieldCheck} title="Nothing is applied until you choose">
              Applying uses no AI credits. Select what you want, then apply.
            </TrustNotice>

            <Button onClick={runApply} disabled={applying || selected.size === 0}>
              {applying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              Apply selected
            </Button>
          </div>
        )}

        {/* Apply result */}
        {applyResult && (
          <ApplyResultView result={applyResult} onToast={onToast} />
        )}

        {/* Footer actions */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          {item.status !== "archived" && (
            <Button variant="outline" size="sm" onClick={onArchive}>
              <InboxIcon className="size-4" /> Archive
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-4" /> Delete
          </Button>
        </div>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function SourcePreview({
  item,
  downloading,
  onDownload,
}: {
  item: MagicInboxItem;
  downloading: boolean;
  onDownload: () => void;
}) {
  if (item.item_type === "file" && item.file) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <FileText className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {item.file.original_filename}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatFileSize(item.file.file_size)} · Private to you
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onDownload}
          disabled={downloading}
        >
          {downloading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          Download
        </Button>
      </div>
    );
  }

  if (item.item_type === "link") {
    return (
      <div className="rounded-xl border border-border bg-muted/20 p-3.5">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Link
        </h3>
        {item.source_url ? (
          <a
            href={item.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 text-sm break-all text-primary underline-offset-2 hover:underline"
          >
            <Link2 className="size-3.5 shrink-0" aria-hidden />
            {item.source_url}
          </a>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">No link captured.</p>
        )}
      </div>
    );
  }

  // Text.
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Pasted text
      </h3>
      <pre className="mt-1.5 max-h-48 overflow-y-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
        {item.pasted_text || "No text captured."}
      </pre>
    </div>
  );
}

function LinkedContext({ item }: { item: MagicInboxItem }) {
  const links: { label: string; href: string }[] = [];
  if (item.linked_document)
    links.push({
      label: "Linked document",
      href: `/dashboard/documents/${item.linked_document}`,
    });
  if (item.linked_bundle)
    links.push({
      label: "Linked pack",
      href: `/dashboard/bundles/${item.linked_bundle}`,
    });
  if (item.linked_application)
    links.push({
      label: "Linked application",
      href: `/dashboard/applications/${item.linked_application}`,
    });
  if (links.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "text-xs",
          )}
        >
          {l.label} <ArrowUpRight className="size-3.5" />
        </Link>
      ))}
    </div>
  );
}

function SuggestionCard({
  suggestion,
  checked,
  onToggle,
}: {
  suggestion: Suggestion;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors",
        checked
          ? "border-primary bg-primary/5 ring-1 ring-primary/25"
          : "border-border hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <input
        type="checkbox"
        className="mt-0.5 size-4"
        checked={checked}
        onChange={onToggle}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{suggestion.label}</span>
          <StatusBadge
            tone={PRIORITY_BADGE_TONE[suggestion.priority]}
            withDot={false}
          >
            {SUGGESTION_PRIORITY_LABELS[suggestion.priority]}
          </StatusBadge>
        </span>
        {suggestion.description && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {suggestion.description}
          </span>
        )}
        {suggestion.source_snippet && (
          <span className="mt-1.5 block rounded-md border-l-2 border-border bg-muted/40 px-2 py-1 text-xs text-muted-foreground italic">
            “{suggestion.source_snippet}”
          </span>
        )}
      </span>
    </label>
  );
}

function WarningsView({
  warnings,
}: {
  warnings: MagicInboxItem["warnings"];
}) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div className="mt-4 rounded-xl border border-brand-amber/30 bg-brand-amber/10 p-3">
      <p className="mb-1.5 text-xs font-medium text-brand-amber">
        Worth reviewing
      </p>
      <ul className="flex flex-col gap-1">
        {warnings.map((w, i) => (
          <li
            key={`${w.type}-${i}`}
            className="flex items-start gap-1.5 text-xs text-brand-amber"
          >
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span>{w.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnalyzeBlockedNotice({
  message,
  upgrade,
  usage,
}: {
  message: string;
  upgrade: boolean;
  usage: boolean;
}) {
  if (upgrade) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-3 text-sm">
        <p>{message}</p>
        <Link
          href="/dashboard/settings/billing?upgrade=pro"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}
        >
          <Sparkles className="size-4" /> Upgrade to Pro
        </Link>
      </div>
    );
  }
  if (usage) return <InlineAlert tone="warn">{message}</InlineAlert>;
  return <InlineAlert tone="warn">{message}</InlineAlert>;
}

function ApplyResultView({
  result,
  onToast,
}: {
  result: ApplyResult;
  onToast: (t: ToastState) => void;
}) {
  const appliedCount = result.applied?.length ?? 0;
  const skipped = result.skipped ?? [];
  const routes = result.routes ?? [];

  return (
    <div className="mt-4 flex flex-col gap-3">
      {appliedCount > 0 && (
        <InlineAlert tone="good">
          Applied {appliedCount} suggestion{appliedCount === 1 ? "" : "s"}. No AI
          credits were used.
        </InlineAlert>
      )}

      {skipped.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Skipped
          </p>
          <ul className="flex flex-col gap-1">
            {skipped.map((s, i) => (
              <li
                key={`${s.type}-${i}`}
                className="text-xs text-muted-foreground"
              >
                {applySkippedReasonMessage(s.reason)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {routes.length > 0 && (
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
          <p className="mb-2 text-xs font-medium">Continue elsewhere</p>
          <div className="flex flex-col gap-2">
            {routes.map((route, i) => {
              const dest = routeDestination(route);
              if (!dest) {
                return (
                  <p key={i} className="text-xs text-muted-foreground">
                    One step needs to be finished in another tool.
                  </p>
                );
              }
              return (
                <Link
                  key={i}
                  href={dest.href}
                  onClick={() =>
                    onToast({ message: "Opening the next step…", kind: "success" })
                  }
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "justify-between",
                  )}
                >
                  {dest.label}
                  <ArrowUpRight className="size-4" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
