import type { Metadata } from "next";
import Link from "next/link";
import {
  LifeBuoy,
  Mail,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Contact & Support",
  description:
    "How to reach DueNest for support, feedback, and security reports during the private beta.",
  alternates: { canonical: "/contact" },
};

const SUPPORT_EMAIL = "support@duenest.app";
const SECURITY_EMAIL = "security@duenest.app";

const channels = [
  {
    icon: Mail,
    title: "Support",
    description:
      "Questions about your account, the beta, or how something works.",
    action: { label: SUPPORT_EMAIL, href: `mailto:${SUPPORT_EMAIL}` },
  },
  {
    icon: MessageSquare,
    title: "Feedback",
    description:
      "Signed-in beta users can send product feedback from inside the app.",
    action: { label: "Open the app", href: "/login" },
  },
  {
    icon: ShieldCheck,
    title: "Security reports",
    description:
      "Report a suspected security issue privately, with steps to reproduce.",
    action: { label: SECURITY_EMAIL, href: `mailto:${SECURITY_EMAIL}` },
  },
];

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 lg:py-20">
        <p className="text-sm font-semibold text-primary">Contact</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance">
          Contact &amp; support
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">
          DueNest is in a private beta, so support is hands-on and may take a
          little time. We read everything and use it to make the product better.
        </p>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-brand-amber/30 bg-brand-amber/5 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-brand-amber" />
          <p>
            Please do not send passwords, access codes, share tokens, or
            sensitive document contents through support messages. We will never
            ask you for them.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {channels.map((channel) => {
            const Icon = channel.icon;
            return (
              <div
                key={channel.title}
                className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-card"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="size-5" />
                </span>
                <h2 className="font-heading text-base font-semibold">
                  {channel.title}
                </h2>
                <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
                  {channel.description}
                </p>
                <Link
                  href={channel.action.href}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  {channel.action.label}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex items-start gap-3 rounded-2xl border border-border bg-card p-6">
          <LifeBuoy className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Beta support expectations</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              We aim to reply as quickly as we can, but response times vary
              during the private beta. For anything urgent and official (legal,
              medical, immigration, or financial), please contact the relevant
              authority directly — DueNest is an organization tool, not an
              emergency or advisory service.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link href="/security" className={cn(buttonVariants({ variant: "outline" }))}>
            Trust &amp; Security
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
