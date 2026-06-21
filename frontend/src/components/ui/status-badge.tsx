import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  resolveStatus,
  TONE_CLASS,
  type StatusKey,
  type StatusTone,
} from "@/lib/status-badge";

/**
 * Canonical status pill. Renders a calm tinted badge with a saturated status
 * dot, built on the shared `Badge` primitive and the single status vocabulary
 * in `lib/status-badge`. Use this everywhere a document/pack/link lifecycle
 * state is shown so colour and wording stay consistent.
 *
 * Usage:
 *   <StatusBadge status="expiring-soon" />            // canonical label
 *   <StatusBadge status="shared">In 2 packs</StatusBadge>  // custom label, info tone
 *   <StatusBadge tone="warning">Blurry scan</StatusBadge>  // one-off, no known status
 *
 * Server-component safe: no hooks, no client state.
 */
type StatusBadgeProps = {
  /** A known lifecycle status; sets both tone and default label. */
  status?: StatusKey;
  /** Override or supply the tone directly (required when `status` is omitted). */
  tone?: StatusTone;
  /** Override the label text. Falls back to the status's canonical label. */
  children?: React.ReactNode;
  /** Show the leading status dot (default true). */
  withDot?: boolean;
  className?: string;
};

export function StatusBadge({
  status,
  tone,
  children,
  withDot = true,
  className,
}: StatusBadgeProps) {
  const resolved = status ? resolveStatus(status) : undefined;
  const effectiveTone: StatusTone = tone ?? resolved?.tone ?? "neutral";
  const toneClass = TONE_CLASS[effectiveTone];
  const label = children ?? resolved?.label ?? "";

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 border-transparent", toneClass.badge, className)}
    >
      {withDot && (
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", toneClass.dot)}
        />
      )}
      {label}
    </Badge>
  );
}
