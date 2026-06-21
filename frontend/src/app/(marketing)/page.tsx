import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  BellRing,
  Building2,
  Check,
  DoorClosed,
  Eye,
  Folder,
  KeyRound,
  LifeBuoy,
  Lock,
  Package,
  Plus,
  Radar,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Timer,
  X,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AttributionCapture } from "@/components/marketing/attribution-capture";
import { SectionHeader } from "@/components/marketing/section";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { SystemFlow } from "@/components/marketing/system-flow";
import { FeatureCard, type Feature } from "@/components/marketing/feature-card";
import {
  EmergencyMockup,
  FixFirstCard,
  LifeRadarMockup,
  DeadlinesRenewalsMockup,
  SafeSendMockup,
  VaultMockup,
} from "@/components/marketing/mockups";
import { LiveCountdown } from "@/components/marketing/live-countdown";
import { TiltCard } from "@/components/marketing/tilt-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: "DueNest — Important Documents, Ready When Life Asks" },
  description:
    "DueNest helps you scan, organize, prepare, track, generate, and safely share important documents before deadlines, applications, renewals, and emergencies. Private by default. Join the beta.",
  alternates: { canonical: "/" },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://duenest.app";

// Private-beta vs public-launch messaging. Defaults to beta (waitlist-gated) so
// nothing changes until launch; set NEXT_PUBLIC_PRIVATE_BETA_ENABLED=false at
// build time to flip the hero/CTAs to the public "14-day free trial" flow.
// Build-time (not the runtime API) keeps this page fully static + resilient.
const PRIVATE_BETA =
  (process.env.NEXT_PUBLIC_PRIVATE_BETA_ENABLED ?? "true").toLowerCase() !==
  "false";

// CTA shared by the hero and final call-to-action.
const PRIMARY_CTA = PRIVATE_BETA
  ? { href: "/waitlist", label: "Join the beta" }
  : { href: "/register", label: "Start your 14-day free trial" };

// AI marketing is gated on its OWN flag (default off), independent of the
// beta/launch flag, so the AI story can be turned on the moment AI features are
// actually available to users — set NEXT_PUBLIC_AI_ENABLED=true at build time.
const AI_ENABLED =
  (process.env.NEXT_PUBLIC_AI_ENABLED ?? "false").toLowerCase() === "true";

// Shared by the FAQ section and the FAQPage structured data below, so the two
// can never drift apart.
const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Is DueNest free?",
    a: "DueNest is free during its private beta. Paid Pro and Organization plans are previewed on the pricing page, but pricing isn't final yet.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Nothing is shared until you choose to, and files are encrypted at rest. A share or emergency access exposes only the items you pick — never your whole vault.",
  },
  {
    q: "Does DueNest read my documents?",
    a: "Only to help you. DueNest can optionally pull key fields and dates from a file so you type less, and always asks you to confirm before saving. We never sell your data.",
  },
  {
    q: "Can I export or delete my data?",
    a: "Anytime. You can request a full export of your documents, and manage or permanently delete your data from Data & privacy in your settings.",
  },
  {
    q: "How does sharing work?",
    a: "You send access — a QR, a secure link, or a code — not the original file. Require an access code, set an expiry, watermark the preview, and revoke access whenever you want.",
  },
  {
    q: "Why not just use Google Drive?",
    a: "Drive stores files; DueNest makes them ready. It adds deadline and renewal tracking, application packs with checklists, secure shares that expire and can be revoked, and emergency access — built around documents, not just storage.",
  },
  {
    q: "Why not Adobe Scan or a plain scanner app?",
    a: "Scanning is one step. DueNest takes the scan into a Vault, organizes it, tracks its expiry, adds it to application packs, and lets you share it safely — the whole readiness workflow, not just a clean PDF.",
  },
  {
    q: "Are the application pack templates official?",
    a: "No. Templates are generic and fully editable starting points. Requirements vary, so always verify with the official institution or source.",
  },
  {
    q: "Is signing in DueNest legally binding?",
    a: "DueNest helps you prepare a signed copy with a signature image, date, and initials. It is not a legal e-signature service — legal acceptance depends on the recipient and jurisdiction.",
  },
  {
    q: "How do reminders work?",
    a: "DueNest tracks expiry dates and renewal rules, surfaces what needs attention first, and shows it on a calendar and timeline. Rule-based checks — no AI guesswork.",
  },
  {
    q: "What happens after the beta?",
    a: "We'll email you before anything changes. Organizing and tracking your documents is built to stay useful, and we'll be clear about any plan limits ahead of time.",
  },
  // AI FAQ appears only when AI is enabled (its own flag), since the AI
  // features are gated until then. Reconciles with the "no AI guesswork" stance.
  ...(AI_ENABLED
    ? [
        {
          q: "Does DueNest use AI?",
          a: "Optionally, and only to assist you. AI can read your own documents to extract details and answer questions you ask — always as suggestions you confirm, never auto-saved. Your reminders and deadline checks stay rule-based, so nothing important is left to a guess. AI only ever sees your own documents; it is never used to train models or sold.",
        },
      ]
    : []),
];

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "DueNest",
      url: SITE_URL,
      logo: `${SITE_URL}/og.png`,
    },
    {
      "@type": "SoftwareApplication",
      name: "DueNest",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <AttributionCapture />
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <Hero />
        <TrustBar />
        <Pain />
        <HowItWorks />
        <Connected />
        <LifeRadar />
        <Vault />
        <SafeSend />
        <Emergency />
        <DeadlinesRenewals />
        <Capabilities />
        {AI_ENABLED && <AiAssist />}
        <Security />
        <Principles />
        <UseCases />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}

