import type { Metadata } from "next";
import Link from "next/link";
import {
  FileText,
  KeyRound,
  Lock,
  ShieldAlert,
  ShieldCheck,
  TimerReset,
  UserCheck,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Eyebrow } from "@/components/marketing/section";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Trust & Security",
  description:
    "How CertaNest protects your documents: encryption at rest, owner-scoped access, revocable and expiring sharing, and honest limitations.",
  alternates: { canonical: "/security" },
};

const controls = [
  {
    icon: Lock,
    title: "Encrypted at rest",
    description:
      "Uploaded files are encrypted at rest. CertaNest decrypts a file only after its permission checks pass.",
  },
  {
    icon: UserCheck,
    title: "Owner-scoped access",
    description:
      "Documents, files, reminders, checklists, application packs, exports, and account controls are scoped to the signed-in user.",
  },
  {
    icon: ShieldCheck,
    title: "Selected-item sharing",
    description:
      "Sharing exposes only the items you choose. Your wider vault is never shared by default.",
  },
  {
    icon: TimerReset,
    title: "Expiry & revocation",
    description:
      "Shares and emergency access can expire and be revoked. Revoked or expired access is blocked server-side.",
  },
  {
    icon: KeyRound,
    title: "Hashed access codes",
    description:
      "Optional access codes for shared items are stored hashed, never in plain text, and verified on the server.",
  },
  {
    icon: FileText,
    title: "Secret-free exports",
    description:
      "Structured exports include document metadata and summaries, not raw storage paths or share access codes.",
  },
];

const limitations = [
  "Watermarking can help discourage misuse, but no web app can fully prevent screenshots on every device.",
  "Public links remain useful only because of the protections you set — use expiry, revocation, and access codes appropriately.",
  "Do not store full card numbers or banking credentials in CertaNest.",
  "Do not paste passwords or access codes into feedback or support messages.",
  "CertaNest does not provide legal, medical, immigration, tax, or financial advice.",
];

const notDoing = [
  "We do not claim zero-knowledge or 'military-grade' encryption.",
  "We do not claim to make screenshots impossible.",
  "We do not process payments or connect to your bank or card accounts.",
  "We do not sell your documents.",
  "We do not show raw IP addresses in normal internal product views.",
];

export default function SecurityPage() {
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="max-w-2xl">
          <Eyebrow>Trust &amp; Security</Eyebrow>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance">
            Built for sensitive life-admin
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-pretty text-muted-foreground">
            CertaNest is built around private, user-owned document workflows. This
            page is an honest beta transparency draft and should receive legal
            and security review before wider public launch.
          </p>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-brand-amber/30 bg-brand-amber/5 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-brand-amber" />
          <p>
            We describe only safeguards that are actually implemented. Where a
            protection has limits, we say so plainly below.
          </p>
        </div>

        <h2 className="mt-12 text-xl font-semibold">How CertaNest protects your data</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">Honest limitations</h2>
            <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              {limitations.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-amber" />
                  {item}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold">What CertaNest does not do</h2>
            <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              {notDoing.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Current beta boundaries</h2>
          <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li>Full raw-file archive exports are not available yet.</li>
            <li>
              Frontend token handling is acceptable for development; production
              should move toward HttpOnly cookie handling.
            </li>
            <li>
              AI-assisted document processing is not enabled as a third-party
              file-processing pipeline in this beta.
            </li>
          </ul>
        </section>

        <section className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Responsible disclosure</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            If you believe you have found a security issue, please report it
            privately through the Contact page rather than disclosing it
            publicly. Do not include real access codes, share tokens, or document
            contents in your report — a clear description and steps to reproduce
            are enough.
          </p>
        </section>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link href="/privacy" className={cn(buttonVariants({ variant: "outline" }))}>
            Privacy draft
          </Link>
          <Link href="/data-deletion" className={cn(buttonVariants({ variant: "outline" }))}>
            Data &amp; deletion
          </Link>
          <Link href="/waitlist" className={cn(buttonVariants())}>
            Join the waitlist
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
