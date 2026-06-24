"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  IdCard,
  Loader2,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { InlineAlert, TrustNotice } from "@/components/ui/product-ui";
import { SectionCard } from "@/components/ui/section-card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_CATEGORY_LABELS,
  COMMON_ANSWER_CATEGORIES,
  COMMON_ANSWER_CATEGORY_LABELS,
  SKILL_CATEGORIES,
  SKILL_CATEGORY_LABELS,
  completenessLabelTone,
  createAchievement,
  createCommonAnswer,
  createEducation,
  createSkill,
  createWork,
  deleteAchievement,
  deleteCommonAnswer,
  deleteEducation,
  deleteSkill,
  deleteWork,
  getSmartProfile,
  updateAchievement,
  updateCommonAnswer,
  updateEducation,
  updateSkill,
  updateSmartProfileExtras,
  updateWork,
} from "@/lib/smart-profile";
import { cn } from "@/lib/utils";
import type {
  AchievementCategory,
  CommonAnswerCategory,
  SkillCategory,
  SmartProfileAchievement,
  SmartProfileCommonAnswer,
  SmartProfileCompleteness,
  SmartProfileEducation,
  SmartProfileExtras,
  SmartProfilePayload,
  SmartProfileSkill,
  SmartProfileWork,
} from "@/types/smart-profile";

const SETTINGS_PROFILE_HREF = "/dashboard/settings/profile";

const TONE_BAR_CLASS: Record<
  ReturnType<typeof completenessLabelTone>,
  string
> = {
  good: "bg-brand-success",
  secure: "bg-primary",
  warn: "bg-brand-amber",
  danger: "bg-destructive",
  default: "bg-primary",
};

const selectClass =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

// --- Completeness card ---

