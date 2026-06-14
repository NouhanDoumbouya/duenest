"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { ApiError } from "@/lib/api";
import { receiveByCode } from "@/lib/quick-share";

export default function ReceiveCodePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = code.trim();
  const canSubmit = trimmed.length > 0 && !submitting;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await receiveByCode(trimmed);
      // Hand off to the normal, fully guarded claim flow.
      router.push(result.claim_path);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not look up that code. Please try again.",
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
          <Input
            id="dn-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="DN-4KQ7-PXMR"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={16}
            inputMode="text"
            className="text-center text-lg font-semibold tracking-[0.2em] uppercase"
            aria-describedby="dn-code-hint"
          />
          <p id="dn-code-hint" className="text-xs text-muted-foreground">
            The code looks like <span className="font-medium">DN-4KQ7-PXMR</span>.
            Dashes and spacing don&apos;t matter.
          </p>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={!canSubmit}>
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <KeyRound className="size-4" />
          )}
          Find this share
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
