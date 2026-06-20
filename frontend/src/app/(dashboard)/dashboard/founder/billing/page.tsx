"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Mail, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  getReceiptSettings,
  sendTestReceipt,
  updateReceiptSettings,
} from "@/lib/billing";
import type { ReceiptMode, ReceiptSettings } from "@/types/billing";
import { cn } from "@/lib/utils";

const MODES: { id: ReceiptMode; label: string; hint: string }[] = [
  {
    id: "email_link",
    label: "Email + invoice link",
    hint: "Branded email linking to the provider's hosted invoice / PDF. Lightest.",
  },
  {
    id: "email_pdf",
    label: "Email + DueNest PDF",
    hint: "Branded email with a DueNest-generated PDF receipt attached.",
  },
  {
    id: "email_only",
    label: "Email only",
    hint: "Branded receipt email, no PDF or link.",
  },
];

export default function FounderBillingPage() {
  const [settings, setSettings] = useState<ReceiptSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getReceiptSettings()
      .then((data) => active && setSettings(data))
      .catch((err) =>
        active &&
        setLoadError(
          err instanceof ApiError ? err.message : "Unable to load receipt settings.",
        ),
      );
    return () => {
      active = false;
    };
  }, []);

  function patch(partial: Partial<ReceiptSettings>) {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
    setNotice(null);
    setErrorNotice(null);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setNotice(null);
    setErrorNotice(null);
    try {
      const saved = await updateReceiptSettings({
        enabled: settings.enabled,
        mode: settings.mode,
        send_for_manual: settings.send_for_manual,
        business_legal_name: settings.business_legal_name,
        business_address: settings.business_address,
        tax_id: settings.tax_id,
        support_email: settings.support_email,
      });
      setSettings(saved);
      setNotice("Receipt settings saved.");
    } catch (err) {
      setErrorNotice(
        err instanceof ApiError ? err.message : "Could not save settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setNotice(null);
    setErrorNotice(null);
    try {
      const res = await sendTestReceipt();
      setNotice(res.detail);
    } catch (err) {
      setErrorNotice(
        err instanceof ApiError ? err.message : "Could not send the test receipt.",
      );
    } finally {
      setTesting(false);
    }
  }

  if (loadError) {
    return (
      <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
        {loadError}
      </p>
    );
  }

  if (!settings) {
    return <Card className="h-[420px] animate-pulse" />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-heading text-2xl font-semibold">
          Subscription receipts
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send DueNest-branded receipt emails when a subscription payment
          succeeds. Choose the format and send yourself a sample to preview it.
        </p>
      </div>

      {notice && (
        <p className="flex items-center gap-2 rounded-lg bg-teal-500/10 px-4 py-3 text-sm text-teal-700 dark:text-teal-300">
          <Check className="size-4" aria-hidden="true" /> {notice}
        </p>
      )}
      {errorNotice && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorNotice}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Receipts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="text-sm font-medium">Send branded receipts</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                When off, no receipt emails are sent (the provider may still send its own).
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
              className="mt-1 size-5 shrink-0 accent-teal-500"
              aria-label="Send branded receipts"
            />
          </label>

          <fieldset className="space-y-2" disabled={!settings.enabled}>
            <legend className="text-sm font-medium">Format</legend>
            <div className={cn("grid gap-2", !settings.enabled && "opacity-50")}>
              {MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => patch({ mode: m.id })}
                  aria-pressed={settings.mode === m.id}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    settings.mode === m.id
                      ? "border-teal-500/60 bg-teal-500/10"
                      : "border-border hover:bg-muted/50",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {settings.mode === m.id && (
                      <Check className="size-4 text-teal-600" aria-hidden="true" />
                    )}
                    {m.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {m.hint}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="text-sm font-medium">
                Also send for manual / dev payments
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Sends receipts for the offline “manual” provider too, so you can
                exercise them in dev and demos.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.send_for_manual}
              onChange={(e) => patch({ send_for_manual: e.target.checked })}
              disabled={!settings.enabled}
              className="mt-1 size-5 shrink-0 accent-teal-500 disabled:opacity-50"
              aria-label="Also send for manual payments"
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Merchant details (optional)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Printed on the receipt for compliance. Leave blank to show DueNest
            branding only.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="legal-name">Business legal name</Label>
            <Input
              id="legal-name"
              value={settings.business_legal_name}
              onChange={(e) => patch({ business_legal_name: e.target.value })}
              placeholder="e.g. DueNest Ltd"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Business address</Label>
            <Textarea
              id="address"
              value={settings.business_address}
              onChange={(e) => patch({ business_address: e.target.value })}
              rows={3}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tax-id">Tax / VAT ID</Label>
              <Input
                id="tax-id"
                value={settings.tax_id}
                onChange={(e) => patch({ tax_id: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-email">Support email</Label>
              <Input
                id="support-email"
                type="email"
                value={settings.support_email}
                onChange={(e) => patch({ support_email: e.target.value })}
                placeholder="support@duenest.app"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="size-4" aria-hidden="true" />
          )}
          Save settings
        </Button>
        <Button variant="outline" onClick={test} disabled={testing}>
          {testing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-4" aria-hidden="true" />
          )}
          Send a test receipt to me
        </Button>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Mail className="size-3.5" aria-hidden="true" />
          Uses the current saved format
        </span>
      </div>
    </div>
  );
}
