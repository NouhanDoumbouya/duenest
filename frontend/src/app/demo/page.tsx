import Link from "next/link";
import { CalendarClock, FileText, ShieldCheck } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { AppPreview } from "@/components/marketing/app-preview";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const demoHighlights = [
  {
    icon: FileText,
    title: "Sample document vault",
    description: "Preview passports, visas, insurance, files, and renewal dates.",
  },
  {
    icon: CalendarClock,
    title: "Attention workflow",
    description: "See how expiring and missing information rises to the top.",
  },
  {
    icon: ShieldCheck,
    title: "Trust controls",
    description: "Try the same setup and trust surfaces available in the app.",
  },
];

export default function DemoPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <p className="text-sm font-semibold text-primary">Demo</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight">
              Preview DueNest with fake document data
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              The authenticated setup page can create clearly labeled sample
              documents so you can inspect the module without entering personal
              information.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/waitlist" className={cn(buttonVariants({ size: "lg" }))}>
                Join waitlist
              </Link>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
              >
                Sign in
              </Link>
            </div>
          </div>
          <AppPreview />
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {demoHighlights.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title}>
                <CardHeader>
                  <Icon className="size-5 text-primary" />
                  <CardTitle>{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </main>
    </>
  );
}
