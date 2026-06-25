"use client";

// Bulk Reminder Emails modal for CertaNest Portals (B2B). A calm 4-step flow:
//   1. choose a reminder type
//   2. preview recipients (eligible rows are pre-selected; ineligible rows show
//      why they're held back)
//   3. write an optional intro and send
//   4. see the result (sent / skipped / failed)
//
// Trust model: a candidate's `action_url` may carry the recipient's own public
// upload link (with a token) — we NEVER render it. We only ever show safe
// display fields (names, emails, titles, dates, status). Sending is admin/owner
// only; a 403 surfaces a clear "only admins can send reminders" message.

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
  Send,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/product-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { formatDate } from "@/lib/documents";
import {
  REMINDER_TYPE_DESCRIPTIONS,
  REMINDER_TYPE_LABELS,
  REMINDER_TYPE_ORDER,
  createReminderBatch,
  getReminderPreview,
  isPortalForbiddenError,
  reminderSkipLabel,
  selectableCandidates,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type {
  ReminderBatch,
  ReminderCandidate,
  ReminderPreview,
  ReminderType,
} from "@/types/portals";

type Step = "type" | "preview" | "message" | "result";

const MAX_INTRO = 600;

export interface ReminderModalProps {
  orgId: number;
  /** Pre-select a reminder type (e.g. opened from a queue's "Remind…"). */
  defaultType?: ReminderType;
  /** Scope the preview + batch to a single case (case detail entry point). */
  caseId?: number;
  onClose: () => void;
  /** Called after a batch is sent and the user clicks Done — triggers refresh. */
  onSent: () => void;
}

function friendlyError(err: unknown, fallback: string): string {
  if (isPortalForbiddenError(err)) {
    return "Only organization owners and admins can send reminders.";
  }
  if (err instanceof ApiError) return err.message;
  return fallback;
}

export function ReminderModal({
  orgId,
  defaultType,
  caseId,
  onClose,
  onSent,
}: ReminderModalProps) {
  // When a type is provided (opened from a queue/case), skip straight to the
  // preview; otherwise start on the type picker.
  const [step, setStep] = useState<Step>(defaultType ? "preview" : "type");
  const [reminderType, setReminderType] = useState<ReminderType>(
    defaultType ?? "missing_documents",
  );

  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  // When opened straight onto the preview step, show the loading state until the
  // mount fetch resolves.
  const [previewLoading, setPreviewLoading] = useState(Boolean(defaultType));
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [includeRecent, setIncludeRecent] = useState(false);

  // Selected candidate ids (only eligible candidates can be selected).
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [messageIntro, setMessageIntro] = useState("");
  const [overrideRecent, setOverrideRecent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<ReminderBatch | null>(null);

  // Fetch a preview for the current type + recent toggle. Every state write
  // happens after an `await`, so this is safe to call from an effect without
  // triggering a synchronous cascading render. `isStale` lets a caller cancel a
  // result that arrived after the modal moved on.
  const loadPreview = useCallback(
    async (
      type: ReminderType,
      withRecent: boolean,
      isStale?: () => boolean,
    ) => {
      // Yield once so the loading flag is set asynchronously, not synchronously
      // inside an effect body.
      await Promise.resolve();
      if (isStale?.()) return;
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const next = await getReminderPreview(orgId, {
          reminder_type: type,
          case_id: caseId,
          include_recently_reminded: withRecent,
        });
        if (isStale?.()) return;
        setPreview(next);
        // Default every eligible candidate to checked on each fresh load. The
        // preview re-fetches when the type or the recent toggle changes, so a
        // clean default-all selection is the clearest behavior.
        setSelected(
          new Set(
            selectableCandidates(next).map(
              (candidate) => candidate.candidate_id,
            ),
          ),
        );
      } catch (err) {
        if (isStale?.()) return;
        setPreview(null);
        setPreviewError(friendlyError(err, "Could not load recipients."));
      } finally {
        if (!isStale?.()) setPreviewLoading(false);
      }
    },
    [orgId, caseId],
  );

  // Load the initial preview once on mount when the modal opens straight onto
  // the preview step (i.e. a `defaultType` was supplied from a queue/case). The
  // type picker path loads its preview from `chooseType` instead. Fetching from
  // an external source on mount is a legitimate effect; the actual state writes
  // all happen after the awaited fetch.
  const initialType = defaultType;
  useEffect(() => {
    if (!initialType) return;
    let ignore = false;
    // Legitimate fetch-on-mount: loadPreview only writes state after the awaited
    // request resolves, and `ignore` cancels a stale result on unmount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPreview(initialType, false, () => ignore);
    return () => {
      ignore = true;
    };
  }, [initialType, loadPreview]);

  const eligible = useMemo(
    () => (preview ? selectableCandidates(preview) : []),
    [preview],
  );
  const selectedCount = useMemo(
    () => eligible.filter((c) => selected.has(c.candidate_id)).length,
    [eligible, selected],
  );

  function toggleCandidate(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function chooseType(type: ReminderType) {
    setReminderType(type);
    setIncludeRecent(false);
    setSelected(new Set());
    setStep("preview");
    void loadPreview(type, false);
  }

  // Toggle the "show recently reminded" filter and refetch with the new value.
  function changeIncludeRecent(value: boolean) {
    setIncludeRecent(value);
    void loadPreview(reminderType, value);
  }

  async function handleSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setSendError(null);
    try {
      const ids = eligible
        .map((c) => c.candidate_id)
        .filter((id) => selected.has(id));
      const batch = await createReminderBatch(orgId, {
        reminder_type: reminderType,
        selected_candidate_ids: ids,
        message_intro: messageIntro.trim() || undefined,
        case_id: caseId,
        send_now: true,
        override_recent_reminders: overrideRecent,
      });
      setResult(batch);
      setStep("result");
    } catch (err) {
      setSendError(friendlyError(err, "Could not send these reminders."));
    } finally {
      setSubmitting(false);
    }
  }

  const titleByStep: Record<Step, string> = {
    type: "Send reminders",
    preview: "Choose who to remind",
    message: "Review and send",
    result: "Reminders sent",
  };
  const descByStep: Record<Step, string> = {
    type: "Pick what you'd like to nudge people about. Nothing sends until you review and confirm.",
    preview:
      "These recipients match this reminder. Uncheck anyone you'd like to skip.",
    message:
      "Add an optional note. We'll send a calm email to each selected recipient.",
    result: "Here's how the reminders went out.",
  };

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label={titleByStep[step]}
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {/* Header back-arrow: the message step always returns to preview;
                  the preview step returns to the type picker only when the modal
                  wasn't opened pre-set to a type (queue/case entry points). */}
              {(step === "message" || (step === "preview" && !defaultType)) && (
                <button
                  type="button"
                  onClick={() =>
                    setStep(step === "message" ? "preview" : "type")
                  }
                  aria-label="Back"
                  className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                </button>
              )}
              <h2 className="font-heading text-lg font-semibold">
                {titleByStep[step]}
              </h2>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {descByStep[step]}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {step === "type" && (
          <TypeStep
            value={reminderType}
            onChoose={chooseType}
            onCancel={onClose}
          />
        )}

        {step === "preview" && (
          <PreviewStep
            preview={preview}
            loading={previewLoading}
            error={previewError}
            includeRecent={includeRecent}
            onToggleRecent={changeIncludeRecent}
            selected={selected}
            onToggleCandidate={toggleCandidate}
            selectedCount={selectedCount}
            eligibleCount={eligible.length}
            onRetry={() => void loadPreview(reminderType, includeRecent)}
            onBack={() => (defaultType ? onClose() : setStep("type"))}
            onContinue={() => setStep("message")}
          />
        )}

        {step === "message" && (
          <MessageStep
            subject={preview?.subject ?? ""}
            messageIntro={messageIntro}
            onChangeIntro={setMessageIntro}
            overrideRecent={overrideRecent}
            onToggleOverride={setOverrideRecent}
            selectedCount={selectedCount}
            submitting={submitting}
            error={sendError}
            onBack={() => setStep("preview")}
            onSend={handleSend}
          />
        )}

        {step === "result" && result && (
          <ResultStep batch={result} onDone={onSent} />
        )}
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

// ---- Step 1: choose type ----------------------------------------------------

function TypeStep({
  value,
  onChoose,
  onCancel,
}: {
  value: ReminderType;
  onChoose: (type: ReminderType) => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-5 flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {REMINDER_TYPE_ORDER.map((type) => {
          const active = type === value;
          return (
            <li key={type}>
              <button
                type="button"
                onClick={() => onChoose(type)}
                aria-pressed={active}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50",
                )}
              >
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Mail className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {REMINDER_TYPE_LABELS[type]}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {REMINDER_TYPE_DESCRIPTIONS[type]}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ---- Step 2: preview recipients ---------------------------------------------

function PreviewStep({
  preview,
  loading,
  error,
  includeRecent,
  onToggleRecent,
  selected,
  onToggleCandidate,
  selectedCount,
  eligibleCount,
  onRetry,
  onBack,
  onContinue,
}: {
  preview: ReminderPreview | null;
  loading: boolean;
  error: string | null;
  includeRecent: boolean;
  onToggleRecent: (value: boolean) => void;
  selected: Set<string>;
  onToggleCandidate: (id: string, checked: boolean) => void;
  selectedCount: number;
  eligibleCount: number;
  onRetry: () => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="mt-5 flex flex-col gap-4">
      <label className="flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={includeRecent}
          onChange={(e) => onToggleRecent(e.target.checked)}
          disabled={loading}
          className="size-4 rounded border-input"
        />
        <span>
          Show recently reminded
          <span className="block text-xs text-muted-foreground">
            Include people reminded in the last few days.
          </span>
        </span>
      </label>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <InlineAlert>
          {error}
          <button
            type="button"
            onClick={onRetry}
            className="ml-2 font-medium underline underline-offset-2"
          >
            Try again
          </button>
        </InlineAlert>
      ) : !preview || preview.candidates.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-3 py-8 text-center">
          <CheckCircle2 className="size-5 text-brand-success" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No one needs this reminder right now.
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {preview.candidates.map((candidate) => (
              <CandidateRow
                key={candidate.candidate_id}
                candidate={candidate}
                checked={selected.has(candidate.candidate_id)}
                onToggle={(checked) =>
                  onToggleCandidate(candidate.candidate_id, checked)
                }
              />
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {selectedCount} of {eligibleCount} selected
            {preview.count !== eligibleCount && (
              <> · {preview.count - eligibleCount} held back</>
            )}
          </p>
        </>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          disabled={loading || selectedCount === 0}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

function CandidateRow({
  candidate,
  checked,
  onToggle,
}: {
  candidate: ReminderCandidate;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const skip = reminderSkipLabel(candidate.skip_reason);
  const titles = candidate.missing_titles ?? [];
  const id = `cand-${candidate.candidate_id}`;
  return (
    <li
      className={cn(
        "rounded-lg border px-3 py-2.5",
        candidate.eligible ? "border-border" : "border-dashed border-border",
      )}
    >
      <label htmlFor={id} className="flex items-start gap-2.5">
        <input
          id={id}
          type="checkbox"
          checked={candidate.eligible && checked}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={!candidate.eligible}
          className="mt-0.5 size-4 shrink-0 rounded border-input disabled:opacity-50"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {candidate.recipient_name || "Recipient"}
              </span>
              {candidate.has_email && candidate.recipient_email && (
                <span className="block truncate text-xs text-muted-foreground">
                  {candidate.recipient_email}
                </span>
              )}
            </span>
            {skip && (
              <StatusBadge tone="neutral" withDot={false}>
                {skip}
              </StatusBadge>
            )}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="truncate">{candidate.case_title}</span>
            {candidate.document_title && (
              <span className="truncate">· {candidate.document_title}</span>
            )}
            {candidate.due_date && (
              <span>· Due {formatDate(candidate.due_date)}</span>
            )}
          </span>

          {titles.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {titles.slice(0, 4).map((title) => (
                <span
                  key={title}
                  className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                >
                  {title}
                </span>
              ))}
              {titles.length > 4 && (
                <span className="text-[11px] text-muted-foreground">
                  +{titles.length - 4} more
                </span>
              )}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}

// ---- Step 3: message --------------------------------------------------------

function MessageStep({
  subject,
  messageIntro,
  onChangeIntro,
  overrideRecent,
  onToggleOverride,
  selectedCount,
  submitting,
  error,
  onBack,
  onSend,
}: {
  subject: string;
  messageIntro: string;
  onChangeIntro: (value: string) => void;
  overrideRecent: boolean;
  onToggleOverride: (value: boolean) => void;
  selectedCount: number;
  submitting: boolean;
  error: string | null;
  onBack: () => void;
  onSend: (e: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="mt-5 flex flex-col gap-4" onSubmit={onSend}>
      <div className="flex flex-col gap-1.5">
        <Label>Subject</Label>
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          {subject || "Reminder"}
        </p>
        <p className="text-xs text-muted-foreground">
          The subject is set automatically for this reminder type.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reminder-intro">Add a note (optional)</Label>
        <Textarea
          id="reminder-intro"
          value={messageIntro}
          onChange={(e) => onChangeIntro(e.target.value.slice(0, MAX_INTRO))}
          rows={3}
          placeholder="A short, friendly line to open the email — e.g. a deadline or a thank-you."
          disabled={submitting}
        />
        <p className="text-xs text-muted-foreground">
          {messageIntro.length}/{MAX_INTRO}
        </p>
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={overrideRecent}
          onChange={(e) => onToggleOverride(e.target.checked)}
          disabled={submitting}
          className="mt-0.5 size-4 rounded border-input"
        />
        <span>
          Resend even if recently reminded
          <span className="block text-xs text-muted-foreground">
            Reaches people who were already nudged in the last few days.
          </span>
        </span>
      </label>

      {error && <InlineAlert>{error}</InlineAlert>}

      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs text-muted-foreground">
          {selectedCount} recipient{selectedCount === 1 ? "" : "s"}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={submitting}
          >
            Back
          </Button>
          <Button type="submit" disabled={submitting || selectedCount === 0}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            Send reminders
          </Button>
        </div>
      </div>
    </form>
  );
}

// ---- Step 4: result ---------------------------------------------------------

function ResultStep({
  batch,
  onDone,
}: {
  batch: ReminderBatch;
  onDone: () => void;
}) {
  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ResultStat label="Recipients" value={batch.recipient_count} />
        <ResultStat label="Sent" value={batch.sent_count} tone="good" />
        <ResultStat
          label="Skipped"
          value={batch.skipped_count}
          tone={batch.skipped_count ? "warn" : undefined}
        />
        <ResultStat
          label="Failed"
          value={batch.failed_count}
          tone={batch.failed_count ? "danger" : undefined}
        />
      </div>

      {batch.skipped.length > 0 && (
        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">Skipped recipients</p>
          <ul className="mt-2 space-y-1.5">
            {batch.skipped.map((skip, i) => (
              <li
                key={`${skip.email}-${i}`}
                className="flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0 truncate text-muted-foreground">
                  {skip.email || "No email"}
                </span>
                <StatusBadge tone="neutral" withDot={false}>
                  {reminderSkipLabel(skip.reason) || skip.reason || "Skipped"}
                </StatusBadge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {batch.sent_count === 0 && batch.skipped_count > 0 && (
        <InlineAlert tone="warn">
          No emails went out — everyone selected was held back. Try the
          &quot;Resend even if recently reminded&quot; option if needed.
        </InlineAlert>
      )}

      <div className="flex justify-end pt-1">
        <Button type="button" onClick={onDone}>
          <CheckCircle2 className="size-4" aria-hidden />
          Done
        </Button>
      </div>
    </div>
  );
}

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "warn" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-semibold",
          tone === "good" && value > 0 && "text-brand-success",
          tone === "warn" && value > 0 && "text-brand-amber",
          tone === "danger" && value > 0 && "text-destructive",
        )}
      >
        {value}
      </p>
    </div>
  );
}
