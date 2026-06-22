import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  Eye,
  FileText,
  Inbox,
  KeyRound,
  LifeBuoy,
  Link2,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
  Timer,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { LiveCountdown } from "@/components/marketing/live-countdown";

// Polished, static product mockups for the marketing page. Built entirely from
// the real CertaNest design tokens (no screenshots, no image files) so they stay
// crisp at any size, add no layout shift, and never ship a heavy bundle. Every
// number/scenario is realistic and matches what the product actually does.
//
// All server components — zero client JS.

// ---- Primitives ------------------------------------------------------------

export function BrowserFrame({
  url,
  children,
  className,
}: {
  url: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card shadow-floating",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-3">
        <span className="size-2.5 rounded-full bg-destructive/30" />
        <span className="size-2.5 rounded-full bg-brand-amber/40" />
        <span className="size-2.5 rounded-full bg-brand-success/40" />
        <span className="ml-3 inline-flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1 text-xs text-muted-foreground">
          <Lock className="size-3" />
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}

/**
 * A realistic phone shell — titanium-style rim, a Dynamic Island, and side
 * buttons — wrapping any screen content. Pure tokens/markup (no images), so it
 * stays crisp at any size and ships zero bundle weight. Width is controlled via
 * `className`; the screen height follows its children.
 */
export function PhoneFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative mx-auto w-[270px]", className)}>
      {/* Side buttons (volume pair + power), offset just past the rim. */}
      <span
        aria-hidden
        className="absolute -left-[2px] top-[96px] h-7 w-[3px] rounded-l-sm bg-foreground/70"
      />
      <span
        aria-hidden
        className="absolute -left-[2px] top-[138px] h-12 w-[3px] rounded-l-sm bg-foreground/70"
      />
      <span
        aria-hidden
        className="absolute -right-[2px] top-[120px] h-16 w-[3px] rounded-r-sm bg-foreground/70"
      />

      {/* Outer rim → inner bezel → screen. */}
      <div className="rounded-[2.75rem] bg-gradient-to-b from-foreground/85 to-foreground p-[3px] shadow-floating ring-1 ring-black/10">
        <div className="rounded-[2.6rem] bg-foreground p-[9px]">
          <div className="relative overflow-hidden rounded-[2rem] bg-background">
            {/* Dynamic Island */}
            <div
              aria-hidden
              className="absolute left-1/2 top-2.5 z-20 h-[26px] w-[88px] -translate-x-1/2 rounded-full bg-foreground"
            />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

type ChipTone = "safe" | "expiring" | "expired" | "shared" | "info" | "active";

const chipTone: Record<ChipTone, string> = {
  safe: "bg-brand-success/10 text-brand-success",
  expiring: "bg-brand-amber/10 text-brand-amber",
  expired: "bg-destructive/10 text-destructive",
  shared: "bg-accent text-accent-foreground",
  info: "bg-primary/10 text-primary",
  active: "bg-brand-success/10 text-brand-success",
};

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: ChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        chipTone[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const iconTone: Record<string, string> = {
  amber: "bg-brand-amber/15 text-brand-amber",
  blue: "bg-primary/10 text-primary",
  teal: "bg-accent text-accent-foreground",
  green: "bg-brand-success/10 text-brand-success",
  neutral: "bg-muted text-muted-foreground",
};

/** A decorative, deterministic faux-QR (no heavy QR lib on the marketing page). */
function fauxQrMatrix(size = 15): boolean[][] {
  const m = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const finder = (r: number, c: number) => {
    for (let i = 0; i < 7; i++)
      for (let j = 0; j < 7; j++) {
        const edge = i === 0 || i === 6 || j === 0 || j === 6;
        const inner = i >= 2 && i <= 4 && j >= 2 && j <= 4;
        if (edge || inner) m[r + i][c + j] = true;
      }
  };
  finder(0, 0);
  finder(0, size - 7);
  finder(size - 7, 0);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const inFinder =
        (r < 8 && c < 8) ||
        (r < 8 && c >= size - 8) ||
        (r >= size - 8 && c < 8);
      if (inFinder) continue;
      if (rand() > 0.52) m[r][c] = true;
    }
  return m;
}

const QR_MATRIX = fauxQrMatrix(15);

export function FauxQr({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "grid aspect-square gap-px rounded-lg bg-white p-2",
        className,
      )}
      style={{ gridTemplateColumns: `repeat(${QR_MATRIX.length}, minmax(0,1fr))` }}
    >
      {QR_MATRIX.flatMap((row, r) =>
        row.map((on, c) => (
          <span
            key={`${r}-${c}`}
            className={cn("rounded-[1px]", on ? "bg-brand-navy" : "bg-transparent")}
          />
        )),
      )}
    </div>
  );
}

// ---- Life Radar (hero + section) -------------------------------------------

