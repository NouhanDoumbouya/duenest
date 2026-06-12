import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Small inline logo mark — a stylized nest using the brand teal. */
function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg bg-brand-navy text-sm font-bold text-white"
      >
        <span className="text-brand-teal">D</span>
      </span>
      <span className="font-heading text-lg font-semibold tracking-tight">
        DueNest
      </span>
    </Link>
  );
}

/** Top navigation for marketing pages. */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />

        <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
          <a href="#features" className="transition-colors hover:text-foreground">
            Features
          </a>
          <a href="#how" className="transition-colors hover:text-foreground">
            How it works
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className={cn(buttonVariants({ size: "lg" }))}
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
