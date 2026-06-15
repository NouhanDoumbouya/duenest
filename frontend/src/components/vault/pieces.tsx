import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  FolderOpen,
  Lock,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";

import { DocumentStatusBadge } from "@/components/documents/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getDocumentExpiryStatus,
  getDocumentPrimaryAction,
  getDocumentRiskReason,
  isSensitiveDocument,
} from "@/lib/vault";
import { cn } from "@/lib/utils";
import type { DocumentCategory, DocumentRecord } from "@/types/documents";

type Tone = "blue" | "amber" | "teal" | "red" | "green" | "slate";

const TONE: Record<Tone, string> = {
  blue: "bg-primary/10 text-primary",
  amber: "bg-brand-amber/10 text-brand-amber",
  teal: "bg-brand-teal/10 text-brand-teal",
  red: "bg-destructive/10 text-destructive",
  green: "bg-brand-success/10 text-brand-success",
  slate: "bg-muted text-muted-foreground",
};

/** A clickable health/metric tile for the vault overview. */
export function VaultHealthStat({
  label,
  value,
  subtitle,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  subtitle: string;
  icon: LucideIcon;
  tone: Tone;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-full flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:hover:translate-y-0"
    >
      <span className={cn("flex size-9 items-center justify-center rounded-lg", TONE[tone])}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div>
        <p className="text-xl font-semibold tracking-tight">{value}</p>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </Link>
  );
}

const EXPIRY_TONE: Record<string, string> = {
  expired: "text-destructive",
  soon: "text-brand-amber",
  none: "text-primary",
  ok: "text-muted-foreground",
};

/** Lightweight document row for overview lists (full management lives on the
 * documents pages — this stays fast and link-first). */
export function DocRow({ doc }: { doc: DocumentRecord }) {
  const expiry = getDocumentExpiryStatus(doc);
  const action = getDocumentPrimaryAction(doc);
  const sensitive = isSensitiveDocument(doc);
  return (
    <li className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/dashboard/documents/${doc.id}`} className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold">{doc.title}</span>
            <DocumentStatusBadge status={doc.computed_status} />
            {sensitive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground">
                <Lock className="size-3" aria-hidden />
                Sensitive
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{getDocumentRiskReason(doc)}</p>
          <p className={cn("mt-0.5 text-xs font-medium", EXPIRY_TONE[expiry.kind])}>
            {expiry.label}
          </p>
        </Link>
        <Link
          href={action.href}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {action.label}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </li>
  );
}

export function CategoryCard({ category }: { category: DocumentCategory }) {
  return (
    <Link
      href={`/dashboard/documents?category=${category.id}`}
      className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <FolderOpen className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{category.name}</span>
          {category.description && (
            <span className="block truncate text-xs text-muted-foreground">
              {category.description}
            </span>
          )}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function VaultSectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <AlertCircle className="size-4 text-brand-amber" aria-hidden />
        {message}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Try again
        </button>
      )}
    </div>
  );
}

export function RowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
      ))}
    </div>
  );
}

export function HealthSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[108px] w-full rounded-xl" />
      ))}
    </div>
  );
}
