import type { DocumentSetupChecklist, OnboardingState } from "@/types/onboarding";

/**
 * Pure logic for the Readiness Setup onboarding experience.
 *
 * Nothing here touches React or the network so it can be unit-tested in
 * isolation. Goal/step state is persisted inside the existing
 * `UserOnboardingState.metadata` JSON (see `lib/onboarding.ts`), so no new
 * model or migration is required.
 */

export type ReadinessGoal =
  | "international_student"
  | "applications"
  | "travel"
  | "family"
  | "subscriptions"
  | "emergency"
  | "vault"
  | "unsure";

export type ReadinessStep =
  | "welcome"
  | "use_case"
  | "document"
  | "details"
  | "expiry"
  | "success";

export const READINESS_STEP_ORDER: ReadinessStep[] = [
  "welcome",
  "use_case",
  "document",
  "details",
  "expiry",
  "success",
];

export interface GoalOption {
  key: ReadinessGoal;
  label: string;
  description: string;
}

/** A first-action starting path for a brand-new dashboard. Icons mapped in UI. */
export type QuickStartGoalKey =
  | "document"
  | "scan"
  | "subscription"
  | "bundle"
  | "safesend"
  | "emergency";

export interface QuickStartGoal {
  key: QuickStartGoalKey;
  title: string;
  body: string;
  href: string;
  cta: string;
  /** Top goals shown by default; the rest live under "More ways to start". */
  primary: boolean;
}

/**
 * Goal-based starting paths for the empty dashboard. Life goals, not feature
 * names. The first four are shown by default; the rest are progressively
 * disclosed so mobile never feels crowded. All routes are existing flows.
 */
export function getQuickStartGoals(): QuickStartGoal[] {
  return [
    {
      key: "document",
      title: "Track an expiring document",
      body: "Add a passport, ID, visa, insurance, or anything with a date that matters.",
      href: "/dashboard/documents/new",
      cta: "Add document",
      primary: true,
    },
    {
      key: "scan",
      title: "Scan a document",
      body: "Capture a paper document, clean it up, and save it to your File Inbox.",
      href: "/dashboard/scanner",
      cta: "Start scanning",
      primary: true,
    },
    {
      key: "subscription",
      title: "Track a subscription",
      body: "Catch silent renewals and trial endings before they charge you.",
      href: "/dashboard/subscriptions/new",
      cta: "Add subscription",
      primary: true,
    },
    {
      key: "bundle",
      title: "Prepare an application pack",
      body: "Gather documents for a scholarship, visa, job, or university application.",
      href: "/dashboard/bundles/new?type=application",
      cta: "Create a pack",
      primary: true,
    },
    {
      key: "safesend",
      title: "Share something safely",
      body: "Share a document without losing control of who can open it.",
      href: "/dashboard/quick-share",
      cta: "Set up sharing",
      primary: false,
    },
    {
      key: "emergency",
      title: "Set up emergency access",
      body: "Choose what trusted people can reach if something happens.",
      href: "/dashboard/emergency",
      cta: "Set up",
      primary: false,
    },
  ];
}

/** Use-case options shown on the goal-selection step (icons mapped in the UI). */
export function getOnboardingGoalOptions(): GoalOption[] {
  return [
    {
      key: "international_student",
      label: "International student",
      description:
        "Track passport, visa, insurance, student letters, and renewal dates.",
    },
    {
      key: "applications",
      label: "Scholarship or job applications",
      description:
        "Prepare reusable document packs and avoid missing application requirements.",
    },
    {
      key: "travel",
      label: "Travel documents",
      description:
        "Keep passport, visa, tickets, insurance, and emergency access ready.",
    },
    {
      key: "family",
      label: "Family documents",
      description: "Organize important documents and prepare trusted access.",
    },
    {
      key: "subscriptions",
      label: "Subscriptions and renewals",
      description: "Track bills, subscriptions, trial endings, and renewal dates.",
    },
    {
      key: "emergency",
      label: "Emergency readiness",
      description:
        "Prepare selected documents trusted people can request if needed.",
    },
    {
      key: "vault",
      label: "Secure document vault",
      description: "Keep important files organized in one private place.",
    },
    {
      key: "unsure",
      label: "Not sure yet",
      description: "Start with one document and explore from there.",
    },
  ];
}

/** Document name suggestions tailored to the chosen goal. */
export function getDocumentSuggestionsForGoal(goal: ReadinessGoal): string[] {
  switch (goal) {
    case "international_student":
      return ["Passport", "Visa / residence permit", "Student ID", "Insurance document"];
    case "applications":
      return ["Passport / ID", "Transcript", "CV / résumé", "Recommendation letter", "Certificate"];
    case "travel":
      return ["Passport", "Visa", "Travel insurance", "Ticket / booking", "Emergency contact note"];
    case "family":
      return ["Passport / ID", "Birth certificate", "Insurance", "Emergency contact note"];
    case "emergency":
      return ["Passport / ID", "Insurance", "Emergency note", "Important contact document"];
    case "subscriptions":
      return ["Subscription or bill", "Insurance renewal", "Membership"];
    case "vault":
    case "unsure":
    default:
      return ["Passport / ID", "Insurance", "Certificate", "Important document"];
  }
}