export function LifeRadarMockup() {
  const fixFirst = [
    {
      icon: FileText,
      title: "Student visa",
      meta: "Expires in 23 days",
      tone: "amber",
      chip: <StatusChip tone="expiring">Expiring</StatusChip>,
    },
    {
      icon: CalendarClock,
      title: "Car insurance",
      meta: "Renews in 12 days",
      tone: "blue",
      chip: <StatusChip tone="info">Renews</StatusChip>,
    },
    {
      icon: Link2,
      title: "Passport share",
      meta: (
        <>
          Active · expires in{" "}
          <LiveCountdown hoursFromNow={18} className="tabular-nums" />
        </>
      ),
      tone: "teal",
      chip: <StatusChip tone="shared">Shared</StatusChip>,
    },
    {
      icon: LifeBuoy,
      title: "Emergency setup",
      meta: "1 step left to finish",
      tone: "neutral",
      chip: <StatusChip tone="expiring">Incomplete</StatusChip>,
    },
  ];

  const stats = [
    { label: "Next deadline", value: "23 days", icon: CalendarClock },
    { label: "Renewals due", value: "3 soon", icon: RefreshCw },
    { label: "Active shares", value: "1", icon: Link2 },
    { label: "Emergency", value: "Almost", icon: LifeBuoy },
  ];

  return (
    <BrowserFrame url="app.certanest.com/dashboard">
      <div className="space-y-4 p-4 sm:p-5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-heading text-sm font-semibold">Life Radar</p>
            <p className="text-xs text-muted-foreground">
              Here&apos;s what to fix first
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-amber/10 px-2.5 py-1 text-xs font-medium text-brand-amber">
            <AlertTriangle className="size-3.5" />
            4 need attention
          </span>
        </div>

        {/* Stat strip */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.label}
                className="rounded-xl border border-border bg-background px-3 py-2"
              >
                <Icon className="size-3.5 text-muted-foreground" />
                <p className="mt-1.5 text-sm font-semibold tabular-nums">
                  {s.value}
                </p>
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
              </div>
            );
          })}
        </div>

        {/* Fix first list */}
        <div className="space-y-2">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Fix first
          </p>
          {fixFirst.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    iconTone[item.tone],
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.meta}
                  </p>
                </div>
                {item.chip}
              </div>
            );
          })}
        </div>

        {/* What am I forgetting */}
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
          <Search className="size-4 shrink-0 text-primary" />
          <p className="text-xs font-medium text-primary">
            What am I forgetting?
          </p>
          <span className="ml-auto text-[11px] text-muted-foreground">
            Ask Life Radar
          </span>
        </div>
      </div>
    </BrowserFrame>
  );
}

// ---- Fix-first card (compact hero teaser) ----------------------------------

export function FixFirstCard() {
  const rows = [
    {
      icon: FileText,
      title: "Student visa",
      meta: "Expires in 23 days",
      tone: "amber",
      chip: <StatusChip tone="expiring">Expiring</StatusChip>,
    },
    {
      icon: CalendarClock,
      title: "Car insurance",
      meta: "Renews in 12 days",
      tone: "blue",
      chip: <StatusChip tone="info">Renews</StatusChip>,
    },
    {
      icon: Link2,
      title: "Passport share",
      meta: (
        <>
          Active ·{" "}
          <LiveCountdown hoursFromNow={18} className="tabular-nums" />
        </>
      ),
      tone: "teal",
      chip: <StatusChip tone="shared">Shared</StatusChip>,
    },
  ];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-floating">
      <span aria-hidden className="live-scan" />
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="font-heading text-sm font-semibold">Fix first</p>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-success">
          <span className="pulse-soft flex size-1.5 rounded-full bg-brand-success" />
          Watching
        </span>
      </div>
      <div className="space-y-2 p-4">
        {rows.map((r) => {
          const Icon = r.icon;
          return (
            <div
              key={r.title}
              className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  iconTone[r.tone],
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.title}</p>
                <p className="truncate text-xs text-muted-foreground">{r.meta}</p>
              </div>
              {r.chip}
            </div>
          );
        })}
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
          <Search className="size-4 shrink-0 text-primary" />
          <p className="text-xs font-medium text-primary">What am I forgetting?</p>
        </div>
      </div>
    </div>
  );
}

// ---- Vault -----------------------------------------------------------------

