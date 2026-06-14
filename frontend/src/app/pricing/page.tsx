import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, ShieldAlert } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "DueNest is free during its private beta. A preview of where Free, Pro, and Organization plans are heading. Pricing is not final.",
  alternates: { canonical: "/pricing" },
};

type Plan = {
  name: string;
  tagline: string;
  price: string;
  priceNote: string;
  cta: { label: string; href: string };
  highlighted?: boolean;
  features: string[];
};

const plans: Plan[] = [
  {
    name: "Free beta",
    tagline: "Everything in the private beta, free.",
    price: "Free",
    priceNote: "during the private beta",
    cta: { label: "Join the waitlist", href: "/waitlist" },
    highlighted: true,
    features: [
      "Documents, File Inbox, and renewal tracking",
      "Reminders and notification center",
      "Subscription tracking",
      "Application bundles and checklists",
      "Quick Share (link, code, QR)",
      "Emergency Access",
    ],
  },
  {
    name: "Pro",
    tagline: "For power users with more to manage.",
    price: "Later",
    priceNote: "pricing not yet set",
    cta: { label: "Join the waitlist", href: "/waitlist" },
    features: [
      "Higher document and file limits",
      "Advanced Quick Share controls",
      "Priority reminders",
      "AI document support as it ships",
    ],
  },
  {
    name: "Organization",
    tagline: "For teams and small organizations.",
    price: "Later",
    priceNote: "pricing not yet set",
    cta: { label: "Talk to us", href: "/contact" },
    features: [
      "Shared workspaces",
      "Member document collection",
      "Organization-level controls",
      "Collaboration features as they ship",
    ],
  },
];

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold text-primary">Pricing</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance">
            Free during the private beta
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-pretty text-muted-foreground">
            DueNest is free while it is in private beta. Here is an honest
            preview of where paid plans are heading.
          </p>
        </div>

        <div className="mx-auto mt-6 flex max-w-2xl items-start gap-3 rounded-xl border border-brand-amber/30 bg-brand-amber/5 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-brand-amber" />
          <p>
            Pricing is not final during private beta. Plans and limits below are
            a preview of direction, not an offer, and there is no paid checkout
            yet.
          </p>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={cn(
                "flex h-full flex-col rounded-2xl border bg-card p-6 shadow-card",
                plan.highlighted ? "border-primary ring-1 ring-primary/20" : "border-border",
              )}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg font-semibold">
                  {plan.name}
                </h2>
                {plan.highlighted && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    Available now
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
              <div className="mt-5">
                <span className="text-3xl font-semibold">{plan.price}</span>
                <p className="text-xs text-muted-foreground">{plan.priceNote}</p>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-success" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={plan.cta.href}
                className={cn(
                  buttonVariants({
                    variant: plan.highlighted ? "default" : "outline",
                  }),
                  "mt-6 w-full",
                )}
              >
                {plan.cta.label}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-muted-foreground">
          DueNest tracks subscriptions and renewals; it does not process payments
          or charge cards during the beta.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
