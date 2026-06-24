"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  FileText,
  Info,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
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
  WARNING_SEVERITY_LABELS,
  creditNotice,
  exportGeneratedDocument,
  generateApplicationDocument,
  generateReasonMessage,
  getDocumentTemplates,
  getGeneratedDocument,
  groupWarningsBySeverity,
  isUpgradeReason,
  isUsageReason,
  templateSupportsFormat,
  unsupportedFormatReason,
  updateGeneratedDocument,
  downloadGeneratedFile,
} from "@/lib/application-documents";
import { getSmartProfileCompleteness } from "@/lib/smart-profile";
import { cn } from "@/lib/utils";
import type {
  CvHeader,
  CvStructuredContent,
  DocumentTemplate,
  DocumentTypeMeta,
  DocumentWarning,
  ExportFormat,
  ExportResult,
  GeneratedApplicationDocument,
  GenerateResult,
  LetterSection,
  LetterStructuredContent,
  TemplateRegistry,
  WarningSeverity,
} from "@/types/application-documents";

type Step = "setup" | "generating" | "review" | "editing" | "exporting";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const ALL_FORMATS: ExportFormat[] = ["pdf", "docx"];

/** CV-style keys whose structured_content we render with the CV editor. */
const CV_KINDS = new Set(["cv", "resume"]);

export interface GenerateDocumentModalProps {
  open: boolean;
  onClose: () => void;
  applicationId?: number;
  bundleId?: number;
  defaultTargetOrganization?: string;
  onSaved?: (result: ExportResult) => void;
}

