"use client";

import { useEffect, useState } from "react";
import { Check, Minus } from "lucide-react";

import { getPlans } from "@/lib/billing";
import type { BillingPlan } from "@/types/billing";

interface Row {
  key: string;
  label: string;
  // "static" = plan-tier-driven copy (used for scanner rows that aren't a single
  // numeric entitlement, e.g. "Limited" vs "Included").
  kind: "number" | "storage" | "bool" | "static";
  values?: { free: string; pro: string };
}

const ROWS: Row[] = [
  { key: "documents_limit", label: "Documents", kind: "number" },
  { key: "storage_mb", label: "Storage", kind: "storage" },
  { key: "quick_shares_per_month", label: "SafeSend links / month", kind: "number" },
  { key: "bundles_limit", label: "Application bundles", kind: "number" },
  { key: "reminders_limit", label: "Reminders", kind: "number" },
  { key: "emergency_protocol_enabled", label: "Emergency Protocol", kind: "bool" },
  { key: "smart_intake_enabled", label: "Smart Intake (OCR)", kind: "bool" },
  { key: "priority_features", label: "Priority beta features", kind: "bool" },
  // --- Scanner (mostly free; Pro unlocks serious document workflows) ---
  { key: "scanner", label: "Scanner", kind: "static", values: { free: "Included", pro: "Full" } },
  { key: "basic_filters", label: "Basic filters", kind: "static", values: { free: "Included", pro: "Included" } },
  { key: "scanner_max_pages_per_pdf", label: "Multi-page scans", kind: "number" },
  { key: "scanner_hd_export", label: "HD PDF export", kind: "static", values: { free: "Limited", pro: "Included" } },
  { key: "scanner_advanced_enhancement", label: "Advanced enhancement", kind: "static", values: { free: "Limited", pro: "Included" } },
  { key: "ocr_searchable", label: "OCR / searchable text", kind: "static", values: { free: "Limited by AI plan", pro: "Within AI limits" } },
  { key: "ai_extraction_scans", label: "AI extraction from scans", kind: "static", values: { free: "3 AI actions/day", pro: "30 AI actions/day" } },
  { key: "auto_reminders_scans", label: "Auto reminders from scans", kind: "static", values: { free: "Limited", pro: "Included" } },
];

function cellValue(plan: BillingPlan, row: Row) {
  if (row.kind === "static") {
    const text = plan.tier === "free" ? row.values!.free : row.values!.pro;
    return <span>{text}</span>;
  }
  const ent = plan.entitlements.find((e) => e.feature_key === row.key);
  if (row.kind === "bool") {
    return ent?.is_enabled ? (
      <Check className="mx-auto size-4 text-brand-success" aria-label="Included" />
    ) : (
      <Minus className="mx-auto size-4 text-muted-foreground" aria-label="Not included" />
    );
  }
  if (!ent || !ent.is_enabled) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (ent.limit_value === null) return <span className="font-medium">Unlimited</span>;
  if (row.kind === "storage") {
    const mb = ent.limit_value;
    return <span>{mb >= 1024 ? `${(mb / 1024).toFixed(0)} GB` : `${mb} MB`}</span>;
  }
  if (row.key === "scanner_max_pages_per_pdf") {
    return <span>{`Up to ${ent.limit_value} pages`}</span>;
  }
  return <span>{ent.limit_value}</span>;
}

export function PlanComparisonTable() {
  const [plans, setPlans] = useState<BillingPlan[] | null>(null);

  useEffect(() => {
    let active = true;
    getPlans()
      .then((data) => active && setPlans(data))
      .catch(() => active && setPlans([]));
    return () => {
      active = false;
    };
  }, []);

  if (!plans || plans.length === 0) return null;

  // Compare the purchasable plans (Free vs Pro). Coming-soon plans (Family/Teams)
  // have no entitlements to compare and are covered on the cards above.
  const compared = plans.filter((p) => p.is_active !== false);
  if (compared.length === 0) return null;

  return (
    <section className="mx-auto mt-20 max-w-3xl">
      <h2 className="text-center font-heading text-2xl font-semibold tracking-tight">
        Compare plans
      </h2>
      <div className="mt-8 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Feature comparison across CertaNest plans</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-3 pr-4 text-left font-medium">
                Feature
              </th>
              {compared.map((plan) => (
                <th
                  key={plan.key}
                  scope="col"
                  className="px-3 py-3 text-center font-semibold"
                >
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-b border-border/60">
                <th scope="row" className="py-2.5 pr-4 text-left font-normal text-muted-foreground">
                  {row.label}
                </th>
                {compared.map((plan) => (
                  <td key={plan.key} className="px-3 py-2.5 text-center">
                    {cellValue(plan, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
