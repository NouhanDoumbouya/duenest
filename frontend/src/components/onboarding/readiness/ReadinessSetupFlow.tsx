"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  FileText,
  GraduationCap,
  HeartHandshake,
  Loader2,
  Plane,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  Vault,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import {
  createDocument,
  createDocumentReminderRule,
  listDocumentCategories,
} from "@/lib/documents";
import {
  createDocumentFromInboxFile,
  uploadInboxFile,
} from "@/lib/document-files";
import {
  completeOnboarding,
  dismissOnboarding,
  getOnboardingState,
  updateOnboardingState,
} from "@/lib/onboarding";
import {
  buildFirstLifeRadarPreview,
  formatOnboardingProgress,
  getDefaultCategoryForDocument,
  getDefaultReminderForDocument,
  getDocumentSuggestionsForGoal,
  getOnboardingGoalOptions,
  getPersonalizedNextAction,
  mergeReadinessMetadata,
  readReadinessMetadata,
  REMINDER_DAY_OPTIONS,
  type LifeRadarPreview,
  type ReadinessGoal,
  type ReadinessStep,
} from "@/lib/readiness";
import type { DocumentCategory } from "@/types/documents";
import { cn } from "@/lib/utils";

type DocMethod = "upload" | "manual";

const GOAL_ICONS: Record<ReadinessGoal, typeof FileText> = {
  international_student: GraduationCap,
  applications: BriefcaseBusiness,
  travel: Plane,
  family: Users,
  subscriptions: CalendarClock,
  emergency: HeartHandshake,
  vault: Vault,
  unsure: Sparkles,
};

const STEP_INDEX: Record<ReadinessStep, number> = {
  welcome: 1,
  use_case: 2,
  document: 3,
  details: 4,
  expiry: 5,
  success: 6,
};
const TOTAL_STEPS = 5; // welcome is the intro; progress counts the 5 actions

