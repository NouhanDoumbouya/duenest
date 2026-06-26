// Premium Landing V2 sections — the product-led story the original page was
// missing: the full readiness loop, the "not storage, readiness" lifecycle, the
// B2B document-collection workflow, import-only Google integrations, and a
// "what you can do today" proof bento.
//
// Server components (static content + the client `ScrollReveal` wrapper). They
// reuse the existing brand tokens, card style, and `@/lib/cta` so nothing drifts.
// Copy is deliberately concrete and honest: import-only, selected-only,
// review-before-save, Gmail limited/beta — and no compliance/verification claims.

import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FolderInput,
  Inbox,
  Layers,
  Mail,
  MessagesSquare,
  Plus,
  Radar,
  RefreshCw,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";

import { Eyebrow, SectionHeader } from "@/components/marketing/section";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { buttonVariants } from "@/components/ui/button";
import { PRIMARY_CTA } from "@/lib/cta";
import { cn } from "@/lib/utils";

// ---- "Not storage. Readiness." — the document lifecycle --------------------

const LIFECYCLE = [
  { icon: Inbox, label: "Received", sub: "upload, scan, or import" },
  { icon: FolderInput, label: "Organized", sub: "vault, folders, packs" },
  { icon: Radar, label: "Watched", sub: "deadlines & renewals" },
  { icon: ClipboardCheck, label: "Requested", sub: "collect & review" },
  { icon: Send, label: "Shared", sub: "selected, expiring" },
  { icon: RefreshCw, label: "Reused", sub: "packs & templates" },
];

