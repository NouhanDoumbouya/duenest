import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type ContainerWidth = "narrow" | "default" | "wide";

const widthClass: Record<ContainerWidth, string> = {
  narrow: "max-w-3xl",
  default: "max-w-5xl",
  wide: "max-w-6xl",
};

/**
 * Consistent page width + vertical rhythm wrapper for every authenticated
 * screen. Keeps spacing and max-width uniform so the app reads as one product
 * rather than a set of differently-sized pages.
 */
export function PageContainer({
  children,
  width = "default",
  className,
}: {
  children: ReactNode;
  width?: ContainerWidth;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full space-y-8", widthClass[width], className)}>
      {children}
    </div>
  );
}