function CompletenessCard({
  completeness,
}: {
  completeness: SmartProfileCompleteness;
}) {
  const tone = completenessLabelTone(completeness.label);
  const score = Math.max(0, Math.min(100, completeness.score));
  const incompleteSections = completeness.sections.filter((s) => !s.complete);

  return (
    <SectionCard
      title="Profile completeness"
      description="A more complete profile fills applications and drafts faster."
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-end justify-between gap-3">
            <p className="text-2xl font-semibold leading-none">{score}%</p>
            <StatusBadge
              tone={tone === "good" ? "success" : tone === "warn" ? "warning" : "info"}
            >
              {completeness.label}
            </StatusBadge>
          </div>
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={score}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Smart Profile completeness"
          >
            <div
              className={cn("h-full rounded-full transition-all", TONE_BAR_CLASS[tone])}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {incompleteSections.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {incompleteSections.map((section) => (
              <span
                key={section.key}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"
              >
                <span className="size-1.5 rounded-full bg-brand-amber" aria-hidden />
                {section.label}
              </span>
            ))}
          </div>
        )}

        {completeness.next_actions.length > 0 && (
          <ul className="space-y-1.5">
            {completeness.next_actions.map((action, i) => (
              <li
                key={`${action.type}-${i}`}
                className="flex items-start gap-2 text-sm text-muted-foreground"
              >
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                {action.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  );
}

// --- Basic identity (read-only) ---

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value || "—"}</span>
    </div>
  );
}

function IdentitySection({
  identity,
}: {
  identity: SmartProfilePayload["identity"];
}) {
  return (
    <SectionCard
      title="Basic identity"
      description="Pulled from your secure profile. Edit these in Settings → Profile."
      action={
        <Link
          href={SETTINGS_PROFILE_HREF}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Manage
          <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <IdentityRow label="Legal full name" value={identity.legal_full_name} />
          <IdentityRow label="Preferred name" value={identity.preferred_name} />
          <IdentityRow label="Date of birth" value={identity.date_of_birth} />
          <IdentityRow label="Nationality" value={identity.nationality} />
          <IdentityRow label="Phone number" value={identity.phone_number} />
          <IdentityRow label="Address on file" value={identity.address_on_file} />
        </div>
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {identity.has_passport_number ? (
            <StatusBadge tone="trust">Passport on file ✓</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">No passport on file</StatusBadge>
          )}
          {identity.has_national_id ? (
            <StatusBadge tone="trust">National ID on file ✓</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">No national ID on file</StatusBadge>
          )}
        </div>
        <p className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/[0.04] px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
          <span>
            Document numbers are encrypted and never displayed here. Manage
            identity &amp; document numbers in{" "}
            <Link
              href={SETTINGS_PROFILE_HREF}
              className="font-medium text-primary hover:underline"
            >
              Settings → Profile
            </Link>
            .
          </span>
        </p>
      </div>
    </SectionCard>
  );
}

// --- Application details (editable extras) ---

const EXTRAS_FIELDS: {
  key: keyof SmartProfileExtras;
  label: string;
  type?: string;
  textarea?: boolean;
  autoComplete?: string;
}[] = [
  {
    key: "email_for_applications",
    label: "Email for applications",
    type: "email",
    autoComplete: "email",
  },
  { key: "country_of_residence", label: "Country of residence", autoComplete: "country-name" },
  { key: "current_address", label: "Current address", textarea: true },
  { key: "permanent_address", label: "Permanent address", textarea: true },
  { key: "passport_expiry_date", label: "Passport expiry date", type: "date" },
  { key: "emergency_contact_name", label: "Emergency contact name" },
  { key: "emergency_contact_relationship", label: "Emergency contact relationship" },
  { key: "emergency_contact_phone", label: "Emergency contact phone", type: "tel" },
];

const ApplicationDetailsSection = ({
  extras,
  onSaved,
  formRef,
}: {
  extras: SmartProfileExtras;
  onSaved: (payload: SmartProfilePayload) => void;
  formRef: React.RefObject<HTMLFormElement | null>;
}) => {
  const [draft, setDraft] = useState<SmartProfileExtras>(extras);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(key: keyof SmartProfileExtras, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload = await updateSmartProfileExtras(draft);
      onSaved(payload);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't save your details.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Application details"
      description="Reusable info applications and forms ask for again and again."
    >
      <form ref={formRef} onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {EXTRAS_FIELDS.map((field) => (
            <div
              key={field.key}
              className={cn("grid gap-1.5", field.textarea && "sm:col-span-2")}
            >
              <Label htmlFor={`extra-${field.key}`}>{field.label}</Label>
              {field.textarea ? (
                <Textarea
                  id={`extra-${field.key}`}
                  value={draft[field.key]}
                  onChange={(e) => update(field.key, e.target.value)}
                  rows={2}
                />
              ) : (
                <Input
                  id={`extra-${field.key}`}
                  type={field.type ?? "text"}
                  value={draft[field.key]}
                  onChange={(e) => update(field.key, e.target.value)}
                  autoComplete={field.autoComplete}
                />
              )}
            </div>
          ))}
        </div>

        {error && <InlineAlert>{error}</InlineAlert>}

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Save details
          </Button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-brand-success">
              <Check className="size-4" /> Saved
            </span>
          )}
        </div>
      </form>
    </SectionCard>
  );
};

// --- Shared collection-section scaffolding ---

interface CollectionSectionProps<T extends { id: number }> {
  title: string;
  description: string;
  items: T[];
  emptyHint: string;
  onChanged: () => void;
  renderItem: (item: T) => React.ReactNode;
  renderForm: (args: {
    item: T | null;
    onDone: () => void;
    onError: (message: string) => void;
  }) => React.ReactNode;
  deleteItem: (id: number) => Promise<void>;
  itemLabel: (item: T) => string;
  setEditing: (item: T | null) => void;
  editing: T | null;
  adding: boolean;
  setAdding: (v: boolean) => void;
}

function CollectionSection<T extends { id: number }>({
  title,
  description,
  items,
  emptyHint,
  onChanged,
  renderItem,
  renderForm,
  deleteItem,
  itemLabel,
  setEditing,
  editing,
  adding,
  setAdding,
}: CollectionSectionProps<T>) {
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<T | null>(null);
  const [deleting, setDeleting] = useState(false);

  function closeForms() {
    setAdding(false);
    setEditing(null);
    setError(null);
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteItem(pendingDelete.id);
      setPendingDelete(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete that.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <SectionCard
      title={title}
      description={description}
      action={
        !adding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(null);
              setAdding(true);
              setError(null);
            }}
          >
            <Plus className="size-4" /> Add
          </Button>
        )
      }
    >
      <div className="space-y-3">
        {error && <InlineAlert>{error}</InlineAlert>}

        {adding && (
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            {renderForm({
              item: null,
              onDone: () => {
                closeForms();
                onChanged();
              },
              onError: setError,
            })}
          </div>
        )}

        {items.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-border bg-card p-3"
              >
                {editing?.id === item.id ? (
                  renderForm({
                    item,
                    onDone: () => {
                      closeForms();
                      onChanged();
                    },
                    onError: setError,
                  })
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">{renderItem(item)}</div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${itemLabel(item)}`}
                        onClick={() => {
                          setAdding(false);
                          setEditing(item);
                          setError(null);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${itemLabel(item)}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setPendingDelete(item)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this entry?"
        description={
          pendingDelete
            ? `"${itemLabel(pendingDelete)}" will be permanently removed from your profile.`
            : ""
        }
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </SectionCard>
  );
}

/** Save / cancel row reused by every inline collection form. */
function FormActions({
  saving,
  onCancel,
  saveLabel,
}: {
  saving: boolean;
  onCancel: () => void;
  saveLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button type="submit" size="sm" disabled={saving}>
        {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        {saveLabel}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
        <X className="size-4" /> Cancel
      </Button>
    </div>
  );
}

// --- Page ---

export default function SmartProfilePage() {
  const [profile, setProfile] = useState<SmartProfilePayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // One editing/adding cursor per collection.
  const [eduEditing, setEduEditing] = useState<SmartProfileEducation | null>(null);
  const [eduAdding, setEduAdding] = useState(false);
  const [workEditing, setWorkEditing] = useState<SmartProfileWork | null>(null);
  const [workAdding, setWorkAdding] = useState(false);
  const [skillEditing, setSkillEditing] = useState<SmartProfileSkill | null>(null);
  const [skillAdding, setSkillAdding] = useState(false);
  const [achEditing, setAchEditing] = useState<SmartProfileAchievement | null>(null);
  const [achAdding, setAchAdding] = useState(false);
  const [ansEditing, setAnsEditing] = useState<SmartProfileCommonAnswer | null>(null);
  const [ansAdding, setAnsAdding] = useState(false);

  const detailsFormRef = useRef<HTMLFormElement>(null);

  const load = useCallback(() => {
    getSmartProfile()
      .then((payload) => {
        setProfile(payload);
        setLoadError(null);
      })
      .catch((err) =>
        setLoadError(
          err instanceof ApiError ? err.message : "Unable to load your profile.",
        ),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function focusDetails() {
    detailsFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const firstInput =
      detailsFormRef.current?.querySelector<HTMLInputElement>("input, textarea");
    firstInput?.focus();
  }

  if (loadError) {
    return (
      <PageContainer width="default">
        <PageHeader
          title="Smart Profile"
          description="Reusable information for applications, forms, and document drafts."
        />
        <InlineAlert>{loadError}</InlineAlert>
        <Button variant="outline" onClick={load}>
          Try again
        </Button>
      </PageContainer>
    );
  }

  if (profile === null) {
    return (
      <PageContainer width="default">
        <span className="sr-only" role="status">
          Loading your Smart Profile…
        </span>
        <PageHeader
          title="Smart Profile"
          description="Reusable information for applications, forms, and document drafts."
        />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </PageContainer>
    );
  }

  const everythingEmpty =
    profile.education.length === 0 &&
    profile.work.length === 0 &&
    profile.skills.length === 0 &&
    profile.achievements.length === 0 &&
    profile.common_answers.length === 0 &&
    Object.values(profile.extras).every((v) => v.trim() === "");

  return (
    <PageContainer width="default">
      <PageHeader
        eyebrow="Account"
        title="Smart Profile"
        description="Reusable information for applications, forms, and document drafts."
      />

      <CompletenessCard completeness={profile.completeness} />

      {everythingEmpty && (
        <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center">
          <IdCard className="mx-auto size-7 text-muted-foreground/60" />
          <p className="mt-3 text-sm font-medium">
            Build your Smart Profile once, reuse it for applications, letters, CVs,
            and forms.
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Add the details applications keep asking for, plus your education,
            experience, skills, and achievements.
          </p>
          <Button className="mt-4" onClick={focusDetails}>
            <Plus className="size-4" /> Start profile
          </Button>
        </div>
      )}

      <IdentitySection identity={profile.identity} />

      <ApplicationDetailsSection
        key={profile.updated_at}
        extras={profile.extras}
        onSaved={setProfile}
        formRef={detailsFormRef}
      />

      {/* Education */}
      <CollectionSection<SmartProfileEducation>
        title="Education"
        description="Schools, degrees, and programs you can reuse on applications."
        items={profile.education}
        emptyHint="No education added yet."
        onChanged={load}
        editing={eduEditing}
        setEditing={setEduEditing}
        adding={eduAdding}
        setAdding={setEduAdding}
        deleteItem={deleteEducation}
        itemLabel={(item) => item.institution_name}
        renderItem={(item) => (
          <>
            <p className="text-sm font-medium">{item.institution_name}</p>
            {(item.degree_or_program || item.field_of_study) && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[item.degree_or_program, item.field_of_study]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.currently_studying
                ? `${item.start_date ?? ""} – Present`
                : [item.start_date, item.end_date].filter(Boolean).join(" – ")}
              {item.country ? ` · ${item.country}` : ""}
            </p>
          </>
        )}
        renderForm={({ item, onDone, onError }) => (
          <EducationForm item={item} onDone={onDone} onError={onError} />
        )}
      />

      {/* Work */}
      <CollectionSection<SmartProfileWork>
        title="Work / experience"
        description="Roles and experience to drop into applications and CVs."
        items={profile.work}
        emptyHint="No experience added yet."
        onChanged={load}
        editing={workEditing}
        setEditing={setWorkEditing}
        adding={workAdding}
        setAdding={setWorkAdding}
        deleteItem={deleteWork}
        itemLabel={(item) => item.organization_name}
        renderItem={(item) => (
          <>
            <p className="text-sm font-medium">
              {item.role_title ? `${item.role_title} · ` : ""}
              {item.organization_name}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.currently_working
                ? `${item.start_date ?? ""} – Present`
                : [item.start_date, item.end_date].filter(Boolean).join(" – ")}
              {item.location ? ` · ${item.location}` : ""}
            </p>
          </>
        )}
        renderForm={({ item, onDone, onError }) => (
          <WorkForm item={item} onDone={onDone} onError={onError} />
        )}
      />

      {/* Skills */}
      <CollectionSection<SmartProfileSkill>
        title="Skills"
        description="Skills, languages, and tools you can list on applications."
        items={profile.skills}
        emptyHint="No skills added yet."
        onChanged={load}
        editing={skillEditing}
        setEditing={setSkillEditing}
        adding={skillAdding}
        setAdding={setSkillAdding}
        deleteItem={deleteSkill}
        itemLabel={(item) => item.name}
        renderItem={(item) => (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{item.name}</p>
            <StatusBadge tone="neutral">
              {SKILL_CATEGORY_LABELS[item.category]}
            </StatusBadge>
            {item.proficiency && (
              <span className="text-xs text-muted-foreground">
                {item.proficiency}
              </span>
            )}
          </div>
        )}
        renderForm={({ item, onDone, onError }) => (
          <SkillForm item={item} onDone={onDone} onError={onError} />
        )}
      />

      {/* Achievements */}
      <CollectionSection<SmartProfileAchievement>
        title="Achievements"
        description="Awards, certifications, and milestones worth highlighting."
        items={profile.achievements}
        emptyHint="No achievements added yet."
        onChanged={load}
        editing={achEditing}
        setEditing={setAchEditing}
        adding={achAdding}
        setAdding={setAchAdding}
        deleteItem={deleteAchievement}
        itemLabel={(item) => item.title}
        renderItem={(item) => (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{item.title}</p>
              <StatusBadge tone="neutral">
                {ACHIEVEMENT_CATEGORY_LABELS[item.category]}
              </StatusBadge>
              {item.date && (
                <span className="text-xs text-muted-foreground">{item.date}</span>
              )}
            </div>
            {item.description && (
              <p className="mt-1 text-xs text-muted-foreground">
                {item.description}
              </p>
            )}
          </>
        )}
        renderForm={({ item, onDone, onError }) => (
          <AchievementForm item={item} onDone={onDone} onError={onError} />
        )}
      />

      {/* Common answers */}
      <CollectionSection<SmartProfileCommonAnswer>
        title="Common answers"
        description="Saved responses to questions applications ask over and over."
        items={profile.common_answers}
        emptyHint="No saved answers yet."
        onChanged={load}
        editing={ansEditing}
        setEditing={setAnsEditing}
        adding={ansAdding}
        setAdding={setAnsAdding}
        deleteItem={deleteCommonAnswer}
        itemLabel={(item) => item.prompt}
        renderItem={(item) => (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{item.prompt}</p>
              <StatusBadge tone="neutral">
                {COMMON_ANSWER_CATEGORY_LABELS[item.category]}
              </StatusBadge>
            </div>
            <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
              {item.answer}
            </p>
          </>
        )}
        renderForm={({ item, onDone, onError }) => (
          <CommonAnswerForm item={item} onDone={onDone} onError={onError} />
        )}
      />

      <TrustNotice icon={ShieldCheck} title="Private to you">
        Your Smart Profile stays private to you. CertaNest reuses it to pre-fill
        applications and drafts only when you ask — never automatically shared.
      </TrustNotice>
    </PageContainer>
  );
}

// --- Collection forms ---

interface FormProps<T> {
  item: T | null;
  onDone: () => void;
  onError: (message: string) => void;
}

function useSaving() {
  return useState(false);
}

function EducationForm({
  item,
  onDone,
  onError,
}: FormProps<SmartProfileEducation>) {
  const [institution, setInstitution] = useState(item?.institution_name ?? "");
  const [degree, setDegree] = useState(item?.degree_or_program ?? "");
  const [field, setField] = useState(item?.field_of_study ?? "");
  const [start, setStart] = useState(item?.start_date ?? "");
  const [end, setEnd] = useState(item?.end_date ?? "");
  const [current, setCurrent] = useState(item?.currently_studying ?? false);
  const [grade, setGrade] = useState(item?.grade_or_cgpa ?? "");
  const [country, setCountry] = useState(item?.country ?? "");
  const [saving, setSaving] = useSaving();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!institution.trim()) {
      onError("Institution name is required.");
      return;
    }
    setSaving(true);
    onError("");
    const body = {
      institution_name: institution.trim(),
      degree_or_program: degree.trim(),
      field_of_study: field.trim(),
      start_date: start || null,
      end_date: current ? null : end || null,
      currently_studying: current,
      grade_or_cgpa: grade.trim(),
      country: country.trim(),
    };
    try {
      if (item) await updateEducation(item.id, body);
      else await createEducation(body);
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="edu-institution">Institution name *</Label>
          <Input
            id="edu-institution"
            value={institution}
            onChange={(e) => setInstitution(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edu-degree">Degree / program</Label>
          <Input id="edu-degree" value={degree} onChange={(e) => setDegree(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edu-field">Field of study</Label>
          <Input id="edu-field" value={field} onChange={(e) => setField(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edu-start">Start date</Label>
          <Input id="edu-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edu-end">End date</Label>
          <Input
            id="edu-end"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={current}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edu-grade">Grade / CGPA</Label>
          <Input id="edu-grade" value={grade} onChange={(e) => setGrade(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="edu-country">Country</Label>
          <Input id="edu-country" value={country} onChange={(e) => setCountry(e.target.value)} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={current}
          onChange={(e) => setCurrent(e.target.checked)}
          className="size-4 rounded border-input"
        />
        Currently studying here
      </label>
      <FormActions saving={saving} onCancel={onDone} saveLabel={item ? "Save" : "Add"} />
    </form>
  );
}

function WorkForm({ item, onDone, onError }: FormProps<SmartProfileWork>) {
  const [org, setOrg] = useState(item?.organization_name ?? "");
  const [role, setRole] = useState(item?.role_title ?? "");
  const [start, setStart] = useState(item?.start_date ?? "");
  const [end, setEnd] = useState(item?.end_date ?? "");
  const [current, setCurrent] = useState(item?.currently_working ?? false);
  const [location, setLocation] = useState(item?.location ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [achievements, setAchievements] = useState(item?.achievements ?? "");
  const [saving, setSaving] = useSaving();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!org.trim()) {
      onError("Organization name is required.");
      return;
    }
    setSaving(true);
    onError("");
    const body = {
      organization_name: org.trim(),
      role_title: role.trim(),
      start_date: start || null,
      end_date: current ? null : end || null,
      currently_working: current,
      location: location.trim(),
      description: description.trim(),
      achievements: achievements.trim(),
    };
    try {
      if (item) await updateWork(item.id, body);
      else await createWork(body);
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="work-org">Organization name *</Label>
          <Input id="work-org" value={org} onChange={(e) => setOrg(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="work-role">Role / title</Label>
          <Input id="work-role" value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="work-start">Start date</Label>
          <Input id="work-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="work-end">End date</Label>
          <Input
            id="work-end"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            disabled={current}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="work-location">Location</Label>
          <Input id="work-location" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="work-description">Description</Label>
          <Textarea
            id="work-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="work-achievements">Achievements</Label>
          <Textarea
            id="work-achievements"
            rows={2}
            value={achievements}
            onChange={(e) => setAchievements(e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={current}
          onChange={(e) => setCurrent(e.target.checked)}
          className="size-4 rounded border-input"
        />
        Currently working here
      </label>
      <FormActions saving={saving} onCancel={onDone} saveLabel={item ? "Save" : "Add"} />
    </form>
  );
}

function SkillForm({ item, onDone, onError }: FormProps<SmartProfileSkill>) {
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<SkillCategory>(item?.category ?? "technical");
  const [proficiency, setProficiency] = useState(item?.proficiency ?? "");
  const [saving, setSaving] = useSaving();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      onError("Skill name is required.");
      return;
    }
    setSaving(true);
    onError("");
    const body = { name: name.trim(), category, proficiency: proficiency.trim() };
    try {
      if (item) await updateSkill(item.id, body);
      else await createSkill(body);
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="skill-name">Skill *</Label>
          <Input id="skill-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="skill-category">Category</Label>
          <select
            id="skill-category"
            className={selectClass}
            value={category}
            onChange={(e) => setCategory(e.target.value as SkillCategory)}
          >
            {SKILL_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SKILL_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="skill-proficiency">Proficiency</Label>
          <Input
            id="skill-proficiency"
            value={proficiency}
            onChange={(e) => setProficiency(e.target.value)}
            placeholder="e.g. Advanced"
          />
        </div>
      </div>
      <FormActions saving={saving} onCancel={onDone} saveLabel={item ? "Save" : "Add"} />
    </form>
  );
}

function AchievementForm({
  item,
  onDone,
  onError,
}: FormProps<SmartProfileAchievement>) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [category, setCategory] = useState<AchievementCategory>(item?.category ?? "academic");
  const [date, setDate] = useState(item?.date ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [saving, setSaving] = useSaving();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      onError("Title is required.");
      return;
    }
    setSaving(true);
    onError("");
    const body = {
      title: title.trim(),
      category,
      date: date || null,
      description: description.trim(),
    };
    try {
      if (item) await updateAchievement(item.id, body);
      else await createAchievement(body);
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="ach-title">Title *</Label>
          <Input id="ach-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ach-category">Category</Label>
          <select
            id="ach-category"
            className={selectClass}
            value={category}
            onChange={(e) => setCategory(e.target.value as AchievementCategory)}
          >
            {ACHIEVEMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {ACHIEVEMENT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ach-date">Date</Label>
          <Input id="ach-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="ach-description">Description</Label>
          <Textarea
            id="ach-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </div>
      <FormActions saving={saving} onCancel={onDone} saveLabel={item ? "Save" : "Add"} />
    </form>
  );
}

function CommonAnswerForm({
  item,
  onDone,
  onError,
}: FormProps<SmartProfileCommonAnswer>) {
  const [prompt, setPrompt] = useState(item?.prompt ?? "");
  const [answer, setAnswer] = useState(item?.answer ?? "");
  const [category, setCategory] = useState<CommonAnswerCategory>(item?.category ?? "general");
  const [saving, setSaving] = useSaving();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !answer.trim()) {
      onError("Both a prompt and an answer are required.");
      return;
    }
    setSaving(true);
    onError("");
    const body = { prompt: prompt.trim(), answer: answer.trim(), category };
    try {
      if (item) await updateCommonAnswer(item.id, body);
      else await createCommonAnswer(body);
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Couldn't save that.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ans-prompt">Prompt / question *</Label>
          <Input id="ans-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ans-answer">Answer *</Label>
          <Textarea
            id="ans-answer"
            rows={3}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:max-w-xs">
          <Label htmlFor="ans-category">Category</Label>
          <select
            id="ans-category"
            className={selectClass}
            value={category}
            onChange={(e) => setCategory(e.target.value as CommonAnswerCategory)}
          >
            {COMMON_ANSWER_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {COMMON_ANSWER_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <FormActions saving={saving} onCancel={onDone} saveLabel={item ? "Save" : "Add"} />
    </form>
  );
}
