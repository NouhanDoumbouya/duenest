// Smart Profile V1 API client — owner-scoped reusable applicant information.
// All endpoints sit under /api/v1/smart-profile/ and are authenticated via the
// HttpOnly cookies that `apiFetch` always sends.

import { apiFetch } from "./api";
import type {
  AchievementCategory,
  CommonAnswerCategory,
  CreateAchievementRequest,
  CreateCommonAnswerRequest,
  CreateEducationRequest,
  CreateSkillRequest,
  CreateWorkRequest,
  Paginated,
  SkillCategory,
  SmartProfileAchievement,
  SmartProfileCommonAnswer,
  SmartProfileCompleteness,
  SmartProfileEducation,
  SmartProfilePayload,
  SmartProfileSkill,
  SmartProfileWork,
  UpdateAchievementRequest,
  UpdateCommonAnswerRequest,
  UpdateEducationRequest,
  UpdateSkillRequest,
  UpdateSmartProfileExtrasRequest,
  UpdateWorkRequest,
} from "@/types/smart-profile";

// --- Unified profile + extras ---

export function getSmartProfile(): Promise<SmartProfilePayload> {
  return apiFetch<SmartProfilePayload>("/smart-profile/");
}

export function updateSmartProfileExtras(
  patch: UpdateSmartProfileExtrasRequest,
): Promise<SmartProfilePayload> {
  return apiFetch<SmartProfilePayload>("/smart-profile/", {
    method: "PATCH",
    body: patch,
  });
}

export function getSmartProfileCompleteness(): Promise<SmartProfileCompleteness> {
  return apiFetch<SmartProfileCompleteness>("/smart-profile/completeness/");
}

// --- Education ---

export async function listEducation(): Promise<SmartProfileEducation[]> {
  const page = await apiFetch<Paginated<SmartProfileEducation>>(
    "/smart-profile/education/",
  );
  return page.results;
}

export function createEducation(
  body: CreateEducationRequest,
): Promise<SmartProfileEducation> {
  return apiFetch<SmartProfileEducation>("/smart-profile/education/", {
    method: "POST",
    body,
  });
}

