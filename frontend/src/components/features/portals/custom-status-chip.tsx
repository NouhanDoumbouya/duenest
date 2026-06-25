// A small colored chip for a case's custom status. Tints from the status's
// own `color` (a hex string the org chose), with a saturated dot — matching
// the calm look of StatusBadge but allowing an arbitrary org color. Server-
// component safe (no hooks / client state).

import { cn } from "@/lib/utils";
import type { CaseStatus, CaseStatusRef } from "@/types/portals";

/** Either the compact case-status ref or the full status definition. */
type StatusLike = Pick<CaseStatusRef | CaseStatus, "label" | "color">;

/** A safe hex color (#rgb / #rrggbb), falling back to a neutral slate. */
function safeColor(color: string | undefined): string {
  if (color && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color.trim())) {
    return color.trim();
  }
  return "#64748b";
}

export function CustomStatusChip({
  status,
  className,
}: {
  status: StatusLike;
  className?: string;
}) {
  const color = safeColor(status.color);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
      style={{
        // Tint the chip with the org color at low opacity; keep the text the
        // full color so it stays legible on the card background.
        borderColor: `${color}55`,
        backgroundColor: `${color}14`,
        color,
      }}
    >
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      {status.label}
    </span>
  );
}
