"use client";

import { useEffect, useState } from "react";
import { Check, Minus } from "lucide-react";

import { getPlans } from "@/lib/billing";
import type { BillingPlan } from "@/types/billing";

interface Row {
  key: string;
  label: string;
  kind: "number" | "storage" | "bool";
}

const ROWS: Row[] = [
  { key: "documents_limit", label: "Documents", kind: "number" },
  { key: "storage_mb", label: "Storage", kind: "storage" },
  { key: "scanner_scans_per_month", label: "Scanner scans / month", kind: "number" },
  { key: "quick_shares_per_month", label: "SafeSend links / month", kind: "number" },
  { key: "bundles_limit", label: "Application bundles", kind: "number" },
  { key: "reminders_limit", label: "Reminders", kind: "number" },
  { key: "emergency_protocol_enabled", label: "Emergency Protocol", kind: "bool" },
  { key: "smart_intake_enabled", label: "Smart Intake (OCR)", kind: "bool" },
  { key: "organizations_enabled", label: "Organizations", kind: "bool" },
  { key: "priority_features", label: "Priority beta features", kind: "bool" },
];

function cellValue(plan: BillingPlan, row: Row) {
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
              {plans.map((plan) => (
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
                {plans.map((plan) => (
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
