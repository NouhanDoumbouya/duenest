import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  BellRing,
  Check,
  CreditCard,
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
  Timer,
  X,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AttributionCapture } from "@/components/marketing/attribution-capture";
import { Eyebrow, SectionHeader } from "@/components/marketing/section";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { PersonaSplit } from "@/components/marketing/persona-split";
import { LifeRadarMockup } from "@/components/marketing/mockups";
import { HeroReadinessComposite } from "@/components/marketing/hero-composite";
import {
  Differentiation,
  Integrations,
  Organizations,
  ProductProof,
  ReadinessLoop,
} from "@/components/marketing/landing-sections";
import { LiveCountdown } from "@/components/marketing/live-countdown";
import { buttonVariants } from "@/components/ui/button";
import { PRIMARY_CTA, PRIVATE_BETA } from "@/lib/cta";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: {
    absolute: "CertaNest — Life Documents, Deadlines & Proof, Ready When Life Asks",
  },
  description:
    "Organize important documents, track renewals and deadlines, prepare application packs, request documents from others, and share proof securely — all from one calm readiness workspace. Private by default. Free during the private beta.",
  alternates: { canonical: "/" },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://certanest.com";

// PRIMARY_CTA + PRIVATE_BETA come from @/lib/cta so the navbar, footer, and page
// never drift: "Start organizing" routes to the waitlist during the private
// beta and to registration at launch (NEXT_PUBLIC_PRIVATE_BETA_ENABLED=false).

// AI marketing is gated on its OWN flag (default off), independent of the
// beta/launch flag, so the AI FAQ only appears once AI features are live.
const AI_ENABLED =
  (process.env.NEXT_PUBLIC_AI_ENABLED ?? "false").toLowerCase() === "true";

