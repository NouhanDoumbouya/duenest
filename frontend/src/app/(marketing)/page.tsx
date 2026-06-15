import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  Check,
  CreditCard,
  FileText,
  LifeBuoy,
  Link2,
  Lock,
  Radar,
  Search,
  ShieldCheck,
  Timer,
  X,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SectionHeader } from "@/components/marketing/section";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import {
  EmergencyMockup,
  LifeRadarMockup,
  MoneyRadarMockup,
  SafeSendMockup,
  VaultMockup,
} from "@/components/marketing/mockups";
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
      <SiteHeader />

      <main className="flex-1">
        <Hero />
        <TrustStrip />
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
        className="bg-grid mask-fade-b pointer-events-none absolute inset-0 -z-10 opacity-60"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-32 -z-10 h-[420px] [background:radial-gradient(50%_60%_at_70%_0%,rgba(37,99,235,0.10),transparent_70%),radial-gradient(40%_50%_at_15%_10%,rgba(20,184,166,0.10),transparent_70%)]"
      />
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div className="content-fade-in flex flex-col items-start text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur">
            <span className="flex size-1.5 rounded-full bg-brand-teal" />
            The Life Admin OS for documents &amp; deadlines
          </span>

          <h1 className="mt-6 font-heading text-4xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl md:text-[3.4rem]">
            Stay ready{" "}
            <span className="bg-gradient-to-r from-primary to-brand-teal bg-clip-text text-transparent">
              before it&apos;s due
            </span>
            .
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted-foreground">
            DueNest helps you organize important documents, track renewals, share
            securely, and prepare emergency access — before life asks for them.
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

          <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-brand-success" />
            <span>Private by default</span>
            <span className="text-border">·</span>
            <span>Secure sharing</span>
            <span className="text-border">·</span>
            <span>Revoke anytime</span>
          </p>

          <p className="mt-4 text-sm text-muted-foreground">
            Built for students, travelers, families, and busy professionals.
          </p>
        </div>

        <div className="content-fade-in lg:pl-4">
          <LifeRadarMockup />
        </div>
      </div>
    </section>
  );
}

// ---- Trust strip -----------------------------------------------------------

function TrustStrip() {
  const flow = [
    "Vault",
    "Life Radar",
    "SafeSend",
    "Emergency Access",
    "Money Radar",
  ];
  return (
    <section className="border-y border-border bg-card/60">
      <ScrollReveal className="mx-auto flex w-full max-w-6xl flex-col items-center gap-5 px-4 py-8 sm:px-6">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          One connected system for personal readiness
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-sm">
          {flow.map((item, i) => (
            <span key={item} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="size-3.5 text-muted-foreground/50" />}
              <span className="rounded-full border border-border bg-card px-3 py-1 font-medium text-foreground/80 shadow-xs">
                {item}
              </span>
            </span>
          ))}
        </div>
      </ScrollReveal>
    </section>
  );
}

// ---- Pain ------------------------------------------------------------------