/**
 * AI Application Document Generator V1 — a review-first client modal. The flow
 * is: Generate → Review → Edit → Choose template → Export (PDF/DOCX) → Save to
 * pack. Owner-only and key-gated; nothing is exported or saved without an
 * explicit action. The backend stays the source of truth for plan/consent
 * gating and recomputes preview + warnings on every edit (no AI, no credits).
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

  // Smart Profile completeness (drives the "thin profile" hint).
  const [profileScore, setProfileScore] = useState<number | null>(null);

  // Blocked/error copy on setup.
  const [error, setError] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [usageBlock, setUsageBlock] = useState(false);

  // Review state. `doc` is the persisted document — the source of truth after
  // generation. `result` keeps the original generate response for context.
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [doc, setDoc] = useState<GeneratedApplicationDocument | null>(null);

  // Edit-step working copy (only committed to the backend on save).
  const [editTitle, setEditTitle] = useState<string>("");
  const [editContent, setEditContent] = useState<Record<string, unknown>>({});
  const [savingEdits, setSavingEdits] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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

  // Fetch templates + profile completeness once when the modal opens.
  useEffect(() => {
    if (!open) return;
    let active = true;
    getDocumentTemplates()
      .then((reg) => {
        if (!active) return;
        setRegistry(reg);
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
    // Completeness is a soft hint — failures are silently ignored.
    getSmartProfileCompleteness()
      .then((c) => active && setProfileScore(c.score))
      .catch(() => {});
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

  const typeMeta = useMemo<DocumentTypeMeta | null>(
    () => registry?.document_types.find((d) => d.key === documentType) ?? null,
    [registry, documentType],
  );

  // Selecting a document type also resets the template to its recommended one.
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

  // Whether the active document type is CV-shaped (drives the editor variant).
  const isCvShape = useMemo(() => {
    const kind = doc
      ? registry?.document_types.find((d) => d.key === doc.document_type)?.kind
      : typeMeta?.kind;
    return CV_KINDS.has((kind ?? "").toLowerCase());
  }, [doc, registry, typeMeta]);

  // A weak profile produces thin documents — surface a calm nudge.
  const profileThin = profileScore !== null && profileScore < 40;

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
      if (res.template_key) setTemplateKey(res.template_key);
      // Pull the persisted document so review/edit work off the stored shape.
      const persisted = await getGeneratedDocument(res.generated_document_id);
      setDoc(persisted);
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

  // Move from review into the focused edit step with a fresh working copy.
  function startEditing() {
    if (!doc) return;
    setEditTitle(doc.title);
    setEditContent(structuredClone(doc.structured_content));
    setEditError(null);
    setStep("editing");
  }

  async function saveEdits() {
    if (!doc) return;
    setSavingEdits(true);
    setEditError(null);
    try {
      await updateGeneratedDocument(doc.id, {
        title: editTitle.trim() || doc.title,
        structured_content: editContent,
      });
      // Refetch so the server-recomputed preview + warnings are shown.
      const refreshed = await getGeneratedDocument(doc.id);
      setDoc(refreshed);
      setStep("review");
    } catch (err) {
      setEditError(
        err instanceof ApiError ? err.message : "Could not save your edits.",
      );
    } finally {
      setSavingEdits(false);
    }
  }

  async function runExport(format: ExportFormat) {
    if (!doc) return;
    setExportingFormat(format);
    setExportError(null);
    setStep("exporting");
    try {
      const exported = await exportGeneratedDocument(doc.id, {
        format,
        template_key: templateKey || undefined,
        save_to_pack: saveToPack && canSaveToPack,
      });
      const filename = `${(doc.title || "document").trim()}.${format}`;
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

  const atsScore = doc?.ats_score ?? result?.ats_score ?? null;
  const qualityScore = doc?.quality_score ?? result?.quality_score ?? null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto p-0 sm:p-4"
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
        className="relative mt-auto w-full max-w-2xl rounded-t-2xl border border-border bg-card p-5 shadow-2xl shadow-foreground/10 outline-none sm:my-auto sm:rounded-2xl sm:p-6"
      >
        <button
          type="button"
          onClick={() => !busy && onClose()}
          aria-label="Close"
          className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>

        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <h2 id={titleId} className="mt-3 font-heading text-lg font-semibold">
          {step === "editing" ? "Edit your draft" : "Generate application document"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {step === "editing"
            ? "Editing is free — no AI credits are used. Changes update the preview and checks."
            : "Create a professional document from your Smart Profile and application context."}
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
                {registry.document_types.map((type) => (
                  <DocumentTypeCard
                    key={type.key}
                    type={type}
                    active={type.key === documentType}
                    disabled={busy}
                    onSelect={() => chooseDocumentType(type.key)}
                  />
                ))}
              </div>
            </fieldset>

            {profileThin && (
              <ProfileThinHint />
            )}

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
              <Button onClick={generate} disabled={busy || !documentType}>
                {step === "generating" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" /> Generate draft
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step: generating (registry not yet visible — fallback) */}
        {step === "generating" && !registry && <GeneratingState />}

        {/* Step: editing — focused structured editor */}
        {step === "editing" && doc && (
          <div className="mt-5 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gd-edit-title">Title</Label>
              <Input
                id="gd-edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>

            {isCvShape ? (
              <CvEditor
                content={editContent as CvStructuredContent}
                onChange={setEditContent}
              />
            ) : (
              <LetterEditor
                content={editContent as LetterStructuredContent}
                onChange={setEditContent}
              />
            )}

            {editError && <InlineAlert>{editError}</InlineAlert>}

            <TrustNotice icon={ShieldCheck} title="Editing is free">
              No AI credits are used when you edit. We recompute the preview and
              checks from your changes. Original draft preserved until you save.
            </TrustNotice>

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setStep("review")}
                disabled={savingEdits}
              >
                <ArrowLeft className="size-4" /> Back to review
              </Button>
              <Button onClick={saveEdits} disabled={savingEdits}>
                {savingEdits ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" />
                )}
                Save edits
              </Button>
            </div>
          </div>
        )}

        {/* Step: review / exporting */}
        {(step === "review" || step === "exporting") && doc && (
          <div className="mt-5 flex flex-col gap-5">
            {step === "exporting" ? (
              <ExportingState />
            ) : (
              <>
                {/* Title + edit entry */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-heading text-base font-semibold">
                      {doc.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {typeMeta?.label ?? doc.document_type} · Private until you
                      share
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={startEditing}>
                    <Pencil className="size-4" /> Edit content
                  </Button>
                </div>

                {/* Calm scores */}
                {(atsScore !== null || qualityScore !== null) && (
                  <div className="flex flex-wrap gap-2">
                    {atsScore !== null && (
                      <ScorePill label="ATS readiness" value={atsScore} />
                    )}
                    {qualityScore !== null && (
                      <ScorePill label="Draft quality" value={qualityScore} />
                    )}
                  </div>
                )}

                {/* Preview (read-only, from latest saved content) */}
                <DocumentPreview text={doc.plain_text_preview} />

                {/* Warnings grouped by severity */}
                <WarningsView warnings={doc.warnings} />

                {/* Quality checks (from the original generate response) */}
                {result?.quality_checks && (
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
                            tpl.key ===
                            (result?.recommended_template ??
                              typeMeta?.recommended_template)
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
                    Exported.
                    {lastExport.saved_to_pack ? " Saved to pack." : ""} Your
                    download has started.
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
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>
                      Done
                    </Button>
                    {ALL_FORMATS.map((format) => {
                      const supported = templateSupportsFormat(
                        selectedTemplate,
                        format,
                      );
                      return (
                        <Button
                          key={format}
                          onClick={() => runExport(format)}
                          disabled={exportingFormat !== null || !supported}
                          variant={
                            exportedFormats.has(format) ? "outline" : "default"
                          }
                          title={
                            supported
                              ? undefined
                              : unsupportedFormatReason(
                                  selectedTemplate,
                                  format,
                                )
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
                      );
                    })}
                  </div>
                  {ALL_FORMATS.filter(
                    (f) => !templateSupportsFormat(selectedTemplate, f),
                  ).map((f) => (
                    <p
                      key={f}
                      className="text-right text-xs text-muted-foreground"
                    >
                      {unsupportedFormatReason(selectedTemplate, f)}
                    </p>
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

// ---- Setup cards -----------------------------------------------------------

function DocumentTypeCard({
  type,
  active,
  disabled,
  onSelect,
}: {
  type: DocumentTypeMeta;
  active: boolean;
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
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{type.label}</span>
        {type.ats_relevant && (
          <StatusBadge tone="info" withDot={false}>
            ATS
          </StatusBadge>
        )}
      </span>
      {type.best_for && (
        <span className="text-xs text-muted-foreground">{type.best_for}</span>
      )}
      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/80">
        <span>
          {type.credit_cost} AI credit{type.credit_cost === 1 ? "" : "s"}
        </span>
        {type.export_formats.length > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>
              {type.export_formats
                .map((f) => EXPORT_FORMAT_LABELS[f])
                .join(" / ")}
            </span>
          </>
        )}
      </span>
    </button>
  );
}

function ProfileThinHint() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-brand-amber/30 bg-brand-amber/10 px-3.5 py-3 text-sm text-brand-amber">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0">
        Your profile is thin — results improve with more detail.{" "}
        <Link
          href="/dashboard/profile"
          className="font-medium underline underline-offset-2"
        >
          Add to your Smart Profile
        </Link>
      </p>
    </div>
  );
}

// ---- Template card ---------------------------------------------------------

/**
 * A tasteful, non-graphic mini-preview derived from `preview.tone` /
 * `preview.divider`. No real layout render, no logos — just a calm visual
 * differentiator so templates don't all look identical.
 */
function TemplateMiniPreview({
  preview,
}: {
  preview: DocumentTemplate["preview"];
}) {
  const tone = (preview.tone ?? "").toLowerCase();
  // Map tone to a restrained density/weight, not colour.
  const isCentered = tone.includes("center") || tone.includes("classic");
  const isBold = tone.includes("bold") || tone.includes("premium");
  return (
    <div
      aria-hidden
      className="flex h-14 w-full flex-col gap-1 rounded-md border border-border/70 bg-muted/30 p-2"
    >
      <div
        className={cn(
          "h-1.5 rounded-full bg-foreground/30",
          isBold ? "w-2/3" : "w-1/2",
          isCentered && "mx-auto",
        )}
      />
      {preview.divider && (
        <div className="h-px w-full bg-foreground/15" />
      )}
      <div className="mt-0.5 flex flex-col gap-1">
        <div className="h-1 w-full rounded-full bg-foreground/12" />
        <div className="h-1 w-5/6 rounded-full bg-foreground/12" />
        <div className="h-1 w-2/3 rounded-full bg-foreground/12" />
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
        "flex flex-col gap-2 rounded-xl border px-3 py-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border hover:border-primary/40 hover:bg-muted/40",
      )}
    >
      <TemplateMiniPreview preview={template.preview} />
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-medium">{template.label}</span>
        {recommended && (
          <StatusBadge tone="success" withDot={false}>
            Recommended
          </StatusBadge>
        )}
        {template.ats_safe ? (
          <StatusBadge tone="info" withDot={false}>
            ATS-safe
          </StatusBadge>
        ) : (
          <span className="text-[11px] text-muted-foreground/80">
            Not ATS-optimized
          </span>
        )}
      </span>
      {template.best_for && (
        <span className="text-xs text-muted-foreground">
          Best for: {template.best_for}
        </span>
      )}
      <span className="text-[11px] text-muted-foreground/80">
        Exports{" "}
        {template.export_formats
          .map((f) => EXPORT_FORMAT_LABELS[f])
          .join(" · ")}
      </span>
    </button>
  );
}

// ---- Scores ----------------------------------------------------------------

function ScorePill({ label, value }: { label: string; value: number }) {
  const tone = value >= 70 ? "good" : value >= 45 ? "warn" : "danger";
  const toneClass =
    tone === "good"
      ? "text-brand-success"
      : tone === "warn"
        ? "text-brand-amber"
        : "text-destructive";
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", toneClass)}>
        {value}
        <span className="font-normal text-muted-foreground">/100</span>
      </span>
    </span>
  );
}

// ---- Preview & warnings ----------------------------------------------------

function DocumentPreview({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Preview
      </h3>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-muted/15 p-3.5">
        <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-foreground/90">
          {text || "No preview available yet."}
        </pre>
      </div>
    </div>
  );
}

const SEVERITY_STYLES: Record<
  WarningSeverity,
  { wrap: string; text: string; icon: typeof AlertTriangle }
> = {
  high: {
    wrap: "border-brand-amber/30 bg-brand-amber/10",
    text: "text-brand-amber",
    icon: AlertTriangle,
  },
  medium: {
    wrap: "border-border bg-muted/30",
    text: "text-foreground/80",
    icon: Info,
  },
  low: {
    wrap: "border-border bg-muted/20",
    text: "text-muted-foreground",
    icon: Info,
  },
};

function WarningsView({ warnings }: { warnings: DocumentWarning[] }) {
  const groups = groupWarningsBySeverity(warnings);
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Checks
      </h3>
      {groups.map(({ severity, items }) => {
        const styles = SEVERITY_STYLES[severity];
        const Icon = styles.icon;
        return (
          <div
            key={severity}
            className={cn("rounded-xl border p-3", styles.wrap)}
          >
            <p
              className={cn(
                "mb-1.5 text-xs font-medium",
                severity === "high" ? styles.text : "text-muted-foreground",
              )}
            >
              {WARNING_SEVERITY_LABELS[severity]}
            </p>
            <ul className="flex flex-col gap-1">
              {items.map((w, i) => (
                <li
                  key={`${w.type}-${i}`}
                  className={cn("flex items-start gap-1.5 text-xs", styles.text)}
                >
                  <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>{w.message}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function QualityChecksView({
  checks,
}: {
  checks: NonNullable<GenerateResult["quality_checks"]>;
}) {
  const hasAny =
    checks.strengths.length > 0 ||
    checks.missing_information.length > 0 ||
    checks.risk_warnings.length > 0 ||
    checks.suggested_improvements.length > 0;
  if (!hasAny) return null;
  return (
    <details className="group rounded-xl border border-border bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        AI review notes
        <ChevronDown
          className="size-4 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="flex flex-col gap-3 px-3.5 pb-3.5">
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
    </details>
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

// ---- Structured editors ----------------------------------------------------

/** A collapsible editor section — progressive disclosure for long forms. */
function EditorSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-xl border border-border bg-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3.5 py-2.5 text-sm font-medium">
        {title}
        <ChevronDown
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="flex flex-col gap-3 px-3.5 pb-3.5">{children}</div>
    </details>
  );
}

function FieldRow({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

/** Editor for CV-shaped structured content. */
function CvEditor({
  content,
  onChange,
}: {
  content: CvStructuredContent;
  onChange: (next: Record<string, unknown>) => void;
}) {
  function patch(next: Partial<CvStructuredContent>) {
    onChange({ ...content, ...next });
  }
  const header: CvHeader = content.header ?? {};

  function patchHeader(next: Partial<CvHeader>) {
    patch({ header: { ...header, ...next } });
  }

  return (
    <div className="flex flex-col gap-3">
      <EditorSection title="Header" defaultOpen>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow
            label="Name"
            value={header.name ?? ""}
            onChange={(v) => patchHeader({ name: v })}
          />
          <FieldRow
            label="Email"
            value={header.email ?? ""}
            onChange={(v) => patchHeader({ email: v })}
          />
          <FieldRow
            label="Phone"
            value={header.phone ?? ""}
            onChange={(v) => patchHeader({ phone: v })}
          />
          <FieldRow
            label="Location"
            value={header.location ?? ""}
            onChange={(v) => patchHeader({ location: v })}
          />
        </div>
      </EditorSection>

      <EditorSection title="Summary" defaultOpen>
        <Textarea
          value={content.summary ?? ""}
          onChange={(e) => patch({ summary: e.target.value })}
          rows={3}
          placeholder="A short professional summary…"
        />
      </EditorSection>

      <StringListSection
        title="Experience"
        noun="entry"
        items={content.experience ?? []}
        onChange={(items) => patch({ experience: items })}
        placeholder="e.g. Built models improving accuracy by 12% at Acme (2021–2024)"
      />
      <StringListSection
        title="Education"
        noun="entry"
        items={content.education ?? []}
        onChange={(items) => patch({ education: items })}
        placeholder="e.g. BSc Computer Science, University of Oxford (2018–2021)"
      />
      <StringListSection
        title="Skills"
        noun="skill"
        items={content.skills ?? []}
        onChange={(items) => patch({ skills: items })}
        placeholder="e.g. Python, data analysis, public speaking"
      />
      <StringListSection
        title="Projects"
        noun="project"
        items={content.projects ?? []}
        onChange={(items) => patch({ projects: items })}
        placeholder="e.g. Open-source PDF toolkit used by 2k+ developers"
      />
      <StringListSection
        title="Certifications"
        noun="certification"
        items={content.certifications ?? []}
        onChange={(items) => patch({ certifications: items })}
        placeholder="e.g. AWS Certified Solutions Architect (2023)"
      />
      <StringListSection
        title="Awards"
        noun="award"
        items={content.awards ?? []}
        onChange={(items) => patch({ awards: items })}
        placeholder="e.g. Dean's List, 2020"
      />
      <StringListSection
        title="Leadership"
        noun="entry"
        items={content.leadership ?? []}
        onChange={(items) => patch({ leadership: items })}
        placeholder="e.g. Led a team of 6 volunteers for the campus food drive"
      />
      <StringListSection
        title="Languages"
        noun="language"
        items={content.languages ?? []}
        onChange={(items) => patch({ languages: items })}
        placeholder="e.g. English (native), French (fluent)"
      />
    </div>
  );
}

/**
 * A repeatable list of plain-string entries. The backend stores every CV list
 * section as `string[]` and renders each element with `str(item)`, so the
 * editor must keep entries as strings — never objects. Each entry is a single
 * multiline string (so a rich entry like
 * "Built models improving accuracy by 12% at Acme (2021–2024)" stays one item).
 */
function StringListSection({
  title,
  noun,
  items,
  onChange,
  placeholder,
}: {
  title: string;
  noun: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  function update(i: number, value: string) {
    onChange(items.map((s, idx) => (idx === i ? value : s)));
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }
  function add() {
    onChange([...items, ""]);
  }
  return (
    <EditorSection
      title={`${title}${items.length ? ` (${items.length})` : ""}`}
    >
      <div className="flex flex-col gap-3">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nothing here yet. Add {noun === "entry" ? "an" : "a"} {noun} below.
          </p>
        )}
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/20 p-2.5"
          >
            <Textarea
              value={item}
              onChange={(e) => update(i, e.target.value)}
              rows={2}
              placeholder={placeholder}
              className="min-h-0 flex-1"
              aria-label={`${title} ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${noun} ${i + 1}`}
              className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-destructive"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={add} className="self-start">
          <Plus className="size-4" /> Add {noun}
        </Button>
      </div>
    </EditorSection>
  );
}

/** Editor for letter-shaped structured content. */
function LetterEditor({
  content,
  onChange,
}: {
  content: LetterStructuredContent;
  onChange: (next: Record<string, unknown>) => void;
}) {
  function patch(next: Partial<LetterStructuredContent>) {
    onChange({ ...content, ...next });
  }
  const sections: LetterSection[] = content.sections ?? [];

  function updateSection(i: number, next: Partial<LetterSection>) {
    patch({
      sections: sections.map((s, idx) => (idx === i ? { ...s, ...next } : s)),
    });
  }
  function removeSection(i: number) {
    patch({ sections: sections.filter((_, idx) => idx !== i) });
  }
  function addSection() {
    patch({ sections: [...sections, { heading: "", body: "" }] });
  }

  return (
    <div className="flex flex-col gap-3">
      <EditorSection title="Letter details" defaultOpen>
        <FieldRow
          label="Subject"
          value={content.subject ?? ""}
          onChange={(v) => patch({ subject: v })}
        />
        <FieldRow
          label="Salutation"
          value={content.salutation ?? ""}
          onChange={(v) => patch({ salutation: v })}
          placeholder="e.g. Dear Hiring Manager,"
        />
      </EditorSection>

      <EditorSection title={`Body${sections.length ? ` (${sections.length})` : ""}`} defaultOpen>
        <div className="flex flex-col gap-3">
          {sections.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No body paragraphs yet. Add one below.
            </p>
          )}
          {sections.map((section, i) => (
            <div
              key={i}
              className="flex flex-col gap-2.5 rounded-lg border border-border/70 bg-muted/20 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Paragraph {i + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeSection(i)}
                  className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-3.5" aria-hidden /> Remove
                </button>
              </div>
              <FieldRow
                label="Heading (optional)"
                value={section.heading ?? ""}
                onChange={(v) => updateSection(i, { heading: v })}
              />
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Body</Label>
                <Textarea
                  value={section.body ?? ""}
                  onChange={(e) => updateSection(i, { body: e.target.value })}
                  rows={4}
                />
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={addSection}
            className="self-start"
          >
            <Plus className="size-4" /> Add paragraph
          </Button>
        </div>
      </EditorSection>

      <EditorSection title="Closing">
        <FieldRow
          label="Closing"
          value={content.closing ?? ""}
          onChange={(v) => patch({ closing: v })}
          placeholder="e.g. Sincerely,"
        />
        <FieldRow
          label="Signature"
          value={content.signature ?? ""}
          onChange={(v) => patch({ signature: v })}
        />
      </EditorSection>
    </div>
  );
}

// ---- Blocked / loading states ----------------------------------------------

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
        <p className="text-sm font-medium">
          Building your professional document…
        </p>
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
