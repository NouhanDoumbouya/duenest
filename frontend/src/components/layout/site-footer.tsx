import Link from "next/link";

import { Logo } from "@/components/layout/logo";

type FooterLink = { label: string; href: string };

const columns: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Life Radar", href: "/#life-radar" },
      { label: "Vault", href: "/#vault" },
      { label: "SafeSend", href: "/#safesend" },
      { label: "Emergency Protocol", href: "/#emergency" },
      { label: "Deadlines & Renewals", href: "/#deadlines-renewals" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    heading: "Use cases",
    links: [
      { label: "Students & visas", href: "/#use-cases" },
      { label: "Families", href: "/#use-cases" },
      { label: "Freelancers", href: "/#use-cases" },
      { label: "Organizations", href: "/#use-cases" },
    ],
  },
  {
    heading: "Trust & legal",
    links: [
      { label: "Trust & Security", href: "/security" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Data & deletion", href: "/data-deletion" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    heading: "Get started",
    links: [
      { label: "Join the waitlist", href: "/waitlist" },
      { label: "Sign in", href: "/login" },
    ],
  },
];

/** Shared footer for all public marketing and legal pages. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
              A calm, secure command center for your important documents,
              renewals, applications, and secure sharing.
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.heading} aria-label={column.heading}>
              <p className="text-xs font-semibold tracking-wide text-foreground uppercase">
                {column.heading}
              </p>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={`${column.heading}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} DueNest. Documents, deadlines, and
            renewals in one calm place.
          </p>
          <p>Private beta · Legal pages are drafts under review.</p>
        </div>
      </div>
    </footer>
  );
}
