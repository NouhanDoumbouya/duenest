import type { Metadata } from "next";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PricingPlans } from "@/components/billing/pricing-plans";
import { PlanComparisonTable } from "@/components/billing/plan-comparison-table";
import { Eyebrow } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Start free. Upgrade to Pro when you need more documents, secure sharing, scanner power, and emergency readiness.",
  alternates: { canonical: "/pricing" },
};

const FAQ: { q: string; a: string }[] = [
  {
    q: "Can I use DueNest for free?",
    a: "Yes. The Free plan covers the basics — documents, reminders, basic Life Radar, and Emergency Access — with generous limits.",
  },
  {
    q: "Will my documents be deleted if I downgrade?",
    a: "Never. If you move to Free, your existing documents stay safe and viewable. Adding new items above the Free limit may be paused until you upgrade again.",
  },
  {
    q: "What happens if I cancel?",
    a: "Your plan stays active until the end of the period you already paid for. After that you move to Free — your documents are untouched.",
  },
  {
    q: "Can I apply a promo or student code?",
    a: "Yes. You can enter a promo, founder, or student code at checkout, and we validate it before it applies.",
  },
  {
    q: "Can I switch between monthly and yearly?",
    a: "Yes, you can change your billing cycle from the billing portal at any time.",
  },
  {
    q: "Is Organization billing available?",
    a: "Organization (per-seat) billing is in pilot. Reach out and we'll get your team set up.",
  },
];

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance">
            Choose how ready you want to be.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-pretty text-muted-foreground">
            Start free. Upgrade when you need more documents, secure sharing,
            scanner power, and emergency readiness.
          </p>
        </div>

        <PricingPlans />

        <PlanComparisonTable />

        {/* FAQ */}
        <section className="mx-auto mt-20 max-w-2xl">
          <h2 className="text-center font-heading text-2xl font-semibold tracking-tight">
            Frequently asked questions
          </h2>
          <dl className="mt-8 space-y-6">
            {FAQ.map((item) => (
              <div key={item.q} className="rounded-xl border border-border bg-card p-5">
                <dt className="font-medium">{item.q}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mx-auto mt-12 max-w-2xl text-center text-xs text-muted-foreground">
          DueNest helps you organize and prepare important documents; this
          pricing is for DueNest&apos;s own plans. Taxes may apply at checkout
          depending on your region.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
