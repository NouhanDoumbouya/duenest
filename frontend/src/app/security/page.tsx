import Link from "next/link";
import { FileText, Lock, ShieldCheck } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const controls = [
  {
    icon: Lock,
    title: "Owner-scoped access",
    description:
      "Document records, files, reminders, checklists, bundles, exports, and account controls are scoped to the signed-in user.",
  },
  {
    icon: ShieldCheck,
    title: "Controlled sharing",
    description:
      "Shared file links can expire, be revoked, and optionally require an access code.",
  },
  {
    icon: FileText,
    title: "Secret-free exports",
    description:
      "Structured exports include document metadata and related summaries, not raw storage paths or share access codes.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-primary">Security</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Security posture for the DueNest beta
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
            DueNest is built around private, user-owned document workflows. This
            page is a beta transparency draft and should receive legal and
            security review before wider public launch.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {controls.map((control) => {
            const Icon = control.icon;
            return (
              <Card key={control.title}>
                <CardHeader>
                  <Icon className="size-5 text-primary" />
                  <CardTitle>{control.title}</CardTitle>
                  <CardDescription>{control.description}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>

        <section className="mt-12 space-y-5 rounded-lg border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">Current beta boundaries</h2>
          <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li>Full raw-file archive exports are not available yet.</li>
            <li>
              Frontend token handling is acceptable for local development only;
              production should move toward HttpOnly cookie handling.
            </li>
            <li>
              AI-assisted document processing is not enabled as a third-party
              file-processing pipeline in this beta.
            </li>
          </ul>
        </section>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link href="/privacy" className={cn(buttonVariants({ variant: "outline" }))}>
            Privacy draft
          </Link>
          <Link href="/waitlist" className={cn(buttonVariants())}>
            Join waitlist
          </Link>
        </div>
      </main>
    </>
  );
}
