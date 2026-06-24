"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useFocusTrap } from "@/lib/use-focus-trap";
import {
  EXPORT_FORMAT_LABELS,
  creditNotice,
  exportGeneratedDocument,
  generateApplicationDocument,
  generateReasonMessage,
  getDocumentTemplates,
  isUpgradeReason,
  isUsageReason,
  updateGeneratedDocument,
  downloadGeneratedFile,
} from "@/lib/application-documents";
import { cn } from "@/lib/utils";
import type {
  DocumentTemplate,
  ExportFormat,
  ExportResult,
  GenerateResult,
  TemplateRegistry,
} from "@/types/application-documents";

type Step = "setup" | "generating" | "review" | "exporting";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export interface GenerateDocumentModalProps {
  open: boolean;
  onClose: () => void;
  applicationId?: number;
  bundleId?: number;
  defaultTargetOrganization?: string;
  onSaved?: (result: ExportResult) => void;
}

/**
 * AI Application Document Generator V1 — a 4-step client modal mirroring the
 * requirement-import flow: setup → generating → review → exporting. Owner-only
 * and key-gated; nothing is exported or saved to a pack without an explicit
 * action. The backend remains the source of truth for plan/consent gating; this
 * modal surfaces blocked reasons as inline upgrade/usage copy.
 */
