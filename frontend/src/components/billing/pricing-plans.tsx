"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Loader2 } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { getPlans, formatMoney, annualSavingsPercent } from "@/lib/billing";
import { cn } from "@/lib/utils";
import type { BillingInterval, BillingPlan } from "@/types/billing";

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
  return { label: "Upgrade to Pro", href: "/dashboard/settings/billing?upgrade=pro" };
}

export function PricingPlans() {
  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [error, setError] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("year");

  useEffect(() => {
    let active = true;
    getPlans()
      .then((data) => active && setPlans(data))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p className="mt-10 text-center text-sm text-muted-foreground">
        Pricing is loading slowly. Please refresh, or{" "}
        <Link href="/register" className="text-primary hover:underline">
          start free
        </Link>
        .
      </p>
    );
  }

  if (plans === null) {
    return (
      <div className="mt-12 flex justify-center py-16 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );
  }

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
