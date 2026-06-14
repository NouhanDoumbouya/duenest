"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  FileText,
  KeyRound,
  Plus,
  QrCode as QrCodeIcon,
  ShieldCheck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { ProductMetric, TrustNotice } from "@/components/ui/product-ui";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import { listQuickShares } from "@/lib/quick-share";
import { modeLabel } from "@/components/quick-share/shared";
import { cn } from "@/lib/utils";
import type { QuickShareListItem, QuickShareStatus } from "@/types/quick-share";

const statusClass: Record<QuickShareStatus, string> = {
  active: "bg-brand-success/10 text-brand-success",
  accepted: "bg-brand-success/10 text-brand-success",
  claimed: "bg-accent text-accent-foreground",
  declined: "bg-muted text-muted-foreground",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-destructive/10 text-destructive",
  consumed: "bg-muted text-muted-foreground",
};

const statusLabel: Record<QuickShareStatus, string> = {
  active: "Active",
  accepted: "Accepted",
  claimed: "Scanned",
  declined: "Declined",
  expired: "Expired",
  revoked: "Revoked",
  consumed: "Used",
};

export default function QuickShareListPage() {
  const [sessions, setSessions] = useState<QuickShareListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listQuickShares()
      .then((data) => {
        if (active) setSessions(data);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof ApiError ? err.message : "Could not load Quick Shares.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const stats = useMemo(() => {
    const list = sessions ?? [];
    return {
      total: list.length,
      active: list.filter((s) => s.is_active).length,
      claims: list.reduce((sum, s) => sum + s.claim_count, 0),
    };
  }, [sessions]);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Sharing"
        title="Quick Share"
        description="Share important documents in seconds with a secure QR code — you stay in control of access, expiry, and downloads."
        actions={
          <Link
            href="/dashboard/quick-share/new"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            <Plus className="size-4" />
            New Quick Share
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <ProductMetric
          label="Active shares"
          value={String(stats.active)}
          icon={ShieldCheck}
        />
        <ProductMetric
          label="Total created"
          value={String(stats.total)}
          icon={QrCodeIcon}
        />
        <ProductMetric
          label="Times accessed"
          value={String(stats.claims)}
          icon={Users}
        />
      </div>

      <TrustNotice icon={ShieldCheck} title="Your vault stays private">
        A Quick Share QR only ever contains a secure link — never your files,
        file paths, or access codes. Access is checked on DueNest&apos;s servers
        every time, and you can revoke any share instantly.
      </TrustNotice>

      <SectionCard
        title="Recently shared"
        description="Your most recent Quick Shares. Open one to view its QR, live status, and revoke access."
      >
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : sessions === null ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={QrCodeIcon}
            title="No Quick Shares yet"
            description="Create a secure QR to hand someone a document in seconds — at a counter, an appointment, or across the table."
            action={
              <Link
                href="/dashboard/quick-share/new"
                className={cn(buttonVariants())}
              >
                <Plus className="size-4" />
                Create your first Quick Share
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/dashboard/quick-share/${s.id}`}
                  className="flex flex-col gap-3 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:px-1"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                      <QrCodeIcon className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {s.title || "Untitled Quick Share"}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <FileText className="size-3" />
                          {s.file_count} file{s.file_count === 1 ? "" : "s"}
                        </span>
                        <span aria-hidden>·</span>
                        <span>{modeLabel[s.mode]}</span>
                        {s.access_code_required && (
                          <>
                            <span aria-hidden>·</span>
                            <span className="inline-flex items-center gap-1">
                              <KeyRound className="size-3" />
                              Code
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 pl-13 sm:pl-0">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3" />
                      {s.is_active
                        ? `Expires ${formatDate(s.expires_at)}`
                        : statusLabel[s.status]}
                    </span>
                    {s.claim_count > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs text-brand-success">
                        <CheckCircle2 className="size-3" />
                        {s.claim_count}
                      </span>
                    )}
                    <Badge
                      className={cn(
                        "border-transparent",
                        statusClass[s.status],
                      )}
                    >
                      {statusLabel[s.status]}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageContainer>
  );
}
