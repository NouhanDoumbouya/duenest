import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CalendarCheck,
  CreditCard,
  FileCheck2,
  Layers,
  LifeBuoy,
  ListChecks,
  Lock,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  TimerReset,
  UploadCloud,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AppPreview } from "@/components/marketing/app-preview";
import { FeatureCard, type Feature } from "@/components/marketing/feature-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title:
    "DueNest — Stay ready for important documents, renewals, and secure sharing",
  description:
    "DueNest is a calm, secure command center for important documents, renewals, applications, subscriptions, bundles, emergency access, and secure sharing. Join the private beta.",
  alternates: { canonical: "/" },
};

const features: Feature[] = [
  {
    icon: FileCheck2,
    title: "Documents & File Inbox",
    description:
      "Keep passports, visas, licenses, insurance, and certificates in one place — capture a file fast, organize it later.",
  },
  {
    icon: CalendarCheck,
    title: "Renewal & expiry tracking",
    description:
      "Every document carries the date that matters, so what's expiring or renewing soon rises to the top.",
  },
  {
    icon: BellRing,
    title: "Reminders & notifications",
    description:
      "A notification center and email reminders give you a heads-up before a deadline or renewal arrives.",
  },
  {
    icon: CreditCard,
    title: "Subscription tracking",
    description:
      "Track recurring subscriptions and trials so the next charge never takes you by surprise. DueNest tracks — it does not process payments.",
  },
  {
    icon: ListChecks,
    title: "Application bundles",
    description:
      "Group the documents an application needs, see what's still missing, and reuse the pack for the next one.",
  },
  {
    icon: QrCode,
    title: "Quick Share",
    description:
      "Share selected documents by secure link, DueNest code, or QR — with expiry, revocation, and view-only control.",
  },
  {
    icon: LifeBuoy,
    title: "Emergency Access",
    description:
      "Prepare a chosen set of items for moments when access matters. Only what you pick is visible — never your full vault.",
  },
  {
    icon: Sparkles,
    title: "AI document support",
    description:
      "Automatic date extraction and smart classification to keep records accurate with less manual entry.",
    badge: "Coming soon",
  },
];

const pains = [
  "Documents scattered across phone, email, WhatsApp, Drive, and laptop.",
  "Passports, visas, and certificates expiring unnoticed.",
  "Subscriptions renewing without warning.",
  "Application files missing at the last minute.",
  "Sending sensitive documents through unsafe channels.",
  "Family or emergency contacts without the information they need.",
];

const steps = [
  {
    icon: UploadCloud,
    title: "Add your documents",
    description:
      "Upload files or create document records with type, issuer, and the key dates that matter.",
  },
  {
    icon: ListChecks,
    title: "Organize and prepare",
    description:
      "Add categories, reminders, and bundles so you walk into any application or renewal already prepared.",
  },
  {
    icon: QrCode,
    title: "Share when needed",
    description:
      "Share only the items you choose — by secure link, code, or QR — with expiry and revocation in your control.",
  },
  {
    icon: BellRing,
    title: "Stay reminded",
    description:
      "Get notified before expiry and renewal dates, so nothing important slips by quietly.",
  },
];

const quickShare = [
  "Secure link, DueNest code, or QR — your choice of hand-off.",
  "Set an expiry and revoke access at any time.",
  "View-only or allow download, per share.",
  "Share a single file or a whole bundle.",
  "An activity log shows opens, accepts, and downloads.",
];

const emergency = [
  "Only the items you choose are visible.",
  "Add an emergency note or contact alongside them.",
  "Set an expiry and revoke whenever you want.",
  "A public viewer opens the selected items — nothing more.",
];

const useCases = [
  {
    title: "International students & visa holders",
    description:
      "Keep passports, visas, and enrolment letters ready, and share selected documents securely with schools or sponsors.",
  },
  {
    title: "Scholarship & job applicants",
    description:
      "Build a complete application bundle, track what's still missing, and reuse it for the next opportunity.",
  },
  {
    title: "Families",
    description:
      "Organize the household's important documents and prepare emergency access for the people who may need it.",
  },
  {
    title: "Freelancers & professionals",
    description:
      "Track contracts, insurance, and renewals, and send clients only the files they need — not your whole vault.",
  },
  {
    title: "Travelers",
    description:
      "Carry a calm, organized copy of the documents a trip depends on, ready to show or share when asked.",
  },
  {
    title: "Student groups & small organizations",
    description:
      "Collect and manage documents from members without the chaos of scattered messages and threads.",
  },
];