// Shared by the FAQ section and the FAQPage structured data below, so the two
// can never drift apart.
const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Is CertaNest free?",
    a: "Yes, free during the private beta. Paid plans are previewed on the pricing page, but pricing isn't final — we'll be clear before anything changes.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Nothing is shared until you choose to, and files are encrypted at rest. A share or emergency access exposes only the items you pick — never your whole vault.",
  },
  {
    q: "Does CertaNest read my documents?",
    a: "Only to help you. CertaNest can optionally pull key fields and dates from a file so you type less, and always asks you to confirm before saving. We never sell your data.",
  },
  {
    q: "Can I export or delete my data?",
    a: "Anytime. Request a full export of your documents, or permanently delete everything from Data & privacy in your settings.",
  },
  {
    q: "How does secure sharing work?",
    a: "You send access — a QR, a secure link, or a code — not the original file. Require a code, set an expiry, watermark the preview, and revoke access whenever you want.",
  },
  {
    q: "Why not just use Google Drive?",
    a: "Drive stores files; CertaNest makes them ready. It adds deadline and renewal tracking, application packs with checklists, shares that expire and can be revoked, and emergency access — built around documents, not just storage.",
  },
  {
    q: "Why not use only a scanner app?",
    a: "Scanning is one step. CertaNest takes the scan into a vault, tracks its expiry, adds it to application packs, and lets you share it safely — the whole readiness workflow, not just a clean PDF.",
  },
  {
    q: "Why not just use calendar reminders?",
    a: "A calendar only knows what you remember to add by hand. CertaNest derives deadlines from your actual documents and packs, surfaces the next action first, and links each reminder to the file it's about.",
  },
  {
    q: "Is CertaNest for individuals or organizations?",
    a: "Both. Individuals organize and share their own documents; organizations collect documents from many people through request links and review them from one place. The same readiness system works from both sides.",
  },
  {
    q: "How do Google imports work?",
    a: "Sign in with Google, then import the specific files (Drive), deadlines (Calendar), or attachments (Gmail) you choose. Imports are review-before-save and import-only — nothing syncs automatically and CertaNest never writes back to your Google account.",
  },
  {
    q: "Are Gmail imports public or automatic?",
    a: "No. Gmail attachment import is limited to selected beta users while Google verification is completed, and it never scans your inbox or syncs automatically — you pick the message and the attachment, and confirm before anything is saved.",
  },
  {
    q: "Are application pack templates official?",
    a: "No. Templates are generic, fully editable starting points. Requirements vary, so always verify with the official institution or source.",
  },
  {
    q: "How do reminders work?",
    a: "CertaNest tracks expiry dates and renewal rules and surfaces what needs attention first, on a calendar and timeline. Rule-based checks — no AI guesswork.",
  },
  {
    q: "What happens after the beta?",
    a: "We'll email you before anything changes. Organizing and tracking your documents is built to stay useful, and we'll be clear about any plan limits ahead of time.",
  },
  ...(AI_ENABLED
    ? [
        {
          q: "Does CertaNest use AI?",
          a: "Optionally, and only to assist you. AI can read your own documents to extract details and answer questions you ask — always as suggestions you confirm, never auto-saved. Reminders and deadline checks stay rule-based. AI only ever sees your own documents; it is never sold or used to train models.",
        },
      ]
    : []),
];

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "CertaNest",
      url: SITE_URL,
      logo: `${SITE_URL}/icons/icon-512.png`,
    },
    {
      "@type": "SoftwareApplication",
      name: "CertaNest",
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
        <Problem />
        <Differentiation />
        <ReadinessLoop />
        <LifeRadar />
        <CoreSystem />
        <Organizations />
        <Integrations />
        <Security />
        <ProductProof />
        <UseCases />
        <Beta />
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
      {/* Calm, restrained brand glow — Certa Teal + Secure Emerald, no neon. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[560px] [background:radial-gradient(48%_62%_at_72%_-4%,rgba(15,118,110,0.16),transparent_70%),radial-gradient(40%_52%_at_12%_6%,rgba(16,185,129,0.12),transparent_70%),radial-gradient(30%_40%_at_50%_30%,rgba(215,237,233,0.22),transparent_75%)]"
      />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 py-20 sm:px-6 lg:grid-cols-[1.04fr_1fr] lg:py-28">
        <div className="content-fade-in flex flex-col items-start text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
            <span className="flex size-1.5 rounded-full bg-brand-teal" />
            Life-admin, securely organized
          </span>

          <h1 className="mt-6 font-heading text-[2.7rem] leading-[1.02] font-semibold tracking-tight text-balance sm:text-6xl lg:text-[4rem]">
            Your important documents, ready before life asks.
          </h1>

          <p className="mt-5 max-w-md text-lg leading-relaxed text-pretty text-muted-foreground">
            CertaNest turns scattered files, deadlines, applications, document
            requests, and secure sharing into one calm readiness workspace.
          </p>

          {/* The whole product in four verbs — the 10-second understanding test. */}
          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2">
            {[
              { icon: ScanLine, label: "Add" },
              { icon: Folder, label: "Organize" },
              { icon: Radar, label: "Watch" },
              { icon: ShieldCheck, label: "Share" },
            ].map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80"
              >
                <Icon className="size-4 text-brand-teal" aria-hidden />
                {label}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
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

          <ul className="mt-6 flex flex-wrap gap-2">
            {[
              "Private until shared",
              "Import-only integrations",
              "Export anytime",
              "Built for sensitive proof",
            ].map((t) => (
              <li
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/80 px-2.5 py-1 text-xs font-medium text-foreground/80 shadow-xs backdrop-blur"
              >
                <Check className="size-3 text-brand-success" aria-hidden />
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Private beta · No credit card required
          </p>
        </div>

        {/* Product story: scattered files → ready documents, in one composed
            moment (readiness card + live SafeSend + AI-suggestion accents). */}
        <div className="content-fade-in relative lg:pl-2">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-primary/12 via-brand-teal/10 to-transparent blur-3xl"
          />
          <HeroReadinessComposite />
        </div>
      </div>
    </section>
  );
}

// ---- Trust strip (verifiable facts, high in the page) ----------------------

function TrustBar() {
  const facts = [
    { icon: Lock, label: "Encrypted at rest" },
    { icon: ShieldCheck, label: "You control every share" },
    { icon: Ban, label: "Export or delete anytime" },
    { icon: Radar, label: "Rule-based — no AI guesswork" },
  ];
  return (
    <section
      aria-label="How CertaNest protects your documents"
      className="border-y border-border bg-card/50"
    >
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

// ---- Problem (before / after) ----------------------------------------------

function Problem() {
  const before = [
    "Passports, visas, certificates, and insurance spread across Drive, email, WhatsApp, and your gallery",
    "Expiry and renewal dates that are easy to forget",
    "Applications that turn into a last-minute document hunt",
    "Shared files you can't take back",
  ];
  const after = [
    "Every important document in one organized place",
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
            title="Life admin gets messy exactly when you need it most."
            description="Important proof is usually remembered only when something goes wrong. CertaNest gives every item a place, a status, and a next action — before a deadline becomes an emergency."
          />
        </ScrollReveal>
        <div className="mx-auto mt-12 grid max-w-4xl gap-5 md:grid-cols-2">
          <ScrollReveal className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <p className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <span className="flex size-6 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <X className="size-3.5" />
              </span>
              Scattered &amp; reactive
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
              Organized &amp; ready
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

// ---- Life Radar (signature section) ----------------------------------------

function LifeRadar() {
  const watches = [
    "Documents",
    "Deadlines",
    "Renewals",
    "Subscriptions",
    "Application Packs",
    "Secure shares",
    "Emergency setup",
  ];
  const points = [
    {
      icon: Search,
      title: "Fix first",
      body: "The one thing that needs you today rises to the top — never buried in a folder or a list.",
    },
    {
      icon: Radar,
      title: "Always watching",
      body: "Rule-based checks run quietly across documents, renewals, deadlines, shares, packs, and emergency setup. No AI guesswork, no noise.",
    },
    {
      icon: ShieldCheck,
      title: "A calm week stays calm",
      body: "“Nothing urgent. CertaNest will keep watching.” This is not storage — it's readiness.",
    },
  ];
  return (
    <section id="life-radar" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="Life Radar"
            title="See what needs attention before it becomes urgent."
            description="Instead of burying you in folders, Life Radar surfaces the next thing to fix across everything important — then tells you when there's nothing to worry about."
          />
        </ScrollReveal>
        <div className="mt-14 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <ScrollReveal className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand-teal/10 via-primary/10 to-transparent blur-2xl"
            />
            {/* Signature motion: an "always watching" radar sweep behind the
                dashboard, peeking past its edges (paused under reduced motion). */}
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
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-brand-teal-bright">
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

// ---- Core product system (6 connected pillars) -----------------------------

type SystemPillar = {
  id: string;
  icon: typeof Folder;
  title: string;
  description: string;
  bullets: string[];
  badge?: string;
};

function SystemCard({ pillar }: { pillar: SystemPillar }) {
  const Icon = pillar.icon;
  return (
    <div
      id={pillar.id}
      className="surface-hover flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-card scroll-mt-24"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-brand-teal-bright">
          <Icon className="size-5" />
        </span>
        {pillar.badge && (
          <span className="inline-flex items-center rounded-full border border-brand-amber/40 bg-brand-amber/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-amber">
            {pillar.badge}
          </span>
        )}
      </div>
      <h3 className="font-heading text-lg font-semibold">{pillar.title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {pillar.description}
      </p>
      <ul className="mt-auto space-y-2 pt-1">
        {pillar.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-brand-success" />
            <span className="text-muted-foreground">{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CoreSystem() {
  const pillars: SystemPillar[] = [
    {
      id: "vault",
      icon: Folder,
      title: "Vault",
      description:
        "Every document gets a place, a status, and a next action — not just a filename in a folder.",
      bullets: [
        "Status at a glance: Safe, Expiring, Expired, Shared",
        "Drop into File Inbox now, organize later",
        "Trash and recovery, so nothing is lost by accident",
      ],
    },
    {
      id: "deadlines-renewals",
      icon: BellRing,
      title: "Deadlines & Renewals",
      description:
        "Track passport and visa expiries, ID renewals, insurance, and application deadlines before they pass.",
      bullets: [
        "Reminders 7, 30, 60, or 90 days before",
        "Recurring reminders for anything that returns",
        "Linked to the document or pack it belongs to",
      ],
    },
    {
      id: "subscriptions",
      icon: CreditCard,
      title: "Subscriptions",
      description:
        "Keep recurring subscriptions and memberships visible before they quietly renew.",
      bullets: [
        "Renewal dates and payment reminders",
        "Notes for what to review or cancel",
        "Surfaced by Life Radar alongside your documents",
      ],
      badge: "Beta",
    },
    {
      id: "packs",
      icon: Package,
      title: "Application Packs",
      description:
        "Prepare reusable packs for visas, scholarships, jobs, school submissions, and renewals.",
      bullets: [
        "Required vs optional checklist",
        "A readiness score and what's still missing",
        "Export or share safely when complete",
      ],
    },
    {
      id: "safesend",
      icon: ShieldCheck,
      title: "SafeSend",
      description:
        "Share selected documents without exposing your full vault — send a link, QR, or code, never the file.",
      bullets: [
        "View-only access, codes, expiry, and watermarking",
        "See the recipient preview before you send",
        "Revoke anytime, with a full activity log",
      ],
    },
    {
      id: "emergency",
      icon: LifeBuoy,
      title: "Emergency Access",
      description:
        "Prepare selected documents for trusted people before they're ever needed — and stay in control.",
      bullets: [
        "Trusted contacts, selected documents only",
        "Owner approval, a delayed unlock, or instant with a code",
        "Revoke or disable anytime, with an activity log",
      ],
      badge: "Beta",
    },
  ];
  return (
    <section id="capabilities" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="One connected system"
            title="Everything important stays connected."
            description="Not five apps — one place where a document you add once stays organized, tracked, shareable, and ready. Beta features are labelled honestly."
          />
        </ScrollReveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p, i) => (
            <ScrollReveal key={p.id} delay={(i % 3) * 80}>
              <SystemCard pillar={p} />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Trust & security ------------------------------------------------------

function Security() {
  const statements = [
    {
      icon: Lock,
      title: "Private by default",
      body: "Nothing is shared until you choose to. Files are encrypted at rest.",
    },
    {
      icon: ShieldCheck,
      title: "Selected access, not your whole vault",
      body: "A share or emergency unlock exposes only the items you pick. Everything else stays private.",
    },
    {
      icon: Timer,
      title: "Expiring access",
      body: "Shares and emergency access can expire automatically, so access never lingers.",
    },
    {
      icon: Ban,
      title: "Revoke anytime",
      body: "Close access instantly. Revoked and expired links are blocked server-side, not just hidden.",
    },
  ];
  return (
    <section
      id="security"
      className="scroll-mt-20 border-y border-border bg-card/60"
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
        <ScrollReveal className="max-w-lg">
          <Eyebrow>Trust &amp; security</Eyebrow>
          <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Built for sensitive proof.
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            CertaNest handles personal documents, so it&apos;s designed around
            controlled access. You choose what to share, how long it lasts, and
            when to revoke it — and we&apos;re honest about what we can and
            can&apos;t guarantee. No sensitive document contents are ever sent in
            email.
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
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {s.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <Link
            href="/security"
            className="mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Read trust &amp; security
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

// ---- Use cases -------------------------------------------------------------

function UseCases() {
  const cases: { title: string; description: string; href?: string }[] = [
    {
      title: "International students",
      description:
        "Track passports, visas, student letters, insurance, and sponsorship documents — and share them with schools or sponsors.",
      href: "/use-cases/students",
    },
    {
      title: "Visa applicants",
      description:
        "Prepare a complete visa pack, track passport and visa expiry, and share selected documents safely.",
      href: "/use-cases/visa-documents",
    },
    {
      title: "Scholarship applicants",
      description:
        "Keep transcripts, certificates, letters, and essays ready before submission week.",
      href: "/use-cases/scholarship-applications",
    },
    {
      title: "Job applicants",
      description:
        "Build a reusable job pack with CVs, certificates, portfolios, references, and deadlines.",
      href: "/use-cases/job-applications",
    },
    {
      title: "Families",
      description:
        "Keep IDs, certificates, insurance, and property papers ready — with emergency access for the people you trust.",
      href: "/use-cases/families",
    },
    {
      title: "Agencies & schools",
      description:
        "Request documents, review submissions, and see what's still missing — without chasing email attachments.",
      href: "/use-cases/agencies-schools",
    },
  ];
  return (
    <section id="use-cases" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="Use cases"
            title="Built for people who can't afford to lose track of proof."
            description="Whether you're keeping your own documents ready or collecting them from others, CertaNest works from both sides."
          />
        </ScrollReveal>
        <ScrollReveal delay={80} className="mt-12">
          <PersonaSplit />
        </ScrollReveal>
        <div className="mt-5 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
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
                    <ArrowRight
                      className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden
                    />
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {c.description}
                  </p>
                </Link>
              ) : (
                <div className="flex h-full flex-col gap-2">
                  <h3 className="font-heading text-base font-semibold">
                    {c.title}
                  </h3>
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

// ---- Private beta ----------------------------------------------------------

function Beta() {
  const points = [
    "Free during the private beta",
    "No credit card",
    "Gradual rollout",
    "Export anytime",
  ];
  return (
    <section id="pricing-preview" className="scroll-mt-20 border-y border-border bg-card/50">
      <div className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6 lg:py-24">
        <ScrollReveal>
          <Eyebrow className="justify-center">Private beta</Eyebrow>
          <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Start organizing before the next deadline.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground">
            CertaNest is currently in private beta. Early users can organize
            documents, track renewals and subscriptions, prepare application
            packs, and test secure sharing while the product is shaped with real
            feedback.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 px-7 text-base",
              )}
            >
              See pricing preview
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {points.map((p) => (
              <span key={p} className="inline-flex items-center gap-1.5">
                <Check className="size-4 text-brand-success" />
                {p}
              </span>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ---- FAQ -------------------------------------------------------------------

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="Questions & answers"
            title="Everything you might be wondering."
            description="Straight answers on privacy, sharing, and what happens during the beta."
          />
        </ScrollReveal>
        <ScrollReveal
          delay={80}
          className="mt-10 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-card"
        >
          {FAQ_ITEMS.map((item) => (
            <details key={item.q} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-medium transition-colors hover:bg-muted/40 group-open:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
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
          A note on the beta: CertaNest is still being shaped with early users.
          You can export or delete your data anytime, and we&apos;ll always be
          clear about what changes before it does.{" "}
          <span className="font-medium text-foreground">— The CertaNest team</span>
        </p>
      </div>
    </section>
  );
}

// ---- Final CTA -------------------------------------------------------------

function FinalCta() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:py-24">
      <ScrollReveal className="relative mx-auto block w-full max-w-6xl overflow-hidden rounded-3xl bg-brand-navy px-6 py-16 text-center text-white shadow-floating ring-1 ring-white/10 sm:px-12">
        {/* Restrained brand glow — Certa Teal tint + Secure Emerald. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 [background:radial-gradient(50%_60%_at_50%_0%,rgba(94,234,212,0.18),transparent_60%),radial-gradient(45%_55%_at_100%_100%,rgba(16,185,129,0.22),transparent_60%)]"
        />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-6">
          <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl">
            Be ready before life asks.
          </h2>
          <p className="text-pretty text-white/70">
            Organize your first document, track your next renewal, and prepare
            secure sharing before the deadline arrives.
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
          <p className="text-sm font-medium text-white/80">
            Private until you share it.
          </p>
          {PRIVATE_BETA && (
            <p className="text-xs text-white/50">
              Free during the private beta · rolls out gradually to selected
              users.
            </p>
          )}
        </div>
      </ScrollReveal>
    </section>
  );
}
