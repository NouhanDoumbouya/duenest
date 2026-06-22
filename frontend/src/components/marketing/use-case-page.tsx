import Link from "next/link";
import { ArrowRight, Check, ShieldCheck } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Eyebrow } from "@/components/marketing/section";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UseCase } from "@/lib/use-cases";

// Launch-gated CTA: during private beta the real action is the waitlist; at
// public launch (NEXT_PUBLIC_PRIVATE_BETA_ENABLED=false) it becomes register.
// Resolved at build time so these pages stay fully static.
const PRIVATE_BETA =
  (process.env.NEXT_PUBLIC_PRIVATE_BETA_ENABLED ?? "true").toLowerCase() !==
  "false";
const PRIMARY_CTA = PRIVATE_BETA
  ? { href: "/waitlist", label: "Join the beta" }
  : { href: "/register", label: "Start organizing for free" };

export function UseCasePage({ useCase }: { useCase: UseCase }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
        {/* Hero */}
        <div className="max-w-2xl">
          <Eyebrow>{useCase.eyebrow}</Eyebrow>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance">
            {useCase.title}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-pretty text-muted-foreground">
            {useCase.solution}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href={PRIMARY_CTA.href}
              className={cn(buttonVariants({ size: "lg" }), "h-12 px-7 text-base")}
            >
              {PRIMARY_CTA.label}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/#how-it-works"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 px-7 text-base",
              )}
            >
              See how it works
            </Link>
          </div>
        </div>

        {/* Pain → solution */}
        <section className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">The problem</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {useCase.pain}
            </p>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
            <h2 className="text-lg font-semibold">How CertaNest helps</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {useCase.solution}
            </p>
          </div>
        </section>

        {/* Workflow */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold">The workflow</h2>
          <ol className="mt-5 space-y-3">
            {useCase.workflow.map((step, i) => (
              <li key={step} className="flex items-start gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {i + 1}
                </span>
                <span className="text-sm leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold">Features you&apos;ll use</h2>
          <ul className="mt-5 flex flex-wrap gap-2">
            {useCase.features.map((f) => (
              <li
                key={f}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm"
              >
                <Check className="size-3.5 text-brand-success" aria-hidden />
                {f}
              </li>
            ))}
          </ul>
        </section>

        {/* Trust + final CTA */}
        <section className="mt-12 rounded-2xl border border-border bg-card p-6">
          <p className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-success" aria-hidden />
            {useCase.trustNote}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={PRIMARY_CTA.href} className={cn(buttonVariants())}>
              {PRIMARY_CTA.label}
            </Link>
            <Link
              href="/use-cases"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              See other use cases
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
