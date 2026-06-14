"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InlineAlert } from "@/components/ui/product-ui";
import { ApiError } from "@/lib/api";
import {
  BILLING_CYCLE_LABELS,
  IMPORTANCE_LABELS,
  STATUS_LABELS,
} from "@/lib/subscriptions";
import { cn } from "@/lib/utils";
import type {
  BillingCycle,
  Importance,
  IntervalUnit,
  Subscription,
  SubscriptionCategory,
  SubscriptionInput,
  SubscriptionStatus,
} from "@/types/subscriptions";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const CARD_NUMBER_RE = /(?:\d[ -]?){13,19}/;

interface FormState {
  name: string;
  provider: string;
  category: string;
  plan_name: string;
  account_email: string;
  website_url: string;
  status: SubscriptionStatus;
  amount: string;
  currency: string;
  billing_cycle: BillingCycle;
  custom_interval_count: string;
  custom_interval_unit: IntervalUnit | "";
  start_date: string;
  next_billing_date: string;
  cancellation_deadline: string;
  auto_renew: boolean;
  reminder_days_before: string;
  payment_method_label: string;
  importance: Importance;
  last_used_date: string;
  notes: string;
}

export interface SubscriptionPrefill {
  name?: string;
  provider?: string;
  category?: string;
  website_url?: string;
  billing_cycle?: BillingCycle;
  reminder_days_before?: number;
  auto_renew?: boolean;
}

function initialState(
  subscription?: Subscription,
  prefill?: SubscriptionPrefill,
): FormState {
  return {
    name: subscription?.name ?? prefill?.name ?? "",
    provider: subscription?.provider ?? prefill?.provider ?? "",
    category:
      (subscription?.category ? String(subscription.category) : "") ||
      prefill?.category ||
      "",
    plan_name: subscription?.plan_name ?? "",
    account_email: subscription?.account_email ?? "",
    website_url: subscription?.website_url ?? prefill?.website_url ?? "",
    status: subscription?.status ?? "active",
    amount: subscription?.amount ?? "",
    currency: subscription?.currency ?? "USD",
    billing_cycle:
      subscription?.billing_cycle ?? prefill?.billing_cycle ?? "monthly",
    custom_interval_count: subscription?.custom_interval_count
      ? String(subscription.custom_interval_count)
      : "",
    custom_interval_unit: subscription?.custom_interval_unit ?? "",
    start_date: subscription?.start_date ?? "",
    next_billing_date: subscription?.next_billing_date ?? "",
    cancellation_deadline: subscription?.cancellation_deadline ?? "",
    auto_renew: subscription?.auto_renew ?? prefill?.auto_renew ?? true,
    reminder_days_before: String(
      subscription?.reminder_days_before ?? prefill?.reminder_days_before ?? 7,
    ),
    payment_method_label: subscription?.payment_method_label ?? "",
    importance: subscription?.importance ?? "useful",
    last_used_date: subscription?.last_used_date ?? "",
    notes: subscription?.notes ?? "",
  };
}

