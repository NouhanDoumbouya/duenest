"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { ApiError } from "@/lib/api";
import { receiveByCode } from "@/lib/quick-share";
import { formatDueNestCode, normalizeDueNestCode } from "@/lib/safesend";
import { cn } from "@/lib/utils";

export default function ReceiveCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tolerate lowercase, spaces, and dashes; auto-format toward DN-XXXX-XXXX.
  const normalized = normalizeDueNestCode(code);
  const looksComplete = normalized.length > 0;
  const canSubmit = code.trim().length > 0 && !submitting;

  function handleChange(value: string) {
    setCode(formatDueNestCode(value));
    if (error) setError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // Send the normalized form when valid, else the raw input (the backend
      // re-normalizes and returns a calm error if it cannot be resolved).
      const result = await receiveByCode(normalized || code.trim());
      // Hand off to the normal, fully guarded claim flow.
      router.push(result.claim_path);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Code does not match. Check with the sender and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <PageContainer width="narrow">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/quick-share"
          className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Back to Quick Share"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-page-title">Receive a code</h1>
          <p className="text-sm text-muted-foreground">
            Enter the DueNest code a sender gave you to open what they shared.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-card"
      >
        {error && <InlineAlert tone="danger">{error}</InlineAlert>}

        <div className="space-y-2">
          <Label htmlFor="dn-code">DueNest code</Label>
          <div className="relative">
            <Input
              id="dn-code"
              value={code}
              onChange={(e) => handleChange(e.target.value)}
              placeholder="DN-4KQ7-PXMR"
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={11}
              inputMode="text"
              className={cn(
                "text-center text-lg font-semibold tracking-[0.2em] uppercase",
                looksComplete && "border-brand-success/60",
              )}
              aria-describedby="dn-code-hint"
            />
            {looksComplete && (
              <Check className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-brand-success" />
            )}
          </div>
          <p id="dn-code-hint" className="text-xs text-muted-foreground">
            Codes look like <span className="font-medium">DN-4KQ7-PXMR</span>.
            Dashes, spacing, and lowercase don&apos;t matter — paste it however you
            received it.
          </p>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}
          {submitting ? "Finding share…" : "Find this share"}
        </Button>
      </form>

      <TrustNotice icon={ShieldCheck} title="Codes are checked on our servers">
        A DueNest code only points to a share — it never carries files or
        permissions. Access, login, any access code, and expiry are all verified
        by DueNest before anything opens, and the sender can revoke at any time.
      </TrustNotice>
    </PageContainer>
  );
}
