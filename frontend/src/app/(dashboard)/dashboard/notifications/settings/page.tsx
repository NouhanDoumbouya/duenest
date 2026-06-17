"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, Save } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { PushDeviceCard } from "@/components/notifications/push-device-card";
import { ApiError } from "@/lib/api";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";
import type { NotificationPreferences } from "@/types/notifications";

type ToggleKey =
  | "in_app_enabled"
  | "email_enabled"
  | "document_reminders_enabled"
  | "subscription_reminders_enabled"
  | "checklist_bundle_reminders_enabled"
  | "organization_reminders_enabled"
  | "emergency_reminders_enabled"
  | "security_alerts_enabled"
  | "activity_notifications_enabled"
  | "reminder_digest_enabled";

const TOGGLES: Array<{ key: ToggleKey; label: string; helper: string }> = [
  {
    key: "in_app_enabled",
    label: "In-app notifications",
    helper: "Show reminders and alerts inside DueNest.",
  },
  {
    key: "email_enabled",
    label: "Email reminders",
    helper: "Send privacy-safe reminder emails when delivery is configured.",
  },
  {
    key: "document_reminders_enabled",
    label: "Document reminders",
    helper: "Expiry, renewal, missing-file, and review reminders.",
  },
  {
    key: "subscription_reminders_enabled",
    label: "Subscription reminders",
    helper: "Renewal, trial, and cancellation deadline reminders.",
  },
  {
    key: "checklist_bundle_reminders_enabled",
    label: "Checklist and bundle reminders",
    helper: "Checklist item due dates and application pack deadlines.",
  },
  {
    key: "organization_reminders_enabled",
    label: "Organization reminders",
    helper: "Assigned requests, campaigns, and review tasks.",
  },
  {
    key: "emergency_reminders_enabled",
    label: "Emergency access reminders",
    helper: "Emergency access reviews and expiring emergency links.",
  },
  {
    key: "security_alerts_enabled",
    label: "Security alerts",
    helper: "Account and access warnings that should stay visible.",
  },
  {
    key: "activity_notifications_enabled",
    label: "Activity notifications",
    helper: "Optional viewed/opened activity alerts for shared access.",
  },
  {
    key: "reminder_digest_enabled",
    label: "Reminder digest",
    helper: "Prepared for a later grouped digest workflow.",
  },
];

/** The browser's IANA timezone (e.g. "Asia/Kuala_Lumpur"), or "" if unavailable. */
function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

function parseLeadDays(value: string): number[] {
  const seen = new Set<number>();
  for (const part of value.split(",")) {
    const parsed = Number.parseInt(part.trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 365) continue;
    seen.add(parsed);
  }
  return Array.from(seen).sort((a, b) => b - a);
}

export default function NotificationSettingsPage() {
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [leadDays, setLeadDays] = useState("90, 30, 7, 1");
  const [timezone, setTimezone] = useState("UTC");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    getNotificationPreferences()
      .then((result) => {
        if (!active) return;
        setPrefs(result);
        setLeadDays(result.default_reminder_lead_days.join(", "));
        setTimezone(result.timezone || "UTC");
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load notification preferences.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const parsedLeadDays = useMemo(() => parseLeadDays(leadDays), [leadDays]);
  const detectedTimezone = useMemo(() => detectTimezone(), []);
  const timezoneMismatch =
    detectedTimezone !== "" && detectedTimezone !== timezone.trim();

  function updateToggle(key: ToggleKey, value: boolean) {
    setPrefs((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  }

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await updateNotificationPreferences({
        ...prefs,
        default_reminder_lead_days:
          parsedLeadDays.length > 0 ? parsedLeadDays : [90, 30, 7, 1],
        timezone: timezone.trim() || "UTC",
      });
      setPrefs(updated);
      setLeadDays(updated.default_reminder_lead_days.join(", "));
      setTimezone(updated.timezone || "UTC");
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Unable to save notification preferences.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer width="wide">
      <PageHeader
        eyebrow="Settings"
        title="Notification settings"
        description="Choose how DueNest should surface reminders for documents, renewals, shared access, and account safety."
        actions={
          <Link
            href="/dashboard/notifications"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            <ArrowLeft className="size-4" />
            Notifications
          </Link>
        }
      />

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg bg-brand-success/10 px-3 py-2 text-sm text-brand-success">
          Notification preferences saved.
        </p>
      )}

      <SectionCard
        title="Delivery and reminder categories"
        description="Security-sensitive emails stay summary-only and link back to authenticated DueNest pages."
      >
        {prefs === null ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {TOGGLES.map((item) => (
              <label
                key={item.key}
                className="flex min-h-20 items-start gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={Boolean(prefs[item.key])}
                  onChange={(event) => updateToggle(item.key, event.target.checked)}
                  className="mt-1 size-4 rounded border-input accent-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {item.helper}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Timing"
        description="Date-based reminders are evaluated in the selected timezone."
        action={
          <Button onClick={handleSave} disabled={prefs === null || saving}>
            <Save className="size-4" />
            {saving ? "Saving" : "Save changes"}
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-medium">Default lead days</span>
            <Input
              value={leadDays}
              onChange={(event) => {
                setLeadDays(event.target.value);
                setSaved(false);
              }}
              placeholder="90, 30, 7, 1"
              disabled={prefs === null}
            />
            <span className="block text-xs text-muted-foreground">
              Active values:{" "}
              {parsedLeadDays.length > 0 ? parsedLeadDays.join(", ") : "90, 30, 7, 1"}
            </span>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Timezone</span>
            <Input
              value={timezone}
              onChange={(event) => {
                setTimezone(event.target.value);
                setSaved(false);
              }}
              placeholder="UTC"
              disabled={prefs === null}
            />
            <span className="block text-xs text-muted-foreground">
              Use an IANA timezone such as UTC, America/New_York, or Asia/Kuala_Lumpur.
            </span>
            {timezoneMismatch && (
              <button
                type="button"
                onClick={() => {
                  setTimezone(detectedTimezone);
                  setSaved(false);
                }}
                disabled={prefs === null}
                className="text-xs font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
              >
                Use my timezone ({detectedTimezone})
              </button>
            )}
          </label>
        </div>
      </SectionCard>

      <PushDeviceCard />

      <SectionCard title="Email privacy" description="Reminder emails are not a vault.">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Bell className="size-4" />
          </span>
          <p className="text-sm leading-relaxed text-muted-foreground">
            DueNest email reminders use safe summaries only. They do not include
            document contents, files, access codes, share tokens, emergency
            tokens, raw OCR text, private notes, or encryption keys.
          </p>
        </div>
      </SectionCard>
    </PageContainer>
  );
}
