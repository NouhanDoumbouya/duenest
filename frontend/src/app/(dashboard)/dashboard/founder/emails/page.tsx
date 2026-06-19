"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { FounderPageHeader } from "@/components/founder/founder-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Toast, type ToastState } from "@/components/ui/toast";
import { ApiError } from "@/lib/api";
import {
  getEmailSettings,
  updateEmailSetting,
  type TransactionalEmailSetting,
} from "@/lib/founder";

export default function FounderEmailsPage() {
  const [items, setItems] = useState<TransactionalEmailSetting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
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

  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Emails"
        title="Transactional emails"
        description="Edit the subject and message of each email, or turn one off. Buttons, links, codes, and DueNest branding stay intact — leave a field blank to use the default."
      />

      {error && (
        <p className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
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

                  <div className="flex items-center justify-end gap-2">
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
                        className="text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        Discard changes
                      </button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => saveCopy(item)}
                      disabled={busy || !dirty}
                    >
                      {busy ? <Loader2 className="size-4 animate-spin" /> : "Save"}
                    </Button>
                  </div>
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
