import Link from "next/link";
import { ArrowRight, Check, Plus, ShieldCheck } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Eyebrow } from "@/components/marketing/section";
import { buttonVariants } from "@/components/ui/button";
import { buildUseCaseJsonLd } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { getUseCase, type UseCase } from "@/lib/use-cases";

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
  const related = (useCase.related ?? [])
    .map((slug) => getUseCase(slug))
    .filter((u): u is UseCase => Boolean(u));
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildUseCaseJsonLd(useCase)) }}
      />
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

        {/* FAQ — visible content that exactly matches the FAQPage JSON-LD. */}
        {useCase.faqs && useCase.faqs.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-semibold">Frequently asked questions</h2>
            <div className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {useCase.faqs.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <Plus
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                      aria-hidden
                    />
                  </summary>
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </section>
        )}

        {/* Related use cases — descriptive internal links for crawl + discovery. */}
        {related.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-semibold">Related use cases</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-3">
              {related.map((u) => (
                <li key={u.slug}>
                  <Link
                    href={`/use-cases/${u.slug}`}
                    className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/40"
                  >
                    <span className="flex items-center gap-1.5 font-semibold">
                      {u.title}
                      <ArrowRight
                        className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    </span>
                    <span className="mt-1 text-sm text-muted-foreground">
                      {u.eyebrow}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
