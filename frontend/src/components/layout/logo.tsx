import Link from "next/link";
import Image from "next/image";

import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";

const markPx: Record<LogoSize, number> = {
  sm: 28,
  md: 32,
  lg: 36,
};

const wordSize: Record<LogoSize, string> = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-xl",
};

/**
 * The CertaNest brand mark (Secure Nest Mark).
 * Use `onDark` on dark surfaces to swap to the light-tile variant.
 */
export function LogoMark({
  size = "md",
  onDark = false,
  className,
}: {
  size?: LogoSize;
  onDark?: boolean;
  className?: string;
}) {
  const px = markPx[size];
  return (
    <Image
      src={onDark ? "/brand/certanest-icon-light.svg" : "/brand/certanest-icon.svg"}
      alt="CertaNest"
      width={px}
      height={px}
      priority
      className={cn("rounded-[0.6rem]", className)}
    />
  );
}

/** Full logo (mark + wordmark) that links home by default. */
export function Logo({
  size = "md",
  href = "/",
  onDark = false,
  className,
}: {
  size?: LogoSize;
  href?: string | null;
  onDark?: boolean;
  className?: string;
}) {
  const content = (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark size={size} onDark={onDark} />
      <span
        className={cn(
          "font-heading font-semibold tracking-tight",
          onDark ? "text-white" : "text-foreground",
          wordSize[size],
        )}
      >
        CertaNest
      </span>
    </span>
  );

  if (href === null) return content;
  return <Link href={href}>{content}</Link>;
}
