"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BellRing,
  CalendarClock,
  Check,
  CheckCircle2,
  Edit3,
  FileUp,
  Inbox,
  LifeBuoy,
  Loader2,
  MoreHorizontal,
  Package,
  Share2,
  Star,
  Trash2,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";

import { LifecycleBadge } from "@/components/documents/lifecycle-badge";
import { DocumentStatusBadge } from "@/components/documents/status-badge";
import { UrgencyBadge } from "@/components/documents/urgency-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import {
  ACCEPT_ATTR,
  uploadDocumentFile,
  validateFile,
} from "@/lib/document-files";
import { formatDate, updateDocument } from "@/lib/documents";
import { tagColorClass } from "@/lib/tags";
import { cn } from "@/lib/utils";
import type { DocumentRecord } from "@/types/documents";

function DateCell({
  label,
  value,
  emphasise,
}: {
  label: string;
  value: string | null;
  emphasise?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-medium", emphasise && "text-destructive")}>
        {formatDate(value)}
      </p>
    </div>
  );
}

function Signal({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "default" | "good" | "warn";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        tone === "good" &&
          "bg-brand-success/10 text-brand-success ring-brand-success/20",
        tone === "warn" &&
          "bg-brand-amber/15 text-brand-amber ring-brand-amber/25",
        tone === "default" && "bg-muted text-muted-foreground ring-border",
      )}
    >
      <Icon className="size-3" />
      {label}
    </span>
  );
}

