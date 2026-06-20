"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getPlans, formatMoney, annualSavingsPercent } from "@/lib/billing";
import { cn } from "@/lib/utils";
import type { BillingInterval, BillingPlan } from "@/types/billing";

/**
 * Static fallback plans so the public pricing page always renders complete,
 * polished cards immediately — even on the marketing deployment where the
 * billing API isn't connected yet. Live API data (below) progressively replaces
 * these when available. Prices here are indicative; the API is the source of
 * truth once reachable.
 */
const FALLBACK_PLANS: BillingPlan[] = [
  {
    key: "free",
    name: "Free",
    description: "Everything you need to get organized and stay ready.",
    tier: "free",
    is_public: true,
    is_recommended: false,
    currency: "usd",
    monthly_price: 0,
    yearly_price: 0,
    trial_days: 0,
    sort_order: 0,
    entitlements: [
      { feature_key: "documents_limit", limit_value: 25, limit_period: "total", is_enabled: true },
      { feature_key: "storage_mb", limit_value: 100, limit_period: "total", is_enabled: true },
      { feature_key: "scanner_scans_per_month", limit_value: 10, limit_period: "month", is_enabled: true },
    ],
    metadata: {},
  },
  {
    key: "pro",
    name: "Pro",
    description: "Full power for documents, scanning, and secure sharing.",
    tier: "pro",
    is_public: true,
    is_recommended: true,
    currency: "usd",
    monthly_price: 599,
    yearly_price: 5900,
    trial_days: 14,
    sort_order: 1,
    entitlements: [],
    metadata: {},
  },
  {
    key: "organization",
    name: "Organization",
    description: "Shared readiness for teams, with admin controls.",
    tier: "organization",
    is_public: true,
    is_recommended: false,
    currency: "usd",
    monthly_price: 900,
    yearly_price: 9000,
    trial_days: 0,
    sort_order: 2,
    entitlements: [],
    metadata: { coming_soon: true },
  },
];

function entitlement(plan: BillingPlan, key: string) {
  return plan.entitlements.find((e) => e.feature_key === key);
}

function limitText(plan: BillingPlan, key: string, label: string, unit = ""): string {
  const ent = entitlement(plan, key);
  if (!ent || !ent.is_enabled) return "";
  if (ent.limit_value === null) return `Unlimited ${label}`;
  return `${ent.limit_value}${unit} ${label}`;
}

/** A short, human bullet list for a plan card, derived from entitlements. */
function planHighlights(plan: BillingPlan): string[] {
  if (plan.tier === "free") {
    return [
      limitText(plan, "documents_limit", "documents"),
      `${entitlement(plan, "storage_mb")?.limit_value ?? 100}MB storage`,
      limitText(plan, "scanner_scans_per_month", "scans / month"),
      "Basic Life Radar & Emergency Access",
      "Secure sharing with Quick Share",
    ].filter(Boolean);
  }
  if (plan.tier === "organization") {
    return [
      "Team workspace & member roles",
      "Shared readiness packs & bundles",
      "Per-seat billing & admin controls",
      "Everything in Pro for each member",
    ];
  }
  // Pro / family
  return [
    "Unlimited documents & high storage",
    "Full premium scanner & Smart Intake",
    "Full Life Radar & Money Radar",
    "Full Emergency Protocol",
    "Higher secure-sharing limits",
    "Priority beta features",
  ];
}

function planCta(plan: BillingPlan): { label: string; href: string } {
  if (plan.tier === "free") return { label: "Start free", href: "/register" };
  if (plan.tier === "organization")
    return { label: "Join organization pilot", href: "/contact" };
  const label =
    plan.trial_days > 0
      ? `Start ${plan.trial_days}-day free trial`
      : "Upgrade to Pro";
  return { label, href: "/dashboard/settings/billing?upgrade=pro" };
}

export function PricingPlans() {
  // Start from polished static plans so the page is complete on first paint,
  // then progressively enhance with live API data when it's reachable. A failed
  // or slow API simply leaves the fallback in place — never a broken/scary state.
  const [plans, setPlans] = useState<BillingPlan[]>(FALLBACK_PLANS);
  const [interval, setInterval] = useState<BillingInterval>("year");

  useEffect(() => {
    let active = true;
    getPlans()
      .then((data) => {
        if (active && Array.isArray(data) && data.length > 0) setPlans(data);
      })
      .catch(() => {
        // Keep the fallback plans; the marketing page stays complete offline.
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      {/* Monthly / yearly toggle */}
      <div className="mt-10 flex items-center justify-center gap-3">
        <span
          className={cn(
            "text-sm",
            interval === "month" ? "font-semibold" : "text-muted-foreground",
          )}
        >
          Monthly
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={interval === "year"}
          aria-label="Toggle annual billing"
          onClick={() => setInterval((i) => (i === "year" ? "month" : "year"))}
          className="relative h-6 w-11 rounded-full bg-muted transition-colors data-[on=true]:bg-primary"
          data-on={interval === "year"}
        >
          <span
            className="absolute top-0.5 left-0.5 size-5 rounded-full bg-card shadow-sm transition-transform"
            style={{
              transform: interval === "year" ? "translateX(20px)" : "translateX(0)",
            }}
          />
        </button>
        <span
          className={cn(
            "text-sm",
            interval === "year" ? "font-semibold" : "text-muted-foreground",
          )}
        >
          Yearly
          <span className="ml-1 rounded-full bg-brand-success/10 px-2 py-0.5 text-xs font-medium text-brand-success">
            Save more
          </span>
        </span>
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const cta = planCta(plan);
          const isFree = plan.tier === "free";
          const isOrg = plan.tier === "organization";
          const monthly = plan.monthly_price;
          const yearly = plan.yearly_price;
          const savings = annualSavingsPercent(monthly, yearly);
          const perMonth =
            interval === "year" && yearly ? Math.round(yearly / 12) : monthly;
          return (
            <div
              key={plan.key}
              className={cn(
                "flex h-full flex-col rounded-2xl border bg-card p-6 shadow-card",
                plan.is_recommended
                  ? "border-primary ring-1 ring-primary/20"
                  : "border-border",
              )}
            >
              <div className="flex items-center justify-between">
                <h2 className="font-heading text-lg font-semibold">{plan.name}</h2>
                {plan.is_recommended && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                    Recommended
                  </span>
                )}
                {isOrg && Boolean(plan.metadata?.coming_soon) && (
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    Pilot
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>

              <div className="mt-5 min-h-14">
                {isFree ? (
                  <span className="text-3xl font-semibold">Free</span>
                ) : (
                  <>
                    <span className="text-3xl font-semibold">
                      {formatMoney(perMonth ?? null, plan.currency)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {isOrg ? " / seat / mo" : " / mo"}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {interval === "year"
                        ? `Billed yearly${savings ? ` · save ${savings}%` : ""}`
                        : "Billed monthly"}
                    </p>
                    {plan.trial_days > 0 && (
                      <p className="mt-1 text-xs font-medium text-brand-success">
                        {plan.trial_days}-day free trial · no card required
                      </p>
                    )}
                  </>
                )}
              </div>

              <ul className="mt-5 flex-1 space-y-2.5">
                {planHighlights(plan).map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-success" />
                    <span className="text-muted-foreground">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={cta.href}
                className={cn(
                  buttonVariants({
                    variant: plan.is_recommended ? "default" : "outline",
                  }),
                  "mt-6 w-full",
                )}
              >
                {cta.label}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          );
        })}
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Private by default · Secure sharing · Cancel anytime
      </p>
    </>
  );
}
