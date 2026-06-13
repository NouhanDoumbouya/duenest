import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const sections = [
  {
    title: "What DueNest stores",
    body: "DueNest stores the account details you provide and the document records, dates, files, reminders, checklists, bundles, and sharing controls you create.",
  },
  {
    title: "How document data is used",
    body: "Document data is used to show your vault, calculate attention states, build timelines, create reminders, prepare exports, and power the product workflows you request.",
  },
  {
    title: "Sharing",
    body: "Documents and files are not shared by default. When you create a share link, only the selected file or pack is exposed through the configured access controls.",
  },
  {
    title: "Exports and deletion requests",
    body: "You can request a structured metadata export and create a cancellable account deletion request from the data controls area.",
  },
];

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 lg:py-20">
        <p className="text-sm font-semibold text-primary">Privacy</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          Privacy draft
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          This is a beta-ready product draft, not final legal policy. It should
          be reviewed before a public production launch.
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
          <Link href="/security" className={cn(buttonVariants({ variant: "outline" }))}>
            Security page
          </Link>
          <Link href="/terms" className={cn(buttonVariants({ variant: "outline" }))}>
            Terms draft
          </Link>
        </div>
      </main>
    </>
  );
}
