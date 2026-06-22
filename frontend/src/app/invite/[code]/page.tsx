"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, ShieldCheck, TicketCheck } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import { validateInviteCode } from "@/lib/private-beta";
import { cn } from "@/lib/utils";
import type { InviteValidationResponse } from "@/types/private-beta";

export default function InvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const decodedCode = decodeURIComponent(code);
  const [result, setResult] = useState<InviteValidationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    validateInviteCode(decodedCode)
      .then((response) => {
        if (!active) return;
        setResult(response);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setResult(null);
        setError(
          err instanceof ApiError
            ? err.message
            : "Unable to validate this invite code.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [decodedCode]);

  const registerHref = `/register?invite=${encodeURIComponent(
    result?.code ?? decodedCode,
  )}`;

  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="min-h-dvh bg-background">
        <section className="border-b border-border bg-card/50">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-24">
            <div className="flex flex-col justify-center">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                <TicketCheck className="size-3.5 text-primary" />
                Founder invite
              </span>
              <h1 className="mt-5 max-w-2xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                You have been invited to CertaNest private beta
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
                Create your account with this invite code to start organizing
                documents, renewals, application packs, and important deadlines
                in a calmer workspace.
              </p>
            </div>

            <Card className="shadow-elevated">
              <CardContent className="flex min-h-[420px] flex-col justify-center p-6 text-center sm:p-8">
                {loading ? (
                  <div className="flex flex-col items-center gap-4">
                    <span className="flex size-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Loader2 className="size-6 animate-spin" />
                    </span>
                    <div>
                      <h2 className="font-heading text-2xl font-semibold">
                        Checking your invite
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        Validating this private beta code with CertaNest.
                      </p>
                    </div>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center gap-5">
                    <span className="flex size-14 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                      <ShieldCheck className="size-6" />
                    </span>
                    <div>
                      <h2 className="font-heading text-2xl font-semibold">
                        Invite unavailable
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">{error}</p>
                    </div>
                    <Link
                      href="/waitlist"
                      className={cn(buttonVariants(), "h-11 px-5")}
                    >
                      Join the waitlist
                    </Link>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-5">
                    <span className="flex size-14 items-center justify-center rounded-xl bg-brand-success/10 text-brand-success">
                      <CheckCircle2 className="size-7" />
                    </span>
                    <div>
                      <h2 className="font-heading text-2xl font-semibold">
                        Your invite is ready
                      </h2>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {result?.label || "CertaNest private beta invite"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 font-mono text-sm font-medium">
                      {result?.code ?? decodedCode}
                    </div>
                    <Link
                      href={registerHref}
                      className={cn(buttonVariants({ size: "lg" }), "h-12 px-6")}
                    >
                      Create account
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