export function ReadinessSetupFlow() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<ReadinessStep>("welcome");
  const [goal, setGoal] = useState<ReadinessGoal | null>(null);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Readiness setup");

  // document draft
  const [method, setMethod] = useState<DocMethod>("manual");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [hasExpiry, setHasExpiry] = useState(true);
  const [expiryDate, setExpiryDate] = useState("");
  const [reminderDays, setReminderDays] = useState<number | null>(30);
  const [inboxFileId, setInboxFileId] = useState<number | null>(null);
  const [preview, setPreview] = useState<LifeRadarPreview | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const metadataRef = useRef<Record<string, unknown>>({});

  const announce = useCallback((msg: string) => setStatus(msg), []);

  // ---- load + resume -----------------------------------------------------
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [state, cats] = await Promise.all([
          getOnboardingState(),
          listDocumentCategories().catch(() => [] as DocumentCategory[]),
        ]);
        if (!active) return;
        metadataRef.current = (state.metadata as Record<string, unknown>) ?? {};
        const meta = readReadinessMetadata(state);
        if (meta.goal) setGoal(meta.goal);
        // Resume mid-flow, but never resume into the document draft (not persisted)
        // or the success screen — re-entering at use_case/document is safe.
        if (meta.current_step && meta.current_step !== "success") {
          setStep(meta.current_step === "details" || meta.current_step === "expiry"
            ? "document"
            : meta.current_step);
        }
        setCategories(Array.isArray(cats) ? cats : []);
      } catch {
        // A fresh user with no state still starts at welcome — non-fatal.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback(
    async (patch: { goal?: ReadinessGoal; current_step?: ReadinessStep }) => {
      try {
        const merged = mergeReadinessMetadata(metadataRef.current, patch);
        metadataRef.current = merged;
        await updateOnboardingState({ metadata: merged });
      } catch {
        // Persistence is best-effort; the local flow keeps working.
      }
    },
    [],
  );

  const goTo = useCallback(
    (next: ReadinessStep) => {
      setError(null);
      setStep(next);
      void persist({ current_step: next });
    },
    [persist],
  );

  const chooseGoal = useCallback(
    (g: ReadinessGoal) => {
      setGoal(g);
      void persist({ goal: g, current_step: "document" });
      setStep("document");
      announce("Add your first important document");
    },
    [announce, persist],
  );

  const skip = useCallback(async () => {
    setBusy(true);
    try {
      await dismissOnboarding();
    } catch {
      /* still navigate away */
    }
    router.push("/dashboard");
  }, [router]);

  // ---- suggestion / category defaults -----------------------------------
  const suggestions = useMemo(
    () => (goal ? getDocumentSuggestionsForGoal(goal) : []),
    [goal],
  );

  const applySuggestedDefaults = useCallback(
    (docName: string) => {
      const suggestedCat = getDefaultCategoryForDocument(docName, goal ?? undefined);
      const match = categories.find(
        (c) => c.name.toLowerCase() === suggestedCat.toLowerCase(),
      );
      if (match) setCategoryId(match.id);
      const rem = getDefaultReminderForDocument(docName);
      setHasExpiry(rem.expires);
      setReminderDays(rem.daysBefore);
    },
    [categories, goal],
  );

  const startManual = useCallback(
    (prefillName: string) => {
      setMethod("manual");
      setName(prefillName);
      if (prefillName) applySuggestedDefaults(prefillName);
      goTo("details");
    },
    [applySuggestedDefaults, goTo],
  );

  const onPickFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setBusy(true);
      setError(null);
      announce("Uploading your file");
      try {
        const uploaded = await uploadInboxFile(file);
        setInboxFileId(uploaded.id);
        setMethod("upload");
        const baseName = file.name.replace(/\.[^.]+$/, "");
        setName(baseName);
        applySuggestedDefaults(baseName);
        goTo("details");
      } catch (err) {
        setError(
          err instanceof ApiError
            ? `Upload failed. ${err.message} You can retry or add details manually instead.`
            : "Upload failed. You can retry or add details manually instead.",
        );
      } finally {
        setBusy(false);
      }
    },
    [announce, applySuggestedDefaults, goTo],
  );

  // ---- save document + optional reminder --------------------------------
  const saveDocument = useCallback(async () => {
    if (!name.trim()) {
      setError("Give your document a name so DueNest can track it.");
      return;
    }
    setBusy(true);
    setError(null);
    announce("Saving your document");
    const expiry = hasExpiry && expiryDate ? expiryDate : undefined;
    const categoryName =
      categories.find((c) => c.id === categoryId)?.name ?? undefined;

    try {
      let documentId: number;
      if (method === "upload" && inboxFileId != null) {
        const result = await createDocumentFromInboxFile(inboxFileId, {
          title: name.trim(),
          category: categoryId === "" ? undefined : categoryId,
          notes: notes || undefined,
          expiry_date: expiry,
        });
        documentId = result.document.id;
      } else {
        const doc = await createDocument({
          title: name.trim(),
          category: categoryId === "" ? null : categoryId,
          notes: notes || undefined,
          expiry_date: expiry ?? null,
        });
        documentId = doc.id;
      }

      let reminderCreated = false;
      if (expiry && reminderDays != null) {
        try {
          await createDocumentReminderRule(documentId, {
            trigger_type: "before_expiry",
            days_before: reminderDays,
            is_enabled: true,
          });
          reminderCreated = true;
        } catch {
          // Document is saved; a failed reminder must not lose their work.
          setError(
            "Your document was saved, but we couldn't set the reminder. You can add it later from the document.",
          );
        }
      }

      setPreview(
        buildFirstLifeRadarPreview({
          name: name.trim(),
          category: categoryName,
          expiryDate: expiry ?? null,
          reminderDaysBefore: reminderCreated ? reminderDays : null,
          hasFile: method === "upload",
        }),
      );
      try {
        await completeOnboarding();
      } catch {
        /* non-fatal */
      }
      setStep("success");
      void persist({ current_step: "success" });
      announce("Your first document is ready");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `We couldn't save this step. ${err.message}`
          : "We could not save this step. Your file is still safe. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }, [
    announce,
    categories,
    categoryId,
    expiryDate,
    hasExpiry,
    inboxFileId,
    method,
    name,
    notes,
    persist,
    reminderDays,
  ]);

  if (loading) return <ReadinessSkeleton />;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6 sm:py-10">
      <span className="sr-only" role="status" aria-live="polite">
        {status}
      </span>

      {step !== "welcome" && step !== "success" && (
        <ProgressBar step={step} />
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {step === "welcome" && <WelcomeStep onStart={() => goTo("use_case")} onSkip={skip} busy={busy} />}

      {step === "use_case" && (
        <UseCaseStep selected={goal} onSelect={chooseGoal} onSkip={skip} />
      )}

      {step === "document" && (
        <DocumentStep
          suggestions={suggestions}
          busy={busy}
          onUpload={() => fileInputRef.current?.click()}
          onScan={() => {
            void persist({ current_step: "document" });
            router.push("/dashboard/scanner");
          }}
          onManual={() => startManual("")}
          onPickSuggestion={(s) => startManual(s)}
          onSkip={skip}
        />
      )}

      {step === "details" && (
        <DetailsStep
          name={name}
          setName={(v) => {
            setName(v);
          }}
          onNameBlur={() => name && applySuggestedDefaults(name)}
          categories={categories}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          notes={notes}
          setNotes={setNotes}
          showNotes={showNotes}
          setShowNotes={setShowNotes}
          onBack={() => goTo("document")}
          onNext={() => {
            if (!name.trim()) {
              setError("Add a document name to continue.");
              return;
            }
            setError(null);
            goTo("expiry");
          }}
        />
      )}

      {step === "expiry" && (
        <ExpiryStep
          name={name}
          hasExpiry={hasExpiry}
          setHasExpiry={setHasExpiry}
          expiryDate={expiryDate}
          setExpiryDate={setExpiryDate}
          reminderDays={reminderDays}
          setReminderDays={setReminderDays}
          busy={busy}
          onBack={() => goTo("details")}
          onSave={saveDocument}
        />
      )}

      {step === "success" && preview && (
        <SuccessStep
          preview={preview}
          goal={goal}
          onDashboard={() => router.push("/dashboard")}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,application/pdf,.doc,.docx"
        className="sr-only"
        onChange={onPickFile}
      />
    </div>
  );
}

// ---- steps --------------------------------------------------------------

function ProgressBar({ step }: { step: ReadinessStep }) {
  const current = Math.min(STEP_INDEX[step] - 1, TOTAL_STEPS);
  const pct = Math.round((current / TOTAL_STEPS) * 100);
  return (
    <div className="mb-6">
      <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
        <span>Readiness setup</span>
        <span>{formatOnboardingProgress(current, TOTAL_STEPS)}</span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Readiness setup progress"
      >
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function WelcomeStep({
  onStart,
  onSkip,
  busy,
}: {
  onStart: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
        <ShieldCheck className="size-8 text-primary" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Let’s make your first important document ready.
        </h1>
        <p className="text-muted-foreground">
          Add one document, set what matters, and DueNest will help you stay ready
          before it’s due.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button size="lg" onClick={onStart} className="w-full">
          Start readiness setup
        </Button>
        <Button size="lg" variant="ghost" onClick={onSkip} disabled={busy} className="w-full">
          Skip for now
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Private by default · You stay in control · Setup takes about 3 minutes
      </p>
    </div>
  );
}

function UseCaseStep({
  selected,
  onSelect,
  onSkip,
}: {
  selected: ReadinessGoal | null;
  onSelect: (g: ReadinessGoal) => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-semibold">What do you want DueNest to help with first?</h2>
        <p className="text-sm text-muted-foreground">Pick one. You can change focus anytime.</p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {getOnboardingGoalOptions().map((opt) => {
          const Icon = GOAL_ICONS[opt.key];
          const active = selected === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSelect(opt.key)}
              aria-pressed={active}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/50",
              )}
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{opt.label}</span>
                <span className="block text-xs text-muted-foreground">{opt.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="text-center">
        <button type="button" onClick={onSkip} className="text-sm text-muted-foreground hover:underline">
          Skip for now
        </button>
      </div>
    </div>
  );
}

function DocumentStep({
  suggestions,
  busy,
  onUpload,
  onScan,
  onManual,
  onPickSuggestion,
  onSkip,
}: {
  suggestions: string[];
  busy: boolean;
  onUpload: () => void;
  onScan: () => void;
  onManual: () => void;
  onPickSuggestion: (s: string) => void;
  onSkip: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-semibold">Add your first important document.</h2>
        <p className="text-sm text-muted-foreground">
          Start with one file. You can organize more later.
        </p>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPickSuggestion(s)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:bg-muted/50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-2.5">
        <ActionRow icon={Upload} title="Upload a file" subtitle="PDF, image, or document" onClick={onUpload} busy={busy} />
        <ActionRow icon={ScanLine} title="Scan a document" subtitle="Use your camera" onClick={onScan} busy={busy} />
        <ActionRow icon={FileText} title="Add details manually" subtitle="No file needed right now" onClick={onManual} busy={busy} />
      </div>

      <div className="text-center">
        <button type="button" onClick={onSkip} className="text-sm text-muted-foreground hover:underline">
          I’ll do this later
        </button>
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  title,
  subtitle,
  onClick,
  busy,
}: {
  icon: typeof FileText;
  title: string;
  subtitle: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
    >
      <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{subtitle}</span>
      </span>
      {busy ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : (
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
      )}
    </button>
  );
}

function DetailsStep(props: {
  name: string;
  setName: (v: string) => void;
  onNameBlur: () => void;
  categories: DocumentCategory[];
  categoryId: number | "";
  setCategoryId: (v: number | "") => void;
  notes: string;
  setNotes: (v: string) => void;
  showNotes: boolean;
  setShowNotes: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Add only what matters now.</h2>
        <p className="text-sm text-muted-foreground">You can complete the rest later.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="doc-name">Document name</Label>
        <Input
          id="doc-name"
          value={props.name}
          onChange={(e) => props.setName(e.target.value)}
          onBlur={props.onNameBlur}
          placeholder="e.g. Passport"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="doc-category">Category</Label>
        <select
          id="doc-category"
          value={props.categoryId}
          onChange={(e) => props.setCategoryId(e.target.value ? Number(e.target.value) : "")}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <option value="">No category</option>
          {props.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {props.showNotes ? (
        <div className="space-y-2">
          <Label htmlFor="doc-notes">Notes</Label>
          <textarea
            id="doc-notes"
            value={props.notes}
            onChange={(e) => props.setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => props.setShowNotes(true)}
          className="text-sm text-muted-foreground hover:underline"
        >
          + Add a note (optional)
        </button>
      )}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={props.onBack} className="flex-1">
          Back
        </Button>
        <Button onClick={props.onNext} className="flex-1">
          Continue
        </Button>
      </div>
    </div>
  );
}

function ExpiryStep(props: {
  name: string;
  hasExpiry: boolean;
  setHasExpiry: (v: boolean) => void;
  expiryDate: string;
  setExpiryDate: (v: string) => void;
  reminderDays: number | null;
  setReminderDays: (v: number | null) => void;
  busy: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">When should DueNest remind you?</h2>
        <p className="text-sm text-muted-foreground">
          DueNest will show this in Life Radar before it becomes urgent.
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!props.hasExpiry}
            onChange={(e) => props.setHasExpiry(!e.target.checked)}
            className="size-4 rounded border-border"
          />
          This document has no expiry date
        </label>

        {props.hasExpiry && (
          <>
            <div className="space-y-2">
              <Label htmlFor="expiry-date">Expiry date</Label>
              <Input
                id="expiry-date"
                type="date"
                value={props.expiryDate}
                onChange={(e) => props.setExpiryDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Remind me</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Reminder timing">
                {REMINDER_DAY_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => props.setReminderDays(d)}
                    aria-pressed={props.reminderDays === d}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs transition-colors",
                      props.reminderDays === d
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card hover:bg-muted/50",
                    )}
                  >
                    {d} days before
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => props.setReminderDays(null)}
                  aria-pressed={props.reminderDays === null}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs transition-colors",
                    props.reminderDays === null
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card hover:bg-muted/50",
                  )}
                >
                  No reminder
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={props.onBack} disabled={props.busy} className="flex-1">
          Back
        </Button>
        <Button onClick={props.onSave} disabled={props.busy} className="flex-1">
          {props.busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Save document
        </Button>
      </div>
    </div>
  );
}

function SuccessStep({
  preview,
  goal,
  onDashboard,
}: {
  preview: LifeRadarPreview;
  goal: ReadinessGoal | null;
  onDashboard: () => void;
}) {
  const next = getPersonalizedNextAction(goal);
  return (
    <div className="space-y-6 py-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="size-7 text-emerald-500" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Your first document is ready.</h2>
          <p className="text-sm text-muted-foreground">
            {preview.hasReminder
              ? `DueNest will remind you ${preview.reminderStatus}.`
              : preview.hasExpiry
                ? "DueNest is now watching this date for you."
                : "Your document is now organized in your Vault."}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 text-left">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{preview.name}</p>
            <p className="text-xs text-muted-foreground">
              {preview.category} · {preview.expiryStatus} · {preview.reminderStatus}
            </p>
          </div>
          <BadgeCheck className="size-5 text-emerald-500" aria-hidden="true" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">One less thing to forget.</p>
      </div>

      <div className="flex flex-col gap-2">
        <Link
          href={next.href}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {next.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <button
          type="button"
          onClick={onDashboard}
          className="text-sm text-muted-foreground hover:underline"
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
}

function ReadinessSkeleton() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-10" aria-hidden="true">
      <div className="h-1.5 w-full animate-pulse rounded-full bg-muted" />
      <div className="h-8 w-2/3 animate-pulse rounded-lg bg-muted" />
      <div className="h-4 w-full animate-pulse rounded bg-muted" />
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
