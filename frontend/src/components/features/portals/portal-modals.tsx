"use client";

// Shared create modals for the B2B portal: Add person and Create case. Extracted
// so the Overview, People, and Cases surfaces can each open them with their own
// open/close state without duplicating the forms. Writes require an admin/owner
// role; the caller is responsible for only rendering these when allowed.

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DrawerBackdrop, DrawerPanel } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineAlert } from "@/components/ui/product-ui";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  PORTAL_CASE_PRIORITY_LABELS,
  PORTAL_CASE_PRIORITY_ORDER,
  PORTAL_CASE_TYPE_LABELS,
  PORTAL_CASE_TYPE_ORDER,
  PORTAL_PERSON_TYPE_LABELS,
  PORTAL_PERSON_TYPE_ORDER,
  createPortalCase,
  createPortalPerson,
  isOrgLimitError,
} from "@/lib/portals";
import type {
  PortalCasePriority,
  PortalCaseType,
  PortalPerson,
  PortalPersonType,
} from "@/types/portals";

/**
 * Pick the best message for a create-form error. An `organization_plan_limit_exceeded`
 * error carries a clear, human `message` from the backend — surface that. Any
 * other ApiError uses its message; everything else uses the fallback.
 */
export function orgLimitMessage(err: unknown, fallback: string): string {
  if (isOrgLimitError(err)) {
    const message = (err.data as Record<string, unknown>).message;
    if (typeof message === "string" && message) return message;
  }
  if (err instanceof ApiError) return err.message;
  return fallback;
}

function ModalHeader({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  );
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

function selectClass() {
  return "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
}

export function AddPersonModal({
  orgId,
  onClose,
  onCreated,
}: {
  orgId: number;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [personType, setPersonType] = useState<PortalPersonType>("client");
  const [notes, setNotes] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(onClose);

  const nameEmpty = fullName.trim().length === 0;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (nameEmpty) {
      setNameTouched(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createPortalPerson(orgId, {
        full_name: fullName.trim(),
        person_type: personType,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      await onCreated();
    } catch (err) {
      setError(orgLimitMessage(err, "Could not add this person."));
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label="Add person"
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <ModalHeader
          title="Add person"
          description="Someone you're helping — a client, student, applicant, or employee."
          onClose={onClose}
        />
        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-name">
              Full name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pp-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={() => setNameTouched(true)}
              placeholder="e.g. Amina Diallo"
              aria-invalid={nameTouched && nameEmpty}
              disabled={submitting}
            />
            {nameTouched && nameEmpty && (
              <p className="text-xs text-destructive">
                Enter the person&apos;s full name.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-type">Type</Label>
            <select
              id="pp-type"
              value={personType}
              onChange={(e) => setPersonType(e.target.value as PortalPersonType)}
              className={selectClass()}
              disabled={submitting}
            >
              {PORTAL_PERSON_TYPE_ORDER.map((type) => (
                <option key={type} value={type}>
                  {PORTAL_PERSON_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pp-email">Email (optional)</Label>
              <Input
                id="pp-email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="amina@example.com"
                disabled={submitting}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pp-phone">Phone (optional)</Label>
              <Input
                id="pp-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                disabled={submitting}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pp-notes">Notes (optional)</Label>
            <Textarea
              id="pp-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything your team should know."
              disabled={submitting}
            />
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
              Add person
            </Button>
          </div>
        </form>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}

export function CreateCaseModal({
  orgId,
  people,
  onClose,
  onCreated,
}: {
  orgId: number;
  people: PortalPerson[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [personId, setPersonId] = useState<string>(
    people[0] ? String(people[0].id) : "",
  );
  const [title, setTitle] = useState("");
  const [caseType, setCaseType] = useState<PortalCaseType>("general");
  const [priority, setPriority] = useState<PortalCasePriority>("normal");
  const [dueDate, setDueDate] = useState("");
  const [requirementsText, setRequirementsText] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeClose(onClose);

  const titleEmpty = title.trim().length === 0;
  const personMissing = personId === "";

  // One requirement per non-empty line — kept simple and explicit.
  const requirements = useMemo(
    () =>
      requirementsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [requirementsText],
  );

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (titleEmpty || personMissing) {
      setTitleTouched(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createPortalCase(orgId, {
        person: Number(personId),
        title: title.trim(),
        case_type: caseType,
        priority,
        due_date: dueDate || undefined,
        requirements: requirements.length ? requirements : undefined,
      });
      await onCreated();
    } catch (err) {
      setError(orgLimitMessage(err, "Could not create this case."));
      setSubmitting(false);
    }
  }

  return (
    <DrawerBackdrop onClose={onClose}>
      <DrawerPanel
        label="Create case"
        onClick={(e) => e.stopPropagation()}
        className="max-w-lg"
      >
        <ModalHeader
          title="Create case"
          description="A document case for one person — collect, review, and get it ready."
          onClose={onClose}
        />
        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pc-person">
              Person <span className="text-destructive">*</span>
            </Label>
            <select
              id="pc-person"
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pc-title">
              Case title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              placeholder="e.g. Student visa application"
              aria-invalid={titleTouched && titleEmpty}
              disabled={submitting}
            />
            {titleTouched && titleEmpty && (
              <p className="text-xs text-destructive">
                Give the case a clear title.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pc-type">Type</Label>
              <select
                id="pc-type"
                value={caseType}
                onChange={(e) => setCaseType(e.target.value as PortalCaseType)}
                className={selectClass()}
                disabled={submitting}
              >
                {PORTAL_CASE_TYPE_ORDER.map((type) => (
                  <option key={type} value={type}>
                    {PORTAL_CASE_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pc-priority">Priority</Label>
              <select
                id="pc-priority"
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
            <Label htmlFor="pc-due">Due date (optional)</Label>
            <Input
              id="pc-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pc-reqs">Initial requirements (optional)</Label>
            <Textarea
              id="pc-reqs"
              value={requirementsText}
              onChange={(e) => setRequirementsText(e.target.value)}
              rows={3}
              placeholder={
                "One document per line, e.g.\nPassport copy\nBank statement"
              }
              disabled={submitting}
            />
            <p className="text-xs text-muted-foreground">
              {requirements.length} requirement
              {requirements.length === 1 ? "" : "s"} · one per line. You can add
              more later.
            </p>
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
            <Button
              type="submit"
              disabled={submitting || titleEmpty || personMissing}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Create case
            </Button>
          </div>
        </form>
      </DrawerPanel>
    </DrawerBackdrop>
  );
}