export function GenerateDocumentModal({
  open,
  onClose,
  applicationId,
  bundleId,
  defaultTargetOrganization,
  onSaved,
}: GenerateDocumentModalProps) {
  const titleId = useId();
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  const [step, setStep] = useState<Step>("setup");
  const [registry, setRegistry] = useState<TemplateRegistry | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);

  // Setup inputs.
  const [documentType, setDocumentType] = useState<string>("");
  const [contentStyle, setContentStyle] = useState<string>("");
  const [templateKey, setTemplateKey] = useState<string>("");
  const [targetOrg, setTargetOrg] = useState<string>(
    defaultTargetOrganization ?? "",
  );
  const [instructions, setInstructions] = useState<string>("");

  // Blocked/error copy on setup.
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [usageBlock, setUsageBlock] = useState(false);

  // Review state.
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [reviewTitle, setReviewTitle] = useState<string>("");
  const [reviewText, setReviewText] = useState<string>("");
  const [savingReview, setSavingReview] = useState(false);
  const [reviewSaved, setReviewSaved] = useState(false);

  // Export state.
  const [saveToPack, setSaveToPack] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(
    null,
  );
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<ExportResult | null>(null);
  const [exportedFormats, setExportedFormats] = useState<Set<ExportFormat>>(
    new Set(),
  );

  // Whether saving to a pack is even possible (needs a linked pack).
  const canSaveToPack = Boolean(bundleId || applicationId);

  // Fetch templates once when the modal opens.
  useEffect(() => {
    if (!open) return;
    let active = true;
    getDocumentTemplates()
      .then((reg) => {
        if (!active) return;
        setRegistry(reg);
        // Sensible defaults: first document type (+ its recommended template)
        // and the first content style.
        const firstType = reg.document_types[0];
        setDocumentType(firstType?.key ?? "");
        setTemplateKey(firstType?.recommended_template ?? "");
        setContentStyle(reg.content_styles[0]?.key ?? "");
      })
      .catch((err) => {
        if (!active) return;
        setRegistryError(
          err instanceof ApiError
            ? err.message
            : "Could not load document templates.",
        );
      });
    return () => {
      active = false;
    };
  }, [open]);

  // Escape closes the modal except while a request is in flight.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && step !== "generating" && step !== "exporting") {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, step, onClose]);

  // Templates that match the chosen document type.
  const matchingTemplates = useMemo<DocumentTemplate[]>(() => {
    if (!registry || !documentType) return [];
    return registry.templates.filter((t) =>
      t.document_types.includes(documentType),
    );
  }, [registry, documentType]);

  const typeMeta = useMemo(
    () => registry?.document_types.find((d) => d.key === documentType) ?? null,
    [registry, documentType],
  );

  // Selecting a document type also resets the template to its recommended one.
  // Done in the click handler (not an effect) to avoid cascading renders.
  function chooseDocumentType(key: string) {
    setDocumentType(key);
    const meta = registry?.document_types.find((d) => d.key === key);
    if (meta) setTemplateKey(meta.recommended_template);
  }

  const selectedTemplate = useMemo<DocumentTemplate | null>(
    () =>
      (registry?.templates ?? []).find((t) => t.key === templateKey) ?? null,
    [registry, templateKey],
  );

  if (!open) return null;

  const busy = step === "generating" || step === "exporting";

  async function generate() {
    if (!documentType) return;
    setStep("generating");
    setError(null);
    setUpgrade(false);
    setUsageBlock(false);
    try {
      const res = await generateApplicationDocument({
        document_type: documentType,
        content_style: contentStyle || undefined,
        template_key: templateKey || undefined,
        application_id: applicationId,
        bundle_id: bundleId,
        target_organization: targetOrg.trim() || undefined,
        additional_instructions: instructions.trim() || undefined,
      });
      if (!res.available || res.reason !== "ok" || !res.generated_document_id) {
        setError(generateReasonMessage(res));
        setUpgrade(isUpgradeReason(res));
        setUsageBlock(isUsageReason(res));
        setStep("setup");
        return;
      }
      setResult(res);
      setReviewTitle(res.title ?? "");
      setReviewText(res.plain_text_preview ?? "");
      if (res.template_key) setTemplateKey(res.template_key);
      setStep("review");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.status === 503
            ? "Document generation isn't enabled yet."
            : err.message
          : "Something went wrong. Please try again.",
      );
      setStep("setup");
    }
  }

  async function saveReview() {
    if (!result?.generated_document_id) return;
    setSavingReview(true);
    setReviewSaved(false);
    try {
      await updateGeneratedDocument(result.generated_document_id, {
        title: reviewTitle.trim() || reviewTitle,
        plain_text_preview: reviewText,
      });
      setReviewSaved(true);
    } catch (err) {
      setExportError(
        err instanceof ApiError ? err.message : "Could not save your edits.",
      );
    } finally {
      setSavingReview(false);
    }
  }

  async function runExport(format: ExportFormat) {
    if (!result?.generated_document_id) return;
    setExportingFormat(format);
    setExportError(null);
    setStep("exporting");
    try {
      const exported = await exportGeneratedDocument(
        result.generated_document_id,
        {
          format,
          template_key: templateKey || undefined,
          save_to_pack: saveToPack && canSaveToPack,
        },
      );
      const filename = `${(reviewTitle || result.title || "document").trim()}.${format}`;
      await downloadGeneratedFile(exported.file_id, filename);
      setLastExport(exported);
      setExportedFormats((prev) => new Set(prev).add(format));
      onSaved?.(exported);
      setStep("review");
    } catch (err) {
      setExportError(
        err instanceof ApiError
          ? err.status === 400
            ? "This template doesn't support that format. Pick another template or format."
            : err.message
          : "Could not export this document.",
      );
      setStep("review");
    } finally {
      setExportingFormat(null);
    }
  }

  function templateSupports(format: ExportFormat): boolean {
    return (selectedTemplate?.export_formats ?? []).includes(format);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="fixed inset-0 cursor-default bg-foreground/40 backdrop-blur-sm"
        onClick={() => !busy && onClose()}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative my-auto w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-foreground/10 outline-none"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <h2 id={titleId} className="mt-3 font-heading text-lg font-semibold">
          Generate application document
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create a professional document from your Smart Profile and application
          context.
        </p>

        {registryError && (
          <div className="mt-4">
            <InlineAlert>{registryError}</InlineAlert>
          </div>
        )}

        {/* Step: setup */}
        {(step === "setup" || step === "generating") && registry && (
          <div className="mt-5 flex flex-col gap-5">
            {/* Document type */}
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">Document type</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {registry.document_types.map((type) => {
                  const active = type.key === documentType;
                  return (
                    <button
                      key={type.key}
                      type="button"
                      onClick={() => chooseDocumentType(type.key)}
                      disabled={busy}
                      aria-pressed={active}
                      className={cn(
                        "flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        active
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border hover:border-primary/40 hover:bg-muted/40",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{type.label}</span>
                        {type.ats_relevant && (
                          <StatusBadge tone="info" withDot={false}>
                            ATS
                          </StatusBadge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {type.credit_cost} AI credit
                        {type.credit_cost === 1 ? "" : "s"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Content style */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gd-style">Content style</Label>
              <select
                id="gd-style"
                className={SELECT_CLASS}
                value={contentStyle}
                onChange={(e) => setContentStyle(e.target.value)}
                disabled={busy}
              >
                {registry.content_styles.map((style) => (
                  <option key={style.key} value={style.key}>
                    {style.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Target organization */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gd-org">Target organization (optional)</Label>
              <Input
                id="gd-org"
                value={targetOrg}
                onChange={(e) => setTargetOrg(e.target.value)}
                placeholder="e.g. University of Oxford"
                disabled={busy}
              />
            </div>

            {/* Additional instructions */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gd-instructions">
                Additional instructions (optional)
              </Label>
              <Textarea
                id="gd-instructions"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Anything specific to emphasize, tone, role, or focus…"
                rows={3}
                disabled={busy}
              />
            </div>

            {/* Template selector */}
            {matchingTemplates.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Template</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {matchingTemplates.map((tpl) => (
                    <TemplateCard
                      key={tpl.key}
                      template={tpl}
                      active={tpl.key === templateKey}
                      recommended={tpl.key === typeMeta?.recommended_template}
                      disabled={busy}
                      onSelect={() => setTemplateKey(tpl.key)}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  ATS-safe templates are best for online job portals. Premium
                  templates are best for human review and direct sharing.
                </p>
              </fieldset>
            )}

            <p className="text-xs text-muted-foreground">
              {creditNotice(documentType, registry)}
            </p>

            {error && (
              <BlockedNotice
                message={error}
                upgrade={upgrade}
                usage={usageBlock}
              />
            )}

            <TrustNotice icon={ShieldCheck} title="Review before saving">
              Nothing is exported or saved until you choose to. You stay in
              control.
            </TrustNotice>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button
                onClick={generate}
                disabled={busy || !documentType}
              >
                {step === "generating" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> Generate
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step: generating (when registry not yet visible — fallback) */}
        {step === "generating" && !registry && (
          <GeneratingState />
        )}

        {/* Step: review / exporting */}
        {(step === "review" || step === "exporting") && result && (
          <div className="mt-5 flex flex-col gap-5">
            {step === "exporting" ? (
              <ExportingState />
            ) : (
              <>
                {/* Editable title */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gd-title">Title</Label>
                  <Input
                    id="gd-title"
                    value={reviewTitle}
                    onChange={(e) => {
                      setReviewTitle(e.target.value);
                      setReviewSaved(false);
                    }}
                  />
                </div>

                {/* ATS score for CV-type documents */}
                {typeof result.ats_score === "number" && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">ATS score</span>
                    <StatusBadge
                      tone={result.ats_score >= 70 ? "success" : "warning"}
                    >
                      {result.ats_score}/100
                    </StatusBadge>
                  </div>
                )}

                {/* Editable content preview */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="gd-content">Document content</Label>
                  <Textarea
                    id="gd-content"
                    value={reviewText}
                    onChange={(e) => {
                      setReviewText(e.target.value);
                      setReviewSaved(false);
                    }}
                    rows={10}
                    className="font-mono text-xs leading-relaxed"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      Edit the wording here. The exported file uses these edits
                      after you save.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={saveReview}
                      disabled={savingReview}
                    >
                      {savingReview ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : reviewSaved ? (
                        <CheckCircle2 className="size-4 text-brand-success" />
                      ) : null}
                      {reviewSaved ? "Saved" : "Save edits"}
                    </Button>
                  </div>
                </div>

                {/* Quality checks */}
                {result.quality_checks && (
                  <QualityChecksView checks={result.quality_checks} />
                )}

                {/* Template selector (export target) */}
                {matchingTemplates.length > 0 && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-sm font-medium">
                      Export template
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {matchingTemplates.map((tpl) => (
                        <TemplateCard
                          key={tpl.key}
                          template={tpl}
                          active={tpl.key === templateKey}
                          recommended={
                            tpl.key === result.recommended_template
                          }
                          onSelect={() => setTemplateKey(tpl.key)}
                        />
                      ))}
                    </div>
                  </fieldset>
                )}

                {exportError && <InlineAlert>{exportError}</InlineAlert>}

                {lastExport && (
                  <InlineAlert tone="good">
                    Exported ✓
                    {lastExport.saved_to_pack
                      ? " — saved to pack."
                      : "."}{" "}
                    Your download has started.
                  </InlineAlert>
                )}

                {/* Save-to-pack toggle */}
                {canSaveToPack && (
                  <label className="flex items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4"
                      checked={saveToPack}
                      onChange={(e) => setSaveToPack(e.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">
                        Save to the linked application pack
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Adds the exported file to this pack on export.
                      </span>
                    </span>
                  </label>
                )}

                {/* Export actions */}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="outline" onClick={onClose}>
                    Done
                  </Button>
                  {(["pdf", "docx"] as ExportFormat[]).map((format) => (
                    <Button
                      key={format}
                      onClick={() => runExport(format)}
                      disabled={
                        exportingFormat !== null || !templateSupports(format)
                      }
                      variant={
                        exportedFormats.has(format) ? "outline" : "default"
                      }
                    >
                      {exportingFormat === format ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <FileText className="size-4" />
                      )}
                      {exportedFormats.has(format)
                        ? `Export ${EXPORT_FORMAT_LABELS[format]} again`
                        : `Export ${EXPORT_FORMAT_LABELS[format]}`}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TemplateCard({
  template,
  active,
  recommended,
  disabled,
  onSelect,
}: {
  template: DocumentTemplate;
  active: boolean;
  recommended: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium">{template.label}</span>
        {recommended && (
          <StatusBadge tone="success" withDot={false}>
            Recommended
          </StatusBadge>
        )}
        {template.ats_safe && (
          <StatusBadge tone="info" withDot={false}>
            ATS-safe
          </StatusBadge>
        )}
      </span>
      {template.description && (
        <span className="text-xs text-muted-foreground">
          {template.description}
        </span>
      )}
      {template.recommended_for.length > 0 && (
        <span className="text-xs text-muted-foreground">
          Best for: {template.recommended_for.join(", ")}
        </span>
      )}
      <span className="text-[11px] text-muted-foreground/80">
        {template.export_formats
          .map((f) => EXPORT_FORMAT_LABELS[f])
          .join(" · ")}
      </span>
    </button>
  );
}

function QualityChecksView({
  checks,
}: {
  checks: NonNullable<GenerateResult["quality_checks"]>;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-3.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Review
      </h3>
      <CheckList
        heading="Strengths"
        items={checks.strengths}
        tone="good"
        icon={CheckCircle2}
      />
      <CheckList
        heading="Missing information"
        items={checks.missing_information}
        tone="warn"
        icon={AlertTriangle}
      />
      <CheckList
        heading="Risk warnings"
        items={checks.risk_warnings}
        tone="warn"
        icon={AlertTriangle}
      />
      <CheckList
        heading="Suggested improvements"
        items={checks.suggested_improvements}
        tone="neutral"
      />
    </div>
  );
}

function CheckList({
  heading,
  items,
  tone,
  icon: Icon,
}: {
  heading: string;
  items: string[];
  tone: "good" | "warn" | "neutral";
  icon?: typeof CheckCircle2;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-medium">{heading}</h4>
      <ul className="flex flex-col gap-1">
        {items.map((item, i) => (
          <li
            key={i}
            className={cn(
              "flex items-start gap-1.5 text-xs",
              tone === "warn" ? "text-brand-amber" : "text-muted-foreground",
            )}
          >
            {Icon && <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockedNotice({
  message,
  upgrade,
  usage,
}: {
  message: string;
  upgrade: boolean;
  usage: boolean;
}) {
  if (upgrade) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-3 text-sm">
        <p>{message}</p>
        <Link
          href="/dashboard/settings/billing?upgrade=pro"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "mt-2",
          )}
        >
          <Sparkles className="size-4" /> Upgrade to Pro
        </Link>
      </div>
    );
  }
  if (usage) {
    return <InlineAlert tone="warn">{message}</InlineAlert>;
  }
  return <InlineAlert>{message}</InlineAlert>;
}

function GeneratingState() {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 py-8 text-center">
      <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-medium">Building your professional document…</p>
        <p className="text-xs text-muted-foreground">
          Using your Smart Profile and application context…
        </p>
      </div>
    </div>
  );
}

function ExportingState() {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-medium">Preparing your export…</p>
    </div>
  );
}
