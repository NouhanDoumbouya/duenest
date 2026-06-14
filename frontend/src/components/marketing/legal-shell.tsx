import Link from "next/link";
import { ShieldAlert } from "lucide-react";

import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export type LegalSection = { title: string; body: string | string[] };

/**
 * Shared shell for DueNest's public legal/trust drafts. Renders a consistent
 * header, a visible "beta draft — review before launch" banner, the section
 * list, and the shared footer. Body entries may be a string or a list of
 * paragraphs/bullets.
 */
export function LegalShell({
  eyebrow,
  title,
  intro,
  updated,
  sections,
  footerLinks,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated?: string;
  sections: LegalSection[];
  footerLinks?: { label: string; href: string }[];
}) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-14 sm:px-6 lg:py-20">
        <p className="text-sm font-semibold text-primary">{eyebrow}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance">
          {title}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-pretty text-muted-foreground">
          {intro}
        </p>

        <div className="mt-6 flex items-start gap-3 rounded-xl border border-brand-amber/30 bg-brand-amber/5 p-4 text-sm text-muted-foreground">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-brand-amber" />
          <p>
            This is a private-beta draft for product clarity, not final legal
            text. It should be reviewed by a qualified professional before public
            launch.
            {updated ? ` Last updated ${updated}.` : ""}
          </p>
        </div>

        <div className="mt-10 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {sections.map((section) => (
            <section key={section.title} className="p-6">
              <h2 className="text-lg font-semibold">{section.title}</h2>
              {Array.isArray(section.body) ? (
                <ul className="mt-3 space-y-2">
                  {section.body.map((item, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground"
                    >
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-border" />
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {section.body}
                </p>
              )}
            </section>
          ))}
        </div>

        {footerLinks && footerLinks.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="font-medium text-primary hover:underline"
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