function Pain() {
  const before = [
    "Files scattered across WhatsApp, email, Drive, and your phone gallery",
    "No idea what expires or renews soon",
    "Subscriptions charge you by surprise",
    "Shared files are hard to take back",
    "Trusted people can't help in an emergency",
  ];
  const after = [
    "Important documents organized in one place",
    "Deadlines and renewals visible at a glance",
    "Renewals tracked before money leaves your account",
    "Secure sharing you can revoke anytime",
    "Emergency access prepared before it's needed",
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

// ---- Reusable product section ----------------------------------------------

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
      <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:py-24">
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

// ---- Life Radar ------------------------------------------------------------

function LifeRadar() {
  const signals = [
    { icon: Search, label: "Fix first", meta: "What needs you today" },
    { icon: Timer, label: "Next deadline", meta: "Student visa · 23 days" },
    { icon: CreditCard, label: "Next charge", meta: "Spotify · tomorrow" },
    { icon: Link2, label: "Active share", meta: "Passport · expires 18h" },
    { icon: LifeBuoy, label: "Emergency", meta: "1 step left" },
    { icon: Radar, label: "What am I forgetting?", meta: "DueNest keeps watching" },
  ];
  return (
    <section id="life-radar" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="Life Radar"
            title="Know what needs attention before it becomes a problem."
            description="Life Radar checks your documents, renewals, subscriptions, shares, bundles, and emergency setup, then tells you what to fix first — rule-based, calm, and always on."
          />
        </ScrollReveal>
        <div className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {signals.map((s, i) => {
            const Icon = s.icon;
            return (
              <ScrollReveal
                as="div"
                key={s.label}
                delay={(i % 3) * 70}
                className="surface-hover flex items-start gap-3 rounded-2xl border border-border bg-card p-5 shadow-card"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-brand-teal">
                  <Icon className="size-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">{s.label}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{s.meta}</p>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
        <p className="mx-auto mt-8 max-w-xl text-center text-sm text-muted-foreground">
          A calm week looks calm: “Nothing urgent. DueNest will keep watching.”
        </p>
      </div>
    </section>
  );
}

// ---- Product sections ------------------------------------------------------

function Vault() {
  return (
    <ProductSection
      id="vault"
      tone="muted"
      eyebrow="Vault"
      title="A vault that does more than store files."
      description="Every important document has a status, a place, and a next action — not just a filename in a folder."
      bullets={[
        "Status at a glance: Safe, Expiring, Expired, Missing info, Shared",
        "Drop a file into File Inbox now, organize it later",
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
      title="Share safely. Stay in control."
      description="Send secure access through a QR, a link, or a DueNest code — without losing control of your documents. You share access, not raw files."
      bullets={[
        "QR, secure link, or DueNest code — send via WhatsApp, Telegram, or email",
        "View-only, access codes, expiry countdown, and watermarking",
        "See a recipient preview, and revoke access anytime",
        "Your wider vault is never exposed",
      ]}
      visual={
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-tr from-brand-teal/10 via-primary/10 to-transparent blur-2xl"
          />
          <SafeSendMockup />
        </div>
      }
    />
  );
}

function Emergency() {
  return (
    <ProductSection
      id="emergency"
      tone="muted"
      eyebrow="Emergency Access"
      title="Prepare emergency access before it's needed."
      description="Let trusted people reach selected documents if you need help — without exposing your full vault. Calm, prepared, and entirely in your control."
      bullets={[
        "Only the documents you select are ever shown",
        "Add a trusted contact and an emergency note",
        "The emergency QR can be locked by default",
        "Revoke or regenerate access anytime, with an access log",
      ]}
      visual={<EmergencyMockup />}
    />
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
        "See your next charge, monthly spend, and yearly estimate",
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
  const pillars = [
    {
      icon: Lock,
      title: "Private by default",
      description:
        "Nothing is shared until you choose to. Your vault is scoped to your account, and uploaded files are encrypted at rest.",
    },
    {
      icon: ShieldCheck,
      title: "Share selected access, not your vault",
      description:
        "A share exposes only the items you pick. Everything else stays private — no full-vault exposure.",
    },
    {
      icon: Timer,
      title: "Expiring access",
      description:
        "Shares and emergency access can expire automatically, so access never lingers longer than you intend.",
    },
    {
      icon: Ban,
      title: "Revoke anytime",
      description:
        "Change your mind and close access instantly. Revoked and expired links are blocked server-side.",
    },
    {
      icon: FileText,
      title: "Activity visibility",
      description:
        "An activity log shows opens, accepts, previews, and downloads — so you always know what happened.",
    },
    {
      icon: Search,
      title: "Honest about limits",
      description:
        "Watermarking discourages misuse, but no web app can fully block screenshots. We tell you what's true.",
    },
  ];
  return (
    <section id="security" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="Trust & security"
            title="Built for sensitive life documents."
            description="DueNest is designed around controlled access. You choose what to share, how long access lasts, and when to revoke it."
          />
        </ScrollReveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p, i) => {
            const Icon = p.icon;
            return (
              <ScrollReveal
                key={p.title}
                delay={(i % 3) * 70}
                className="rounded-2xl border border-border bg-card p-5 shadow-card"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {p.description}
                </p>
              </ScrollReveal>
            );
          })}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/security"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Read the trust &amp; security page
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---- Use cases -------------------------------------------------------------

function UseCases() {
  const cases = [
    {
      title: "International students",
      description:
        "Track passport, visa, insurance, and student letters — and share selected documents with schools or sponsors.",
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
    <section id="use-cases" className="scroll-mt-20 border-y border-border bg-card/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="Use cases"
            title="Built for the people juggling important documents."
          />
        </ScrollReveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cases.map((c, i) => (
            <ScrollReveal
              key={c.title}
              delay={(i % 3) * 70}
              className="surface-hover flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-6 shadow-card"
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
          <h2 className="font-heading text-3xl font-semibold text-balance text-white sm:text-4xl">
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