// ---- Hero ------------------------------------------------------------------

function Hero() {
  return (
    <section id="product" className="relative overflow-hidden scroll-mt-20">
      <div
        aria-hidden
        className="bg-grid mask-fade-b pointer-events-none absolute inset-0 -z-10 opacity-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[480px] [background:radial-gradient(45%_60%_at_72%_0%,rgba(37,99,235,0.10),transparent_70%),radial-gradient(38%_50%_at_14%_8%,rgba(20,184,166,0.10),transparent_70%)]"
      />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-[1.04fr_1fr] lg:py-28">
        <div className="content-fade-in flex flex-col items-start text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
            <span className="flex size-1.5 rounded-full bg-brand-teal" />
            Private life-document readiness
          </span>

          <h1 className="mt-7 font-heading text-[2.6rem] leading-[1.04] font-semibold tracking-tight text-balance sm:text-6xl">
            Important documents, ready when life asks.
          </h1>

          <p className="mt-6 max-w-md text-lg leading-relaxed text-pretty text-muted-foreground">
            DueNest helps you scan, organize, prepare, track, generate, and
            safely share important documents — before deadlines, applications,
            renewals, and emergencies.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href={PRIMARY_CTA.href}
              className={cn(
                buttonVariants({ size: "lg" }),
                "cta-sheen h-12 px-7 text-base",
              )}
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

          <p className="mt-7 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-brand-success" />
            <span>Private until shared</span>
            <span className="text-border">·</span>
            <span>Secure sharing</span>
            <span className="text-border">·</span>
            <span>Revoke anytime</span>
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Made for anyone who can&apos;t afford to miss a passport, a visa, or
            a deadline.
          </p>
        </div>

        {/* Product moment: a focused, living teaser with depth. */}
        <div className="content-fade-in relative lg:pl-2">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-primary/12 via-brand-teal/10 to-transparent blur-3xl"
          />
          <div className="relative mx-auto max-w-md">
            <TiltCard>
              <FixFirstCard />
            </TiltCard>
            <span className="absolute -top-3 -right-2 z-10 hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-card sm:inline-flex">
              <span className="pulse-soft flex size-1.5 rounded-full bg-brand-success" />
              Updates as things change
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- Trust bar (verifiable facts, high in the page) ------------------------

function TrustBar() {
  const facts = [
    { icon: Lock, label: "Encrypted at rest" },
    { icon: ShieldCheck, label: "You control every share" },
    { icon: Ban, label: "Export or delete anytime" },
    { icon: Radar, label: "Rule-based — no AI guesswork" },
  ];
  return (
    <section aria-label="How DueNest protects your documents" className="border-y border-border bg-card/50">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:justify-between lg:py-4">
        <ul className="grid w-full grid-cols-2 gap-x-6 gap-y-3 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-x-7 lg:justify-start">
          {facts.map((f) => {
            const Icon = f.icon;
            return (
              <li
                key={f.label}
                className="flex items-center gap-2 text-sm font-medium text-muted-foreground"
              >
                <Icon className="size-4 shrink-0 text-brand-success" />
                {f.label}
              </li>
            );
          })}
        </ul>
        <Link
          href="/security"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          How we keep documents safe
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}

// ---- How it works (3 steps) ------------------------------------------------

function HowItWorks() {
  const steps = [
    {
      icon: ScanLine,
      title: "Add it once",
      body: "Scan or upload a document — DueNest captures the key dates and details for you.",
    },
    {
      icon: Radar,
      title: "DueNest watches",
      body: "Rule-based checks track every expiry, renewal, and deadline quietly in the background.",
    },
    {
      icon: ShieldCheck,
      title: "You stay ready",
      body: "Get a heads-up before anything's due, share securely, and keep emergency access prepared.",
    },
  ];
  return (
    <section id="how-it-works" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="How it works"
            title="Three steps to never being caught off guard."
            description="No setup marathon. Add what matters once, and DueNest keeps it ready for the moment you need it."
          />
        </ScrollReveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <ScrollReveal
                key={step.title}
                delay={i * 90}
                className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-card"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-brand-navy text-brand-teal">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-heading text-2xl font-semibold tabular-nums text-muted-foreground/30">
                    {i + 1}
                  </span>
                </div>
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    {step.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---- How it connects -------------------------------------------------------

function Connected() {
  return (
    <section className="border-y border-border bg-card/50">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <ScrollReveal>
          <SectionHeader
            eyebrow="One connected system"
            title="Not five apps. One place that keeps you ready."
            description="Add a document once. DueNest tracks it, shares it on your terms, and keeps it ready for the moment you need it."
          />
        </ScrollReveal>
        <ScrollReveal delay={80} className="mt-12">
          <SystemFlow />
        </ScrollReveal>
      </div>
    </section>
  );
}

// ---- Pain ------------------------------------------------------------------

function Pain() {
  const before = [
    "Files scattered across WhatsApp, email, Drive, and your gallery",
    "No idea what expires or renews soon",
    "Scrambling to assemble documents for an application",
    "Shared files are impossible to take back",
  ];
  const after = [
    "Important documents in one organized place",
    "Deadlines and renewals visible at a glance",
    "Application packs ready before the deadline",
    "Secure sharing you can revoke anytime",
  ];
  return (
    <section className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="The problem"
            title="Life admin gets messy fast."
            description="Important documents are usually remembered only when something goes wrong. DueNest brings them into one calm place — before a deadline becomes an emergency."
          />
        </ScrollReveal>
        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          <ScrollReveal className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <X className="size-3.5" />
              </span>
              Without DueNest
            </p>
            <ul className="mt-4 space-y-3">
              {before.map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-3 text-sm text-muted-foreground"
                >
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-amber" />
                  {p}
                </li>
              ))}
            </ul>
          </ScrollReveal>
          <ScrollReveal
            delay={100}
            className="rounded-2xl border border-primary/20 bg-primary/5 p-6 shadow-card"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <span className="flex size-6 items-center justify-center rounded-full bg-brand-success/15 text-brand-success">
                <Check className="size-3.5" />
              </span>
              With DueNest
            </p>
            <ul className="mt-4 space-y-3">
              {after.map((p) => (
                <li key={p} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-success" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

// ---- Life Radar (showpiece) ------------------------------------------------

function LifeRadar() {
  const watches = [
    "Documents",
    "Renewals",
    "Deadlines",
    "Shares",
    "Application Packs",
    "Emergency setup",
  ];
  const points = [
    {
      icon: Search,
      title: "Fix first",
      body: "The one thing that needs you today rises to the top — not buried in a list.",
    },
    {
      icon: Radar,
      title: "Always watching",
      body: "Rule-based checks run quietly in the background. No AI guesswork, no noise.",
    },
    {
      icon: ShieldCheck,
      title: "A calm week stays calm",
      body: "“Nothing urgent. DueNest will keep watching.” Peace of mind, by default.",
    },
  ];
  return (
    <section id="life-radar" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="Life Radar"
            title="Know what needs attention before it becomes a problem."
            description="Life Radar watches your documents, renewals, deadlines, shares, application packs, and emergency setup — then tells you what to fix first."
          />
        </ScrollReveal>
        <div className="mt-14 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <ScrollReveal className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand-teal/10 via-primary/10 to-transparent blur-2xl"
            />
            {/* Signature motion: an "always watching" radar sweep behind the
                dashboard, peeking past its edges. */}
            <div
              aria-hidden
              className="radar-sweep pointer-events-none absolute -inset-[14%] -z-10 opacity-70"
            />
            <LifeRadarMockup />
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <ul className="space-y-6">
              {points.map((p) => {
                const Icon = p.icon;
                return (
                  <li key={p.title} className="flex gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-brand-teal">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <h3 className="font-heading text-base font-semibold">
                        {p.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {p.body}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-8">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                What it watches
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {watches.map((w) => (
                  <span
                    key={w}
                    className="rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/80 shadow-xs"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

// ---- Reusable light product section ----------------------------------------

function ProductSection({
  id,
  eyebrow,
  title,
  description,
  bullets,
  visual,
  reverse,
  tone = "default",
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  visual: React.ReactNode;
  reverse?: boolean;
  tone?: "default" | "muted";
}) {
  return (
    <section
      id={id}
      className={cn(
        "scroll-mt-20",
        tone === "muted" && "border-y border-border bg-card/60",
      )}
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
        <ScrollReveal
          className={cn("max-w-lg", reverse && "lg:order-2 lg:justify-self-end")}
        >
          <p className="text-sm font-semibold text-primary">{eyebrow}</p>
          <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">{description}</p>
          <ul className="mt-6 space-y-2.5">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-3 text-sm">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-success" />
                <span className="text-muted-foreground">{b}</span>
              </li>
            ))}
          </ul>
        </ScrollReveal>
        <ScrollReveal delay={120} className={cn(reverse && "lg:order-1")}>
          {visual}
        </ScrollReveal>
      </div>
    </section>
  );
}

function Vault() {
  return (
    <ProductSection
      id="vault"
      tone="muted"
      eyebrow="Vault"
      title="A vault that does more than store files."
      description="Every important document gets a status, a place, and a next action — not just a filename in a folder."
      bullets={[
        "Status at a glance: Safe, Expiring, Expired, Missing info, Shared",
        "Drop a file in File Inbox now, organize it later",
        "Expiry tracking, categories, and secure preview",
        "Trash and recovery, so nothing is lost by accident",
      ]}
      visual={<VaultMockup />}
    />
  );
}

function SafeSend() {
  return (
    <ProductSection
      id="safesend"
      reverse
      eyebrow="Sharing · SafeSend"
      title="Share access, not raw files."
      description="Send a QR, a secure link, or a DueNest code — through WhatsApp, Telegram, or email — without ever handing over the original file."
      bullets={[
        "View-only, access codes, expiry countdown, and watermarking",
        "See a recipient preview before you send",
        "Revoke access anytime — your vault is never exposed",
        "One activity log shows every open and download",
      ]}
      visual={
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand-teal/12 via-primary/10 to-transparent blur-2xl"
          />
          <SafeSendMockup />
        </div>
      }
    />
  );
}

// ---- Emergency (dark spotlight) --------------------------------------------

function Emergency() {
  const bullets = [
    "Guided setup with a readiness score — you always know what's left",
    "Choose how access opens: owner approval, a delayed unlock, or instant with a code",
    "A locked emergency QR and printable wallet card — scanning starts a request, not an instant unlock",
    "Trusted contacts, optional location (off by default), and a full activity log",
    "Revoke, regenerate, or disable access at any time",
  ];
  return (
    <section id="emergency" className="scroll-mt-20 bg-brand-navy text-white">
      <div className="relative mx-auto w-full max-w-6xl overflow-hidden px-4 py-20 sm:px-6 lg:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-0 [background:radial-gradient(40%_60%_at_85%_0%,rgba(20,184,166,0.16),transparent_70%),radial-gradient(40%_50%_at_0%_100%,rgba(37,99,235,0.20),transparent_70%)]"
        />
        <div className="relative grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <ScrollReveal className="max-w-lg">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-brand-mint">
              <LifeBuoy className="size-3.5" />
              Emergency Protocol
            </span>
            <h2 className="mt-5 font-heading text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
              Prepare emergency access before it&apos;s needed.
            </h2>
            <p className="mt-4 text-pretty text-white/70">
              If something happens, trusted people can request access to selected
              documents — without ever seeing your full vault. You choose how
              access opens, keep a printable card ready, and stay in control with
              a full activity log.
            </p>
            <ul className="mt-6 space-y-2.5">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 text-sm text-white/80">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-teal" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </ScrollReveal>
          <ScrollReveal delay={120}>
            <EmergencyMockup />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

function DeadlinesRenewals() {
  return (
    <ProductSection
      id="deadlines-renewals"
      reverse
      eyebrow="Deadlines & Renewals"
      title="Never miss an expiry, renewal, or application deadline."
      description="Track passport and visa expiries, ID and licence renewals, insurance, certificates, and application deadlines — with reminders before they pass."
      bullets={[
        "Expiry, renewal, and deadline reminders in one place",
        "Choose when to be reminded — 7, 30, 60, or 90 days before",
        "Recurring reminders for anything that comes back around",
        "Linked to the document or application pack it belongs to",
      ]}
      visual={<DeadlinesRenewalsMockup />}
    />
  );
}

// ---- Capabilities (breadth grid) -------------------------------------------

function Capabilities() {
  const features: Feature[] = [
    {
      icon: ScanLine,
      title: "Scan with your camera",
      description:
        "Capture a document, auto-detect the edges, and save a clean, shareable PDF straight into your vault.",
    },
    {
      icon: Sparkles,
      title: "Details filled in for you",
      description:
        "DueNest reads key fields and dates from a file, then asks you to confirm before saving — you stay in control.",
    },
    {
      icon: Package,
      title: "Application & renewal packs",
      description:
        "Group the right documents into a pack with a readiness score — ready for visas, scholarships, jobs, and renewals.",
    },
    {
      icon: BellRing,
      title: "Reminders & calendar",
      description:
        "Renewal and deadline reminders on a calendar and timeline, so the next step never sneaks up on you.",
    },
    {
      icon: DoorClosed,
      title: "Secure rooms",
      description:
        "Open a private, access-controlled room to share a set of documents — and close it the moment you're done.",
      badge: "Beta",
    },
    {
      icon: Building2,
      title: "Shared workspaces",
      description:
        "Bring family or a small team into a shared space to keep important documents organized together.",
      badge: "Beta",
    },
  ];
  return (
    <section id="capabilities" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="The full toolkit"
            title="More ways to stay ready — one calm system."
            description="Beyond documents and renewals, DueNest gives you the tools to capture, prepare, and share important paperwork without the last-minute scramble."
          />
        </ScrollReveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <ScrollReveal key={feature.title} delay={(i % 3) * 80}>
              <FeatureCard feature={feature} />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- AI assist (launch-gated) ----------------------------------------------

function AiAssist() {
  return (
    <ProductSection
      id="ai"
      tone="muted"
      reverse
      eyebrow="AI assist"
      title="AI that assists — never decides."
      description="Optional AI reads your own documents to save you typing and answer the questions you ask. It only ever suggests — you confirm before anything is saved, and your reminders stay rule-based, not guessed."
      bullets={[
        "Extract key fields and dates from a scan or upload — you review before saving",
        "Ask your documents: “When does my visa expire?” — answers cite the source file",
        "Owner-scoped and private: AI only sees your own documents, never sold or used to train",
        "Nothing auto-fills or auto-sends — AI proposes, you decide",
      ]}
      visual={<AiAssistVisual />}
    />
  );
}

function AiAssistVisual() {
  const rows = [
    { label: "Document", value: "Passport" },
    { label: "Expiry date", value: "14 Mar 2027" },
    { label: "Number", value: "A1234567" },
  ];
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4 text-primary" />
        AI suggestion · you confirm
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">{row.label}</span>
            <span className="font-medium">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
          <Check className="size-4" /> Confirm &amp; save
        </span>
        <span className="inline-flex items-center rounded-lg border border-border px-3 py-1.5 text-sm">
          Edit
        </span>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Suggestions only — nothing is saved until you confirm.
      </p>
    </div>
  );
}

// ---- Security --------------------------------------------------------------

function Security() {
  const statements = [
    {
      icon: Lock,
      title: "Private by default",
      body: "Nothing is shared until you choose to. Files are encrypted at rest.",
    },
    {
      icon: ShieldCheck,
      title: "Share selected access, not your vault",
      body: "A share exposes only the items you pick. Everything else stays private.",
    },
    {
      icon: Timer,
      title: "Expiring access",
      body: "Shares and emergency access can expire automatically, so access never lingers.",
    },
    {
      icon: Ban,
      title: "Revoke anytime",
      body: "Close access instantly. Revoked and expired links are blocked server-side.",
    },
  ];
  return (
    <section
      id="security"
      className="scroll-mt-20 border-y border-border bg-card/60"
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
        <ScrollReveal className="max-w-lg">
          <p className="text-sm font-semibold text-primary">Trust &amp; security</p>
          <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Built for sensitive life documents.
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            DueNest is designed around controlled access. You choose what to
            share, how long it lasts, and when to revoke it. We&apos;re honest
            about what we can and can&apos;t guarantee.
          </p>
          <ul className="mt-6 space-y-4">
            {statements.map((s) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{s.title}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{s.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link
            href="/security"
            className="mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Read the trust &amp; security page
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </ScrollReveal>

        <ScrollReveal delay={120}>
          <ControlledAccessCard />
        </ScrollReveal>
      </div>
    </section>
  );
}

function ControlledAccessCard() {
  const chips = [
    { icon: Eye, label: "View only" },
    { icon: KeyRound, label: "Code required" },
    { icon: Timer, label: "Expires 24h" },
    { icon: ShieldCheck, label: "Watermarked" },
  ];
  const log = [
    { who: "Recipient opened the share", when: "just now" },
    { who: "Access code verified", when: "1m ago" },
    { who: "You created the share", when: "2m ago" },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-floating sm:p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Folder className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold">Passport</p>
            <p className="text-xs text-muted-foreground">Shared with 1 person</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-success/10 px-2 py-0.5 text-[11px] font-medium text-brand-success">
          <span className="size-1.5 rounded-full bg-brand-success" />
          Active
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const Icon = c.icon;
          return (
            <span
              key={c.label}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground"
            >
              <Icon className="size-3" />
              {c.label}
            </span>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Timer className="size-3.5" />
          Access closes in{" "}
          <LiveCountdown hoursFromNow={24} className="tabular-nums" />
        </span>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
          <Ban className="size-3.5" />
          Revoke
        </span>
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Activity
        </p>
        <ul className="mt-2 space-y-2">
          {log.map((entry, i) => (
            <li key={entry.who} className="flex items-center gap-2.5 text-xs">
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  i === 0 ? "bg-brand-success" : "bg-muted-foreground/40",
                )}
              />
              <span className="flex-1 text-muted-foreground">{entry.who}</span>
              <span className="text-muted-foreground/70">{entry.when}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ---- Principles (how we build) ---------------------------------------------

function Principles() {
  const principles = [
    {
      icon: Lock,
      title: "Security-first, not an afterthought",
      body: "Files are encrypted at rest, and every share, code, and expiry is enforced on the server — not just hidden in the interface. Revoked and expired access is blocked at the source.",
    },
    {
      icon: Eye,
      title: "Privacy is the default",
      body: "Nothing is shared until you choose to, a share exposes only the items you pick, and we never sell your data. Export or permanently delete everything, anytime.",
    },
    {
      icon: Radar,
      title: "Honest by design",
      body: "Reminders are rule-based — real expiry dates and renewal rules, no AI guesswork. When DueNest reads a file, it asks you to confirm before saving. We're clear about what we can and can't guarantee.",
    },
    {
      icon: Sparkles,
      title: "Built to be relied on",
      body: "DueNest is built like software you trust with what matters: considered, fast, accessible, and steadily improved with the people using it. Details get the care your documents deserve.",
    },
  ];
  return (
    <section id="principles" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="How we build"
            title="The standards behind your documents."
            description="DueNest holds sensitive, sometimes irreplaceable paperwork. We build it the way that responsibility demands — and we're transparent about how."
          />
        </ScrollReveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2">
          {principles.map((p, i) => {
            const Icon = p.icon;
            return (
              <ScrollReveal
                key={p.title}
                delay={(i % 2) * 90}
                className="flex h-full gap-4 rounded-2xl border border-border bg-card p-6 shadow-card"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-brand-teal">
                  <Icon className="size-5" />
                </span>
                <div>
                  <h3 className="font-heading text-lg font-semibold">
                    {p.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {p.body}
                  </p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
        <ScrollReveal
          delay={120}
          className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-muted-foreground"
        >
          <p>
            Built by a small, independent team that treats your documents the way
            we&apos;d want ours treated — with care, restraint, and a bias for
            keeping you in control.{" "}
            <span className="font-medium text-foreground">— The DueNest team</span>
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ---- Use cases -------------------------------------------------------------

function UseCases() {
  const cases: { title: string; description: string; href?: string }[] = [
    {
      title: "International students",
      description:
        "Track passport, visa, insurance, and student letters — and share them with schools or sponsors.",
      href: "/use-cases/students",
    },
    {
      title: "Visa applicants",
      description:
        "Prepare visa documents, track passport and visa expiry, and share safely.",
      href: "/use-cases/visa-documents",
    },
    {
      title: "Scholarship applicants",
      description:
        "Prepare document packs and avoid missing application requirements at the last minute.",
      href: "/use-cases/scholarship-applications",
    },
    {
      title: "Job applicants",
      description:
        "Build a job pack with CV and cover-letter drafts, certificates, and deadlines.",
      href: "/use-cases/job-applications",
    },
    {
      title: "Families",
      description:
        "Keep important documents organized and prepare emergency access for the people you trust.",
      href: "/use-cases/families",
    },
    {
      title: "Agencies & schools",
      description:
        "Request, review, and track document submissions from applicants and students.",
      href: "/use-cases/agencies-schools",
    },
  ];
  return (
    <section id="use-cases" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="Use cases"
            title="Built for the people juggling important documents."
          />
        </ScrollReveal>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c, i) => (
            <ScrollReveal
              key={c.title}
              delay={(i % 3) * 60}
              className="surface-hover bg-card p-6"
            >
              {c.href ? (
                <Link href={c.href} className="group flex h-full flex-col gap-2">
                  <h3 className="flex items-center gap-1.5 font-heading text-base font-semibold">
                    {c.title}
                    <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {c.description}
                  </p>
                </Link>
              ) : (
                <div className="flex h-full flex-col gap-2">
                  <h3 className="font-heading text-base font-semibold">{c.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {c.description}
                  </p>
                </div>
              )}
            </ScrollReveal>
          ))}
        </div>
        <ScrollReveal className="mt-8 text-center">
          <Link
            href="/use-cases"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            See all use cases
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ---- FAQ -------------------------------------------------------------------

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-border bg-card/50">
      <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="Questions & answers"
            title="Everything you might be wondering."
            description="Straight answers on privacy, pricing, sharing, and what happens during the beta."
          />
        </ScrollReveal>
        <ScrollReveal
          delay={80}
          className="mt-10 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card"
        >
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-45"
                  aria-hidden
                />
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </p>
            </details>
          ))}
        </ScrollReveal>
        <p className="mx-auto mt-8 max-w-xl text-center text-sm leading-relaxed text-muted-foreground">
          A note on the beta: DueNest is still being shaped with early users. You
          can export or delete your data anytime, and we&apos;ll always be clear
          about what changes before it does.{" "}
          <span className="font-medium text-foreground">— The DueNest team</span>
        </p>
      </div>
    </section>
  );
}

// ---- Final CTA -------------------------------------------------------------

function FinalCta() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:py-24">
      <ScrollReveal className="relative mx-auto block w-full max-w-6xl overflow-hidden rounded-3xl bg-brand-navy px-6 py-16 text-center text-white shadow-floating sm:px-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(50%_60%_at_50%_0%,rgba(20,184,166,0.28),transparent_60%),radial-gradient(45%_55%_at_100%_100%,rgba(37,99,235,0.38),transparent_60%)]"
        />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
            Start getting ready before things are due.
          </h2>
          <p className="text-pretty text-white/70">
            Organize your first document, track your next renewal, and share
            securely when life asks for proof.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={PRIMARY_CTA.href}
              className={cn(
                buttonVariants({ size: "lg" }),
                "cta-sheen h-12 bg-white px-7 text-base text-brand-navy shadow-sm hover:bg-white/90",
              )}
            >
              {PRIMARY_CTA.label}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link
              href="/#how-it-works"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 border-white/25 bg-transparent px-7 text-base text-white hover:bg-white/10 hover:text-white",
              )}
            >
              See how it works
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-white/75">
            {(PRIVATE_BETA
              ? [
                  "Free during the private beta",
                  "No credit card",
                  "Private by default — export anytime",
                ]
              : [
                  "14-day free trial",
                  "No credit card required",
                  "Private by default — export anytime",
                ]
            ).map((item) => (
              <span key={item} className="inline-flex items-center gap-1.5">
                <Check className="size-4 text-brand-teal" />
                {item}
              </span>
            ))}
          </div>
          {PRIVATE_BETA && (
            <p className="text-xs text-white/50">
              Private beta · rolls out gradually to selected users.
            </p>
          )}
        </div>
      </ScrollReveal>
    </section>
  );
}
