import { cn } from "@/lib/utils";

/**
 * A consistent section heading for the marketing page: a small colored eyebrow,
 * a confident title, and an optional one-line description. Server component —
 * no client JS.
 */
export function SectionHeader({
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "center" | "left";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-2xl",
        align === "center" ? "mx-auto text-center" : "text-left",
        className,
      )}
    >
      {eyebrow && (
        <p className="text-sm font-semibold text-primary">{eyebrow}</p>
      )}
      <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="mt-4 text-pretty text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

/** A small audience/feature pill used in strips and hints. */
export function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-foreground/80 shadow-xs",
        className,
      )}
    >
      {children}
    </span>
  );
}