/** Recommended categories offered on the details step. */
export const READINESS_CATEGORIES = [
  "Identity",
  "Travel",
  "Education",
  "Work",
  "Finance",
  "Health",
  "Insurance",
  "Family",
  "Legal",
  "Subscription",
  "Other",
] as const;

export type ReadinessCategory = (typeof READINESS_CATEGORIES)[number];

/** Suggest a category from the document name (+ goal as a tie-breaker). */
export function getDefaultCategoryForDocument(
  name: string,
  goal?: ReadinessGoal,
): ReadinessCategory {
  const n = (name || "").toLowerCase();
  if (/passport|national id|identity|\bid\b/.test(n)) {
    return goal === "travel" || goal === "international_student" ? "Travel" : "Identity";
  }
  if (/visa|residence|permit|immigration/.test(n)) return "Travel";
  if (/insurance/.test(n)) return "Insurance";
  if (/transcript|certificate|diploma|degree|student/.test(n)) return "Education";
  if (/cv|résumé|resume|recommendation|reference letter/.test(n)) return "Work";
  if (/birth|marriage|family/.test(n)) return "Family";
  if (/subscription|bill|membership|invoice/.test(n)) return "Subscription";
  if (/ticket|booking|itinerary|travel/.test(n)) return "Travel";
  if (goal === "subscriptions") return "Subscription";
  if (goal === "emergency" || goal === "family") return "Identity";
  return "Other";
}

export interface ReminderDefault {
  /** Days before expiry/renewal, or null when the document type has no expiry. */
  daysBefore: number | null;
  /** Whether this document type typically has an expiry date at all. */
  expires: boolean;
}

/** Sensible reminder default based on the document type. */
export function getDefaultReminderForDocument(name: string): ReminderDefault {
  const n = (name || "").toLowerCase();
  if (/passport/.test(n)) return { daysBefore: 90, expires: true };
  if (/visa|residence|permit/.test(n)) return { daysBefore: 90, expires: true };
  if (/insurance/.test(n)) return { daysBefore: 30, expires: true };
  if (/subscription|bill|membership/.test(n)) return { daysBefore: 7, expires: true };
  if (/transcript|certificate|diploma|degree/.test(n)) return { daysBefore: null, expires: false };
  if (/birth|marriage/.test(n)) return { daysBefore: null, expires: false };
  // Default: assume it may expire, suggest 30 days, but never force a date.
  return { daysBefore: 30, expires: true };
}

export const REMINDER_DAY_OPTIONS = [7, 30, 60, 90] as const;

export interface LifeRadarPreview {
  name: string;
  category: string;
  expiryStatus: string;
  reminderStatus: string;
  hasExpiry: boolean;
  hasReminder: boolean;
}

/** Build the calm success "mini Life Radar" preview from the created document. */
export function buildFirstLifeRadarPreview(input: {
  name: string;
  category?: string | null;
  expiryDate?: string | null;
  reminderDaysBefore?: number | null;
  hasFile?: boolean;
}): LifeRadarPreview {
  const hasExpiry = Boolean(input.expiryDate);
  const hasReminder = input.reminderDaysBefore != null;
  let expiryStatus: string;
  if (hasExpiry) {
    expiryStatus = `expires ${formatExpiryRelative(input.expiryDate as string)}`;
  } else {
    expiryStatus = "no expiry date";
  }
  const reminderStatus = hasReminder
    ? `reminder ${input.reminderDaysBefore} days before`
    : "add a reminder later";
  return {
    name: input.name,
    category: input.category || "Other",
    expiryStatus,
    reminderStatus,
    hasExpiry,
    hasReminder,
  };
}

