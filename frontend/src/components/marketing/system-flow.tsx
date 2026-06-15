import {
  CreditCard,
  FileText,
  LifeBuoy,
  QrCode,
  Radar,
} from "lucide-react";

import { cn } from "@/lib/utils";

const nodes = [
  { icon: FileText, label: "Vault", tag: "Add it once" },
  { icon: Radar, label: "Life Radar", tag: "Stays watched" },
  { icon: QrCode, label: "SafeSend", tag: "Share on demand" },
  { icon: LifeBuoy, label: "Emergency", tag: "Ready if needed" },
  { icon: CreditCard, label: "Money Radar", tag: "Catch charges" },
];

/**
 * The signature "how it connects" diagram — five product pillars on one
 * connected line. Horizontal on desktop, a vertical chain on mobile. Static
 * server component.
 */
export function SystemFlow() {
  return (
    <div className="flex flex-col items-stretch gap-0 sm:flex-row">
      {nodes.map((node, i) => {
        const Icon = node.icon;
        return (
          <div key={node.label} className="flex flex-col sm:flex-1 sm:flex-row">
            <div className="flex flex-1 flex-col items-center gap-2.5 rounded-2xl border border-border bg-card p-5 text-center shadow-card">
              <span className="flex size-11 items-center justify-center rounded-xl bg-brand-navy text-brand-teal">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold">{node.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{node.tag}</p>
              </div>
            </div>
            {i < nodes.length - 1 && <Connector />}
          </div>
        );
      })}
    </div>
  );
}

function Connector() {
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        // Vertical chain on mobile, a thin horizontal link on desktop.
        "py-1.5 sm:w-8 sm:py-0 lg:w-10",
      )}
    >
      <span className="h-5 w-px bg-gradient-to-b from-brand-teal/50 to-primary/40 sm:h-px sm:w-full sm:bg-gradient-to-r" />
    </div>
  );
}
