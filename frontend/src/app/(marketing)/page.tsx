import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  Check,
  Eye,
  Folder,
  KeyRound,
  LifeBuoy,
  Lock,
  Radar,
  Search,
  ShieldCheck,
  Timer,
  X,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AttributionCapture } from "@/components/marketing/attribution-capture";
import { SectionHeader } from "@/components/marketing/section";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { SystemFlow } from "@/components/marketing/system-flow";
import {
  EmergencyMockup,
  FixFirstCard,
  LifeRadarMockup,
  MoneyRadarMockup,
  SafeSendMockup,
  VaultMockup,
} from "@/components/marketing/mockups";
import { LiveCountdown } from "@/components/marketing/live-countdown";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "DueNest — Stay ready before it's due",
  description:
    "DueNest is the calm place to organize important documents, track renewals, share securely, and prepare emergency access — before life asks for them. Private by default. Join the beta.",
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  return (
    <>
      <AttributionCapture />
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <Connected />
        <Pain />
        <LifeRadar />
        <Vault />
        <SafeSend />
        <Emergency />
        <MoneyRadar />
        <Security />
        <UseCases />
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
            The Life Admin OS
          </span>

          <h1 className="mt-7 font-heading text-[2.6rem] leading-[1.04] font-semibold tracking-tight text-balance sm:text-6xl">
            Stay ready before it&apos;s due.
          </h1>

          <p className="mt-6 max-w-md text-lg leading-relaxed text-pretty text-muted-foreground">
            Organize important documents, track renewals, share securely, and
            prepare emergency access — before life asks for them.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/waitlist"
              className={cn(buttonVariants({ size: "lg" }), "h-12 px-7 text-base")}
            >
              Start free
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/#life-radar"
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
            <span>Private by default</span>
            <span className="text-border">·</span>
            <span>Secure sharing</span>
            <span className="text-border">·</span>
            <span>Revoke anytime</span>
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            Built for students, travelers, families, and busy professionals.
          </p>
        </div>

        {/* Product moment: a focused, living teaser with depth. */}
        <div className="content-fade-in relative lg:pl-2">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-8 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-primary/12 via-brand-teal/10 to-transparent blur-3xl"
          />
          <div className="relative mx-auto max-w-md">
            <FixFirstCard />
            <span className="absolute -top-3 -right-2 hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-card sm:inline-flex">
              <span className="pulse-soft flex size-1.5 rounded-full bg-brand-success" />
              Updates as things change
            </span>
          </div>
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
    "Subscriptions charge you by surprise",
    "Shared files are impossible to take back",
  ];
  const after = [
    "Important documents in one organized place",
    "Deadlines and renewals visible at a glance",
    "Renewals caught before money leaves your account",
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
    "Subscriptions",
    "Shares",
    "Bundles",
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
            description="Life Radar watches your documents, renewals, subscriptions, shares, bundles, and emergency setup — then tells you what to fix first."
          />
        </ScrollReveal>
        <div className="mt-14 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <ScrollReveal className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand-teal/10 via-primary/10 to-transparent blur-2xl"
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
      eyebrow="Quick Share · SafeSend"
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

function MoneyRadar() {
  return (
    <ProductSection
      id="money-radar"
      reverse
      eyebrow="Money Radar"
      title="Catch silent renewals before they charge you."
      description="Track subscriptions, trials, cancellation deadlines, and upcoming charges before the money leaves your account."
      bullets={[
        "Next charge, monthly spend, and yearly estimate",
        "Trial-ending and cancellation-deadline reminders",
        "“Still using this?” prompts to review what you pay for",
        "DueNest tracks renewals — it never processes payments",
      ]}
      visual={<MoneyRadarMockup />}
    />
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
            <ArrowRight className="size-4" />
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
  const cases = [
    {
      title: "International students",
      description:
        "Track passport, visa, insurance, and student letters — and share them with schools or sponsors.",
    },
    {
      title: "Travelers",
      description:
        "Carry a secure backup of travel documents and keep emergency access ready, wherever you are.",
    },
    {
      title: "Scholarship applicants",
      description:
        "Prepare document bundles and avoid missing application requirements at the last minute.",
    },
    {
      title: "Families",
      description:
        "Keep important documents organized and prepare emergency access for the people you trust.",
    },
    {
      title: "Young professionals",
      description:
        "Track contracts, certificates, subscriptions, and the deadlines that matter for your career.",
    },
    {
      title: "Freelancers",
      description:
        "Organize contracts, invoices, and renewals, and share only the files a client needs.",
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
              className="surface-hover flex h-full flex-col gap-2 bg-card p-6"
            >
              <h3 className="font-heading text-base font-semibold">{c.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {c.description}
              </p>
            </ScrollReveal>
          ))}
        </div>
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
              href="/waitlist"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 bg-white px-7 text-base text-brand-navy shadow-sm hover:bg-white/90",
              )}
            >
              Start free
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/#life-radar"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 border-white/25 bg-transparent px-7 text-base text-white hover:bg-white/10 hover:text-white",
              )}
            >
              See how it works
            </Link>
          </div>
          <p className="text-xs text-white/50">
            Private beta · rolls out gradually to selected users.
          </p>
        </div>
      </ScrollReveal>
    </section>
  );
}
