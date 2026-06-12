import { CalendarClock, FileText, RefreshCw, ShieldCheck } from "lucide-react";

/**
 * A lightweight, illustrative mock of the DueNest dashboard for the hero.
 *
 * This is intentionally static and decorative — it shows where the product is
 * going without implying any real data or completed backend functionality.
 */
export function AppPreview() {
  const items = [
    {
      icon: FileText,
      title: "Passport",
      meta: "Expires in 24 days",
      tone: "amber" as const,
    },
    {
      icon: RefreshCw,
      title: "Car insurance",
      meta: "Renews in 3 weeks",
      tone: "blue" as const,
    },
    {
      icon: CalendarClock,
      title: "Visa application",
      meta: "Due next month",
      tone: "neutral" as const,
    },
  ];

  const toneClasses: Record<string, string> = {
    amber: "bg-brand-amber/15 text-brand-amber",
    blue: "bg-primary/10 text-primary",
    neutral: "bg-muted text-muted-foreground",
  };

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-4 -z-10 rounded-[2rem] bg-gradient-to-tr from-primary/10 via-brand-teal/10 to-transparent blur-2xl"
      />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-foreground/10">
        {/* window chrome */}
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/50 px-4 py-3">
          <span className="size-2.5 rounded-full bg-destructive/40" />
          <span className="size-2.5 rounded-full bg-brand-amber/50" />
          <span className="size-2.5 rounded-full bg-brand-success/50" />
          <span className="ml-3 text-xs text-muted-foreground">
            app.duenest.com/dashboard
          </span>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-heading text-sm font-semibold">Upcoming</p>
              <p className="text-xs text-muted-foreground">
                3 items need attention
              </p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-brand-success/10 px-2.5 py-1 text-xs font-medium text-brand-success">
              <ShieldCheck className="size-3.5" />
              On track
            </span>
          </div>

          <div className="space-y-2.5">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-background px-3 py-2.5"
                >
                  <span
                    className={`flex size-9 items-center justify-center rounded-lg ${toneClasses[item.tone]}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.meta}</p>
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    Track
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
