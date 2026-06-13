"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Loader2,
  Pencil,
  Trash2,
  UploadCloud,
} from "lucide-react";

import { DocumentStatusBadge } from "@/components/documents/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import {
  ACCEPT_ATTR,
  uploadDocumentFile,
  validateFile,
} from "@/lib/document-files";
import { formatDate } from "@/lib/documents";
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

export function DocumentCard({
  doc,
  onRequestDelete,
}: {
  doc: DocumentRecord;
  onRequestDelete: (doc: DocumentRecord) => void;
}) {
  const meta = [doc.document_type, doc.issuer, doc.country]
    .filter(Boolean)
    .join(" · ");
  const expiryPast = doc.is_expired;
  const attentionIsUrgent =
    doc.urgency_level === "critical" || doc.urgency_level === "high";

  // One-click upload straight from the card — no need to open the document.
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-picking the same file later
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
      setStatus({ ok: true, msg: `Attached “${uploaded.original_filename}”` });
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
    <Card className="transition-all duration-200 hover:shadow-elevated">
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/dashboard/documents/${doc.id}/edit`}
                className="truncate font-heading text-base font-semibold hover:underline"
              >
                {doc.title}
              </Link>
              <DocumentStatusBadge status={doc.computed_status} />
            </div>
            {meta && (
              <p className="mt-1 truncate text-sm text-muted-foreground">{meta}</p>
            )}
            {doc.needs_attention && (
              <p
                className={cn(
                  "mt-2 flex items-start gap-1.5 text-xs leading-relaxed",
                  attentionIsUrgent ? "text-destructive" : "text-muted-foreground",
                )}
              >
                <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
                <span>{doc.status_reason}</span>
              </p>
            )}
            {doc.category_name && (
              <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
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
          </div>

          <div className="flex items-center gap-2 sm:flex-col sm:items-stretch">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={handleFile}
              disabled={uploading}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              aria-label={`Upload a file to ${doc.title}`}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <UploadCloud className="size-3.5" />
              )}
              {uploading ? "Uploading…" : "Upload"}
            </Button>
            <Link
              href={`/dashboard/documents/${doc.id}/edit`}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground hover:text-foreground",
              )}
            >
              <Pencil className="size-3.5" />
              Edit
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => onRequestDelete(doc)}
              aria-label={`Delete ${doc.title}`}
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
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
                href={`/dashboard/documents/${doc.id}/edit`}
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
