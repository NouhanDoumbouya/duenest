import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sections = [
  {
    title: "Beta product",
    body: "DueNest is a beta document and deadline organization product. Features may change as the product matures.",
  },
  {
    title: "User responsibility",
    body: "DueNest helps organize records and reminders, but users remain responsible for verifying deadlines, renewal requirements, and official instructions.",
  },
  {
    title: "Document handling",
    body: "Users should upload only records they are allowed to store and share. Shared links should be created carefully and revoked when no longer needed.",
  },
  {
    title: "No professional advice",
    body: "DueNest does not provide legal, immigration, tax, insurance, or financial advice.",
  },
  {
    title: "Account controls",
    body: "Users can request data exports and account deletion through the product. Deletion is handled as a request so it can be reviewed and cancelled while pending.",
  },
];

export default function TermsPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 lg:py-20">
        <p className="text-sm font-semibold text-primary">Terms</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Terms draft
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          This page is a private beta draft for product clarity. It is not final
          legal text and should be reviewed before public launch.
        </p>

        <div className="mt-10 divide-y divide-border rounded-lg border border-border bg-card">
          {sections.map((section) => (
            <section key={section.title} className="p-6">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {section.body}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link href="/privacy" className={cn(buttonVariants({ variant: "outline" }))}>
            Privacy draft
          </Link>
          <Link href="/security" className={cn(buttonVariants({ variant: "outline" }))}>
            Security page
          </Link>
        </div>
      </main>
    </>
  );
}
