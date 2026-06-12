import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  FileCheck2,
  FolderGit2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: FileCheck2,
    title: "Document renewal tracking",
    description:
      "Keep passports, licenses, insurance, and certificates in one vault with expiry dates you never have to remember.",
  },
  {
    icon: BellRing,
    title: "Subscription reminders",
    description:
      "Track recurring subscriptions and trials, and get a calm heads-up before the next charge or renewal lands.",
  },
  {
    icon: FolderGit2,
    title: "Application packs",
    description:
      "Bundle the right documents once and reuse them for jobs, scholarships, visas, and grants in seconds.",
  },
  {
    icon: Sparkles,
    title: "AI-powered document support",
    description:
      "Soon: automatic date extraction, smart classification, and reminder suggestions so nothing slips through.",
  },
];

export default function LandingPage() {
  return (
    <>
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,var(--brand-mint)_0%,transparent_70%)]"
          />
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 py-20 text-center sm:px-6 sm:py-28">
            <Badge variant="secondary" className="mb-6 gap-1.5">
              <ShieldCheck className="size-3.5 text-brand-teal" />
              Secure life-admin workspace
            </Badge>

            <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-tight sm:text-5xl md:text-6xl">
              Never miss a renewal, deadline, or document again.
            </h1>

            <p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
              DueNest keeps your important documents, subscriptions, and
              deadlines organized in one calm, secure workspace — so you can stay
              ahead of everything that matters.
            </p>

            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "h-11 px-6 text-base",
                )}
              >
                Get started
                <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "h-11 px-6 text-base",
                )}
              >
                Sign in
              </Link>
            </div>

            <p className="mt-6 text-sm text-muted-foreground">
              No credit card required · Built for students, professionals, and
              families.
            </p>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-t border-border bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold sm:text-4xl">
                Everything in one organized nest
              </h2>
              <p className="mt-4 text-muted-foreground">
                Four core pillars that turn scattered documents and forgotten
                dates into a system you can trust.
              </p>
            </div>

            <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Card
                    key={feature.title}
                    className="h-full border-border/80 transition-shadow hover:shadow-lg"
                  >
                    <CardHeader>
                      <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                        <Icon className="size-5" />
                      </div>
                      <CardTitle className="text-lg">{feature.title}</CardTitle>
                      <CardDescription>{feature.description}</CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works / CTA */}
        <section id="how" className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <Card className="overflow-hidden border-0 bg-brand-navy text-white">
              <CardContent className="flex flex-col items-center gap-6 px-6 py-14 text-center sm:px-12">
                <h2 className="max-w-2xl text-3xl font-semibold text-white sm:text-4xl">
                  Bring calm to your documents and deadlines
                </h2>
                <p className="max-w-xl text-white/70">
                  Create your free DueNest workspace and add your first document
                  in under a minute.
                </p>
                <Link
                  href="/register"
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "h-11 bg-white px-6 text-base text-brand-navy hover:bg-white/90",
                  )}
                >
                  Create your free account
                  <ArrowRight className="size-4" />
                </Link>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} DueNest. All rights reserved.</span>
          <span>Documents, deadlines, and renewals in one secure workspace.</span>
        </div>
      </footer>
    </>
  );
}