export function VaultMockup() {
  const docs = [
    {
      title: "Passport",
      meta: "Identity · expires 12 Mar 2027",
      tone: "green",
      chip: <StatusChip tone="safe">Safe</StatusChip>,
    },
    {
      title: "Student visa",
      meta: "Immigration · expires in 23 days",
      tone: "amber",
      chip: <StatusChip tone="expiring">Expiring</StatusChip>,
    },
    {
      title: "Travel insurance",
      meta: "Missing expiry date",
      tone: "neutral",
      chip: <StatusChip tone="info">Add info</StatusChip>,
    },
    {
      title: "Enrolment letter",
      meta: "Shared · view-only",
      tone: "teal",
      chip: <StatusChip tone="shared">Shared</StatusChip>,
    },
  ];
  return (
    <BrowserFrame url="app.certanest.com/vault">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <p className="font-heading text-sm font-semibold">Your vault</p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground">
            <Lock className="size-3" />
            Private by default
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-background px-3 py-2.5 text-xs text-muted-foreground">
          <Inbox className="size-4 text-muted-foreground" />
          File Inbox · drop a file now, organize it later
        </div>

        <div className="space-y-2">
          {docs.map((d) => (
            <div
              key={d.title}
              className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  iconTone[d.tone],
                )}
              >
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.title}</p>
                <p className="truncate text-xs text-muted-foreground">{d.meta}</p>
              </div>
              {d.chip}
            </div>
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}

// ---- SafeSend (QR share card + permission chips) ---------------------------

export function SafeSendMockup() {
  return (
    <PhoneFrame className="mx-auto w-full max-w-[280px]">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5 text-brand-success" />
            Secure share
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-success/10 px-2 py-0.5 text-[11px] font-medium text-brand-success">
            <span className="size-1.5 rounded-full bg-brand-success" />
            Active
          </span>
        </div>

        <p className="text-center text-sm font-semibold">Passport</p>

        <div className="mx-auto w-40">
          <FauxQr />
        </div>

        <div className="flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            <Timer className="size-3.5" />
            Expires in{" "}
            <LiveCountdown hoursFromNow={18} className="tabular-nums" />
          </span>
        </div>

        <div className="flex flex-wrap justify-center gap-1.5">
          {[
            { icon: Eye, label: "View only" },
            { icon: KeyRound, label: "Code required" },
            { icon: ShieldCheck, label: "Watermarked" },
          ].map((chip) => {
            const Icon = chip.icon;
            return (
              <span
                key={chip.label}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <Icon className="size-3" />
                {chip.label}
              </span>
            );
          })}
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] text-muted-foreground">
          {["WhatsApp", "Link", "Code"].map((m) => (
            <div
              key={m}
              className="rounded-lg border border-border bg-background py-1.5"
            >
              {m}
            </div>
          ))}
        </div>

        <p className="flex items-center justify-center gap-1 text-center text-[11px] font-medium text-brand-success">
          <Ban className="size-3" />
          Revoke anytime
        </p>
      </div>
    </PhoneFrame>
  );
}

// ---- Emergency Protocol ----------------------------------------------------

export function EmergencyMockup() {
  const checklist = [
    { label: "Selected documents", done: true },
    { label: "Trusted contact added", done: true },
    { label: "Unlock rule · Delayed (24h)", done: true },
    { label: "Printable card ready", done: true },
    { label: "Test emergency access", done: false },
  ];
  return (
    <BrowserFrame url="app.certanest.com/emergency">
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:p-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-heading text-sm font-semibold">
              Emergency Protocol
            </p>
            <StatusChip tone="safe">80% ready</StatusChip>
          </div>

          {/* Readiness bar */}
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand-success"
                style={{ width: "80%" }}
              />
            </div>
            <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
              4 / 5
            </span>
          </div>

          <div className="space-y-1.5">
            {checklist.map((c) => (
              <div
                key={c.label}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs"
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full",
                    c.done
                      ? "bg-brand-success/15 text-brand-success"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {c.done ? (
                    <Check className="size-2.5" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current" />
                  )}
                </span>
                <span className={c.done ? "" : "text-muted-foreground"}>
                  {c.label}
                </span>
              </div>
            ))}
          </div>

          <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Only the documents you select are shown. Your full vault stays
            private.
          </p>
        </div>

        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-background p-3">
          <div className="w-24">
            <FauxQr />
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            <Lock className="size-3" />
            Locked QR
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Wallet card
          </span>
        </div>
      </div>
    </BrowserFrame>
  );
}

// ---- Deadlines & Renewals --------------------------------------------------

export function DeadlinesRenewalsMockup() {
  const items = [
    {
      title: "Passport",
      meta: "Expires in 3 weeks",
      tone: "amber",
      chip: <StatusChip tone="expiring">Soon</StatusChip>,
    },
    {
      title: "Visa application",
      meta: "Deadline 14 Jun",
      tone: "blue",
      chip: <StatusChip tone="info">Deadline</StatusChip>,
    },
    {
      title: "Car insurance",
      meta: "Renews 28 Jun",
      tone: "neutral",
      chip: <StatusChip tone="info">Renewal</StatusChip>,
    },
  ];
  return (
    <BrowserFrame url="app.certanest.com/reminders">
      <div className="space-y-4 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <p className="font-heading text-sm font-semibold">
            Deadlines &amp; Renewals
          </p>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
            <CalendarClock className="size-3" />
            5 upcoming
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-background px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">This week</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">2</p>
          </div>
          <div className="rounded-xl border border-border bg-background px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">Next 30 days</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">5</p>
          </div>
        </div>

        <div className="space-y-2">
          {items.map((s) => (
            <div
              key={s.title}
              className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5"
            >
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-lg",
                  iconTone[s.tone],
                )}
              >
                <CalendarClock className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{s.title}</p>
                <p className="truncate text-xs text-muted-foreground">{s.meta}</p>
              </div>
              {s.chip}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          CertaNest reminds you before documents expire and deadlines pass.
        </p>
      </div>
    </BrowserFrame>
  );
}
