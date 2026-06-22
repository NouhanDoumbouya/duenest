"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CalendarClock,
  Loader2,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  createDocumentReminderRule,
  deleteDocumentReminderRule,
  formatDate,
  getDocumentReminderRules,
  updateDocumentReminderRule,
} from "@/lib/documents";
import { cn } from "@/lib/utils";
import type {
  DocumentRecord,
  DocumentReminderRule,
  ReminderTriggerType,
} from "@/types/documents";

type ReminderPresetValue = `${ReminderTriggerType}:${number}`;

interface ReminderOption {
  value: ReminderPresetValue;
  label: string;
  disabled: boolean;
}

function parsePreset(value: ReminderPresetValue): {
  trigger_type: ReminderTriggerType;
  days_before: number;
} {
  const [triggerType, daysBefore] = value.split(":");
  return {
    trigger_type: triggerType as ReminderTriggerType,
    days_before: Number(daysBefore),
  };
}

function sortRules(rules: DocumentReminderRule[]): DocumentReminderRule[] {
  return [...rules].sort((a, b) => {
    if (a.trigger_type !== b.trigger_type) {
      return a.trigger_type.localeCompare(b.trigger_type);
    }
    return b.days_before - a.days_before;
  });
}

function describeRule(rule: DocumentReminderRule): string {
  if (rule.trigger_type === "on_expiry") return "On expiry day";
  const unit = rule.days_before === 1 ? "day" : "days";
  const source =
    rule.trigger_type === "before_renewal_date" ? "renewal date" : "expiry";
  return `${rule.days_before} ${unit} before ${source}`;
}

function buildOptions(document: DocumentRecord): ReminderOption[] {
  const expiryMissing = !document.expiry_date;
  const renewalMissing = !document.renewal_date;
  return [
    { value: "before_expiry:90", label: "90 days before expiry", disabled: expiryMissing },
    { value: "before_expiry:60", label: "60 days before expiry", disabled: expiryMissing },
    { value: "before_expiry:30", label: "30 days before expiry", disabled: expiryMissing },
    { value: "before_expiry:7", label: "7 days before expiry", disabled: expiryMissing },
    { value: "on_expiry:0", label: "On expiry day", disabled: expiryMissing },
    {
      value: "before_renewal_date:30",
      label: "30 days before renewal date",
      disabled: renewalMissing,
    },
    {
      value: "before_renewal_date:7",
      label: "7 days before renewal date",
      disabled: renewalMissing,
    },
  ];
}

export function DocumentReminderRules({
  document,
}: {
  document: DocumentRecord;
}) {
  const options = useMemo(() => buildOptions(document), [document]);
  const defaultPreset: ReminderPresetValue = document.expiry_date
    ? "before_expiry:90"
    : document.renewal_date
      ? "before_renewal_date:30"
      : "before_expiry:90";

  const [rules, setRules] = useState<DocumentReminderRule[] | null>(null);
  const [selectedPreset, setSelectedPreset] =
    useState<ReminderPresetValue>(defaultPreset);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionRuleId, setActionRuleId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getDocumentReminderRules(document.id)
      .then((items) => {
        if (!active) return;
        setRules(sortRules(items));
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setRules([]);
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to load reminder rules.",
        );
      });
    return () => {
      active = false;
    };
  }, [document.id]);

  const selected = parsePreset(selectedPreset);
  const selectedOption = options.find((option) => option.value === selectedPreset);
  const duplicate =
    rules?.some(
      (rule) =>
        rule.trigger_type === selected.trigger_type &&
        rule.days_before === selected.days_before,
    ) ?? false;
  const canCreateAny = options.some((option) => !option.disabled);
  const createDisabled =
    creating || !canCreateAny || selectedOption?.disabled || duplicate;

  async function handleCreate() {
    if (!selectedOption || selectedOption.disabled) return;
    setCreating(true);
    setError(null);
    try {
      const created = await createDocumentReminderRule(document.id, selected);
      setRules((prev) => sortRules([...(prev ?? []), created]));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not create the reminder rule.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(rule: DocumentReminderRule) {
    setActionRuleId(rule.id);
    setError(null);
    try {
      const updated = await updateDocumentReminderRule(document.id, rule.id, {
        is_enabled: !rule.is_enabled,
      });
      setRules((prev) =>
        sortRules((prev ?? []).map((item) => (item.id === rule.id ? updated : item))),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not update the reminder rule.",
      );
    } finally {
      setActionRuleId(null);
    }
  }

  async function handleDelete(rule: DocumentReminderRule) {
    setActionRuleId(rule.id);
    setError(null);
    try {
      await deleteDocumentReminderRule(document.id, rule.id);
      setRules((prev) => (prev ?? []).filter((item) => item.id !== rule.id));
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not delete the reminder rule.",
      );
    } finally {
      setActionRuleId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/25 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BellRing className="size-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Create reminder rules</p>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                Create reminder rules so important documents do not surprise you
                at the last minute. No emails or push notifications are sent yet.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label htmlFor="reminder-preset" className="sr-only">
              Reminder rule
            </label>
            <select
              id="reminder-preset"
              className="h-10 min-w-[230px] rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={selectedPreset}
              onChange={(event) =>
                setSelectedPreset(event.target.value as ReminderPresetValue)
              }
              disabled={!canCreateAny || creating}
            >
              {options.map((option) => (
                <option
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                >
                  {option.label}
                </option>
              ))}
            </select>
            <Button onClick={handleCreate} disabled={createDisabled}>
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add rule
            </Button>
          </div>
        </div>

        {!canCreateAny && (
          <p className="mt-3 text-sm text-muted-foreground">
            Add an expiry date or renewal date before creating reminder rules.
          </p>
        )}
        {duplicate && (
          <p className="mt-3 text-sm text-muted-foreground">
            This reminder rule already exists for this document.
          </p>
        )}
      </div>

      {error && (
        <p
          className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      )}

      {rules === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" />
          <span>Loading reminder rules...</span>
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm font-medium">No reminder rules yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add the first rule to calculate when CertaNest should remind you about
            this document later.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => {
            const pending = actionRuleId === rule.id;
            return (
              <li
                key={rule.id}
                className="flex flex-col gap-3 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{describeRule(rule)}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        rule.is_enabled
                          ? "bg-brand-success/10 text-brand-success"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {rule.is_enabled ? "Enabled" : "Paused"}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" />
                    {rule.upcoming_reminder_date
                      ? `Upcoming: ${formatDate(rule.upcoming_reminder_date)}`
                      : "Upcoming date cannot be calculated yet"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggle(rule)}
                    disabled={pending}
                    aria-label={
                      rule.is_enabled ? "Pause reminder rule" : "Enable reminder rule"
                    }
                  >
                    {pending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : rule.is_enabled ? (
                      <ToggleRight className="size-3.5" />
                    ) : (
                      <ToggleLeft className="size-3.5" />
                    )}
                    {rule.is_enabled ? "Pause" : "Enable"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(rule)}
                    disabled={pending}
                    aria-label="Delete reminder rule"
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
