"use client";

// Organization case templates (B2B Portals) — the two drawer modals:
//   • TemplateFormModal: create or edit a reusable case template, including an
//     ordered requirements builder.
//   • CreateCaseFromTemplateModal: spin a new portal case from a template —
//     choose a person, pick which requirements to include, tune the auto-create
//     toggles, then see what was created.
//
// Both mirror the ReminderModal's DrawerPanel + multi-step shell. Managing
// templates and creating cases is admin/owner only (a 403 surfaces a clear
// message). The create-case result may carry recipient-facing public links
// (room URL, request upload URLs) inside `result.case` — we NEVER render those
// as standalone text; we link to the case detail instead.

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/product-ui";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  CASE_TYPE_LABELS,
  CASE_TYPE_ORDER,
  PORTAL_CASE_PRIORITY_LABELS,
  PORTAL_CASE_PRIORITY_ORDER,
  createCaseFromTemplate,
  createPortalTemplate,
  getPortalTemplate,
  isOrgLimitError,
  isPortalForbiddenError,
  renderTemplateTitlePreview,
  templateWarningLabel,
  updatePortalTemplate,
} from "@/lib/portals";
import { cn } from "@/lib/utils";
import type {
  CaseType,
  CreateCaseFromTemplateResult,
  OrgCaseTemplate,
  OrgCaseTemplateBody,
  OrgCaseTemplateSummary,
  OrgTemplateRequirement,
  PortalCasePriority,
  PortalPerson,
} from "@/types/portals";

// A sample name used purely for the live title preview while editing a template.
const SAMPLE_PERSON_NAME = "Amina Diallo";

function selectClass() {
  return "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
}

function useEscapeClose(onClose: () => void) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/** Friendly copy for a template/case action error (admin-gated). */
function templateErrorMessage(err: unknown, fallback: string): string {
  if (isOrgLimitError(err)) {
    const message = (err.data as Record<string, unknown>).message;
    if (typeof message === "string" && message) return message;
  }
  if (isPortalForbiddenError(err)) {
    return "Only organization owners and admins can manage templates.";
  }
  if (err instanceof ApiError) return err.message;
  return fallback;
}

function ModalHeader({
  title,
  description,
  onBack,
  onClose,
}: {
  title: string;
  description: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </button>
          )}
          <h2 className="font-heading text-lg font-semibold">{title}</h2>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
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
  );
}

// ---- Template form modal (create / edit) ------------------------------------

// A requirement row in the builder. `key` is a stable client id for React keys
// and reordering; `id` (when present) is the backend requirement id.
interface RequirementDraft {
  key: string;
  id?: number;
  title: string;
  instructions: string;
  required: boolean;
  request_message: string;
  dueDaysOffset: string;
  /** Advisory, not editable in the V1 builder — preserved across edits. */
  acceptedFileTypes: string[];
}

let requirementKeySeq = 0;
function nextRequirementKey(): string {
  requirementKeySeq += 1;
  return `req-${requirementKeySeq}`;
}

function emptyRequirement(): RequirementDraft {
  return {
    key: nextRequirementKey(),
    title: "",
    instructions: "",
    required: true,
    request_message: "",
    dueDaysOffset: "",
    acceptedFileTypes: [],
  };
}

function requirementFromTemplate(
  requirement: OrgTemplateRequirement,
): RequirementDraft {
  return {
    key: nextRequirementKey(),
    id: requirement.id,
    title: requirement.title,
    instructions: requirement.instructions ?? "",
    required: requirement.required,
    request_message: requirement.request_message ?? "",
    dueDaysOffset:
      requirement.due_days_offset === null ||
      requirement.due_days_offset === undefined
        ? ""
        : String(requirement.due_days_offset),
    acceptedFileTypes: requirement.accepted_file_types ?? [],
  };
}

export interface TemplateFormModalProps {
  orgId: number;
  /** When set, the modal edits this template; otherwise it creates a new one. */
  template?: OrgCaseTemplate;
  onClose: () => void;
  onSaved: (template: OrgCaseTemplate) => void;
}