export function SubscriptionForm({
  subscription,
  prefill,
  categories,
  onSubmit,
  submitLabel,
  cancelHref,
}: {
  subscription?: Subscription;
  prefill?: SubscriptionPrefill;
  categories: SubscriptionCategory[];
  onSubmit: (input: SubscriptionInput) => Promise<void>;
  submitLabel: string;
  cancelHref: string;
}) {
  const [form, setForm] = useState<FormState>(() =>
    initialState(subscription, prefill),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Optional details start open when editing an existing subscription that
  // already has some of those fields filled, so nothing is hidden unexpectedly.
  const [optionalOpen, setOptionalOpen] = useState<boolean>(() =>
    Boolean(
      subscription &&
        (subscription.plan_name ||
          subscription.account_email ||
          subscription.website_url ||
          subscription.payment_method_label ||
          subscription.last_used_date ||
          subscription.notes),
    ),
  );

  const isCustom = form.billing_cycle === "custom";

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const clientErrors = useMemo(() => validate(form), [form]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (Object.keys(clientErrors).length > 0) {
      setErrors(clientErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSubmit(toInput(form));
    } catch (err) {
      if (err instanceof ApiError && err.data && typeof err.data === "object") {
        const data = err.data as Record<string, unknown>;
        const fieldErrors: Record<string, string> = {};
        for (const [key, value] of Object.entries(data)) {
          if (Array.isArray(value) && typeof value[0] === "string") {
            fieldErrors[key] = value[0];
          } else if (typeof value === "string") {
            fieldErrors[key] = value;
          }
        }
        setErrors(fieldErrors);
        setFormError(
          err.message || "Please fix the highlighted fields and try again.",
        );
      } else {
        setFormError("Could not save this subscription. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button type="submit" disabled={saving}>
        {saving && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
      <Link
        href={cancelHref}
        className={cn(buttonVariants({ variant: "outline" }))}
      >
        Cancel
      </Link>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} noValidate>
      {formError && (
        <div className="mb-6">
          <InlineAlert>{formError}</InlineAlert>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Left: the form, grouped by user intention. */}
        <div className="space-y-6">
          <Section
            title="What are you paying for?"
            description="The basics so you can recognise it later."
          >
            <Field label="Name" required error={errors.name}>
              <Input
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Netflix"
                aria-invalid={Boolean(errors.name)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Provider" error={errors.provider}>
                <Input
                  value={form.provider}
                  onChange={(e) => update("provider", e.target.value)}
                  placeholder="Netflix, Inc."
                />
              </Field>
              <Field label="Category" error={errors.category}>
                <select
                  value={form.category}
                  onChange={(e) => update("category", e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="">No category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          <Section
            title="How much and how often?"
            description="Powers your monthly and yearly cost summaries."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Amount" required error={errors.amount}>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => update("amount", e.target.value)}
                  placeholder="15.99"
                  aria-invalid={Boolean(errors.amount)}
                />
              </Field>
              <Field label="Currency" required error={errors.currency}>
                <Input
                  value={form.currency}
                  onChange={(e) =>
                    update("currency", e.target.value.toUpperCase())
                  }
                  maxLength={3}
                  placeholder="USD"
                  aria-invalid={Boolean(errors.currency)}
                />
              </Field>
              <Field label="Billing cycle" required error={errors.billing_cycle}>
                <select
                  value={form.billing_cycle}
                  onChange={(e) =>
                    update("billing_cycle", e.target.value as BillingCycle)
                  }
                  className={SELECT_CLASS}
                >
                  {Object.entries(BILLING_CYCLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            {isCustom && (
              <div className="grid gap-4 rounded-xl border border-border bg-muted/30 p-3 sm:grid-cols-2">
                <Field
                  label="Every"
                  required
                  error={errors.custom_interval_count}
                  hint="e.g. 2"
                >
                  <Input
                    type="number"
                    min="1"
                    value={form.custom_interval_count}
                    onChange={(e) =>
                      update("custom_interval_count", e.target.value)
                    }
                    placeholder="2"
                  />
                </Field>
                <Field label="Unit" required error={errors.custom_interval_unit}>
                  <select
                    value={form.custom_interval_unit}
                    onChange={(e) =>
                      update(
                        "custom_interval_unit",
                        e.target.value as IntervalUnit | "",
                      )
                    }
                    className={SELECT_CLASS}
                  >
                    <option value="">Select...</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                    <option value="years">Years</option>
                  </select>
                </Field>
              </div>
            )}

            <Field
              label="Next billing date"
              required
              error={errors.next_billing_date}
              hint="When the next charge or renewal happens. Shown in Calendar and Timeline."
            >
              <Input
                type="date"
                value={form.next_billing_date}
                onChange={(e) => update("next_billing_date", e.target.value)}
                aria-invalid={Boolean(errors.next_billing_date)}
              />
            </Field>
          </Section>

          <Section
            title="When should DueNest warn you?"
            description="Stay ahead of auto-renewals and cancellation cut-offs."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Cancellation deadline"
                error={errors.cancellation_deadline}
                hint="The last safe day to cancel before renewal."
              >
                <Input
                  type="date"
                  value={form.cancellation_deadline}
                  onChange={(e) =>
                    update("cancellation_deadline", e.target.value)
                  }
                  aria-invalid={Boolean(errors.cancellation_deadline)}
                />
              </Field>
              <Field
                label="Reminder days before"
                error={errors.reminder_days_before}
                hint="In-app reminder lead time."
              >
                <Input
                  type="number"
                  min="0"
                  value={form.reminder_days_before}
                  onChange={(e) =>
                    update("reminder_days_before", e.target.value)
                  }
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={form.auto_renew}
                onChange={(e) => update("auto_renew", e.target.checked)}
              />
              This subscription auto-renews
            </label>
          </Section>

          <CollapsibleSection
            title="Optional details"
            description="Add only what helps you decide what to keep."
            open={optionalOpen}
            onToggle={() => setOptionalOpen((v) => !v)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status" error={errors.status}>
                <select
                  value={form.status}
                  onChange={(e) =>
                    update("status", e.target.value as SubscriptionStatus)
                  }
                  className={SELECT_CLASS}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Plan name" error={errors.plan_name}>
                <Input
                  value={form.plan_name}
                  onChange={(e) => update("plan_name", e.target.value)}
                  placeholder="Premium"
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Importance" error={errors.importance}>
                <select
                  value={form.importance}
                  onChange={(e) =>
                    update("importance", e.target.value as Importance)
                  }
                  className={SELECT_CLASS}
                >
                  {Object.entries(IMPORTANCE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Last used" error={errors.last_used_date}>
                <Input
                  type="date"
                  value={form.last_used_date}
                  onChange={(e) => update("last_used_date", e.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Start date" error={errors.start_date}>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => update("start_date", e.target.value)}
                />
              </Field>
              <Field label="Account email" error={errors.account_email}>
                <Input
                  type="email"
                  value={form.account_email}
                  onChange={(e) => update("account_email", e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
            </div>
            <Field label="Website / manage URL" error={errors.website_url}>
              <Input
                type="url"
                value={form.website_url}
                onChange={(e) => update("website_url", e.target.value)}
                placeholder="https://..."
                aria-invalid={Boolean(errors.website_url)}
              />
            </Field>
            <Field
              label="Payment method label"
              error={errors.payment_method_label}
              hint='Use safe labels like "Visa ending 1234". Never store full card numbers, CVV, passwords, or banking details.'
            >
              <Input
                value={form.payment_method_label}
                onChange={(e) =>
                  update("payment_method_label", e.target.value)
                }
                placeholder="Visa ending 1234"
                aria-invalid={Boolean(errors.payment_method_label)}
              />
            </Field>
            <Field label="Notes" error={errors.notes}>
              <Textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                rows={3}
                placeholder="Anything worth remembering about this subscription."
              />
            </Field>
          </CollapsibleSection>

          {/* Inline actions on desktop (the sticky summary holds them too on
              wide screens; on mobile a sticky bar appears below). */}
          <div className="hidden lg:flex">{actions}</div>
        </div>

        {/* Right: the live summary — a calm recap, sticky on desktop. */}
        <aside className="lg:sticky lg:top-6 lg:h-fit">
          <LiveSummary form={form} />
        </aside>
      </div>

      {/* Mobile: sticky save bar so the primary action is always reachable. */}
      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6 lg:hidden">
        {actions}
      </div>
    </form>
  );
}

function validate(form: FormState): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = "Name is required.";
  const amount = Number(form.amount);
  if (form.amount === "" || Number.isNaN(amount)) {
    errors.amount = "Amount is required.";
  } else if (amount < 0) {
    errors.amount = "Amount must be a positive number.";
  }
  if (!form.currency.trim()) {
    errors.currency = "Currency is required.";
  } else if (!/^[A-Za-z]{3}$/.test(form.currency.trim())) {
    errors.currency = "Use a 3-letter code, e.g. USD.";
  }
  if (!form.next_billing_date) {
    errors.next_billing_date = "Next billing date is required.";
  }
  if (form.billing_cycle === "custom") {
    if (!form.custom_interval_count || Number(form.custom_interval_count) < 1) {
      errors.custom_interval_count = "Enter how often it renews.";
    }
    if (!form.custom_interval_unit) {
      errors.custom_interval_unit = "Choose a unit.";
    }
  }
  if (
    form.cancellation_deadline &&
    form.next_billing_date &&
    form.cancellation_deadline > form.next_billing_date
  ) {
    errors.cancellation_deadline =
      "Cannot be after the next billing date.";
  }
  if (form.website_url && !/^https?:\/\/.+/.test(form.website_url)) {
    errors.website_url = "Enter a valid URL starting with http(s)://";
  }
  if (
    form.payment_method_label &&
    CARD_NUMBER_RE.test(form.payment_method_label)
  ) {
    errors.payment_method_label =
      'Do not store full card numbers. Use "Visa ending 1234".';
  }
  return errors;
}

function toInput(form: FormState): SubscriptionInput {
  return {
    name: form.name.trim(),
    provider: form.provider.trim(),
    category: form.category ? Number(form.category) : null,
    plan_name: form.plan_name.trim(),
    account_email: form.account_email.trim(),
    website_url: form.website_url.trim(),
    status: form.status,
    amount: form.amount,
    currency: form.currency.trim().toUpperCase(),
    billing_cycle: form.billing_cycle,
    custom_interval_count:
      form.billing_cycle === "custom" && form.custom_interval_count
        ? Number(form.custom_interval_count)
        : null,
    custom_interval_unit:
      form.billing_cycle === "custom" ? form.custom_interval_unit : "",
    start_date: form.start_date || null,
    next_billing_date: form.next_billing_date || null,
    cancellation_deadline: form.cancellation_deadline || null,
    auto_renew: form.auto_renew,
    reminder_days_before: Number(form.reminder_days_before) || 0,
    payment_method_label: form.payment_method_label.trim(),
    importance: form.importance,
    last_used_date: form.last_used_date || null,
    notes: form.notes,
  };
}

// Months covered by one standard billing cycle (custom is intentionally
// excluded — its interval is too variable to estimate confidently here).
const CYCLE_MONTHS: Partial<Record<BillingCycle, number>> = {
  weekly: 12 / 52,
  monthly: 1,
  quarterly: 3,
  yearly: 12,
};

function formatLongDate(value: string): string | null {
  if (!value) return null;
  // Parse as a local date to avoid timezone shifting the day.
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function estimatedYearly(form: FormState): string | null {
  const amount = Number(form.amount);
  const months = CYCLE_MONTHS[form.billing_cycle];
  if (!form.amount.trim() || Number.isNaN(amount) || amount < 0 || !months) {
    return null;
  }
  const yearly = (amount / months) * 12;
  return `${form.currency || ""} ${yearly.toFixed(2)}`.trim();
}

function LiveSummary({ form }: { form: FormState }) {
  const name = form.name.trim() || "This subscription";
  const cycleLabel = BILLING_CYCLE_LABELS[form.billing_cycle]?.toLowerCase();
  const renewDate = formatLongDate(form.next_billing_date);
  const deadlineDate = formatLongDate(form.cancellation_deadline);
  const yearly = estimatedYearly(form);

  // Build calm, plain-language sentences from whatever the user has entered.
  const lines: string[] = [];
  if (renewDate && cycleLabel) {
    lines.push(`${name} renews ${cycleLabel} on ${renewDate}.`);
  } else if (renewDate) {
    lines.push(`${name} renews on ${renewDate}.`);
  } else {
    lines.push(`Add a next billing date so DueNest can track ${name}.`);
  }
  const reminder = Number(form.reminder_days_before);
  if (form.next_billing_date && reminder > 0) {
    lines.push(`DueNest will remind you ${reminder} days before.`);
  }
  lines.push(`Auto-renew is ${form.auto_renew ? "on" : "off"}.`);
  lines.push(
    deadlineDate
      ? `Cancel by ${deadlineDate} to avoid the next charge.`
      : "No cancellation deadline set.",
  );
  if (yearly) lines.push(`Estimated yearly cost: ${yearly}.`);

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-card sm:p-5">
      <h2 className="text-sm font-semibold">What DueNest will track</h2>
      <ul className="mt-3 space-y-2">
        {lines.map((line, i) => (
          <li
            key={i}
            className="flex gap-2 text-sm leading-relaxed text-foreground/90"
          >
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/60" />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-primary/15 pt-3 text-xs text-muted-foreground">
        DueNest tracks renewal reminders only — never full card numbers, CVV,
        passwords, or banking details.
      </p>
    </section>
  );
}

function CollapsibleSection({
  title,
  description,
  open,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card shadow-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"
      >
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block text-xs text-muted-foreground">
            {description}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <div className="space-y-4 px-4 pb-5 sm:px-5">{children}</div>}
    </section>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required = false,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
