import { PlanUsageCard } from "@/components/dashboard/plan-usage-card";

export const metadata = {
  title: "Plan & usage · CertaNest",
};

export default function PlanSettingsPage() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Settings
        </p>
        <h1 className="mt-2 font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Plan &amp; usage
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Keep an eye on how much of your plan you’re using across documents,
          files, bundles, reminders, share links, and emergency packs.
        </p>
      </div>

      <PlanUsageCard />
    </div>
  );
}