export function TemplateFormModal({
  orgId,
  template,
  onClose,
  onSaved,
}: TemplateFormModalProps) {
  const isEdit = Boolean(template);

  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [caseType, setCaseType] = useState<CaseType>(
    template?.case_type ?? "general",
  );
  const [defaultTitle, setDefaultTitle] = useState(
    template?.default_case_title ?? "{person_name} — ",
  );
  const [priority, setPriority] = useState<PortalCasePriority>(
    template?.default_priority ?? "normal",
  );
  const [dueDays, setDueDays] = useState(
    template?.default_due_days === null ||
      template?.default_due_days === undefined
      ? ""
      : String(template.default_due_days),
  );
  const [autoPack, setAutoPack] = useState(template?.auto_create_pack ?? false);
  const [autoRoom, setAutoRoom] = useState(template?.auto_create_room ?? false);
  const [autoRequests, setAutoRequests] = useState(
    template?.auto_create_requests ?? true,
  );
  const [roomTitle, setRoomTitle] = useState(
    template?.default_room_title ?? "",
  );
  const [roomDescription, setRoomDescription] = useState(
    template?.default_room_description ?? "",
  );
  const [requirements, setRequirements] = useState<RequirementDraft[]>(
    template && template.requirements.length > 0
      ? template.requirements.map(requirementFromTemplate)
      : [emptyRequirement()],
  );

  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(onClose);

  const nameEmpty = name.trim().length === 0;
  const titlePreview = renderTemplateTitlePreview(
    defaultTitle,
    SAMPLE_PERSON_NAME,
  );

  function updateRequirement(key: string, patch: Partial<RequirementDraft>) {
    setRequirements((prev) =>
      prev.map((req) => (req.key === key ? { ...req, ...patch } : req)),
    );
  }

  function removeRequirement(key: string) {
    setRequirements((prev) => prev.filter((req) => req.key !== key));
  }

  function addRequirement() {
    setRequirements((prev) => [...prev, emptyRequirement()]);
  }

  function moveRequirement(index: number, direction: -1 | 1) {
    setRequirements((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  function buildBody(): OrgCaseTemplateBody {
    // Keep only requirements with a title; set sort_order from final position.
    const cleaned: OrgTemplateRequirement[] = requirements
      .filter((req) => req.title.trim().length > 0)
      .map((req, index) => {
        const offset = req.dueDaysOffset.trim();
        return {
          ...(typeof req.id === "number" ? { id: req.id } : {}),
          title: req.title.trim(),
          instructions: req.instructions.trim() || undefined,
          required: req.required,
          sort_order: index,
          request_message: req.request_message.trim() || undefined,
          due_days_offset: offset === "" ? null : Number(offset),
          ...(req.acceptedFileTypes.length > 0
            ? { accepted_file_types: req.acceptedFileTypes }
            : {}),
        };
      });

    const dueDaysTrimmed = dueDays.trim();
    return {
      name: name.trim(),
      description: description.trim() || undefined,
      case_type: caseType,
      default_case_title: defaultTitle.trim() || undefined,
      default_priority: priority,
      default_due_days: dueDaysTrimmed === "" ? null : Number(dueDaysTrimmed),
      auto_create_pack: autoPack,
      auto_create_room: autoRoom,
      auto_create_requests: autoRequests,
      default_room_title: roomTitle.trim() || undefined,
      default_room_description: roomDescription.trim() || undefined,
      status: "active",
      requirements: cleaned,
    };
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (nameEmpty) {
      setNameTouched(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = buildBody();
      const saved =
        isEdit && template
          ? await updatePortalTemplate(orgId, template.id, body)
          : await createPortalTemplate(orgId, body);
      onSaved(saved);
    } catch (err) {
      setError(
        templateErrorMessage(
          err,
          isEdit
            ? "Could not save this template."
            : "Could not create this template.",
        ),
      );
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label={isEdit ? "Edit template" : "Create template"}
        onClick={(e) => e.stopPropagation()}
        className="max-w-xl"
      >
        <ModalHeader
          title={isEdit ? "Edit template" : "Create template"}
          description="A reusable blueprint your team can spin new cases from — the defaults and the documents each case needs."
          onClose={onClose}
        />

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-name">
              Template name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tpl-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              placeholder="e.g. Student visa application"
              aria-invalid={nameTouched && nameEmpty}
              disabled={submitting}
            />
            {nameTouched && nameEmpty && (
              <p className="text-xs text-destructive">
                Give the template a clear name.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-description">Description (optional)</Label>
            <Textarea
              id="tpl-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this template is for, so your team picks the right one."
              disabled={submitting}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-type">Case type</Label>
              <select
                id="tpl-type"
                value={caseType}
                onChange={(e) => setCaseType(e.target.value as CaseType)}
                className={selectClass()}
                disabled={submitting}
              >
                {CASE_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>
                    {CASE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-priority">Default priority</Label>
              <select
                id="tpl-priority"
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as PortalCasePriority)
                }
                className={selectClass()}
                disabled={submitting}
              >
                {PORTAL_CASE_PRIORITY_ORDER.map((value) => (
                  <option key={value} value={value}>
                    {PORTAL_CASE_PRIORITY_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-title">Default case title</Label>
            <Input
              id="tpl-title"
              value={defaultTitle}
              onChange={(e) => setDefaultTitle(e.target.value)}
              placeholder="e.g. {person_name} — Student visa"
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              Use <code className="rounded bg-muted px-1">{"{person_name}"}</code>{" "}
              and it&apos;s filled in per case.
              {defaultTitle.trim() && (
                <>
                  {" "}
                  Preview:{" "}
                  <span className="font-medium text-foreground">
                    {titlePreview}
                  </span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-due">Default due window (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="tpl-due"
                type="number"
                min={0}
                inputMode="numeric"
                value={dueDays}
                onChange={(e) => setDueDays(e.target.value)}
                placeholder="e.g. 30"
                className="max-w-32"
                disabled={submitting}
              />
              <span className="text-sm text-muted-foreground">
                days from when a case is created
              </span>
            </div>
          </div>

          {/* Auto-create toggles. */}
          <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-3">
            <legend className="px-1 text-sm font-medium">
              When a case is created
            </legend>
            <ToggleRow
              checked={autoRequests}
              onChange={setAutoRequests}
              disabled={submitting}
              label="Create document requests"
              hint="Turn each requirement into a request you can send."
            />
            <ToggleRow
              checked={autoPack}
              onChange={setAutoPack}
              disabled={submitting}
              label="Create an application pack"
              hint="Group the requirements into a pack for the case."
            />
            <ToggleRow
              checked={autoRoom}
              onChange={setAutoRoom}
              disabled={submitting}
              label="Create a sharing room"
              hint="A secure space to share the finished documents."
            />
          </fieldset>

          {autoRoom && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-room-title">Room title (optional)</Label>
                <Input
                  id="tpl-room-title"
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  placeholder="e.g. Visa documents"
                  disabled={submitting}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-room-desc">
                  Room description (optional)
                </Label>
                <Input
                  id="tpl-room-desc"
                  value={roomDescription}
                  onChange={(e) => setRoomDescription(e.target.value)}
                  placeholder="A short note for the recipient."
                  disabled={submitting}
                />
              </div>
            </div>
          )}

          {/* Requirements builder. */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Requirements</Label>
              <span className="text-xs text-muted-foreground">
                {requirements.filter((r) => r.title.trim()).length} with a title
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {requirements.map((req, index) => (
                <RequirementRow
                  key={req.key}
                  requirement={req}
                  index={index}
                  total={requirements.length}
                  disabled={submitting}
                  onChange={(patch) => updateRequirement(req.key, patch)}
                  onRemove={() => removeRequirement(req.key)}
                  onMove={(dir) => moveRequirement(index, dir)}
                />
              ))}
            </ul>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRequirement}
              disabled={submitting}
              className="w-fit"
            >
              <Plus className="size-4" aria-hidden /> Add requirement
            </Button>
          </div>

          {error && <InlineAlert>{error}</InlineAlert>}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || nameEmpty}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Save changes" : "Create template"}
            </Button>
          </div>
        </form>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function ToggleRow({
  checked,
  onChange,
  disabled,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 size-4 shrink-0 rounded border-input"
      />
      <span>
        {label}
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}

function RequirementRow({
  requirement,
  index,
  total,
  disabled,
  onChange,
  onRemove,
  onMove,
}: {
  requirement: RequirementDraft;
  index: number;
  total: number;
  disabled?: boolean;
  onChange: (patch: Partial<RequirementDraft>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const titleId = `${requirement.key}-title`;
  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-start gap-2">
        <div className="mt-1 flex flex-col items-center gap-0.5 text-muted-foreground">
          <GripVertical className="size-4 opacity-60" aria-hidden />
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={disabled || index === 0}
              aria-label="Move up"
              className="text-xs leading-none text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              ▲
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={disabled || index === total - 1}
              aria-label="Move down"
              className="text-xs leading-none text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
            >
              ▼
            </button>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Input
              id={titleId}
              value={requirement.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder={`Requirement ${index + 1} — e.g. Passport copy`}
              disabled={disabled}
              className="h-9"
            />
            <button
              type="button"
              onClick={onRemove}
              disabled={disabled}
              aria-label="Remove requirement"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>

          <Textarea
            value={requirement.instructions}
            onChange={(e) => onChange({ instructions: e.target.value })}
            rows={2}
            placeholder="Instructions for the recipient (optional)."
            disabled={disabled}
          />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={requirement.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                disabled={disabled}
                className="size-4 rounded border-input"
              />
              Required
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Due offset
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                value={requirement.dueDaysOffset}
                onChange={(e) => onChange({ dueDaysOffset: e.target.value })}
                placeholder="days"
                disabled={disabled}
                className="h-8 w-20"
              />
            </label>
          </div>

          <Input
            value={requirement.request_message}
            onChange={(e) => onChange({ request_message: e.target.value })}
            placeholder="Request email message (optional)."
            disabled={disabled}
            className="h-9"
          />
        </div>
      </div>
    </li>
  );
}

// ---- Create case from template modal ----------------------------------------

type CreateStep = "form" | "result";

export interface CreateCaseFromTemplateModalProps {
  orgId: number;
  /** The template summary the case is created from (we fetch the full detail). */
  template: OrgCaseTemplateSummary;
  people: PortalPerson[];
  onClose: () => void;
  /** Called after the user finishes reviewing the result (triggers refresh). */
  onCreated: () => void;
}

export function CreateCaseFromTemplateModal({
  orgId,
  template,
  people,
  onClose,
  onCreated,
}: CreateCaseFromTemplateModalProps) {
  const [step, setStep] = useState<CreateStep>("form");
  const [detail, setDetail] = useState<OrgCaseTemplate | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [personId, setPersonId] = useState<string>(
    people[0] ? String(people[0].id) : "",
  );
  const [title, setTitle] = useState("");
  // Tracks whether the user edited the title, so we don't clobber their edit when
  // the person changes (which otherwise re-renders the title preview).
  const [titleEdited, setTitleEdited] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [createPack, setCreatePack] = useState(false);
  const [createRoom, setCreateRoom] = useState(false);
  const [createRequests, setCreateRequests] = useState(true);
  const [sendEmails, setSendEmails] = useState(false);
  const [selectedReqIds, setSelectedReqIds] = useState<Set<number>>(new Set());

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateCaseFromTemplateResult | null>(
    null,
  );

  useEscapeClose(onClose);

  const selectedPerson = useMemo(
    () => people.find((p) => String(p.id) === personId) ?? null,
    [people, personId],
  );

  // Load the full template (defaults + requirements) once on mount. All state
  // writes happen after the awaited fetch; `ignore` cancels a stale result.
  const loadDetail = useCallback(async (isStale: () => boolean) => {
    await Promise.resolve();
    if (isStale()) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const full = await getPortalTemplate(orgId, template.id);
      if (isStale()) return;
      setDetail(full);
      // Seed the auto-create toggles + selected requirements from the template.
      setCreatePack(full.auto_create_pack);
      setCreateRoom(full.auto_create_room);
      setCreateRequests(full.auto_create_requests);
      setSelectedReqIds(
        new Set(
          full.requirements
            .map((req) => req.id)
            .filter((id): id is number => typeof id === "number"),
        ),
      );
    } catch (err) {
      if (isStale()) return;
      setDetailError(
        templateErrorMessage(err, "Could not load this template."),
      );
    } finally {
      if (!isStale()) setDetailLoading(false);
    }
  }, [orgId, template.id]);

  useEffect(() => {
    let ignore = false;
    // Legitimate fetch-on-mount: writes only happen after the awaited request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDetail(() => ignore);
    return () => {
      ignore = true;
    };
  }, [loadDetail]);

  // Keep the title in sync with the template pattern + selected person until the
  // user edits it themselves.
  const personName = selectedPerson?.full_name ?? "";
  const titlePattern = detail?.default_case_title ?? "";
  useEffect(() => {
    if (titleEdited) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitle(renderTemplateTitlePreview(titlePattern, personName));
  }, [titleEdited, titlePattern, personName]);

  // Default the due date from the template's due window, once, when detail loads.
  const defaultDueDays = detail?.default_due_days ?? null;
  useEffect(() => {
    if (defaultDueDays === null || defaultDueDays === undefined) return;
    const date = new Date();
    date.setDate(date.getDate() + defaultDueDays);
    const iso = date.toISOString().slice(0, 10);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDueDate(iso);
  }, [defaultDueDays]);

  function toggleRequirement(id: number, checked: boolean) {
    setSelectedReqIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const personMissing = personId === "";
  const requirements = detail?.requirements ?? [];
  const selectableReqs = requirements.filter(
    (req): req is OrgTemplateRequirement & { id: number } =>
      typeof req.id === "number",
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (personMissing) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await createCaseFromTemplate(orgId, template.id, {
        person_id: Number(personId),
        title: title.trim() || undefined,
        // Send the chosen date; when blank, omit it so the backend can compute a
        // due date from the template's default window.
        due_date: dueDate || undefined,
        create_pack: createPack,
        create_room: createRoom,
        create_requests: createRequests,
        send_request_emails: sendEmails,
        // Only send the selection when requests are on AND a subset is chosen.
        selected_requirement_ids:
          createRequests && selectableReqs.length > 0
            ? selectableReqs
                .map((req) => req.id)
                .filter((id) => selectedReqIds.has(id))
            : undefined,
      });
      setResult(created);
      setStep("result");
    } catch (err) {
      setError(templateErrorMessage(err, "Could not create this case."));
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label="Create case from template"
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <ModalHeader
          title={
            step === "result" ? "Case created" : "Create case from template"
          }
          description={
            step === "result"
              ? "Here's what was set up for this case."
              : `Spin a new case from “${template.name}”. Nothing sends until you confirm.`
          }
          onClose={onClose}
        />

        {step === "form" && (
          <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
            {people.length === 0 ? (
              <InlineAlert tone="warn">
                Add a person to the portal first, then create a case from this
                template.
              </InlineAlert>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ct-person">
                  Person <span className="text-destructive">*</span>
                </Label>
                <select
                  id="ct-person"
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  className={selectClass()}
                  disabled={submitting}
                >
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ct-title">Case title</Label>
              <Input
                id="ct-title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleEdited(true);
                }}
                placeholder="e.g. Student visa application"
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                Prefilled from the template. Edit it for this case if you like.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ct-due">Due date (optional)</Label>
              <Input
                id="ct-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                Leave blank to use the template&apos;s default window.
              </p>
            </div>

            {/* Requirement preview with per-requirement selection. */}
            {detailLoading ? (
              <p className="text-sm text-muted-foreground">
                Loading the template&apos;s requirements…
              </p>
            ) : detailError ? (
              <InlineAlert>{detailError}</InlineAlert>
            ) : selectableReqs.length > 0 ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <Label>Requirements to include</Label>
                  <span className="text-xs text-muted-foreground">
                    {
                      selectableReqs.filter((r) => selectedReqIds.has(r.id))
                        .length
                    }{" "}
                    of {selectableReqs.length}
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {selectableReqs.map((req) => {
                    const id = `ct-req-${req.id}`;
                    return (
                      <li
                        key={req.id}
                        className="rounded-lg border border-border px-3 py-2"
                      >
                        <label
                          htmlFor={id}
                          className="flex items-start gap-2.5"
                        >
                          <input
                            id={id}
                            type="checkbox"
                            checked={selectedReqIds.has(req.id)}
                            onChange={(e) =>
                              toggleRequirement(req.id, e.target.checked)
                            }
                            disabled={submitting}
                            className="mt-0.5 size-4 shrink-0 rounded border-input"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">
                                {req.title}
                              </span>
                              {req.required && (
                                <StatusBadge tone="info" withDot={false}>
                                  Required
                                </StatusBadge>
                              )}
                            </span>
                            {req.instructions && (
                              <span className="mt-0.5 block text-xs text-muted-foreground">
                                {req.instructions}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                This template has no requirements — the case starts empty.
              </p>
            )}

            {/* Auto-create toggles, seeded from the template's defaults. */}
            <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-3">
              <legend className="px-1 text-sm font-medium">
                What to set up
              </legend>
              <ToggleRow
                checked={createRequests}
                onChange={setCreateRequests}
                disabled={submitting}
                label="Create document requests"
                hint="From the selected requirements above."
              />
              <ToggleRow
                checked={createPack}
                onChange={setCreatePack}
                disabled={submitting}
                label="Create an application pack"
                hint="Group the requirements into a pack."
              />
              <ToggleRow
                checked={createRoom}
                onChange={setCreateRoom}
                disabled={submitting}
                label="Create a sharing room"
                hint="A secure space for the finished documents."
              />
              <ToggleRow
                checked={sendEmails}
                onChange={setSendEmails}
                disabled={submitting || !createRequests}
                label="Email recipients their request links"
                hint="Off by default — review the case first, then send."
              />
            </fieldset>

            {error && <InlineAlert>{error}</InlineAlert>}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={submitting || personMissing || detailLoading}
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Create case
              </Button>
            </div>
          </form>
        )}

        {step === "result" && result && (
          <CreateCaseResult
            orgId={orgId}
            result={result}
            onDone={onCreated}
          />
        )}
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

function CreateCaseResult({
  orgId,
  result,
  onDone,
}: {
  orgId: number;
  result: CreateCaseFromTemplateResult;
  onDone: () => void;
}) {
  const caseHref = `/dashboard/organizations/${orgId}/portal/cases/${result.case.id}`;
  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="flex items-center gap-2.5 rounded-xl border border-brand-success/25 bg-brand-success/10 p-3 text-sm">
        <CheckCircle2 className="size-5 shrink-0 text-brand-success" aria-hidden />
        <p className="min-w-0">
          <span className="font-medium text-foreground">
            {result.case.title}
          </span>{" "}
          is ready to work.
        </p>
      </div>

      <ul className="grid grid-cols-3 gap-2 text-center">
        <ResultStat
          label="Requests"
          value={result.created_requests_count}
        />
        <ResultStat label="Pack" value={result.pack_created ? "Yes" : "—"} />
        <ResultStat label="Room" value={result.room_created ? "Yes" : "—"} />
      </ul>

      {result.skipped_requirements.length > 0 && (
        <div className="rounded-xl border border-border p-3">
          <p className="text-sm font-medium">Skipped requirements</p>
          <ul className="mt-2 flex flex-wrap gap-1">
            {result.skipped_requirements.map((title) => (
              <li
                key={title}
                className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
              >
                {title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.warnings.length > 0 && (
        <InlineAlert tone="warn">
          <span className="font-medium">Some extras weren&apos;t created:</span>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {result.warnings.map((warning) => (
              <li key={warning}>{templateWarningLabel(warning)}</li>
            ))}
          </ul>
        </InlineAlert>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onDone}>
          Done
        </Button>
        <Link
          href={caseHref}
          className={cn(buttonVariants({}), "w-fit")}
        >
          <ClipboardList className="size-4" aria-hidden /> Open case
        </Link>
      </div>
    </div>
  );
}

function ResultStat({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </li>
  );
}
