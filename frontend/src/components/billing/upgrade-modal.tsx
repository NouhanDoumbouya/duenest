"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { startCheckout, validatePromoCode } from "@/lib/billing";
import { cn } from "@/lib/utils";
import { useFocusTrap } from "@/lib/use-focus-trap";
import type { BillingInterval } from "@/types/billing";

const PRO_UNLOCKS = [
  "Unlimited documents & high storage",
  "Full premium scanner & Smart Intake",
  "Full Life Radar, Application Packs & Emergency Protocol",
  "Higher secure-sharing limits",
];

export function UpgradeModal({
  open,
  onClose,
  reason,
}: {
  open: boolean;
  onClose: () => void;
  reason?: string;
}) {
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [promo, setPromo] = useState("");
  const [promoState, setPromoState] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  async function applyPromo() {
    if (!promo.trim()) return;
    setChecking(true);
    setPromoState(null);
    try {
      const result = await validatePromoCode(promo.trim(), "pro", interval);
      setPromoState({
        valid: result.valid,
        message: result.valid ? result.discount_label || "Code applied." : result.reason,
      });
    } catch {
      setPromoState({ valid: false, message: "Could not check this code." });
    } finally {
      setChecking(false);
    }
  }

  async function upgrade() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await startCheckout(
        "pro",
        interval,
        promoState?.valid ? promo.trim() : undefined,
      );
      // Provider checkout URL (Stripe) or the success page (manual dev mode).
      window.location.href = res.checkout_url;
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not start checkout.",
      );
      setSubmitting(false);
    }
  }

  return (
    <div
      ref={panelRef}
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-title"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="fixed inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
        onClick={() => !submitting && onClose()}
      />
      <div className="relative my-auto w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-foreground/10">
        <button
          type="button"
          onClick={() => !submitting && onClose()}
          aria-label="Close"
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="size-5" />
        </span>
        <h2 id="upgrade-title" className="mt-4 font-heading text-xl font-semibold">
          Unlock Pro
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {reason ||
            "Upgrade to Pro to add more documents, use the full scanner, and unlock secure sharing."}
        </p>

        <ul className="mt-4 space-y-2">
          {PRO_UNLOCKS.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm">
              <Check className="mt-0.5 size-4 shrink-0 text-brand-success" />
              <span className="text-muted-foreground">{f}</span>
            </li>
          ))}
        </ul>

        {/* Interval toggle */}
        <div className="mt-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Billing cycle">
          {(["month", "year"] as BillingInterval[]).map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={interval === i}
              onClick={() => setInterval(i)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                interval === i
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/40",
              )}
            >
              {i === "month" ? "Monthly" : "Yearly"}
              {i === "year" && (
                <span className="ml-1 text-xs text-brand-success">save more</span>
              )}
            </button>
          ))}
        </div>

        {/* Promo */}
        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="promo">Promo code (optional)</Label>
          <div className="flex gap-2">
            <Input
              id="promo"
              value={promo}
              onChange={(e) => {
                setPromo(e.target.value);
                setPromoState(null);
              }}
              placeholder="e.g. FOUNDER50"
              className="h-10"
              aria-describedby="promo-msg"
            />
            <Button
              type="button"
              variant="outline"
              onClick={applyPromo}
              disabled={checking || !promo.trim()}
            >
              {checking ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
            </Button>
          </div>
          {promoState && (
            <p
              id="promo-msg"
              className={cn(
                "text-xs",
                promoState.valid ? "text-brand-success" : "text-destructive",
              )}
              role="status"
            >
              {promoState.message}
            </p>
          )}
        </div>

        {error && (
          <p className="mt-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button className="mt-5 w-full" onClick={upgrade} disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Upgrade to Pro
        </Button>
        <button
          type="button"
          onClick={() => !submitting && onClose()}
          className="mt-2 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
