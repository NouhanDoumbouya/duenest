// Smart Profile V1 — reusable applicant information (owner-scoped).
// Mirrors the backend Smart Profile serializers under /api/v1/smart-profile/.

/** Generic DRF pagination envelope, mirrored from the documents API shape. */
export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// --- Category unions ---

export type SkillCategory =
  | "technical"
  | "language"
  | "soft"
  | "tool"
  | "other";

export type AchievementCategory =
  | "academic"
  | "work"
  | "leadership"
  | "volunteer"
  | "award"
  | "certification"
  | "project"
  | "other";

export type CommonAnswerCategory =
  | "scholarship"
  | "visa"
  | "job"
  | "university"
  | "general";

// --- Read-only identity (managed in Settings → Profile) ---

/**
 * Identity summary derived from the encrypted profile details. Booleans tell us
 * a sensitive number is on file without ever exposing the value itself.
 */
export interface SmartProfileIdentity {
  legal_full_name: string;
  preferred_name: string;
  date_of_birth: string;
  nationality: string;
  phone_number: string;
  address_on_file: string;
  has_passport_number: boolean;
  has_national_id: boolean;
}

// --- Editable application extras ---

export interface SmartProfileExtras {
  email_for_applications: string;
  country_of_residence: string;
  current_address: string;
  permanent_address: string;
  passport_expiry_date: string;
  emergency_contact_name: string;
  emergency_contact_relationship: string;
  emergency_contact_phone: string;
}

/** PATCH /smart-profile/ accepts any subset of the extras fields. */
export type UpdateSmartProfileExtrasRequest = Partial<SmartProfileExtras>;

// --- Sub-entry collections ---

export interface SmartProfileEducation {
  id: number;
  institution_name: string;
  degree_or_program: string;
  field_of_study: string;
  start_date: string | null;
  end_date: string | null;
  currently_studying: boolean;
  grade_or_cgpa: string;
  country: string;
  description: string;
  sort_order: number;
}

export interface SmartProfileWork {
  id: number;
  organization_name: string;
  role_title: string;
  start_date: string | null;
  end_date: string | null;
  currently_working: boolean;
  location: string;
  description: string;
  achievements: string;
  sort_order: number;
}

export interface SmartProfileSkill {
  id: number;
  name: string;
  category: SkillCategory;
  proficiency: string;
  sort_order: number;
}

export interface SmartProfileAchievement {
  id: number;
  title: string;
  category: AchievementCategory;
  date: string | null;
  description: string;
  related_document: number | null;
  sort_order: number;
}

export interface SmartProfileCommonAnswer {
  id: number;
  prompt: string;
  answer: string;
  category: CommonAnswerCategory;
  sort_order: number;
}

// Create payloads: only the listed fields are required; the rest are optional.
export type CreateEducationRequest = { institution_name: string } & Partial<
  Omit<SmartProfileEducation, "id" | "institution_name">
>;
export type UpdateEducationRequest = Partial<
  Omit<SmartProfileEducation, "id">
>;

export type CreateWorkRequest = { organization_name: string } & Partial<
  Omit<SmartProfileWork, "id" | "organization_name">
>;
export type UpdateWorkRequest = Partial<Omit<SmartProfileWork, "id">>;

export type CreateSkillRequest = { name: string } & Partial<
  Omit<SmartProfileSkill, "id" | "name">
>;
export type UpdateSkillRequest = Partial<Omit<SmartProfileSkill, "id">>;

export type CreateAchievementRequest = { title: string } & Partial<
  Omit<SmartProfileAchievement, "id" | "title">
>;
export type UpdateAchievementRequest = Partial<
  Omit<SmartProfileAchievement, "id">
>;

export type CreateCommonAnswerRequest = {
  prompt: string;
  answer: string;
} & Partial<Omit<SmartProfileCommonAnswer, "id" | "prompt" | "answer">>;
export type UpdateCommonAnswerRequest = Partial<
  Omit<SmartProfileCommonAnswer, "id">
>;

// --- Completeness ---

export type CompletenessLabel = string;

export interface CompletenessSection {
  key: string;
  label: string;
  complete: boolean;
  missing_fields: string[];
}

export interface CompletenessNextAction {
  type: string;
  label: string;
  priority: string;
}

export interface SmartProfileCompleteness {
  score: number;
  label: CompletenessLabel;
  sections: CompletenessSection[];
  next_actions: CompletenessNextAction[];
}

// --- Unified payload ---

export interface SmartProfilePayload {
  identity: SmartProfileIdentity;
  extras: SmartProfileExtras;
  education: SmartProfileEducation[];
  work: SmartProfileWork[];
  skills: SmartProfileSkill[];
  achievements: SmartProfileAchievement[];
  common_answers: SmartProfileCommonAnswer[];
  completeness: SmartProfileCompleteness;
  created_at: string;
  updated_at: string;
}
