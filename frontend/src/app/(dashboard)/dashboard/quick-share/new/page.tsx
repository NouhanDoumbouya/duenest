"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Download,
  Eye,
  FileText,
  IdCard,
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
import {
  formatFileSize,
  getDocumentFiles,
  getFileInbox,
} from "@/lib/document-files";
import { getBundle } from "@/lib/renewal-workspace";
import { createQuickShare } from "@/lib/quick-share";
import { setQuickShareHandoff } from "@/lib/quick-share-handoff";
import {
  FilePicker,
  type SelectedBundle,
  type SelectedFile,
} from "@/components/quick-share/file-picker";
import {
  addRecentRecipient,
  buildSafeSendRecommendation,
  buildShareReadinessChecks,
  buildSharePackageOptions,
  detectSensitiveShareItems,
  EXPIRY_LABEL,
  getSharePackageLabel,
  isLongExpiry,
  loadLastShareSettings,
  loadRecentRecipients,
  looksSensitive,
  packageLeadMethod,
  packageMethods,
  PERMISSION_PRESETS,
  PURPOSE_OPTIONS,
  purposeLabel,
  resolveExpiry,
  saveLastShareSettings,
  type ExpiryPreset,
  type PermissionPreset,
  type SavedShareSettings,
  type SharePackage,
  type SharePurpose,
} from "@/lib/safesend";
import { cn } from "@/lib/utils";
import type {
  CreateQuickSharePayload,
  QuickShareMode,
  QuickSharePermission,
} from "@/types/quick-share";

const STEPS = ["Select", "Send", "Protect", "Review"] as const;

const PERMISSION_LABEL: Record<QuickSharePermission, string> = {
  view_only: "View only",
  download_allowed: "Allow download",
  save_copy_allowed: "Allow save copy",
};

