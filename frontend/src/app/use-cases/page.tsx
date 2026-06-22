import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Eyebrow } from "@/components/marketing/section";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { USE_CASES } from "@/lib/use-cases";

export const metadata: Metadata = {
  title: "Use cases",
  description:
    "How students, visa and scholarship applicants, job seekers, families, agencies, and schools use CertaNest to get important documents ready.",
  alternates: { canonical: "/use-cases" },
};

export default function UseCasesIndexPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <Eyebrow>Use cases</Eyebrow>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance">
            Get important documents ready — whatever you&apos;re preparing for
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-pretty text-muted-foreground">
            CertaNest helps you organize, prepare, track, generate, and safely share
            important documents before deadlines, applications, renewals, and
            emergencies.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {USE_CASES.map((u) => (
            <Link key={u.slug} href={`/use-cases/${u.slug}`} className="group">
              <Card className="h-full transition-colors group-hover:border-primary/40">
                <CardHeader>
                  <p className="text-xs font-semibold text-primary">{u.eyebrow}</p>
                  <CardTitle className="flex items-center gap-1.5">
                    {u.title}
                    <ArrowRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </CardTitle>
                  <CardDescription>{u.solution}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
