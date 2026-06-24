"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Link2, Loader2, Sparkles } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  applyRequirementImport,
  importRequirementsFromLink,
} from "@/lib/renewal-workspace";
import { useFocusTrap } from "@/lib/use-focus-trap";
import type {
  RequirementImportApplyResult,
  RequirementImportResult,
} from "@/types/renewal-workspace";

type Step = "input" | "loading" | "review" | "applying";

/** Friendly, actionable copy for a blocked/failed extraction reason. */
function reasonMessage(result: RequirementImportResult): string {
  if (result.message) return result.message;
  switch (result.reason) {
    case "consent_required":
      return "Turn on AI in Settings to import requirements.";
    case "not_configured":
      return "AI isn't configured yet.";
    case "budget":
      return "AI is paused for now to protect usage limits. Please try again later.";
    case "error":
      return "We couldn't extract requirements from that page. Try copying the text manually.";
    default:
      return "We couldn't read this page. Try copying the requirement text manually.";
  }
}

export function RequirementImportModal({
  bundleId,
  open,
  onClose,
  onApplied,
}: {
  bundleId: number;
  open: boolean;
  onClose: () => void;
  onApplied: (result: RequirementImportApplyResult) => void;
}) {
  const titleId = useId();
  const panelRef = useFocusTrap<HTMLDivElement>(open);
  const [step, setStep] = useState<Step>("input");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [result, setResult] = useState<RequirementImportResult | null>(null);
  const [reqSel, setReqSel] = useState<Set<string>>(new Set());
  const [optSel, setOptSel] = useState<Set<string>>(new Set());
  const [dlSel, setDlSel] = useState<Set<number>>(new Set());

  // The modal is conditionally mounted by its parent, so each open is a fresh
  // instance with clean initial state — no reset-on-close needed.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && step !== "loading" && step !== "applying") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, step, onClose]);

  if (!open) return null;

  async function extract() {
    if (!url.trim()) return;
    setStep("loading");
    setError(null);
    setUpgrade(false);
    try {
      const res = await importRequirementsFromLink(bundleId, url.trim());
      if (!res.available || res.reason !== "ok" || !res.draft_id) {
        setError(reasonMessage(res));
        setUpgrade(Boolean(res.upgrade) || res.reason === "ai_feature_not_in_plan");
        setStep("input");
        return;
      }
      setResult(res);
      setReqSel(new Set((res.required_documents ?? []).map((d) => d.title)));
      setOptSel(new Set((res.optional_documents ?? []).map((d) => d.title)));
      setDlSel(
        new Set(
          (res.deadlines ?? [])
            .map((d, i) => (d.date ? i : -1))
            .filter((i) => i >= 0),
        ),
      );
      setStep("review");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setStep("input");
    }
  }

  async function apply() {
    if (!result?.draft_id) return;
    setStep("applying");
    setError(null);
    try {
      const applied = await applyRequirementImport(bundleId, result.draft_id, {
        selected_required_documents: [...reqSel],
        selected_optional_documents: [...optSel],
        selected_deadlines: [...dlSel],
        create_reminders: dlSel.size > 0,
      });
      onApplied(applied);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not add the requirements.",
      );
      setStep("review");
    }
  }

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const busy = step === "loading" || step === "applying";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="fixed inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative my-auto w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-foreground/10 outline-none"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Link2 className="size-5" aria-hidden />
        </span>
        <h2 id={titleId} className="mt-3 font-heading text-lg font-semibold">
          Import requirements from link
        </h2>

        {step === "input" || step === "loading" ? (
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Paste a scholarship, visa, university, job, or application page.
              CertaNest will extract a checklist for you to review. You stay in
              control — nothing is added until you approve.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="req-url">Requirement page URL</Label>
              <Input
                id="req-url"
                type="url"
                inputMode="url"
                placeholder="https://example.edu/scholarship-requirements"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={busy}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Uses 5 AI credits after a successful extraction.
            </p>
            {error && (
              <div className="rounded-lg border border-brand-amber/30 bg-brand-amber/5 px-3 py-2 text-sm">
                <p>{error}</p>
                {upgrade && (
                  <Link
                    href="/dashboard/settings/billing?upgrade=pro"
                    className={`${buttonVariants({ variant: "outline", size: "sm" })} mt-2`}
                  >
                    <Sparkles className="size-4" /> Upgrade to Pro
                  </Link>
                )}
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={extract} disabled={busy || !url.trim()}>
                {step === "loading" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Reading page…
                  </>
                ) : (
                  "Extract checklist"
                )}
              </Button>
            </div>
          </div>
        ) : null}

        {(step === "review" || step === "applying") && result && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Review extracted requirements from{" "}
              <span className="font-medium text-foreground">
                {result.title || result.page_title || "the page"}
              </span>
              . Select what to add to your pack.
            </p>

            {(result.warnings ?? []).length > 0 && (
              <div className="flex flex-col gap-1.5">
                {result.warnings!.map((w, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-brand-amber/30 bg-brand-amber/5 px-3 py-2 text-sm"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand-amber" aria-hidden />
                    <span>{w.message}</span>
                  </div>
                ))}
              </div>
            )}

            <ItemGroup
              heading="Required documents"
              items={result.required_documents ?? []}
              isChecked={(it) => reqSel.has(it.title)}
              onToggle={(it) => setReqSel((s) => toggle(s, it.title))}
            />
            <ItemGroup
              heading="Optional documents"
              items={result.optional_documents ?? []}
              isChecked={(it) => optSel.has(it.title)}
              onToggle={(it) => setOptSel((s) => toggle(s, it.title))}
            />

            {(result.deadlines ?? []).length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Deadlines
                </h3>
                {result.deadlines!.map((d, i) => (
                  <label
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4"
                      checked={dlSel.has(i)}
                      disabled={!d.date}
                      onChange={() => setDlSel((s) => toggle(s, i))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{d.title}</span>
                      {d.date ? (
                        <span className="text-muted-foreground"> · {d.date}</span>
                      ) : (
                        <span className="text-brand-amber"> · date unclear</span>
                      )}
                      {d.source_snippet && (
                        <span className="mt-0.5 block text-xs text-muted-foreground italic">
                          “{d.source_snippet}”
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="mt-1 flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                onClick={apply}
                disabled={busy || reqSel.size + optSel.size === 0}
              >
                {step === "applying" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Adding…
                  </>
                ) : (
                  "Add selected requirements"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemGroup({
  heading,
  items,
  isChecked,
  onToggle,
}: {
  heading: string;
  items: { title: string; description: string; source_snippet: string }[];
  isChecked: (it: { title: string }) => boolean;
  onToggle: (it: { title: string }) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {heading}
      </h3>
      {items.map((it) => (
        <label
          key={it.title}
          className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={isChecked(it)}
            onChange={() => onToggle(it)}
          />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{it.title}</span>
            {it.description && (
              <span className="block text-xs text-muted-foreground">
                {it.description}
              </span>
            )}
            {it.source_snippet && (
              <span className="mt-0.5 block text-xs text-muted-foreground italic">
                “{it.source_snippet}”
              </span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}