/** Friendly relative expiry text (e.g. "in 8 months", "in 12 days", "today"). */
export function formatExpiryRelative(isoDate: string, now: Date = new Date()): string {
  const target = new Date(isoDate);
  if (Number.isNaN(target.getTime())) return "on an unknown date";
  const days = Math.round((target.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return "already (expired)";
  if (days === 0) return "today";
  if (days < 31) return `in ${days} day${days === 1 ? "" : "s"}`;
  const months = Math.round(days / 30);
  if (months < 12) return `in ${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  return `in ${years} year${years === 1 ? "" : "s"}`;
}

export interface NextAction {
  label: string;
  href: string;
}

/** Exactly one primary next action, personalized by goal. */
export function getPersonalizedNextAction(goal: ReadinessGoal | null): NextAction {
  switch (goal) {
    case "international_student":
      return { label: "Create a visa & travel bundle", href: "/dashboard/bundles" };
    case "applications":
      return { label: "Create an application bundle", href: "/dashboard/bundles" };
    case "travel":
      return { label: "Build your travel readiness bundle", href: "/dashboard/bundles" };
    case "family":
      return { label: "Prepare emergency access", href: "/dashboard/emergency" };
    case "subscriptions":
      return { label: "Add your first subscription", href: "/dashboard/subscriptions" };
    case "emergency":
      return { label: "Add this to Emergency Access", href: "/dashboard/emergency" };
    case "vault":
      return { label: "Upload another document", href: "/dashboard/files" };
    case "unsure":
    default:
      return { label: "Explore your dashboard", href: "/dashboard" };
  }
}

export interface ReadinessChecklistItem {
  key: string;
  title: string;
  completed: boolean;
  href: string;
  optional?: boolean;
}

/**
 * Build the persistent "Readiness checklist" from real data: the server-computed
 * setup checklist plus onboarding-state signals. Completion reflects actual user
 * data, not clicked states.
 */
export function computeReadinessChecklist(
  state: OnboardingState | null,
  checklist: DocumentSetupChecklist | null,
): ReadinessChecklistItem[] {
  const byKey = new Map((checklist?.steps ?? []).map((s) => [s.key, s]));
  const done = (key: string) => Boolean(byKey.get(key)?.completed);
  return [
    {
      key: "first_document",
      title: "Add your first document",
      completed: done("create_first_document") || Boolean(state?.first_document_created_at),
      href: "/dashboard/onboarding",
    },
    {
      key: "expiry_or_reminder",
      title: "Add an expiry date or reminder",
      completed:
        done("add_expiry_or_renewal") ||
        done("create_reminder") ||
        Boolean(state?.first_expiry_date_added_at) ||
        Boolean(state?.first_reminder_created_at),
      href: "/dashboard/documents",
    },
    {
      key: "organize_vault",
      title: "Organize your Vault",
      completed: done("upload_first_file") || Boolean(state?.first_file_uploaded_at),
      href: "/dashboard/files",
    },
    {
      key: "try_safesend",
      title: "Try SafeSend",
      completed: Boolean(state?.first_share_link_created_at),
      href: "/dashboard/quick-share",
    },
    {
      key: "emergency_access",
      title: "Prepare Emergency Access",
      completed: Boolean((state?.metadata as Record<string, unknown>)?.emergency_pack_created_at),
      href: "/dashboard/emergency",
    },
    {
      key: "add_subscription",
      title: "Add a subscription or renewal",
      completed: Boolean((state?.metadata as Record<string, unknown>)?.first_subscription_added_at),
      href: "/dashboard/subscriptions",
      optional: true,
    },
  ];
}

/** Whether to route a user into the Readiness Setup flow. */
export function shouldShowOnboarding(state: OnboardingState | null): boolean {
  if (!state) return false;
  if (state.has_completed_document_onboarding) return false;
  if (state.dismissed_onboarding_at) return false;
  // Already has a first document via other flows → no need to push the wizard.
  if (state.first_document_created_at) return false;
  return true;
}

/** Whether to show the persistent dashboard checklist card. */
export function shouldShowReadinessChecklist(
  state: OnboardingState | null,
  checklist: DocumentSetupChecklist | null,
): boolean {
  if (!state) return false;
  if ((state.metadata as Record<string, unknown>)?.readiness_checklist_dismissed) {
    return false;
  }
  if (checklist?.is_complete) return false;
  return true;
}

/** Redirect target for a user based on their onboarding state (no loops). */
export function getOnboardingRedirect(state: OnboardingState | null): string | null {
  return shouldShowOnboarding(state) ? "/dashboard/onboarding" : null;
}

/** "Step 2 of 5" style progress text. */
export function formatOnboardingProgress(currentStep: number, totalSteps: number): string {
  const safeTotal = Math.max(1, totalSteps);
  const safeCurrent = Math.min(Math.max(1, currentStep), safeTotal);
  return `Step ${safeCurrent} of ${safeTotal}`;
}

/** Readiness metadata shape stored inside OnboardingState.metadata. */
export interface ReadinessMetadata {
  goal?: ReadinessGoal;
  current_step?: ReadinessStep;
  started_at?: string;
}

export function readReadinessMetadata(state: OnboardingState | null): ReadinessMetadata {
  const meta = (state?.metadata ?? {}) as Record<string, unknown>;
  const goal = meta.readiness_goal;
  const step = meta.readiness_step;
  return {
    goal: typeof goal === "string" ? (goal as ReadinessGoal) : undefined,
    current_step: typeof step === "string" ? (step as ReadinessStep) : undefined,
    started_at: typeof meta.readiness_started_at === "string" ? meta.readiness_started_at : undefined,
  };
}

/** Merge readiness fields into an existing metadata object (never clobbers it). */
export function mergeReadinessMetadata(
  existing: Record<string, unknown> | undefined,
  patch: ReadinessMetadata,
): Record<string, unknown> {
  const next = { ...(existing ?? {}) };
  if (patch.goal !== undefined) next.readiness_goal = patch.goal;
  if (patch.current_step !== undefined) next.readiness_step = patch.current_step;
  if (patch.started_at !== undefined) next.readiness_started_at = patch.started_at;
  return next;
}
