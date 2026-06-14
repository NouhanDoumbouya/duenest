"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  Eye,
  FileText,
  KeyRound,
  Layers,
  Link2,
  Loader2,
  QrCode,
  Save,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { InlineAlert } from "@/components/ui/product-ui";
import { ApiError } from "@/lib/api";
import { formatFileSize } from "@/lib/document-files";
import { createQuickShare } from "@/lib/quick-share";
import {
  FilePicker,
  type SelectedBundle,
  type SelectedFile,
} from "@/components/quick-share/file-picker";
import { looksSensitive } from "@/components/quick-share/shared";
import { cn } from "@/lib/utils";
import type {
  CreateQuickSharePayload,
  QuickShareMethod,
  QuickShareMode,
  QuickSharePermission,
} from "@/types/quick-share";

type ExpiryPreset = "10m" | "1h" | "24h" | "7d";

const EXPIRY_MS: Record<ExpiryPreset, number> = {
  "10m": 10 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

const EXPIRY_LABEL: Record<ExpiryPreset, string> = {
  "10m": "10 minutes",
  "1h": "1 hour",
  "24h": "24 hours",
  "7d": "7 days",
};

const STEPS = ["Select", "Method", "Protection", "Review"] as const;

export default function NewQuickSharePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [selected, setSelected] = useState<Map<number, SelectedFile>>(new Map());
  const [selectedBundles, setSelectedBundles] = useState<
    Map<number, SelectedBundle>
  >(new Map());
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<QuickShareMode>("account_to_account");
  const [method, setMethod] = useState<QuickShareMethod>("qr");
  const [permission, setPermission] = useState<QuickSharePermission>("view_only");
  const [expiry, setExpiry] = useState<ExpiryPreset>("10m");
  const [accessCodeRequired, setAccessCodeRequired] = useState(false);
  const [oneTime, setOneTime] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [watermark, setWatermark] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedList = useMemo(() => Array.from(selected.values()), [selected]);
  const selectedBundleList = useMemo(
    () => Array.from(selectedBundles.values()),
    [selectedBundles],
  );
  const hasSensitive = selectedList.some((f) => looksSensitive(f.name));

  function toggleFile(file: SelectedFile) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(file.id)) next.delete(file.id);
      else next.set(file.id, file);
      return next;
    });
  }

  function toggleBundle(bundle: SelectedBundle) {
    setSelectedBundles((prev) => {
      const next = new Map(prev);
      if (next.has(bundle.id)) next.delete(bundle.id);
      else next.set(bundle.id, bundle);
      return next;
    });
  }

  function applyRecommended() {
    setPermission("view_only");
    setExpiry("10m");
    setWatermark(true);
    setAccessCodeRequired(false);
    setOneTime(false);
    setRequireApproval(false);
  }

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    const payload: CreateQuickSharePayload = {
      mode,
      share_method: method,
      title: title.trim(),
      permission,
      expires_at: new Date(Date.now() + EXPIRY_MS[expiry]).toISOString(),
      access_code_required: accessCodeRequired,
      one_time: oneTime,
      require_sender_approval: mode === "account_to_account" ? requireApproval : false,
      watermark_enabled: watermark,
      file_ids: selectedList.map((f) => f.id),
      bundle_ids: selectedBundleList.map((b) => b.id),
    };
    try {
      const session = await createQuickShare(payload);
      if (session.access_code) {
        // Stash the one-time plain code so the QR screen can reveal it once.
        try {
          sessionStorage.setItem(`qs-code-${session.id}`, session.access_code);
        } catch {
          /* ignore storage failures */
        }
      }
      router.push(`/dashboard/quick-share/${session.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create this Quick Share.",
      );
      setSubmitting(false);
    }
  }

  const canNext =
    step === 0 ? selected.size > 0 || selectedBundles.size > 0 : true;

  return (
    <PageContainer width="narrow">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/quick-share"
          className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Back to Quick Share"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-page-title">New Quick Share</h1>
          <p className="text-sm text-muted-foreground">
            Pick what to share and how, set protection, then create a secure
            share.
          </p>
        </div>
      </div>

      <Stepper step={step} />

      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      {step === 0 && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
            <h2 className="text-sm font-semibold">Select files to share</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Only the files you pick here are shared. Your wider vault stays
              private.
            </p>
            <div className="mt-4">
              <FilePicker
                selected={selected}
                onToggle={toggleFile}
                selectedBundles={selectedBundles}
                onToggleBundle={toggleBundle}
              />
            </div>
          </div>

          {(selected.size > 0 || selectedBundles.size > 0) && (
            <SelectedSummary
              files={selectedList}
              bundles={selectedBundleList}
              onRemove={(id) => {
                const f = selected.get(id);
                if (f) toggleFile(f);
              }}
              onRemoveBundle={(id) => {
                const b = selectedBundles.get(id);
                if (b) toggleBundle(b);
              }}
            />
          )}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <Field label="How do you want to share?">
            <div className="space-y-2">
              <ChoiceCard
                active={method === "qr"}
                onClick={() => setMethod("qr")}
                icon={<QrCode className="size-4" />}
                title="QR code"
                description="Best in person — they scan it at a counter or across the table."
              />
              <ChoiceCard
                active={method === "link"}
                onClick={() => setMethod("link")}
                icon={<Link2 className="size-4" />}
                title="Secure link"
                description="Best remotely — copy a link to send by message or email."
              />
              <ChoiceCard
                active={method === "code"}
                onClick={() => setMethod("code")}
                icon={<KeyRound className="size-4" />}
                title="DueNest code"
                description="They open Quick Share, choose Receive a code, and type a short code."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              You can use the other methods later too — every share has a QR, a
              link, and a code. This just sets what we show you first.
            </p>
          </Field>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <RecommendedBanner onApply={applyRecommended} />

          <Field label="Title (optional)">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Passport for visa appointment"
              maxLength={120}
            />
          </Field>

          <Field label="Who is this for?">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ChoiceCard
                active={mode === "account_to_account"}
                onClick={() => setMode("account_to_account")}
                icon={<Users className="size-4" />}
                title="A DueNest user"
                description="They sign in, accept, and the files appear in their Shared with me."
              />
              <ChoiceCard
                active={mode === "public_secure_qr"}
                onClick={() => setMode("public_secure_qr")}
                icon={<ShieldCheck className="size-4" />}
                title="Anyone with the QR"
                description="No account needed. Protect with a code and short expiry."
              />
            </div>
          </Field>

          <Field label="What can they do?">
            <div className="space-y-2">
              <ChoiceCard
                active={permission === "view_only"}
                onClick={() => setPermission("view_only")}
                icon={<Eye className="size-4" />}
                title="View only"
                description="Preview in the browser. Downloading is blocked."
              />
              <ChoiceCard
                active={permission === "download_allowed"}
                onClick={() => setPermission("download_allowed")}
                icon={<Download className="size-4" />}
                title="Allow download"
                description="They can preview and download the files."
              />
              <ChoiceCard
                active={permission === "save_copy_allowed"}
                onClick={() => setPermission("save_copy_allowed")}
                icon={<Save className="size-4" />}
                title="Allow save copy"
                description="They can save their own copy into their DueNest vault."
              />
            </div>
            {permission === "save_copy_allowed" && (
              <InlineAlert tone="warn" className="mt-2">
                Saved copies become the recipient&apos;s own copy. You cannot
                revoke their saved copy later.
              </InlineAlert>
            )}
          </Field>

          <Field label="Expires in">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.keys(EXPIRY_LABEL) as ExpiryPreset[]).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setExpiry(preset)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                    expiry === preset
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {EXPIRY_LABEL[preset]}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Protection">
            <div className="space-y-2">
              <ToggleRow
                icon={<KeyRound className="size-4" />}
                title="Require access code"
                description="We generate a short code to share separately from the QR."
                checked={accessCodeRequired}
                onChange={setAccessCodeRequired}
              />
              <ToggleRow
                icon={<Check className="size-4" />}
                title="One-time access"
                description="The share is used up after the first person accepts it."
                checked={oneTime}
                onChange={setOneTime}
              />
              {mode === "account_to_account" && (
                <ToggleRow
                  icon={<UserCheck className="size-4" />}
                  title="Require my approval"
                  description="You approve each person before they can open the files."
                  checked={requireApproval}
                  onChange={setRequireApproval}
                />
              )}
              <ToggleRow
                icon={<ShieldCheck className="size-4" />}
                title="Watermark previews"
                description="Mark previews to deter screenshots and forwarding."
                checked={watermark}
                onChange={setWatermark}
              />
            </div>
          </Field>
        </div>
      )}

      {step === 3 && (
        <ReviewStep
          files={selectedList}
          bundles={selectedBundleList}
          title={title}
          mode={mode}
          method={method}
          permission={permission}
          expiryLabel={EXPIRY_LABEL[expiry]}
          accessCodeRequired={accessCodeRequired}
          oneTime={oneTime}
          requireApproval={requireApproval && mode === "account_to_account"}
          watermark={watermark}
          hasSensitive={hasSensitive}
        />
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
          disabled={submitting}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            size="lg"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext}
          >
            Continue
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button size="lg" onClick={handleCreate} disabled={submitting}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            Create secure share
          </Button>
        )}
      </div>
    </PageContainer>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((label, index) => {
        const done = index < step;
        const active = index === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                done
                  ? "bg-brand-success text-white"
                  : active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                "hidden text-xs font-medium sm:block",
                active ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {index < STEPS.length - 1 && (
              <span className="h-px flex-1 bg-border" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ChoiceCard({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all duration-150",
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          active ? "bg-primary/10 text-primary" : "bg-accent text-accent-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <span
        className={cn(
          "ml-auto mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          active ? "border-primary bg-primary text-primary-foreground" : "border-border",
        )}
      >
        {active && <Check className="size-3" />}
      </span>
    </button>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors",
        checked ? "border-primary/40 bg-primary/5" : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}

function RecommendedBanner({ onApply }: { onApply: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-success/30 bg-brand-success/5 p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-success/10 text-brand-success">
          <ShieldCheck className="size-4" />
        </span>
        <div>
          <p className="text-sm font-medium">Recommended protection</p>
          <p className="text-xs text-muted-foreground">
            View only · 10-minute expiry · watermark on · no download.
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onApply}>
        Apply
      </Button>
    </div>
  );
}

function SelectedSummary({
  files,
  bundles,
  onRemove,
  onRemoveBundle,
}: {
  files: SelectedFile[];
  bundles: SelectedBundle[];
  onRemove: (id: number) => void;
  onRemoveBundle: (id: number) => void;
}) {
  const totalCount = files.length + bundles.length;
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-sm font-semibold">
        {totalCount} item{totalCount === 1 ? "" : "s"} selected
      </p>
      <ul className="mt-3 space-y-2">
        {bundles.map((bundle) => (
          <li
            key={`bundle-${bundle.id}`}
            className="flex items-center gap-3 rounded-lg bg-muted/40 p-2"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <Layers className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{bundle.title}</span>
              <span className="block text-xs text-muted-foreground">
                Bundle · {bundle.requirementCount} item
                {bundle.requirementCount === 1 ? "" : "s"}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onRemoveBundle(bundle.id)}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              aria-label={`Remove ${bundle.title}`}
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
        {files.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-3 rounded-lg bg-muted/40 p-2"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <FileText className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{file.name}</span>
              <span className="block text-xs text-muted-foreground">
                {file.documentTitle} · {formatFileSize(file.size)}
              </span>
            </span>
            {looksSensitive(file.name) && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-brand-amber/10 px-2 py-0.5 text-xs text-brand-amber"
                title="This looks like a sensitive document"
              >
                <AlertTriangle className="size-3" />
                Sensitive
              </span>
            )}
            <button
              type="button"
              onClick={() => onRemove(file.id)}
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              aria-label={`Remove ${file.name}`}
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const METHOD_LABEL: Record<QuickShareMethod, string> = {
  qr: "QR code",
  link: "Secure link",
  code: "DueNest code",
};

function ReviewStep({
  files,
  bundles,
  title,
  mode,
  method,
  permission,
  expiryLabel,
  accessCodeRequired,
  oneTime,
  requireApproval,
  watermark,
  hasSensitive,
}: {
  files: SelectedFile[];
  bundles: SelectedBundle[];
  title: string;
  mode: QuickShareMode;
  method: QuickShareMethod;
  permission: QuickSharePermission;
  expiryLabel: string;
  accessCodeRequired: boolean;
  oneTime: boolean;
  requireApproval: boolean;
  watermark: boolean;
  hasSensitive: boolean;
}) {
  const permLabel =
    permission === "view_only"
      ? "View only"
      : permission === "download_allowed"
        ? "Allow download"
        : "Allow save copy";
  const itemsLabel = [
    files.length > 0 && `${files.length} file${files.length === 1 ? "" : "s"}`,
    bundles.length > 0 &&
      `${bundles.length} bundle${bundles.length === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" + ");
  const rows: [string, string][] = [
    ["Sharing", itemsLabel || "Nothing selected"],
    ["Method", METHOD_LABEL[method]],
    ["Recipient", mode === "account_to_account" ? "A DueNest user" : "Anyone with the link"],
    ["Access", permLabel],
    ["Expires in", expiryLabel],
    ["Access code", accessCodeRequired ? "Required" : "Not required"],
    ["One-time", oneTime ? "Yes" : "No"],
    ...(mode === "account_to_account"
      ? ([["Sender approval", requireApproval ? "Required" : "Not required"]] as [
          string,
          string,
        ][])
      : []),
    ["Watermark", watermark ? "On" : "Off"],
  ];

  return (
    <div className="space-y-4">
      {title && (
        <p className="text-lg font-semibold">{title}</p>
      )}
      {hasSensitive && (
        <InlineAlert tone="warn">
          One or more files look sensitive. Double-check the recipient and
          access settings before you generate the QR.
        </InlineAlert>
      )}
      {permission === "save_copy_allowed" && (
        <InlineAlert tone="warn">
          Save copy is enabled. The recipient can keep their own copy, which you
          will not be able to revoke later.
        </InlineAlert>
      )}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <dl className="divide-y divide-border">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 py-2.5 text-sm"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <p className="text-sm font-semibold">Selected</p>
        <ul className="mt-3 space-y-2">
          {bundles.map((bundle) => (
            <li key={`bundle-${bundle.id}`} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Layers className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {bundle.title}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                Bundle
              </span>
            </li>
          ))}
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <FileText className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
