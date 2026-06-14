"use client";

import {
  FlaskConical,
  Globe2,
  KeyRound,
  Layers,
  Percent,
  Power,
  ShieldAlert,
  Users,
} from "lucide-react";

import { FounderPageHeader } from "@/components/founder/founder-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CAPABILITIES = [
  {
    icon: Power,
    title: "Feature on/off",
    description: "Turn a feature on or off product-wide from one place.",
  },
  {
    icon: FlaskConical,
    title: "Beta-only & founder-only modes",
    description: "Limit a feature to beta cohorts or the founder while it stabilizes.",
  },
  {
    icon: Users,
    title: "Selected-user access",
    description: "Grant early access to specific accounts for interviews and testing.",
  },
  {
    icon: Globe2,
    title: "Country availability",
    description: "Enable or restrict features by country for rollout and policy needs.",
  },
  {
    icon: Percent,
    title: "Rollout percentage",
    description: "Gradually release a feature to a growing share of users.",
  },
  {
    icon: Layers,
    title: "Plan-based access",
    description: "Gate features by plan once billing tiers exist.",
  },
  {
    icon: ShieldAlert,
    title: "Kill switch",
    description: "Instantly disable a feature if something goes wrong.",
  },
  {
    icon: KeyRound,
    title: "Audit log",
    description: "Record who changed which control and when.",
  },
];

export default function FounderFeatureControlsPage() {
  return (
    <div className="space-y-6">
      <FounderPageHeader
        eyebrow="Founder Ops"
        title="Feature Control Center"
        description="The planned home for runtime feature flags — on/off, cohort, country, rollout, and kill switches — with a full audit trail."
      />

      <Card className="border-brand-amber/30 bg-brand-amber/5">
        <CardContent className="flex items-start gap-3 py-4">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-brand-amber" />
          <div className="space-y-1">
            <p className="text-sm font-semibold">
              Foundation only — controls are not enforced yet.
            </p>
            <p className="text-sm text-muted-foreground">
              This page describes the planned Feature Control Center. No toggles
              here change product behaviour. Real feature flags must be enforced
              on the backend (with an audit log) before any control is exposed as
              functional — a UI-only switch would be unsafe and misleading.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CAPABILITIES.map((cap) => {
          const Icon = cap.icon;
          return (
            <Card key={cap.title}>
              <CardContent className="space-y-2 py-5">
                <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </span>
                <p className="font-medium">{cap.title}</p>
                <p className="text-sm text-muted-foreground">{cap.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What needs to be built first</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            {[
              "A backend feature-flag model (key, status, scope, rollout %, audit fields) that the app reads on every request.",
              "A small evaluation service: given a user/country/cohort, decide whether a feature is enabled.",
              "An audit log so every control change is attributable and reversible.",
              "Then, and only then, expose functional controls here that write to that backend.",
            ].map((step, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="text-muted-foreground">{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
