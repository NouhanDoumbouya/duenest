import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Anchors are absolute ("/#…") so they also work from sub-pages (e.g. /security),
// navigating home and scrolling rather than doing nothing.
const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "Quick Share", href: "/#quick-share" },
  { label: "Use cases", href: "/#use-cases" },
  { label: "Security", href: "/security" },
  { label: "Pricing", href: "/pricing" },
  { label: "FAQ", href: "/#faq" },
];

/** Top navigation for marketing pages. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
          >
            Sign in
          </Link>
          <Link
            href="/waitlist"
            className={cn(buttonVariants({ size: "lg" }), "shadow-sm")}
          >
            Join waitlist
          </Link>
        </div>
      </div>
    </header>
  );
}
