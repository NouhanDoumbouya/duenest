import type { ComponentType, MouseEventHandler, ReactNode } from "react";

import { cn } from "@/lib/utils";

type ProductTone = "default" | "good" | "warn" | "danger" | "secure";

const toneClasses: Record<ProductTone, string> = {
  default: "border-border bg-card text-foreground",
  good: "border-brand-success/25 bg-brand-success/10 text-brand-success",
  warn: "border-brand-amber/30 bg-brand-amber/10 text-brand-amber",
  danger: "border-destructive/25 bg-destructive/10 text-destructive",
  secure: "border-primary/20 bg-primary/10 text-primary",
};

const iconToneClasses: Record<ProductTone, string> = {
  default: "bg-muted text-muted-foreground",
  good: "bg-brand-success/10 text-brand-success",
  warn: "bg-brand-amber/15 text-brand-amber",
  danger: "bg-destructive/10 text-destructive",
  secure: "bg-primary/10 text-primary",
};

export function ProductMetric({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ComponentType<{ className?: string }>;
  tone?: ProductTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 shadow-card transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-elevated motion-reduce:transform-none motion-reduce:transition-none",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon && (
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-lg",
              iconToneClasses[tone],
            )}
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold leading-none">{value}</p>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TrustNotice({
  icon: Icon,
  title,
  children,
  tone = "secure",
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  children: ReactNode;
  tone?: ProductTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-4 text-sm shadow-card",
        toneClasses[tone],
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <div className="mt-1 leading-relaxed text-muted-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

export function InlineAlert({
  children,
  tone = "danger",
  className,
}: {
  children: ReactNode;
  tone?: ProductTone;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-lg border px-4 py-3 text-sm",
        toneClasses[tone],
        className,
      )}
      role={tone === "danger" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-border bg-card p-1 shadow-xs",
        className,
      )}
      role="tablist"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none",
            value === option.value
              ? "bg-primary text-primary-foreground shadow-sm shadow-primary/15"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function StatusDot({
  tone = "default",
  label,
}: {
  tone?: ProductTone;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <span
        className={cn(
          "size-2 rounded-full",
          tone === "good" && "bg-brand-success",
          tone === "warn" && "bg-brand-amber",
          tone === "danger" && "bg-destructive",
          tone === "secure" && "bg-primary",
          tone === "default" && "bg-muted-foreground/50",
        )}
      />
      {label}
    </span>
  );
}

export function DataRow({
  label,
  value,
  meta,
  action,
  className,
}: {
  label: ReactNode;
  value?: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-xs transition-colors duration-150 hover:border-primary/30 motion-reduce:transition-none sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{label}</div>
        {meta && <div className="mt-1 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {(value || action) && (
        <div className="flex shrink-0 items-center gap-2">
          {value && <div>{value}</div>}
          {action}
        </div>
      )}
    </div>
  );
}

export function SectionToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-card sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DrawerBackdrop({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-150 motion-reduce:animate-none"
      onClick={onClose}
    >
      {children}
    </div>
  );
}

export function DrawerPanel({
  children,
  className,
  label,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onClick?: MouseEventHandler<HTMLElement>;
}) {
  return (
    <aside
      className={cn(
        "h-full w-full max-w-md overflow-y-auto border-l border-border bg-card p-5 shadow-floating animate-in slide-in-from-right-4 duration-200 ease-out motion-reduce:animate-none",
        className,
      )}
      onClick={onClick}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {children}
    </aside>
  );
}
