import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Check,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/marketing/section";

/**
 * A two-audience block — the people keeping their own documents ready, and the
 * organizations who request and review them. Inspired by the dual "for manager /
 * for applicant" framing on premium SaaS pages, mapped to DueNest's two real
 * sides so it complements (not duplicates) the granular use-case grid below.
 * Server component — no client JS.
 */
interface Persona {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  href: string;
  cta: string;
  tone: "you" | "org";
}

const PERSONAS: Persona[] = [
  {
    icon: Users,
    eyebrow: "For you & your family",
    title: "Keep your own documents ready.",
    description:
      "Organize what matters, track every renewal, and prepare emergency access for the people you trust — without the last-minute scramble.",
    points: [
      "One calm home for passports, IDs, and certificates",
      "Reminders before renewals and deadlines pass",
      "Share securely, then revoke whenever you want",
    ],
    href: "/use-cases/families",
    cta: "See it for families",
    tone: "you",
  },
  {
    icon: Building2,
    eyebrow: "For agencies & schools",
    title: "Collect documents without the chaos.",
    description:
      "Request the right documents, review submissions in one place, and track who's still missing what — instead of chasing email attachments.",
    points: [
      "Request exactly the documents you need",
      "Review and track submissions at a glance",
      "Controlled access, with a full activity log",
    ],
    href: "/use-cases/agencies-schools",
    cta: "See it for agencies & schools",
    tone: "org",
  },
];

export function PersonaSplit() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {PERSONAS.map((p) => {
        const Icon = p.icon;
        return (
          <div
            key={p.eyebrow}
            className={cn(
              "flex h-full flex-col rounded-2xl border p-6 shadow-card sm:p-7",
              p.tone === "org"
                ? "border-primary/20 bg-primary/5"
                : "border-border bg-card",
            )}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-brand-teal">
                <Icon className="size-5" />
              </span>
              <Eyebrow>{p.eyebrow}</Eyebrow>
            </div>

            <h3 className="mt-4 font-heading text-xl font-semibold tracking-tight text-balance sm:text-2xl">
              {p.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {p.description}
            </p>

            <ul className="mt-5 space-y-2.5">
              {p.points.map((point) => (
                <li key={point} className="flex items-start gap-3 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-success" />
                  <span className="text-muted-foreground">{point}</span>
                </li>
              ))}
            </ul>

            <Link
              href={p.href}
              className="group mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-medium text-primary hover:underline"
            >
              {p.cta}
              <ArrowRight
                className="size-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </div>
        );
      })}
    </div>
  );
}