export function updateEducation(
  id: number,
  patch: UpdateEducationRequest,
): Promise<SmartProfileEducation> {
  return apiFetch<SmartProfileEducation>(`/smart-profile/education/${id}/`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteEducation(id: number): Promise<void> {
  return apiFetch<void>(`/smart-profile/education/${id}/`, {
    method: "DELETE",
  });
}

// --- Work / experience ---

export async function listWork(): Promise<SmartProfileWork[]> {
  const page = await apiFetch<Paginated<SmartProfileWork>>(
    "/smart-profile/work/",
  );
  return page.results;
}

export function createWork(
  body: CreateWorkRequest,
): Promise<SmartProfileWork> {
  return apiFetch<SmartProfileWork>("/smart-profile/work/", {
    method: "POST",
    body,
  });
}

export function updateWork(
  id: number,
  patch: UpdateWorkRequest,
): Promise<SmartProfileWork> {
  return apiFetch<SmartProfileWork>(`/smart-profile/work/${id}/`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteWork(id: number): Promise<void> {
  return apiFetch<void>(`/smart-profile/work/${id}/`, { method: "DELETE" });
}

// --- Skills ---

export async function listSkills(): Promise<SmartProfileSkill[]> {
  const page = await apiFetch<Paginated<SmartProfileSkill>>(
    "/smart-profile/skills/",
  );
  return page.results;
}

export function createSkill(
  body: CreateSkillRequest,
): Promise<SmartProfileSkill> {
  return apiFetch<SmartProfileSkill>("/smart-profile/skills/", {
    method: "POST",
    body,
  });
}

export function updateSkill(
  id: number,
  patch: UpdateSkillRequest,
): Promise<SmartProfileSkill> {
  return apiFetch<SmartProfileSkill>(`/smart-profile/skills/${id}/`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteSkill(id: number): Promise<void> {
  return apiFetch<void>(`/smart-profile/skills/${id}/`, { method: "DELETE" });
}

// --- Achievements ---

export async function listAchievements(): Promise<SmartProfileAchievement[]> {
  const page = await apiFetch<Paginated<SmartProfileAchievement>>(
    "/smart-profile/achievements/",
  );
  return page.results;
}

export function createAchievement(
  body: CreateAchievementRequest,
): Promise<SmartProfileAchievement> {
  return apiFetch<SmartProfileAchievement>("/smart-profile/achievements/", {
    method: "POST",
    body,
  });
}

export function updateAchievement(
  id: number,
  patch: UpdateAchievementRequest,
): Promise<SmartProfileAchievement> {
  return apiFetch<SmartProfileAchievement>(
    `/smart-profile/achievements/${id}/`,
    { method: "PATCH", body: patch },
  );
}

export function deleteAchievement(id: number): Promise<void> {
  return apiFetch<void>(`/smart-profile/achievements/${id}/`, {
    method: "DELETE",
  });
}

// --- Common answers ---

export async function listCommonAnswers(): Promise<SmartProfileCommonAnswer[]> {
  const page = await apiFetch<Paginated<SmartProfileCommonAnswer>>(
    "/smart-profile/common-answers/",
  );
  return page.results;
}

export function createCommonAnswer(
  body: CreateCommonAnswerRequest,
): Promise<SmartProfileCommonAnswer> {
  return apiFetch<SmartProfileCommonAnswer>("/smart-profile/common-answers/", {
    method: "POST",
    body,
  });
}

export function updateCommonAnswer(
  id: number,
  patch: UpdateCommonAnswerRequest,
): Promise<SmartProfileCommonAnswer> {
  return apiFetch<SmartProfileCommonAnswer>(
    `/smart-profile/common-answers/${id}/`,
    { method: "PATCH", body: patch },
  );
}

export function deleteCommonAnswer(id: number): Promise<void> {
  return apiFetch<void>(`/smart-profile/common-answers/${id}/`, {
    method: "DELETE",
  });
}

// --- Label maps for category enums ---

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  technical: "Technical",
  language: "Language",
  soft: "Soft skill",
  tool: "Tool",
  other: "Other",
};

export const ACHIEVEMENT_CATEGORY_LABELS: Record<AchievementCategory, string> = {
  academic: "Academic",
  work: "Work",
  leadership: "Leadership",
  volunteer: "Volunteer",
  award: "Award",
  certification: "Certification",
  project: "Project",
  other: "Other",
};

export const COMMON_ANSWER_CATEGORY_LABELS: Record<
  CommonAnswerCategory,
  string
> = {
  scholarship: "Scholarship",
  visa: "Visa",
  job: "Job",
  university: "University",
  general: "General",
};

/** Ordered category options for select inputs. */
export const SKILL_CATEGORIES: SkillCategory[] = [
  "technical",
  "language",
  "soft",
  "tool",
  "other",
];

export const ACHIEVEMENT_CATEGORIES: AchievementCategory[] = [
  "academic",
  "work",
  "leadership",
  "volunteer",
  "award",
  "certification",
  "project",
  "other",
];

export const COMMON_ANSWER_CATEGORIES: CommonAnswerCategory[] = [
  "scholarship",
  "visa",
  "job",
  "university",
  "general",
];

type ProductTone = "default" | "good" | "warn" | "danger" | "secure";

/**
 * Maps a completeness label to a product tone for the progress bar / metric.
 * Labels come from the backend; we match on a normalized substring so wording
 * tweaks don't silently fall back to neutral.
 */
export function completenessLabelTone(label: string): ProductTone {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("complete") || normalized.includes("strong")) {
    return "good";
  }
  if (normalized.includes("good") || normalized.includes("solid")) {
    return "secure";
  }
  if (normalized.includes("start") || normalized.includes("empty")) {
    return "warn";
  }
  return "default";
}