const trustPoints = [
  {
    icon: Lock,
    title: "Encrypted at rest",
    description:
      "Uploaded files are encrypted at rest. DueNest decrypts a file only after its permission checks pass.",
  },
  {
    icon: ShieldCheck,
    title: "You choose what's shared",
    description:
      "Nothing is shared by default. A share exposes only the items you select — your wider vault stays private.",
  },
  {
    icon: TimerReset,
    title: "Expiry & revocation",
    description:
      "Shares and emergency access can expire and be revoked. Once revoked or expired, access stops.",
  },
  {
    icon: RotateCcw,
    title: "Access-controlled by design",
    description:
      "Records are scoped to your account, access codes are stored hashed, and revoked or expired links are blocked server-side.",
  },
];

const faqs = [
  {
    q: "Is DueNest a replacement for Google Drive?",
    a: "Not quite. Drive stores files; DueNest organizes important documents around their dates, reminders, application bundles, and controlled sharing — so you stay ready, not just stored.",
  },
  {
    q: "What kind of documents can I manage?",
    a: "Passports, visas, licenses, insurance, certificates, contracts, receipts, and similar life-admin documents — whatever you need to keep ready and track.",
  },
  {
    q: "Can I share documents securely?",
    a: "Yes. Quick Share lets you share selected items by secure link, DueNest code, or QR, with expiry, revocation, and view-only or download control. Your full vault is never exposed.",
  },
  {
    q: "Is my full vault shared when I use Quick Share?",
    a: "No. Only the specific files or bundle you select for that share are visible. Everything else stays private.",
  },
  {
    q: "Can DueNest remind me before expiry dates?",
    a: "Yes. DueNest surfaces what's expiring or renewing soon and can send reminders. You should still verify official deadlines and requirements yourself.",
  },
  {
    q: "Does DueNest process payments?",
    a: "No. DueNest helps you track subscriptions and renewals. It does not process payments or cancel subscriptions on your behalf.",
  },
  {
    q: "What is Emergency Access?",
    a: "A way to prepare a chosen set of information for moments when access matters. Only the items you select are visible, with expiry and revocation. It is a document access aid, not an emergency service.",
  },
  {
    q: "Are my files secure?",
    a: "Uploaded files are encrypted at rest and access is permission-checked. Watermarking can help discourage misuse, but no web app can fully prevent screenshots on every device.",
  },
  {
    q: "Can I delete my data?",
    a: "Yes. You can delete files and request account deletion and a data export from your account's data controls. See the Data & Deletion page for details.",
  },
  {
    q: "Is DueNest available now?",
    a: "DueNest is in a private beta that rolls out gradually to selected users. Join the waitlist to request access.",
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
                Your calm command center for life-admin
              </span>

              <h1 className="mt-6 text-4xl font-semibold leading-[1.05] text-balance sm:text-5xl md:text-[3.4rem]">
                Stay ready for life&apos;s{" "}
                <span className="bg-gradient-to-r from-primary to-brand-teal bg-clip-text text-transparent">
                  important documents
                </span>
                .
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
                DueNest helps you organize important files, track renewals, build
                application bundles, manage subscriptions, and share selected
                documents securely — all from one trusted place.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/waitlist"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-12 px-7 text-base",
                  )}
                >
                  Join the waitlist
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="#how"
                  className={cn(
                    buttonVariants({ variant: "outline", size: "lg" }),
                    "h-12 px-7 text-base",
                  )}
                >
                  See how it works
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Lock className="size-4 text-brand-success" />
                  Encrypted at rest
                </span>
                <span className="hidden text-border sm:inline">•</span>
                <span className="inline-flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-brand-success" />
                  Selected-item sharing only
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

        {/* Pain */}
        <section className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-primary">
                The problem
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-balance sm:text-4xl">
                Important documents are usually remembered only when something
                goes wrong
              </h2>
              <p className="mt-4 text-pretty text-muted-foreground">
                Life-admin is scattered by default. DueNest brings it into one
                calm, organized place — before a deadline becomes an emergency.
              </p>
            </div>
            <ul className="mx-auto mt-12 grid max-w-4xl gap-3 sm:grid-cols-2">
              {pains.map((pain) => (
                <li
                  key={pain}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-xs"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-amber" />
                  {pain}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-y border-border bg-card/60">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-primary">
                Everything in one place
              </p>
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
        <section id="how" className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-primary">How it works</p>
              <h2 className="mt-2 text-3xl font-semibold text-balance sm:text-4xl">
                From scattered and stressful to organized and ahead
              </h2>
            </div>

            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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

        {/* Quick Share highlight */}
        <section
          id="quick-share"
          className="scroll-mt-20 border-y border-border bg-card/60"
        >
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
            <div className="max-w-md">
              <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <QrCode className="size-5" />
              </span>
              <h2 className="mt-5 text-3xl font-semibold text-balance sm:text-4xl">
                Share selected documents without exposing your full vault
              </h2>
              <p className="mt-4 text-pretty text-muted-foreground">
                Quick Share gives a recipient exactly what you choose — and
                nothing else — with the controls you&apos;d expect from a serious
                document tool.
              </p>
              <p className="mt-4 rounded-xl border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
                Watermarking helps discourage misuse, but no web app can fully
                prevent screenshots on every device.
              </p>
            </div>
            <ul className="grid gap-3">
              {quickShare.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-xs"
                >
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-success" />
                  <span className="text-muted-foreground">{point}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Emergency Access highlight */}
        <section id="emergency" className="scroll-mt-20">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-24">
            <ul className="order-2 grid gap-3 lg:order-1">
              {emergency.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm shadow-xs"
                >
                  <LifeBuoy className="mt-0.5 size-4 shrink-0 text-primary" />
                  <span className="text-muted-foreground">{point}</span>
                </li>
              ))}
            </ul>
            <div className="order-1 max-w-md lg:order-2">
              <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <LifeBuoy className="size-5" />
              </span>
              <h2 className="mt-5 text-3xl font-semibold text-balance sm:text-4xl">
                Prepare selected information for moments when access matters
              </h2>
              <p className="mt-4 text-pretty text-muted-foreground">
                Only the items you choose are visible. Your full DueNest vault
                remains private. Emergency Access is a document access aid — not
                a medical, legal, or emergency service.
              </p>
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section
          id="use-cases"
          className="scroll-mt-20 border-y border-border bg-card/60"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-semibold text-primary">Use cases</p>
              <h2 className="mt-2 text-3xl font-semibold text-balance sm:text-4xl">
                Built for the people juggling important documents
              </h2>
            </div>
            <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {useCases.map((useCase) => (
                <div
                  key={useCase.title}
                  className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-6 shadow-card"
                >
                  <Layers className="size-5 text-primary" />
                  <h3 className="mt-2 font-heading text-base font-semibold">
                    {useCase.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {useCase.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust / security */}
        <section className="scroll-mt-20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
            <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:items-center">
              <div className="max-w-md">
                <p className="text-sm font-semibold text-primary">
                  Trust &amp; security
                </p>
                <h2 className="mt-2 text-3xl font-semibold text-balance sm:text-4xl">
                  Built for sensitive life-admin
                </h2>
                <p className="mt-4 text-pretty text-muted-foreground">
                  Files, sharing links, emergency access, and reminders are built
                  with access control, expiry, revocation, and privacy-safe
                  operations in mind.
                </p>
                <Link
                  href="/security"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  Read our trust &amp; security page
                  <ArrowRight className="size-4" />
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
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
                      <h3 className="mt-4 text-sm font-semibold">
                        {point.title}
                      </h3>
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
                Be ready before deadlines become emergencies
              </h2>
              <p className="text-pretty text-white/70">
                Private beta access rolls out gradually to selected users. Join
                the waitlist to request yours.
              </p>
              <Link
                href="/waitlist"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-12 bg-white px-7 text-base text-brand-navy shadow-sm hover:bg-white/90",
                )}
              >
                Join the waitlist
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