export default function NewQuickSharePage() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [selected, setSelected] = useState<Map<number, SelectedFile>>(new Map());
  const [selectedBundles, setSelectedBundles] = useState<
    Map<number, SelectedBundle>
  >(new Map());
  const [title, setTitle] = useState("");
  const [recipient, setRecipient] = useState("");
  const [mode, setMode] = useState<QuickShareMode>("account_to_account");
  const [pkg, setPkg] = useState<SharePackage>("qr_link");
  const [purpose, setPurpose] = useState<SharePurpose>("");
  const [preset, setPreset] = useState<PermissionPreset>("balanced");
  const [permission, setPermission] = useState<QuickSharePermission>("view_only");
  const [expiry, setExpiry] = useState<ExpiryPreset>("24h");
  const [customExpiry, setCustomExpiry] = useState("");
  const [accessCodeRequired, setAccessCodeRequired] = useState(false);
  const [oneTime, setOneTime] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [watermark, setWatermark] = useState(true);
  const [showCustom, setShowCustom] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recentRecipients, setRecentRecipients] = useState<string[]>([]);
  const [savedSettings, setSavedSettings] = useState<SavedShareSettings | null>(
    null,
  );

  // Restore this device's recent recipient labels + last-used settings (both are
  // stored only locally; nothing is fetched from the server). Deferred to a
  // microtask so we never setState synchronously inside the effect, and read
  // after mount to avoid an SSR/client hydration mismatch.
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setRecentRecipients(loadRecentRecipients());
      setSavedSettings(loadLastShareSettings());
    });
    return () => {
      active = false;
    };
  }, []);

  // Preselect a file handed off from the scanner
  // (/dashboard/quick-share/new?file=<id>) so "Share safely" opens a draft with
  // the scan already chosen. Best-effort and non-blocking: if the file can't be
  // resolved we simply start with an empty selection. setState lands in the
  // async .then, never synchronously in the effect body.
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("file");
    if (!target) return;
    const id = Number(target);
    if (!Number.isFinite(id)) return;
    let active = true;
    getFileInbox()
      .then((res) => {
        if (!active) return;
        const match = res.results.find((file) => file.id === id);
        if (!match) return;
        setSelected((prev) => {
          if (prev.has(match.id)) return prev;
          const next = new Map(prev);
          next.set(match.id, {
            id: match.id,
            name: match.original_filename,
            size: match.file_size,
            documentTitle: match.document_title || match.original_filename,
          });
          return next;
        });
      })
      .catch(() => {
        /* non-blocking: start empty if the handoff file can't be loaded */
      });
    return () => {
      active = false;
    };
  }, []);

  // Preselect a whole pack handed off from the bundle detail
  // (/dashboard/quick-share/new?bundle=<id>) so "Share pack safely" opens a
  // draft with the pack already chosen. Best-effort and non-blocking; the user
  // still reviews access, recipients, and expiry — no link is created here.
  useEffect(() => {
    const target = new URLSearchParams(window.location.search).get("bundle");
    if (!target) return;
    const id = Number(target);
    if (!Number.isFinite(id)) return;
    let active = true;
    getBundle(id)
      .then((bundle) => {
        if (!active) return;
        setSelectedBundles((prev) => {
          if (prev.has(bundle.id)) return prev;
          const next = new Map(prev);
          next.set(bundle.id, {
            id: bundle.id,
            title: bundle.title,
            requirementCount: bundle.requirement_count,
            incomplete: bundle.missing_required_count > 0,
          });
          return next;
        });
      })
      .catch(() => {
        /* non-blocking: start empty if the handoff pack can't be loaded */
      });
    return () => {
      active = false;
    };
  }, []);

  // Preselect Vault documents handed off from the bulk "Share safely" action
  // (/dashboard/quick-share/new?documents=1,2,3). Each document's files are
  // added to the draft; the user still reviews recipients/access/expiry and
  // confirms — no link is created here.
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("documents");
    if (!raw) return;
    const ids = raw
      .split(",")
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n));
    if (ids.length === 0) return;
    let active = true;
    Promise.all(
      ids.map((id) =>
        getDocumentFiles(id)
          .then((page) => page.results)
          .catch(() => []),
      ),
    ).then((lists) => {
      if (!active) return;
      const files = lists.flat().filter((f) => !f.is_trashed);
      if (files.length === 0) return;
      setSelected((prev) => {
        const next = new Map(prev);
        for (const f of files) {
          if (!next.has(f.id)) {
            next.set(f.id, {
              id: f.id,
              name: f.original_filename,
              size: f.file_size,
              documentTitle: f.document_title || f.original_filename,
            });
          }
        }
        return next;
      });
    });
    return () => {
      active = false;
    };
  }, []);

  function applySavedSettings() {
    if (!savedSettings) return;
    setPkg(savedSettings.pkg);
    setPreset(savedSettings.preset);
    setPermission(savedSettings.permission);
    setExpiry(savedSettings.expiry);
    setWatermark(savedSettings.watermark);
    setAccessCodeRequired(savedSettings.accessCode);
  }

  const selectedList = useMemo(() => Array.from(selected.values()), [selected]);
  const selectedBundleList = useMemo(
    () => Array.from(selectedBundles.values()),
    [selectedBundles],
  );
  const itemCount = selectedList.length + selectedBundleList.length;
  // Earliest selectable custom expiry (5 minutes out). Computed once per mount
  // via a lazy initializer so it stays out of the render path.
  const [customExpiryMin] = useState(() =>
    new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16),
  );

  // Sensitivity considers file names, the parent document type, and bundle
  // titles (e.g. a "Passport" document type flags an otherwise plain filename).
  const sensitiveNames = useMemo(
    () =>
      detectSensitiveShareItems([
        ...selectedList.map((f) => ({
          name: `${f.name} ${f.documentType ?? ""} ${f.documentTitle}`,
        })),
        ...selectedBundleList.map((b) => ({ name: b.title })),
      ]),
    [selectedList, selectedBundleList],
  );
  const hasSensitive = sensitiveNames.length > 0;

  const recommendation = useMemo(
    () =>
      buildSafeSendRecommendation({
        sensitive: hasSensitive,
        purpose,
        forDueNestUser: mode === "account_to_account",
        itemCount,
      }),
    [hasSensitive, purpose, mode, itemCount],
  );

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

  function applyPreset(id: PermissionPreset) {
    setPreset(id);
    if (id === "custom") {
      setShowCustom(true);
      return;
    }
    const spec = PERMISSION_PRESETS[id];
    setPermission(spec.permission);
    setExpiry(spec.expiry);
    setWatermark(spec.watermark);
    setAccessCodeRequired(spec.accessCodeRecommended);
  }

  function applyRecommendation() {
    setPkg(recommendation.package);
    applyPreset(recommendation.presetId);
  }

  // When the user edits a granular control, the preset becomes "custom".
  function markCustom() {
    setPreset("custom");
  }

  async function handleCreate() {
    setSubmitting(true);
    setError(null);
    const payload: CreateQuickSharePayload = {
      mode,
      share_method: packageLeadMethod(pkg),
      title: title.trim(),
      // Persist the human label (e.g. "Visa") so it reads cleanly in the detail
      // page and the recipient viewer; the raw key only drives recommendations.
      purpose: purposeLabel(purpose),
      recipient_label: recipient.trim(),
      permission,
      expires_at: resolveExpiry(expiry, customExpiry),
      access_code_required: accessCodeRequired,
      one_time: oneTime,
      require_sender_approval:
        mode === "account_to_account" ? requireApproval : false,
      watermark_enabled: watermark,
      file_ids: selectedList.map((f) => f.id),
      bundle_ids: selectedBundleList.map((b) => b.id),
    };
    try {
      const session = await createQuickShare(payload);
      // Remember this device's choices for next time (local only).
      saveLastShareSettings({
        pkg,
        preset,
        permission,
        expiry,
        watermark,
        accessCode: accessCodeRequired,
      });
      if (recipient.trim()) addRecentRecipient(recipient.trim());
      // SEC-011: hand the one-time plain access code to the detail page in
      // memory only — never persisted to sessionStorage/localStorage.
      setQuickShareHandoff({
        id: session.id,
        code: session.access_code || undefined,
        pkg,
      });
      router.push(`/dashboard/quick-share/${session.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create this Quick Share.",
      );
      setSubmitting(false);
    }
  }

  const canNext = step === 0 ? itemCount > 0 : true;
  const expiryLabel =
    expiry === "custom" && customExpiry
      ? new Date(customExpiry).toLocaleString()
      : EXPIRY_LABEL[expiry];

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
          <h1 className="text-page-title">Create secure share</h1>
          <p className="text-sm text-muted-foreground">
            Share safely. Stay in control. Revoke anytime.
          </p>
        </div>
      </div>

      <Stepper step={step} />

      {error && <InlineAlert tone="danger">{error}</InlineAlert>}

      {/* Step 0 — Select */}
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

          {itemCount > 0 && (
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

          {selectedList.length > 1 && selectedBundleList.length === 0 && (
            <InlineAlert tone="secure">
              Sharing several files? A bundle keeps them together and is easier to
              revoke as one — you can still continue with individual files.
            </InlineAlert>
          )}
        </div>
      )}

      {/* Step 1 — Send (share package) */}
      {step === 1 && (
        <div className="space-y-5">
          <Field label="Choose what to send">
            <div className="space-y-2">
              {buildSharePackageOptions().map((option) => (
                <ChoiceCard
                  key={option.id}
                  active={pkg === option.id}
                  onClick={() => setPkg(option.id)}
                  icon={<PackageIcon id={option.id} />}
                  title={option.label}
                  description={option.helper}
                  recommended={option.recommended}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Every share always has a QR, a secure link, and a DueNest code. This
              just sets what we surface first. QR is best in person · link is best
              for chat apps · code is best for DueNest users.
            </p>
          </Field>
        </div>
      )}

      {/* Step 2 — Protect */}
      {step === 2 && (
        <div className="space-y-5">
          <Field label="What is this share for?">
            <div className="flex flex-wrap gap-1.5">
              {PURPOSE_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={purpose === p.id}
                  onClick={() => setPurpose(purpose === p.id ? "" : p.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    purpose === p.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Optional — we use this to recommend safer defaults.
            </p>
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

          <SafeSendRecommendation
            reason={recommendation.reason}
            presetLabel={PERMISSION_PRESETS[recommendation.presetId].label}
            packageLabel={getSharePackageLabel(recommendation.package)}
            onApply={applyRecommendation}
          />

          {savedSettings && (
            <button
              type="button"
              onClick={applySavedSettings}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-medium text-muted-foreground shadow-xs transition-colors hover:bg-muted"
            >
              <Sparkles className="size-3.5" />
              Use my last settings
            </button>
          )}

          <Field label="Protection level">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(["strict", "balanced", "flexible"] as const).map((id) => (
                <PresetCard
                  key={id}
                  active={preset === id}
                  recommended={id === recommendation.presetId}
                  spec={PERMISSION_PRESETS[id]}
                  onClick={() => applyPreset(id)}
                />
              ))}
              <button
                type="button"
                aria-pressed={preset === "custom"}
                onClick={() => applyPreset("custom")}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all",
                  preset === "custom"
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:bg-muted/50",
                )}
              >
                <span className="text-sm font-medium">Custom</span>
                <span className="text-xs text-muted-foreground">
                  Control every setting yourself.
                </span>
              </button>
            </div>
          </Field>

          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50"
            aria-expanded={showCustom}
          >
            <span className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-muted-foreground" />
              Customize protection
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                showCustom && "rotate-180",
              )}
            />
          </button>

          {showCustom && (
            <div className="space-y-5 rounded-2xl border border-border bg-card/50 p-4">
              <Field label="Title (optional)">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Passport for visa appointment"
                  maxLength={120}
                />
              </Field>

              <Field label="Recipient (optional)">
                <Input
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="e.g. Embassy of Canada, or Jane Doe"
                  maxLength={120}
                />
                {recentRecipients.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {recentRecipients.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRecipient(r)}
                        className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  A note about who this is for. Shown to the recipient for context
                  — never used to look anyone up. Recent labels are remembered only
                  on this device.
                </p>
              </Field>

              <Field label="What can they do?">
                <div className="space-y-2">
                  <ChoiceCard
                    active={permission === "view_only"}
                    onClick={() => {
                      setPermission("view_only");
                      markCustom();
                    }}
                    icon={<Eye className="size-4" />}
                    title="Can view"
                    description="Preview in the browser. Downloading is blocked."
                  />
                  <ChoiceCard
                    active={permission === "download_allowed"}
                    onClick={() => {
                      setPermission("download_allowed");
                      markCustom();
                    }}
                    icon={<Download className="size-4" />}
                    title="Can download"
                    description="They can preview and download the files."
                  />
                  <ChoiceCard
                    active={permission === "save_copy_allowed"}
                    onClick={() => {
                      setPermission("save_copy_allowed");
                      markCustom();
                    }}
                    icon={<Save className="size-4" />}
                    title="Can save a copy"
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
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {(["10m", "1h", "24h", "3d", "7d", "custom"] as ExpiryPreset[]).map(
                    (p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setExpiry(p);
                          markCustom();
                        }}
                        className={cn(
                          "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                          expiry === p
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-card text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {EXPIRY_LABEL[p]}
                      </button>
                    ),
                  )}
                </div>
                {expiry === "custom" && (
                  <Input
                    type="datetime-local"
                    value={customExpiry}
                    min={customExpiryMin}
                    onChange={(e) => setCustomExpiry(e.target.value)}
                    className="mt-2"
                  />
                )}
                {isLongExpiry(expiry, customExpiry) && (
                  <InlineAlert tone="warn" className="mt-2">
                    That keeps access open for over a week. For sensitive
                    documents, a shorter window is safer.
                  </InlineAlert>
                )}
              </Field>

              <Field label="More protection options">
                <div className="space-y-2">
                  <ToggleRow
                    icon={<KeyRound className="size-4" />}
                    title="Require access code"
                    description="We generate a short code to share separately from the QR."
                    checked={accessCodeRequired}
                    onChange={(v) => {
                      setAccessCodeRequired(v);
                      markCustom();
                    }}
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
                    description="Mark previews to discourage screenshots and forwarding."
                    checked={watermark}
                    onChange={(v) => {
                      setWatermark(v);
                      markCustom();
                    }}
                  />
                  {watermark && <WatermarkPreview />}
                </div>
              </Field>
            </div>
          )}
        </div>
      )}

      {/* Step 3 — Review */}
      {step === 3 && (
        <ReviewStep
          files={selectedList}
          bundles={selectedBundleList}
          title={title}
          recipient={recipient.trim()}
          mode={mode}
          pkg={pkg}
          purpose={purpose}
          permission={permission}
          expiryLabel={expiryLabel}
          accessCodeRequired={accessCodeRequired}
          oneTime={oneTime}
          requireApproval={requireApproval && mode === "account_to_account"}
          watermark={watermark}
          sensitiveCount={sensitiveNames.length}
          longExpiry={isLongExpiry(expiry, customExpiry)}
        />
      )}

      {/* Sticky summary */}
      {itemCount > 0 && step > 0 && (
        <StickyShareSummary
          itemCount={itemCount}
          packageLabel={getSharePackageLabel(pkg)}
          mode={mode}
          permissionLabel={PERMISSION_LABEL[permission]}
          expiryLabel={expiryLabel}
          accessCode={accessCodeRequired}
          watermark={watermark}
        />
      )}

      <div className="flex items-center justify-between gap-3 pt-1 pb-20 sm:pb-0">
        <Button
          variant="ghost"
          onClick={() => (step === 0 ? router.back() : setStep((s) => s - 1))}
          disabled={submitting}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button size="lg" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
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
            {submitting ? "Creating secure share…" : "Create secure share"}
          </Button>
        )}
      </div>
    </PageContainer>
  );
}

function PackageIcon({ id }: { id: SharePackage }) {
  const m = packageMethods(id);
  if (m.qr) return <QrCode className="size-4" />;
  if (m.link) return <Link2 className="size-4" />;
  return <IdCard className="size-4" />;
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
            {index < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
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
  recommended,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  recommended?: boolean;
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
        <span className="flex items-center gap-2 text-sm font-medium">
          {title}
          {recommended && (
            <span className="rounded-full bg-brand-success/10 px-2 py-0.5 text-[10px] font-semibold text-brand-success">
              Recommended
            </span>
          )}
        </span>
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

function PresetCard({
  active,
  recommended,
  spec,
  onClick,
}: {
  active: boolean;
  recommended: boolean;
  spec: (typeof PERMISSION_PRESETS)[keyof typeof PERMISSION_PRESETS];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all",
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:bg-muted/50",
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {spec.label}
        {recommended && (
          <span className="rounded-full bg-brand-success/10 px-2 py-0.5 text-[10px] font-semibold text-brand-success">
            SafeSend
          </span>
        )}
      </span>
      <span className="text-xs text-muted-foreground">{spec.description}</span>
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

function WatermarkPreview() {
  // A miniature of the real preview watermark (a diagonal, tiled, low-opacity
  // overlay) so the sender sees roughly what a recipient will see.
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Preview</p>
      <div className="relative h-28 overflow-hidden rounded-lg border border-border bg-card">
        <div className="space-y-1.5 p-3">
          <div className="h-2 w-1/3 rounded bg-muted-foreground/20" />
          <div className="h-2 w-3/4 rounded bg-muted-foreground/10" />
          <div className="h-2 w-2/3 rounded bg-muted-foreground/10" />
          <div className="h-2 w-1/2 rounded bg-muted-foreground/10" />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-wrap items-center justify-center gap-x-6 gap-y-7 overflow-hidden opacity-[0.14]"
        >
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="-rotate-[30deg] text-[10px] font-semibold whitespace-nowrap text-foreground select-none"
            >
              DueNest · Secure
            </span>
          ))}
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Previews are stamped with your name and a share ID. Watermarks discourage
        misuse — they don&apos;t block screenshots.
      </p>
    </div>
  );
}

function SafeSendRecommendation({
  reason,
  presetLabel,
  packageLabel,
  onApply,
}: {
  reason: string;
  presetLabel: string;
  packageLabel: string;
  onApply: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-brand-success/30 bg-brand-success/5 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-success/10 text-brand-success">
          <ShieldCheck className="size-4" />
        </span>
        <div>
          <p className="text-sm font-medium">Recommended by SafeSend</p>
          <p className="text-xs text-muted-foreground">{reason}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {presetLabel} protection · {packageLabel}
          </p>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onApply} className="shrink-0">
        Apply
      </Button>
    </div>
  );
}

function StickyShareSummary({
  itemCount,
  packageLabel,
  mode,
  permissionLabel,
  expiryLabel,
  accessCode,
  watermark,
}: {
  itemCount: number;
  packageLabel: string;
  mode: QuickShareMode;
  permissionLabel: string;
  expiryLabel: string;
  accessCode: boolean;
  watermark: boolean;
}) {
  const parts = [
    `${itemCount} item${itemCount === 1 ? "" : "s"}`,
    packageLabel,
    mode === "account_to_account" ? "DueNest user" : "Public",
    permissionLabel,
    expiryLabel,
    accessCode ? "Code" : null,
    watermark ? "Watermark" : null,
  ].filter(Boolean) as string[];
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 py-2.5 shadow-floating backdrop-blur sm:sticky sm:bottom-4 sm:rounded-xl sm:border sm:shadow-card">
      <p className="flex items-center gap-1.5 overflow-x-auto text-xs font-medium whitespace-nowrap text-muted-foreground">
        <ShieldCheck className="size-3.5 shrink-0 text-brand-success" />
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>·</span>}
            <span>{part}</span>
          </span>
        ))}
      </p>
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
          <li key={file.id} className="flex items-center gap-3 rounded-lg bg-muted/40 p-2">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <FileText className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{file.name}</span>
              <span className="block text-xs text-muted-foreground">
                {file.documentTitle} · {formatFileSize(file.size)}
              </span>
            </span>
            {file.documentExpired && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive"
                title="The parent document is past its expiry date"
              >
                <AlertTriangle className="size-3" />
                Expired
              </span>
            )}
            {looksSensitive(`${file.name} ${file.documentType ?? ""}`) && (
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

function ReviewStep({
  files,
  bundles,
  title,
  recipient,
  mode,
  pkg,
  purpose,
  permission,
  expiryLabel,
  accessCodeRequired,
  oneTime,
  requireApproval,
  watermark,
  sensitiveCount,
  longExpiry,
}: {
  files: SelectedFile[];
  bundles: SelectedBundle[];
  title: string;
  recipient: string;
  mode: QuickShareMode;
  pkg: SharePackage;
  purpose: SharePurpose;
  permission: QuickSharePermission;
  expiryLabel: string;
  accessCodeRequired: boolean;
  oneTime: boolean;
  requireApproval: boolean;
  watermark: boolean;
  sensitiveCount: number;
  longExpiry: boolean;
}) {
  const itemCount = files.length + bundles.length;
  const checks = buildShareReadinessChecks({
    itemCount,
    hasExpiry: true,
    downloadDisabled: permission === "view_only",
    watermark,
    sensitiveCount,
    longExpiry,
    oneTime,
    accessCode: accessCodeRequired,
    expiredCount: files.filter((f) => f.documentExpired).length,
    missingExpiryCount: files.filter((f) => f.documentMissingExpiry).length,
    incompleteBundleCount: bundles.filter((b) => b.incomplete).length,
  });
  const m = packageMethods(pkg);
  const sendParts = [
    m.qr && "QR",
    m.link && "Secure link",
    m.code && "DueNest code",
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold">
          Ready to create secure share
        </h2>
        {title && <p className="text-sm text-muted-foreground">{title}</p>}
      </div>

      {/* Readiness check */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <p className="text-sm font-semibold">Share readiness</p>
        <ul className="mt-3 space-y-2">
          {checks.map((check, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {check.tone === "ok" ? (
                <Check className="mt-0.5 size-4 shrink-0 text-brand-success" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-brand-amber" />
              )}
              <span
                className={cn(
                  check.tone === "warn" ? "text-brand-amber" : "text-foreground",
                )}
              >
                {check.label}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SafetySection title="Sharing">
          <SafetyRow label="Items" value={itemSummary(files, bundles)} />
          {purpose && <SafetyRow label="Purpose" value={purposeLabel(purpose)} />}
        </SafetySection>

        <SafetySection title="Send as">
          <SafetyRow label="Package" value={sendParts.join(" + ")} />
          <SafetyRow
            label="Recipient"
            value={mode === "account_to_account" ? "A DueNest user" : "Anyone with the link"}
          />
          {recipient && <SafetyRow label="For" value={recipient} />}
        </SafetySection>

        <SafetySection title="Access">
          <SafetyRow label="Permission" value={PERMISSION_LABEL[permission]} />
          <SafetyRow label="Expires in" value={expiryLabel} />
          <SafetyRow label="Watermark" value={watermark ? "On" : "Off"} />
          {permission === "view_only" && (
            <SafetyRow label="Download" value="Disabled" />
          )}
          {accessCodeRequired && <SafetyRow label="Access code" value="Required" />}
          {oneTime && <SafetyRow label="One-time" value="Yes" />}
          {requireApproval && <SafetyRow label="Sender approval" value="Required" />}
        </SafetySection>

        <SafetySection title="Control">
          <p className="text-xs text-muted-foreground">
            You can revoke access anytime. Opens, previews, and downloads may be
            logged. DueNest never exposes your full vault.
          </p>
        </SafetySection>
      </div>

      {sensitiveCount > 0 && (
        <InlineAlert tone="warn">
          {sensitiveCount} selected item{sensitiveCount === 1 ? "" : "s"} look
          sensitive. Double-check the recipient and access settings before you
          create the share.
        </InlineAlert>
      )}
      {permission === "save_copy_allowed" && (
        <InlineAlert tone="warn">
          Save copy is enabled. The recipient can keep their own copy, which you
          will not be able to revoke later.
        </InlineAlert>
      )}
    </div>
  );
}

function itemSummary(files: SelectedFile[], bundles: SelectedBundle[]): string {
  return (
    [
      files.length > 0 && `${files.length} file${files.length === 1 ? "" : "s"}`,
      bundles.length > 0 &&
        `${bundles.length} bundle${bundles.length === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join(" + ") || "Nothing selected"
  );
}

function SafetySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </p>
      <div className="mt-2 space-y-1.5">{children}</div>
    </div>
  );
}

function SafetyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
