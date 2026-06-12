import Link from "next/link";

import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";

const markSize: Record<LogoSize, string> = {
  sm: "size-7",
  md: "size-8",
  lg: "size-9",
};

const wordSize: Record<LogoSize, string> = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
};

/** The DueNest mark: a calm "nest" glyph on a deep navy tile. */
export function LogoMark({
  size = "md",
  className,
}: {
  size?: LogoSize;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative flex items-center justify-center rounded-[0.6rem] bg-brand-navy shadow-sm ring-1 ring-white/10",
        markSize[size],
        className,
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="size-1/2 text-brand-teal"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      >
        {/* nested arcs = a nest sheltering what matters */}
        <path d="M3 13a9 9 0 0 1 18 0" />
        <path d="M7 13a5 5 0 0 1 10 0" className="text-white/80" />
        <circle cx="12" cy="13" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

/** Full logo (mark + wordmark) that links home by default. */
export function Logo({
  size = "md",
  href = "/",
  className,
}: {
  size?: LogoSize;
  href?: string | null;
  className?: string;
}) {
  const content = (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark size={size} />
      <span
        className={cn(
          "font-heading font-semibold tracking-tight text-foreground",
          wordSize[size],
        )}
      >
        DueNest
      </span>
    </span>
  );

  if (href === null) return content;
  return <Link href={href}>{content}</Link>;
}
