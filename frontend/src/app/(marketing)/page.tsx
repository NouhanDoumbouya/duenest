import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  FileCheck2,
  FolderGit2,
  ListChecks,
  Lock,
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
      "Keep passports, visas, licenses, insurance, and certificates in one place, each with the expiry date that matters.",
  },
  {
    icon: BellRing,
    title: "Subscription reminders",
    description:
      "Track recurring subscriptions and trials so the next charge or renewal never takes you by surprise.",
  },
  {
    icon: FolderGit2,
    title: "Application packs",
    description:
      "Group the right documents once and reuse them for jobs, scholarships, visas, and grants in seconds.",
  },
  {
    icon: Sparkles,
    title: "AI-assisted document support",
    description:
      "Automatic date extraction and smart classification so your records stay accurate with less manual entry.",
    badge: "Coming soon",
  },
];

const steps = [
  {
    icon: UploadCloud,
    title: "Add your documents",
    description:
      "Capture each document’s details — type, issuer, and key dates — and attach the file itself in one place.",
  },
  {
    icon: CalendarCheck,
    title: "See what needs attention",
    description:
      "DueNest surfaces what’s expiring or renewing soon, so important dates never sneak up on you again.",
  },
  {
    icon: ListChecks,
    title: "Stay application-ready",
    description:
      "Group documents into reusable packs and walk into any application or renewal already prepared.",
  },
];

const trustPoints = [
  {
    icon: Lock,
    title: "Private by design",
    description:
      "Every document and date is scoped to your account. Your records are yours — never shared by default.",
  },
  {
    icon: CalendarCheck,
    title: "Organized around what’s next",
    description:
      "The things closest to their deadline rise to the top, so your attention goes where it actually matters.",
  },
  {
    icon: ShieldCheck,
    title: "Built for important things",
    description:
      "Designed for the documents and deadlines you can’t afford to miss — handled with calm and care.",
  },
];

const faqs = [
  {
    q: "Is DueNest free to start?",
    a: "DueNest is in private beta. Join the waitlist and invited users can start organizing documents, files, and deadlines for free during the beta.",
  },
  {
    q: "Who is DueNest for?",
    a: "Students, professionals, travelers, immigrants, freelancers, and families — anyone juggling important documents and dates.",
  },
  {
    q: "Is my data private?",
    a: "Every record is scoped to your account only. Privacy and careful handling are core to how DueNest is built.",
  },
];

const audience = ["Students", "Professionals", "Travelers", "Freelancers", "Families"];

export default function LandingPage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="bg-grid mask-fade-b pointer-events-none absolute inset-0 -z-10 opacity-60"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-32 -z-10 h-[420px] [background:radial-gradient(50%_60%_at_70%_0%,rgba(37,99,235,0.10),transparent_70%),radial-gradient(40%_50%_at_15%_10%,rgba(20,184,166,0.10),transparent_70%)]"
          />
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
            <div className="flex flex-col items-start text-left">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
                <span className="flex size-1.5 rounded-full bg-brand-teal" />
                A calmer way to stay ahead of important dates
              </span>

              <h1 className="mt-6 text-4xl font-semibold leading-[1.05] text-balance sm:text-5xl md:text-[3.4rem]">
                Stay ahead of the{" "}
                <span className="bg-gradient-to-r from-primary to-brand-teal bg-clip-text text-transparent">
                  deadlines that matter
                </span>
                .
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
                DueNest keeps your passports, visas, licenses, insurance, and
                subscriptions organized around the dates that need attention — so
                nothing important slips by.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/waitlist"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-12 px-7 text-base",
                  )}
                >
                  Join the private beta
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

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-brand-success" />
                  Secure by design
                </span>
                <span className="hidden text-border sm:inline">•</span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarCheck className="size-4 text-brand-success" />
                  Built for important deadlines
                </span>
                <span className="hidden text-border sm:inline">•</span>
                <span className="inline-flex items-center gap-1.5">
                  Invite-only private beta
                </span>
              </div>
            </div>

            <div className="lg:pl-4">
              <AppPreview />
            </div>
          </div>
        </section>

        {/* Audience strip */}
        <section className="border-y border-border bg-card/60">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-8 sm:px-6">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Made for the way real life-admin works
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2">
              {audience.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-foreground/80 shadow-xs"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-primary">Everything in one place</p>
              <h2 className="mt-2 text-3xl font-semibold text-balance sm:text-4xl">
                One organized home for your important documents
              </h2>
              <p className="mt-4 text-pretty text-muted-foreground">
                Turn scattered files, screenshots, and forgotten dates into a
                system you can actually trust.
              </p>
            </div>

            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <FeatureCard key={feature.title} feature={feature} />
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how"
          className="scroll-mt-20 border-y border-border bg-card/60"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-primary">How it works</p>
              <h2 className="mt-2 text-3xl font-semibold text-balance sm:text-4xl">
                From scattered and stressful to organized and ahead
              </h2>
            </div>

            <div className="mt-14 grid gap-5 md:grid-cols-3">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.title}
                    className="relative flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex size-11 items-center justify-center rounded-xl bg-brand-navy text-brand-teal">
                        <Icon className="size-5" />
                      </span>
                      <span className="font-heading text-3xl font-semibold text-muted-foreground/25">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="font-heading text-lg font-semibold">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Trust / security */}
        <section className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
              <div className="max-w-md">
                <p className="text-sm font-semibold text-primary">
                  Trust &amp; care
                </p>
                <h2 className="mt-2 text-3xl font-semibold text-balance sm:text-4xl">
                  Built to be trusted with what matters
                </h2>
                <p className="mt-4 text-pretty text-muted-foreground">
                  DueNest is the kind of place you keep the documents you can’t
                  afford to lose. That trust shapes every decision — from how data
                  is scoped to how the interface stays calm under pressure.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {trustPoints.map((point) => {
                  const Icon = point.icon;
                  return (
                    <div
                      key={point.title}
                      className="rounded-2xl border border-border bg-card p-5 shadow-card"
                    >
                      <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                        <Icon className="size-5" />
                      </span>
                      <h3 className="mt-4 text-sm font-semibold">{point.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {point.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section
          id="faq"
          className="scroll-mt-20 border-y border-border bg-card/60"
        >
          <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 lg:py-24">
            <div className="text-center">
              <p className="text-sm font-semibold text-primary">FAQ</p>
              <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">
                Questions, answered
              </h2>
            </div>
            <div className="mt-10 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card">
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
        <section className="px-4 py-20 sm:px-6 lg:py-24">
          <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-3xl bg-brand-navy px-6 py-16 text-center text-white shadow-floating sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 [background:radial-gradient(50%_60%_at_50%_0%,rgba(20,184,166,0.28),transparent_60%),radial-gradient(45%_55%_at_100%_100%,rgba(37,99,235,0.38),transparent_60%)]"
            />
            <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
              <h2 className="text-3xl font-semibold text-balance text-white sm:text-4xl">
                Bring calm to your documents and deadlines
              </h2>
              <p className="text-pretty text-white/70">
                Join the waitlist for a focused private beta built around real
                document and deadline workflows.
              </p>
              <Link
                href="/waitlist"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-12 bg-white px-7 text-base text-brand-navy shadow-sm hover:bg-white/90",
                )}
              >
                Request beta access
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-card/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 sm:flex-row sm:px-6">
          <Logo />
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} DueNest · Documents, deadlines, and
            renewals in one calm place.
          </p>
        </div>
      </footer>
    </>
  );
}
