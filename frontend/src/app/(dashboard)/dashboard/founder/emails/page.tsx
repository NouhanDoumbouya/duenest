"use client";

import { useEffect, useState } from "react";
import { Eye, Loader2, Send, Zap } from "lucide-react";

import { FounderPageHeader } from "@/components/founder/founder-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toast, type ToastState } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  getEmailAnalytics,
  getEmailSettings,
  previewEmail,
  sendTestEmail,
  updateEmailSetting,
  type EmailAnalytics,
  type TransactionalEmailSetting,
} from "@/lib/founder";

export default function FounderEmailsPage() {
  const [items, setItems] = useState<TransactionalEmailSetting[] | null>(null);
  const [analytics, setAnalytics] = useState<EmailAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  // Which card's live preview is open, the rendered HTML, and its loading flag.
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewBusy, setPreviewBusy] = useState(false);
  // Local edits per email key (so typing doesn't fight the saved state).
  const [drafts, setDrafts] = useState<
    Record<string, { subject: string; body: string }>
  >({});

  useEffect(() => {
    let active = true;
    getEmailSettings()
      .then((result) => {
        if (!active) return;
        setItems(result);
        setDrafts(
          Object.fromEntries(
            result.map((i) => [i.key, { subject: i.subject, body: i.body }]),
          ),
        );
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError ? err.message : "Unable to load email settings.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getEmailAnalytics()
      .then((result) => active && setAnalytics(result))
      .catch(() => {
        /* analytics are non-critical — the editor still works without them */
      });
    return () => {
      active = false;
    };
  }, []);

  function patchLocal(key: string, saved: TransactionalEmailSetting) {
    setItems((prev) => (prev ?? []).map((i) => (i.key === key ? saved : i)));
    setDrafts((prev) => ({
      ...prev,
      [key]: { subject: saved.subject, body: saved.body },
    }));
  }

  async function toggleEnabled(item: TransactionalEmailSetting) {
    setSavingKey(item.key);
    setError(null);
    try {
      const saved = await updateEmailSetting(item.key, {
        enabled: !item.enabled,
      });
      patchLocal(item.key, saved);
      setToast({
        message: `${saved.name} ${saved.enabled ? "enabled" : "disabled"}.`,
        kind: "success",
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't update that email.");
    } finally {
      setSavingKey(null);
    }
  }

  async function saveCopy(item: TransactionalEmailSetting) {
    const draft = drafts[item.key] ?? { subject: "", body: "" };
    setSavingKey(item.key);
    setError(null);
    try {
      const saved = await updateEmailSetting(item.key, {
        subject: draft.subject,
        body: draft.body,
      });
      patchLocal(item.key, saved);
      setToast({ message: `Saved “${saved.name}”.`, kind: "success" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that email.");
    } finally {
      setSavingKey(null);
    }
  }

  async function togglePreview(item: TransactionalEmailSetting) {
    if (previewKey === item.key) {
      setPreviewKey(null);
      setPreviewHtml("");
      return;
    }
    const draft = drafts[item.key] ?? { subject: "", body: "" };
    setPreviewBusy(true);
    setPreviewKey(item.key);
    setError(null);
    try {
      const result = await previewEmail({
        key: item.key,
        subject: draft.subject,
        body: draft.body,
      });
      setPreviewHtml(result.html);
    } catch (err) {
      setPreviewKey(null);
      setError(err instanceof ApiError ? err.message : "Couldn't render preview.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function sendTest(item: TransactionalEmailSetting) {
    const draft = drafts[item.key] ?? { subject: "", body: "" };
    setTestingKey(item.key);
    setError(null);
    try {
      const res = await sendTestEmail(item.key, {
        subject: draft.subject,
        body: draft.body,
      });
      setToast({ message: res.detail, kind: "success" });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't send the test email.",
      );
    } finally {
      setTestingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Emails"
        title="Transactional emails"
        description="Edit the subject and message of each email, preview it, send yourself a test, or turn one off. Each card shows what triggers the email. Buttons, links, codes, and CertaNest branding stay intact — leave a field blank to use the default."
      />

      {error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {analytics && (
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-heading text-base font-semibold">
                Delivery health
              </h2>
              <span className="text-xs text-muted-foreground">
                Last {analytics.window_days} days
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
                {analytics.total} sent attempts
              </span>
              {Object.entries(analytics.by_status).map(([status, count]) => (
                <span
                  key={status}
                  className={cn(
                    "rounded-full px-2.5 py-1 font-medium",
                    status === "failed" || status === "bounced" || status === "complained"
                      ? "bg-destructive/10 text-destructive"
                      : status === "suppressed"
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        : "bg-teal-500/10 text-teal-700 dark:text-teal-300",
                  )}
                >
                  {count} {status}
                </span>
              ))}
              <span className="rounded-full bg-muted px-2.5 py-1 font-medium">
                {analytics.suppressed_total} on suppression list
              </span>
            </div>

            {analytics.by_type.length > 0 && (
              <div className="grid gap-1.5 text-xs sm:grid-cols-2">
                {analytics.by_type.map((t) => (
                  <div
                    key={t.email_type}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <span className="font-medium">{t.email_type}</span>
                    <span className="text-muted-foreground">
                      {t.sent} sent
                      {t.failed > 0 && ` · ${t.failed} failed`}
                      {t.suppressed > 0 && ` · ${t.suppressed} suppressed`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {analytics.recent.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
                  Recent sends ({analytics.recent.length})
                </summary>
                <ul className="mt-2 space-y-1">
                  {analytics.recent.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 rounded border border-border/60 px-2.5 py-1.5"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{r.email_type}</span>{" "}
                        <span className="text-muted-foreground">{r.recipient}</span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 font-medium",
                          r.status === "failed" || r.status === "bounced"
                            ? "bg-destructive/10 text-destructive"
                            : r.status === "suppressed"
                              ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                              : "bg-muted text-muted-foreground",
                        )}
                      >
                        {r.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="text-[0.7rem] text-muted-foreground">
              Delivered / bounced / opened populate once an email provider posts
              delivery webhooks. Recipients are masked.
            </p>
          </CardContent>
        </Card>
      )}

      {items === null ? (
        <Card className="h-[360px] animate-pulse" />
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const draft = drafts[item.key] ?? { subject: "", body: "" };
            const dirty =
              draft.subject !== item.subject || draft.body !== item.body;
            const busy = savingKey === item.key;
            return (
              <Card key={item.key}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="font-heading text-base font-semibold">
                        {item.name}
                      </h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.enabled ? "Sending" : "Disabled — not sent"}
                      </p>
                      {item.trigger && (
                        <p className="mt-2 inline-flex items-start gap-1.5 rounded-md bg-muted px-2 py-1 text-[0.7rem] leading-snug text-muted-foreground">
                          <Zap className="mt-px size-3 shrink-0 text-brand-amber" />
                          <span>
                            <span className="font-medium text-foreground">
                              Trigger:
                            </span>{" "}
                            {item.trigger}
                          </span>
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={item.enabled ? "outline" : "default"}
                      onClick={() => toggleEnabled(item)}
                      disabled={busy}
                    >
                      {busy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : item.enabled ? (
                        "Turn off"
                      ) : (
                        "Turn on"
                      )}
                    </Button>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor={`subject-${item.key}`}>Subject</Label>
                    <Input
                      id={`subject-${item.key}`}
                      value={draft.subject}
                      placeholder={item.default_subject}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [item.key]: { ...draft, subject: e.target.value },
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor={`body-${item.key}`}>Message</Label>
                    <Textarea
                      id={`body-${item.key}`}
                      rows={4}
                      value={draft.body}
                      placeholder={item.default_body}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [item.key]: { ...draft, body: e.target.value },
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use the default. Plain text only — links and
                      buttons are added automatically.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {dirty && (
                      <button
                        type="button"
                        onClick={() =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.key]: {
                              subject: item.subject,
                              body: item.body,
                            },
                          }))
                        }
                        className="mr-auto text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        Discard changes
                      </button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => togglePreview(item)}
                      disabled={previewBusy && previewKey === item.key}
                    >
                      {previewBusy && previewKey === item.key ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                      {previewKey === item.key ? "Hide preview" : "Preview"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => sendTest(item)}
                      disabled={testingKey === item.key}
                    >
                      {testingKey === item.key ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      Send test to me
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => saveCopy(item)}
                      disabled={busy || !dirty}
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>

                  {previewKey === item.key && previewHtml && (
                    <div className="overflow-hidden rounded-lg border border-border">
                      <div className="border-b border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                        Live preview · sample data
                      </div>
                      <iframe
                        title={`Preview of ${item.name}`}
                        sandbox=""
                        srcDoc={previewHtml}
                        className="h-[420px] w-full bg-white"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
