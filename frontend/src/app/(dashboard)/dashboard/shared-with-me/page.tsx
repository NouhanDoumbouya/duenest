"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Clock,
  Download,
  Eye,
  FileText,
  Inbox,
  Save,
  Trash2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import { listSharedWithMe, removeSharedWithMe } from "@/lib/quick-share";
import { cn } from "@/lib/utils";
import type { SharedWithMeItem } from "@/types/quick-share";

const stateBadge: Record<
  SharedWithMeItem["session_state"],
  { label: string; cls: string }
> = {
  active: { label: "Active", cls: "bg-brand-success/10 text-brand-success" },
  awaiting_approval: {
    label: "Awaiting approval",
    cls: "bg-brand-amber/10 text-brand-amber",
  },
  revoked: { label: "Revoked", cls: "bg-destructive/10 text-destructive" },
  expired: { label: "Expired", cls: "bg-muted text-muted-foreground" },
  declined: { label: "Declined", cls: "bg-muted text-muted-foreground" },
  denied: { label: "Denied", cls: "bg-destructive/10 text-destructive" },
};

function permIcon(item: SharedWithMeItem) {
  if (item.save_copy_allowed) return <Save className="size-3" />;
  if (item.download_allowed) return <Download className="size-3" />;
  return <Eye className="size-3" />;
}

export default function SharedWithMePage() {
  const [items, setItems] = useState<SharedWithMeItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    listSharedWithMe()
      .then((data) => active && setItems(data))
      .catch(
        (err) =>
          active &&
          setError(
            err instanceof ApiError ? err.message : "Could not load shared files.",
          ),
      );
    return () => {
      active = false;
    };
  }, []);

  async function handleRemove(id: number) {
    setRemoving(id);
    try {
      await removeSharedWithMe(id);
      setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
    } catch {
      /* keep it in the list on failure */
    } finally {
      setRemoving(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Sharing"
        title="Shared with me"
        description="Files other DueNest users have shared with you. Your access follows the sender's rules and can be revoked by them at any time."
      />

      <SectionCard title="Recent shares">
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : items === null ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Nothing shared with you yet"
            description="When someone shares files with you through a Quick Share QR, they'll appear here after you accept."
          />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const badge = stateBadge[item.session_state];
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <Link
                    href={`/dashboard/shared-with-me/${item.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {item.sender_initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {item.session_title}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span>From {item.sender_name}</span>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-1">
                          <FileText className="size-3" />
                          {item.file_count}
                        </span>
                        <span aria-hidden>·</span>
                        <span className="inline-flex items-center gap-1">
                          {permIcon(item)}
                          {item.save_copy_allowed
                            ? "Save copy"
                            : item.download_allowed
                              ? "Download"
                              : "View only"}
                        </span>
                      </p>
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-3 pl-13 sm:pl-0">
                    {item.session_state === "active" && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        {formatDate(item.expires_at)}
                      </span>
                    )}
                    <Badge className={cn("border-transparent", badge.cls)}>
                      {badge.label}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemove(item.id)}
                      disabled={removing === item.id}
                      aria-label="Remove from list"
                      title="Remove from list"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </PageContainer>
  );
}