export function Differentiation() {
  const tools = [
    { name: "Cloud drives", does: "store files", gap: "no deadlines, no requests, no expiring shares" },
    { name: "Calendar", does: "reminds you", gap: "only if you remember to add every date by hand" },
    { name: "Scanner apps", does: "make PDFs", gap: "then the file is on its own again" },
    { name: "Email", does: "collects attachments", gap: "buried in threads, nothing is ever 'ready'" },
  ];
  return (
    <section className="scroll-mt-20 border-y border-border bg-card/50">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="Not storage. Readiness."
            title="Your documents have a lifecycle. CertaNest connects it."
            description="The problem was never only where your files live. It's whether they're ready the moment a deadline, an application, or another person asks for them."
          />
        </ScrollReveal>

        {/* The lifecycle rail — received → reused. */}
        <ScrollReveal delay={80} className="mt-12">
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {LIFECYCLE.map((step, i) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.label}
                  className="relative flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center shadow-card"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-navy text-brand-teal-bright">
                    <Icon className="size-5" />
                  </span>
                  <span className="text-sm font-semibold">{step.label}</span>
                  <span className="text-[11px] leading-tight text-muted-foreground">
                    {step.sub}
                  </span>
                  {i < LIFECYCLE.length - 1 && (
                    <ArrowRight
                      aria-hidden
                      className="absolute -right-2.5 top-1/2 hidden size-4 -translate-y-1/2 text-border lg:block"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </ScrollReveal>

        {/* Other tools vs. CertaNest. */}
        <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          <ScrollReveal className="rounded-2xl border border-border bg-background p-6 shadow-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              The tools you already use
            </p>
            <ul className="mt-4 space-y-3">
              {tools.map((t) => (
                <li key={t.name} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold text-foreground">{t.name}</span>
                  <span className="text-muted-foreground">{t.does}</span>
                  <span className="w-full text-xs text-muted-foreground/80 sm:w-auto">
                    — {t.gap}
                  </span>
                </li>
              ))}
            </ul>
          </ScrollReveal>
          <ScrollReveal
            delay={100}
            className="flex flex-col justify-center rounded-2xl border border-primary/20 bg-primary/5 p-6 shadow-card"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-brand-success/15 text-brand-success">
              <CheckCircle2 className="size-5" />
            </span>
            <p className="mt-4 font-heading text-lg font-semibold">
              CertaNest connects the whole workflow.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Add once, and a document stays organized, watched for deadlines,
              collectable from other people, reviewable, safely shareable, and
              reusable in your next application — in one calm place.
            </p>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

// ---- The readiness loop (7 steps, each with a mini UI card) -----------------

type LoopStep = {
  icon: typeof Plus;
  verb: string;
  title: string;
  body: string;
  card: React.ReactNode;
};

function MiniCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-background/80 p-3 text-xs shadow-xs">
      {children}
    </div>
  );
}

function StatusDot({ tone = "teal" }: { tone?: "teal" | "amber" | "success" }) {
  const cls =
    tone === "amber"
      ? "bg-brand-amber"
      : tone === "success"
        ? "bg-brand-success"
        : "bg-brand-teal";
  return <span className={cn("inline-block size-1.5 rounded-full", cls)} />;
}

export function ReadinessLoop() {
  const steps: LoopStep[] = [
    {
      icon: ScanLine,
      verb: "Add",
      title: "Add",
      body: "Upload, scan, or import from Google Drive and Gmail attachments.",
      card: (
        <MiniCard>
          <p className="flex items-center justify-between">
            <span className="font-medium">Drive import</span>
            <span className="text-brand-success">2 files added</span>
          </p>
          <p className="mt-1 text-muted-foreground">Recommendation letter · Transcript</p>
        </MiniCard>
      ),
    },
    {
      icon: FolderInput,
      verb: "Organize",
      title: "Organize",
      body: "A vault with folders, tags, and reusable application packs.",
      card: (
        <MiniCard>
          <p className="flex items-center justify-between">
            <span className="font-medium">Scholarship pack</span>
            <span className="text-muted-foreground">5 / 6 items</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <span className="block h-full w-[83%] rounded-full bg-brand-teal" />
          </div>
        </MiniCard>
      ),
    },
    {
      icon: Radar,
      verb: "Watch",
      title: "Watch",
      body: "Life Radar surfaces renewals and deadlines before they're urgent.",
      card: (
        <MiniCard>
          <p className="flex items-center gap-1.5">
            <StatusDot tone="amber" />
            <span className="font-medium">Passport expires</span>
            <span className="ml-auto text-muted-foreground">42 days</span>
          </p>
        </MiniCard>
      ),
    },
    {
      icon: ClipboardCheck,
      verb: "Request",
      title: "Request",
      body: "Send a link to collect a document — recipients upload without an account.",
      card: (
        <MiniCard>
          <p className="flex items-center justify-between">
            <span className="font-medium">Transcript request</span>
            <span className="rounded-full bg-brand-amber/10 px-1.5 py-0.5 text-brand-amber">
              Uploaded
            </span>
          </p>
          <p className="mt-1 text-muted-foreground">No account needed</p>
        </MiniCard>
      ),
    },
    {
      icon: FileCheck2,
      verb: "Review",
      title: "Review",
      body: "Accept, reject, or ask for a replacement. Missing items stay visible.",
      card: (
        <MiniCard>
          <p className="flex items-center justify-between">
            <span className="font-medium">Transcript.pdf</span>
            <span className="inline-flex items-center gap-1 text-brand-success">
              <CheckCircle2 className="size-3" /> Accepted
            </span>
          </p>
        </MiniCard>
      ),
    },
    {
      icon: Send,
      verb: "Share",
      title: "Share",
      body: "Send selected proof in an expiring sharing room — never your whole vault.",
      card: (
        <MiniCard>
          <p className="flex items-center gap-1.5">
            <StatusDot tone="success" />
            <span className="font-medium">Sharing room</span>
            <span className="ml-auto text-muted-foreground">expires 6d</span>
          </p>
        </MiniCard>
      ),
    },
    {
      icon: RefreshCw,
      verb: "Reuse",
      title: "Reuse",
      body: "Turn a finished pack into a template for the next application.",
      card: (
        <MiniCard>
          <p className="flex items-center justify-between">
            <span className="font-medium">Save as template</span>
            <Layers className="size-3.5 text-brand-teal" />
          </p>
        </MiniCard>
      ),
    },
  ];
  return (
    <section id="how-it-works" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="The readiness loop"
            title="Add once. Stay ready for everything that comes next."
            description="From a scattered file to reusable proof — one connected loop, not seven disconnected apps."
          />
        </ScrollReveal>
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <ScrollReveal
                key={step.title}
                as="li"
                delay={(i % 4) * 70}
                className={cn(
                  "surface-hover flex h-full flex-col rounded-2xl border border-border bg-card p-5 shadow-card",
                  // The 7th step gets emphasis as the payoff.
                  i === steps.length - 1 && "sm:col-span-2 lg:col-span-1",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-brand-navy text-brand-teal-bright">
                    <Icon className="size-5" />
                  </span>
                  <span className="font-heading text-sm font-semibold tabular-nums text-muted-foreground/40">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <h3 className="mt-3 font-heading text-base font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                {step.card}
              </ScrollReveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// ---- For organizations — document collection without the email chase --------

export function Organizations() {
  const flow = [
    { n: "01", title: "Create a template", body: "Reusable checklist for a case type — visa, scholarship, admission." },
    { n: "02", title: "Open a case for a person", body: "Custom fields and statuses your team actually uses." },
    { n: "03", title: "Send document requests", body: "Recipients upload through a simple link — no account required." },
    { n: "04", title: "Review from one place", body: "Accept, reject, or request a replacement. Missing items stay visible." },
    { n: "05", title: "Nudge and share", body: "Send branded reminders, then a sharing room with selected proof." },
  ];
  return (
    <section id="for-organizations" className="scroll-mt-20 border-y border-border bg-card/60">
      <div className="mx-auto grid w-full max-w-6xl items-start gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
        <ScrollReveal className="lg:sticky lg:top-24">
          <Eyebrow>For organizations</Eyebrow>
          <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Collect documents without chasing email attachments.
          </h2>
          <p className="mt-4 text-pretty text-muted-foreground">
            Agencies, schools, scholarship offices, and admin teams turn repeated
            document collection into a clean workflow. Know what&apos;s missing,
            what&apos;s ready, and what needs review — from one place.
          </p>
          <ul className="mt-6 space-y-2.5">
            {[
              "Recipients upload through a link — no account needed",
              "One review queue: accept, reject, needs-replacement",
              "Reusable templates, custom fields, and case statuses",
              "Branded reminders and expiring sharing rooms",
            ].map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-success" />
                <span className="text-muted-foreground">{b}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/use-cases/client-document-collection"
            className="mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            See the client document collection workflow
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <p className="mt-4 text-xs text-muted-foreground">
            Built for small teams in private beta. No enterprise SSO or compliance
            certifications yet — we say so plainly.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={120}>
          <ol className="relative space-y-3 border-l border-border pl-6">
            {flow.map((s) => (
              <li key={s.n} className="relative rounded-2xl border border-border bg-card p-4 shadow-card">
                <span className="absolute -left-[31px] top-4 flex size-5 items-center justify-center rounded-full border border-border bg-card text-[10px] font-semibold text-primary">
                  {s.n.slice(1)}
                </span>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
            <li className="relative rounded-2xl border border-primary/20 bg-primary/5 p-4">
              <span className="absolute -left-[31px] top-4 flex size-5 items-center justify-center rounded-full bg-brand-success/15 text-brand-success">
                <CheckCircle2 className="size-3" />
              </span>
              <p className="text-sm font-semibold">Everything in one queue</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                No more reconciling attachments across inboxes and spreadsheets.
              </p>
            </li>
          </ol>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ---- Integrations (import-only, selected-only, review-before-save) ----------

export function Integrations() {
  const cards = [
    {
      icon: FolderInput,
      name: "Google Drive",
      line: "Import selected files into your vault or a pack.",
      result: "2 files imported",
    },
    {
      icon: CalendarClock,
      name: "Google Calendar",
      line: "Turn a selected event into a deadline + reminder.",
      result: "Visa appointment saved",
    },
    {
      icon: Mail,
      name: "Gmail attachments",
      line: "Import the attachments you pick from a message.",
      result: "Recommendation letter selected",
      beta: true,
    },
  ];
  return (
    <section id="integrations" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="Integrations"
            title="Bring documents in. Nothing leaves without you."
            description="Sign in with Google, then import selected files, deadlines, and attachments. Import-only — nothing syncs automatically, and CertaNest never writes back to your Google account."
          />
        </ScrollReveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {cards.map((c, i) => {
            const Icon = c.icon;
            return (
              <ScrollReveal
                key={c.name}
                delay={(i % 3) * 80}
                className="surface-hover flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-card"
              >
                <div className="flex items-center justify-between">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <Icon className="size-5" />
                  </span>
                  {c.beta && (
                    <span className="inline-flex items-center rounded-full border border-brand-amber/40 bg-brand-amber/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-amber">
                      Limited beta
                    </span>
                  )}
                </div>
                <h3 className="font-heading text-base font-semibold">{c.name}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{c.line}</p>
                <div className="mt-auto flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs">
                  <Upload className="size-3.5 text-brand-teal" />
                  <span className="font-medium">{c.result}</span>
                </div>
                <ul className="flex flex-wrap gap-1.5 pt-1">
                  {["Selected only", "Review before save", "Import-only"].map((t) => (
                    <li
                      key={t}
                      className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </ScrollReveal>
            );
          })}
        </div>
        <ScrollReveal className="mt-6">
          <p className="mx-auto max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
            Google imports are rolling out to selected beta users while we complete
            Google&apos;s verification requirements. No inbox scanning, no automatic
            sync, no write-back — you confirm every import before anything is saved.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ---- Product proof — "what you can do today" bento --------------------------

export function ProductProof() {
  const items: { icon: typeof ScanLine; label: string; beta?: boolean }[] = [
    { icon: ScanLine, label: "Scan & save a document" },
    { icon: FolderInput, label: "Import from Google Drive" },
    { icon: CalendarClock, label: "Import calendar deadlines" },
    { icon: Mail, label: "Import Gmail attachments", beta: true },
    { icon: Radar, label: "Track expiry dates" },
    { icon: Layers, label: "Build an application pack" },
    { icon: ClipboardCheck, label: "Request documents from someone" },
    { icon: FileCheck2, label: "Review uploaded files" },
    { icon: Send, label: "Create an expiring sharing room" },
    { icon: ShieldCheck, label: "Redact & watermark a copy" },
    { icon: Sparkles, label: "See a full audit trail" },
    { icon: RefreshCw, label: "Prepare emergency access" },
  ];
  return (
    <section className="scroll-mt-20 border-y border-border bg-card/50">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="Real, today"
            title="What you can do in CertaNest right now."
            description="Not a roadmap — these work in the private beta today. Features still maturing are labelled honestly."
          />
        </ScrollReveal>
        <ScrollReveal
          delay={80}
          className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-4"
        >
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <div
                key={it.label}
                className="surface-hover flex items-start gap-3 bg-card p-5"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-navy text-brand-teal-bright">
                  <Icon className="size-4" />
                </span>
                <span className="text-sm font-medium leading-snug">
                  {it.label}
                  {it.beta && (
                    <span className="ml-1.5 rounded-full border border-brand-amber/40 bg-brand-amber/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-amber">
                      beta
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </ScrollReveal>
        <ScrollReveal className="mt-10 flex justify-center">
          <Link
            href={PRIMARY_CTA.href}
            className={cn(buttonVariants({ size: "lg" }), "cta-sheen h-12 px-7 text-base")}
          >
            {PRIMARY_CTA.label}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </ScrollReveal>
      </div>
    </section>
  );
}

// ---- AI assist (gated) — only marketed once AI is actually live -------------
//
// Renders ONLY when NEXT_PUBLIC_AI_ENABLED=true (same gate the AI FAQ uses), so
// we never advertise AI users can't reach yet. Copy is consent-first: opt-in,
// review-before-save, your own documents only, never sold or used for training.

/** Whether AI features are live enough to market (build-time public flag). */
export function aiMarketingEnabled(): boolean {
  return (process.env.NEXT_PUBLIC_AI_ENABLED ?? "false").toLowerCase() === "true";
}

export function AiAssist() {
  if (!aiMarketingEnabled()) return null;
  const cards = [
    {
      icon: Wand2,
      title: "Generate a document draft",
      body: "Draft cover letters, personal statements, and form answers from details you've already saved — then review and edit before anything is kept.",
    },
    {
      icon: Sparkles,
      title: "Smart intake",
      body: "Add a file and get a suggested title, category, and key dates — as suggestions you confirm, never auto-saved.",
    },
    {
      icon: MessagesSquare,
      title: "Chat with your documents",
      body: "Ask questions about the specific documents you select. AI only ever sees what you choose.",
    },
  ];
  return (
    <section id="ai" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <ScrollReveal>
          <SectionHeader
            eyebrow="AI, with your consent"
            title="When you want it, AI helps you do more."
            description="AI is optional and opt-in. It assists with drafting, intake, and answering questions about documents you choose — always as suggestions you review before saving. Reminders and deadline checks stay rule-based."
          />
        </ScrollReveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {cards.map((c, i) => {
            const Icon = c.icon;
            return (
              <ScrollReveal
                key={c.title}
                delay={(i % 3) * 80}
                className="surface-hover flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-card"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-brand-navy text-brand-teal-bright">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-heading text-base font-semibold">{c.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{c.body}</p>
                <ul className="mt-auto flex flex-wrap gap-1.5 pt-1">
                  {["Opt-in", "Review before save", "Your documents only"].map((t) => (
                    <li
                      key={t}
                      className="rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </ScrollReveal>
            );
          })}
        </div>
        <ScrollReveal className="mt-6">
          <p className="mx-auto max-w-2xl text-center text-xs leading-relaxed text-muted-foreground">
            AI is consent-based: it only ever sees documents you choose, every
            suggestion is reviewed before it&apos;s saved, and your documents are
            never sold or used to train models.
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
