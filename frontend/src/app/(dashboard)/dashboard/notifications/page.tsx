"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Bell, CheckCheck, Settings, X } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, buttonVariants } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  dismissNotification,
  formatNotificationTime,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATION_SEVERITY_LABELS,
  NOTIFICATION_TYPE_LABELS,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";
import type {
  NotificationRecord,
  NotificationSeverity,
  NotificationType,
} from "@/types/notifications";

type InboxFilter = "unread" | "all";

function severityTone(notification: NotificationRecord): string {
  if (notification.severity === "urgent") {
    return "border-destructive/25 bg-destructive/10 text-destructive";
  }
  if (notification.severity === "security") {
    return "border-brand-navy/25 bg-brand-navy/10 text-brand-navy";
  }
  if (notification.severity === "warning") {
    return "border-brand-amber/30 bg-brand-amber/10 text-brand-amber";
  }
  if (notification.severity === "success") {
    return "border-brand-success/25 bg-brand-success/10 text-brand-success";
  }
  return "border-border bg-muted text-muted-foreground";
}

function safeActionUrl(notification: NotificationRecord): string {
  return notification.action_url?.startsWith("/")
    ? notification.action_url
    : "/dashboard/notifications";
}

export default function NotificationsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<InboxFilter>("unread");
  const [type, setType] = useState<NotificationType | "">("");
  const [severity, setSeverity] = useState<NotificationSeverity | "">("");
  const [notifications, setNotifications] = useState<NotificationRecord[] | null>(
    null,
  );
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | "all" | null>(null);

  const refresh = useCallback(() => {
    listNotifications({
      unread: filter === "unread",
      type,
      severity,
      page_size: 50,
    })
      .then((result) => {
        setNotifications(result.results);
        setCount(result.count);
        setError(null);
      })
      .catch((err) => {
        setCount(0);
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load notifications.",
        );
      });
  }, [filter, severity, type]);

  useEffect(() => refresh(), [refresh]);

  const retry = useCallback(() => {
    setError(null);
    setNotifications(null);
    refresh();
  }, [refresh]);

  async function handleOpen(notification: NotificationRecord) {
    setBusyId(notification.id);
    try {
      if (notification.is_unread) {
        await markNotificationRead(notification.id);
      }
      router.push(safeActionUrl(notification));
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkRead(notification: NotificationRecord) {
    setBusyId(notification.id);
    try {
      await markNotificationRead(notification.id);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDismiss(notification: NotificationRecord) {
    setBusyId(notification.id);
    try {
      await dismissNotification(notification.id);
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleMarkAllRead() {
    setBusyId("all");
    try {
      await markAllNotificationsRead();
      refresh();
    } finally {
      setBusyId(null);
    }
  }

  const isLoading = notifications === null;
  const isEmpty = notifications !== null && notifications.length === 0;

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Workspace"
        title="Notifications"
        description="Reminders and account alerts generated from your DueNest deadlines."
        actions={
          <>
            <Link
              href="/dashboard/notifications/settings"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <Settings className="size-4" />
              Settings
            </Link>
            <Button
              variant="secondary"
              onClick={handleMarkAllRead}
              disabled={busyId === "all" || count === 0}
            >
              <CheckCheck className="size-4" />
              Mark all read
            </Button>
          </>
        }
      />

      <SectionCard
        title="Notification center"
        description={`${count} result${count === 1 ? "" : "s"}`}
      >
        <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="inline-flex w-fit rounded-lg border border-border bg-muted/40 p-1">
            {(["unread", "all"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  filter === item
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setFilter(item)}
              >
                {item === "unread" ? "Unread" : "All"}
              </button>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as NotificationType | "")
              }
              className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Filter by notification type"
            >
              <option value="">All types</option>
              {(Object.entries(NOTIFICATION_TYPE_LABELS) as Array<
                [NotificationType, string]
              >).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={severity}
              onChange={(event) =>
                setSeverity(event.target.value as NotificationSeverity | "")
              }
              className="h-9 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="Filter by severity"
            >
              <option value="">All severities</option>
              {(Object.entries(NOTIFICATION_SEVERITY_LABELS) as Array<
                [NotificationSeverity, string]
              >).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <ErrorState description={error} onRetry={retry} />
        ) : isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        ) : isEmpty ? (
          <EmptyState
            icon={Bell}
            title="You’re all caught up"
            description="DueNest will notify you here when documents, renewals, checklists, or emergency access items need attention."
            action={
              <Link
                href="/dashboard/notifications/settings"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Review reminder settings
              </Link>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map((notification) => (
              <li key={notification.id} className="py-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {notification.is_unread && (
                        <span className="size-2 rounded-full bg-primary" />
                      )}
                      <h2 className="text-base font-semibold">
                        {notification.title}
                      </h2>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-xs font-medium",
                          severityTone(notification),
                        )}
                      >
                        {NOTIFICATION_SEVERITY_LABELS[notification.severity]}
                      </span>
                    </div>
                    <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                      {notification.message}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {NOTIFICATION_TYPE_LABELS[notification.type]} ·{" "}
                      {notification.source_type || "DueNest"} ·{" "}
                      {formatNotificationTime(notification.created_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleOpen(notification)}
                      disabled={busyId === notification.id}
                    >
                      Open
                      <ArrowRight className="size-3.5" />
                    </Button>
                    {notification.is_unread && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleMarkRead(notification)}
                        disabled={busyId === notification.id}
                      >
                        <CheckCheck className="size-3.5" />
                        Read
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDismiss(notification)}
                      disabled={busyId === notification.id}
                    >
                      <X className="size-3.5" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </PageContainer>
  );
}
