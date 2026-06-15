"use client";

// A compact, reusable activity timeline for a Quick Share. Renders the owner's
// audit trail (opens, accepts, previews, downloads, extends, revokes) with a
// per-action icon. Never shows access codes or file contents — only safe,
// already-redacted summaries from the backend.

import {
  Ban,
  CalendarPlus,
  Check,
  Clock,
  Download,
  Eye,
  History,
  KeyRound,
  Save,
  Sparkles,
  UserCheck,
  UserX,
} from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { QuickShareActivity } from "@/types/quick-share";

function actionIcon(action: string) {
  switch (action) {
    case "session_created":
      return Sparkles;
    case "qr_viewed":
    case "claim_started":
      return Eye;
    case "claim_accepted":
      return Check;
    case "claim_declined":
      return UserX;
    case "sender_approved":
      return UserCheck;
    case "sender_denied":
      return UserX;
    case "file_previewed":
      return Eye;
    case "file_downloaded":
      return Download;
    case "copy_saved":
      return Save;
    case "session_revoked":
      return Ban;
    case "session_expired":
      return Clock;
    case "session_extended":
      return CalendarPlus;
    case "extension_requested":
      return Clock;
    case "access_code_verified":
    case "access_code_failed":
      return KeyRound;
    default:
      return History;
  }
}

function dotTone(actorType: QuickShareActivity["actor_type"]): string {
  if (actorType === "owner") return "bg-primary/10 text-primary";
  if (actorType === "receiver") return "bg-brand-success/10 text-brand-success";
  return "bg-muted text-muted-foreground";
}

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ShareActivityTimeline({
  activity,
}: {
  activity: QuickShareActivity[] | null;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <History className="size-4" />
        Activity
      </p>
      {activity === null ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-6 w-full rounded-md" />
          ))}
        </div>
      ) : activity.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No activity yet. You&apos;ll see opens, accepts, previews, downloads,
          and revokes here as they happen.
        </p>
      ) : (
        <ol className="mt-3 space-y-3">
          {activity.map((entry) => {
            const Icon = actionIcon(entry.action);
            return (
              <li key={entry.id} className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                    dotTone(entry.actor_type),
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {entry.safe_summary || entry.action.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatActivityTime(entry.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        We record actions to keep you in control — never access codes or file
        contents.
      </p>
    </div>
  );
}