export function DocumentCard({
  doc,
  onRequestDelete,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  doc: DocumentRecord;
  onRequestDelete: (doc: DocumentRecord) => void;
  /** When true, the card shows a selection checkbox (Vault bulk-select mode). */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (doc: DocumentRecord) => void;
}) {
  const meta = [doc.document_type, doc.issuer, doc.country]
    .filter(Boolean)
    .join(" · ");
  const expiryPast = doc.is_expired;
  const attentionIsUrgent =
    doc.urgency_level === "critical" || doc.urgency_level === "high";
  const hasReminder =
    doc.confidence_reasons.find((reason) => reason.key === "has_reminder")
      ?.met ?? false;

  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pinned, setPinned] = useState(doc.is_pinned);
  const [pinning, setPinning] = useState(false);

  async function togglePin() {
    const next = !pinned;
    setPinned(next); // optimistic
    setPinning(true);
    try {
      await updateDocument(doc.id, { is_pinned: next });
    } catch {
      setPinned(!next); // revert on failure
    } finally {
      setPinning(false);
    }
  }

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validationError = validateFile(file);
    if (validationError) {
      setStatus({ ok: false, msg: validationError });
      return;
    }

    setStatus(null);
    setUploading(true);
    try {
      const uploaded = await uploadDocumentFile(doc.id, file);
      setStatus({ ok: true, msg: `Attached "${uploaded.original_filename}"` });
    } catch (err) {
      setStatus({
        ok: false,
        msg:
          err instanceof ApiError
            ? err.message
            : "Upload failed. Please try again.",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card
      className={cn(
        "!overflow-visible transition-all duration-200 hover:shadow-elevated",
        selected && "ring-2 ring-primary ring-offset-1",
      )}
    >
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          {selectable && (
            <button
              type="button"
              role="checkbox"
              aria-checked={selected}
              aria-label={selected ? "Deselect document" : "Select document"}
              onClick={() => onToggleSelect?.(doc)}
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                selected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card hover:border-primary/60",
              )}
            >
              {selected && <Check className="size-3.5" aria-hidden />}
            </button>
          )}
          <Link
            href={`/dashboard/documents/${doc.id}`}
            className="-m-2 min-w-0 flex-1 rounded-lg p-2 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {/* Title + status stay primary on every screen. Lower-priority
                badges are deferred to sm+ so mobile cards stay calm and the
                badge row never wraps into multi-line clutter. */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-heading text-base font-semibold">
                {doc.title}
              </span>
              <DocumentStatusBadge status={doc.computed_status} />
              <span className="hidden sm:inline-flex">
                <LifecycleBadge status={doc.lifecycle_status} />
              </span>
              <span className="hidden sm:inline-flex">
                <UrgencyBadge level={doc.urgency_level} />
              </span>
              {doc.is_shared_externally && (
                <span
                  className="hidden items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[0.68rem] font-medium text-primary sm:inline-flex"
                  title="This document has an active external share"
                >
                  <Share2 className="size-3" aria-hidden />
                  Shared
                </span>
              )}
              {doc.in_bundle && (
                <span
                  className="hidden items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground sm:inline-flex"
                  title="This document is used in a bundle"
                >
                  <Package className="size-3" aria-hidden />
                  In bundle
                </span>
              )}
              {doc.in_emergency && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[0.68rem] font-medium text-destructive"
                  title="This document is used in emergency access"
                >
                  <LifeBuoy className="size-3" aria-hidden />
                  Emergency
                </span>
              )}
              {doc.category === null && (
                <span
                  className="hidden items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground sm:inline-flex"
                  title="No category yet — file it to find it faster later"
                >
                  <Inbox className="size-3" aria-hidden />
                  Unsorted
                </span>
              )}
            </div>

            {meta && (
              <p className="mt-1 truncate text-sm text-muted-foreground">{meta}</p>
            )}

            {doc.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {doc.tags.map((tag) => (
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

            <div className="mt-3 flex flex-wrap gap-2">
              <Signal
                icon={FileUp}
                label={doc.has_file ? "File attached" : "No file yet"}
                tone={doc.has_file ? "good" : "warn"}
              />
              <Signal
                icon={BellRing}
                label={hasReminder ? "Reminder active" : "No reminder"}
                tone={hasReminder ? "good" : "default"}
              />
            </div>

            {doc.needs_attention && (
              <p
                className={cn(
                  "mt-3 flex items-start gap-1.5 text-xs leading-relaxed",
                  attentionIsUrgent ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
                <span>{doc.status_reason}</span>
              </p>
            )}

            {doc.category_name && (
              <span className="mt-3 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {doc.category_name}
              </span>
            )}

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <DateCell label="Issued" value={doc.issue_date} />
              <DateCell
                label="Expires"
                value={doc.expiry_date}
                emphasise={expiryPast}
              />
              <DateCell label="Renewal" value={doc.renewal_date} />
            </div>
          </Link>

          <div className="relative flex items-start justify-end" ref={menuRef}>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={handleFile}
              disabled={uploading}
              className="hidden"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePin}
              disabled={pinning}
              aria-label={pinned ? `Unpin ${doc.title}` : `Pin ${doc.title}`}
              aria-pressed={pinned}
              title={pinned ? "Unpin" : "Pin to top"}
            >
              <Star
                className={cn(
                  "size-4",
                  pinned ? "fill-brand-amber text-brand-amber" : "text-muted-foreground",
                )}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={`Open actions for ${doc.title}`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <MoreHorizontal className="size-4" />
            </Button>

            {menuOpen && (
              <div
                className="absolute right-0 top-9 z-20 w-52 rounded-xl border border-border bg-popover p-1 text-sm text-popover-foreground shadow-floating"
                role="menu"
              >
                <Link
                  href={`/dashboard/documents/${doc.id}`}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted"
                  onClick={() => setMenuOpen(false)}
                  role="menuitem"
                >
                  <CalendarClock className="size-4 text-muted-foreground" />
                  Open workspace
                </Link>
                <Link
                  href={`/dashboard/documents/${doc.id}/edit`}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted"
                  onClick={() => setMenuOpen(false)}
                  role="menuitem"
                >
                  <Edit3 className="size-4 text-muted-foreground" />
                  Edit metadata
                </Link>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50"
                  onClick={() => {
                    setMenuOpen(false);
                    inputRef.current?.click();
                  }}
                  disabled={uploading}
                  role="menuitem"
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : (
                    <UploadCloud className="size-4 text-muted-foreground" />
                  )}
                  {uploading ? "Uploading..." : "Upload file"}
                </button>
                <Link
                  href={`/dashboard/documents/${doc.id}?tab=sharing`}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-muted"
                  onClick={() => setMenuOpen(false)}
                  role="menuitem"
                >
                  <Share2 className="size-4 text-muted-foreground" />
                  Sharing options
                </Link>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-destructive transition-colors hover:bg-destructive/10"
                  onClick={() => {
                    setMenuOpen(false);
                    onRequestDelete(doc);
                  }}
                  role="menuitem"
                >
                  <Trash2 className="size-4" />
                  Move to trash
                </button>
              </div>
            )}
          </div>
        </div>

        {status && (
          <p
            className={cn(
              "flex items-center gap-1.5 border-t border-border pt-3 text-xs",
              status.ok ? "text-brand-success" : "text-destructive",
            )}
            role="status"
          >
            {status.ok && <CheckCircle2 className="size-3.5 shrink-0" />}
            {status.msg}
            {status.ok && (
              <Link
                href={`/dashboard/documents/${doc.id}?tab=files`}
                className="ml-1 font-medium underline underline-offset-2"
              >
                View files
              </Link>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
