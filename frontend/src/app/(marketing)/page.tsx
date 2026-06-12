import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  FileCheck2,
  FolderGit2,
  ListChecks,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { Logo } from "@/components/layout/logo";
import { AppPreview } from "@/components/marketing/app-preview";
import { FeatureCard, type Feature } from "@/components/marketing/feature-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features: Feature[] = [
  {
    icon: FileCheck2,
    title: "Document renewal tracking",
    description:
      "Keep passports, licenses, insurance, and certificates in one vault with expiry dates you never have to remember.",
  },
  {
    icon: BellRing,
    title: "Subscription reminders",
    description:
      "Track recurring subscriptions and trials, and get a calm heads-up before the next charge or renewal lands.",
  },
  {
    icon: FolderGit2,
    title: "Application packs",
    description:
      "Bundle the right documents once and reuse them for jobs, scholarships, visas, and grants in seconds.",
  },
  {
    icon: Sparkles,
    title: "AI-assisted document support",
    description:
      "Automatic date extraction, smart classification, and reminder suggestions so nothing slips through.",
    badge: "Coming soon",
  },
];

const steps = [
  {
    icon: UploadCloud,
    title: "Add your documents",
    description:
      "Capture the details of each document — type, issuer, and key dates — in a structured, searchable vault.",
  },
  {
    icon: CalendarCheck,
    title: "Track every deadline",
    description:
      "DueNest surfaces what's expiring or renewing soon, so important dates never sneak up on you again.",
  },
  {
    icon: ListChecks,
    title: "Stay application-ready",
    description:
      "Group documents into reusable packs and walk into any application or renewal fully prepared.",
  },
];

const faqs = [
  {
    q: "Is DueNest free to start?",
    a: "Yes. You can create an account and start organizing your documents and deadlines for free.",
  },
  {
    q: "Who is DueNest for?",
    a: "Students, professionals, immigrants, freelancers, and families — anyone juggling important documents and deadlines.",
  },
  {
    q: "Is my data private?",
    a: "Every document is scoped to your account only. Privacy and security are core to how DueNest is built.",
  },
];

const trustChips = ["Students", "Professionals", "Immigrants", "Freelancers", "Families"];

export default function LandingPage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 [background:radial-gradient(55%_45%_at_85%_-5%,var(--brand-mint),transparent_60%),radial-gradient(45%_40%_at_5%_10%,rgba(37,99,235,0.08),transparent_60%)]"
          />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <div className="flex flex-col items-start text-left">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm">
                <ShieldCheck className="size-3.5 text-brand-teal" />
                Your secure life-admin workspace
              </span>

              <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.1] sm:text-5xl md:text-6xl">
                Stay ahead of every{" "}
                <span className="bg-gradient-to-r from-primary to-brand-teal bg-clip-text text-transparent">
                  renewal and deadline
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-balance text-lg text-muted-foreground">
                DueNest keeps your important documents, subscriptions, and
                deadlines organized in one calm, secure workspace — so you never
                miss what matters.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-12 px-7 text-base shadow-sm",
                  )}
                >
                  Get started
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="/login"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-12 px-7 text-base",
                  )}
                >
                  Sign in
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-brand-success" />
                  Private by design
                </span>
                <span className="flex items-center gap-1.5">
                  <CalendarCheck className="size-4 text-brand-success" />
                  No credit card required
                </span>
              </div>
            </div>

            <div className="lg:pl-6">
              <AppPreview />
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="border-y border-border bg-muted/40">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-8 sm:px-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Built for the way real life-admin works
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
              {trustChips.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-border bg-background px-3 py-1 text-sm font-medium text-foreground/80"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold sm:text-4xl">
                Everything in one organized nest
              </h2>
              <p className="mt-4 text-muted-foreground">
                Four core pillars that turn scattered documents and forgotten
                dates into a system you can trust.
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <FeatureCard key={feature.title} feature={feature} />
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 border-t border-border bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold sm:text-4xl">
                How DueNest works
              </h2>
              <p className="mt-4 text-muted-foreground">
                Three simple steps to go from scattered and stressed to organized
                and ahead.
              </p>
            </div>

            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div key={step.title} className="relative">
                    <div className="flex h-full flex-col gap-4 rounded-xl border border-border bg-card p-6">
                      <div className="flex items-center justify-between">
                        <span className="flex size-11 items-center justify-center rounded-xl bg-brand-navy text-brand-teal">
                          <Icon className="size-5" />
                        </span>
                        <span className="font-heading text-2xl font-semibold text-muted-foreground/30">
                          0{index + 1}
                        </span>
                      </div>
                      <h3 className="font-heading text-lg font-semibold">
                        {step.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6">
            <div className="text-center">
              <h2 className="text-3xl font-semibold sm:text-4xl">
                Frequently asked questions
              </h2>
            </div>
            <div className="mt-10 divide-y divide-border rounded-xl border border-border bg-card">
              {faqs.map((faq) => (
                <div key={faq.q} className="p-6">
                  <h3 className="font-heading text-base font-semibold">
                    {faq.q}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {faq.a}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-3xl bg-brand-navy px-6 py-16 text-center text-white sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 [background:radial-gradient(50%_60%_at_50%_0%,rgba(20,184,166,0.25),transparent_60%),radial-gradient(40%_50%_at_100%_100%,rgba(37,99,235,0.35),transparent_60%)]"
            />
            <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                Bring calm to your documents and deadlines
              </h2>
              <p className="text-white/70">
                Create your free DueNest workspace and add your first document in
                under a minute.
              </p>
              <Link
                href="/register"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-12 bg-white px-7 text-base text-brand-navy shadow-sm hover:bg-white/90",
                )}
              >
                Create your free account
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6">
          <Logo />
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} DueNest. Documents, deadlines, and
            renewals in one secure workspace.
          </p>
        </div>
      </footer>
    </>
  );
}
