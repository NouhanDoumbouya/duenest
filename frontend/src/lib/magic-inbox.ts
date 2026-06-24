// Client for the Magic Inbox V1 (apps.magic_inbox). Owner-scoped. Reuses the
// shared `apiFetch` (cookie auth + CSRF + error handling). File capture uses an
// XMLHttpRequest progress upload, mirroring `uploadInboxFileWithProgress`.
//
// Trust model:
//   * Deterministic analysis (use_ai: false) works on every plan, no credits.
//   * Smart analysis (use_ai: true) is key-gated + plan-gated and charges 3 AI
//     credits AFTER a successful analysis — surfaced via a clear notice.
//   * Applying selected suggestions NEVER calls AI or charges credits.

import { API_BASE_URL, ApiError, apiFetch, readCookie } from "./api";
import { getAccessToken } from "./auth";
import type {
  AnalyzeRequest,
  AnalyzeResult,
  ApplyRequest,
  ApplyResult,
  MagicInboxItem,
  MagicInboxListResponse,
  MagicInboxStatus,
  SelectedSuggestion,
  Suggestion,
  SuggestionPriority,
} from "@/types/magic-inbox";

const CSRF_COOKIE_NAME =
  process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? "duenest_csrftoken";

// ---- API calls -------------------------------------------------------------

/** List inbox items, optionally filtered by status. */
export function getMagicInbox(
  status?: MagicInboxStatus,
): Promise<MagicInboxListResponse> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<MagicInboxListResponse>(`/magic-inbox/${query}`);
}

/** Read a single inbox item. */
export function getMagicInboxItem(id: number): Promise<MagicInboxItem> {
  return apiFetch<MagicInboxItem>(`/magic-inbox/${id}/`);
}

/** Capture pasted text / an email body. */
export function createTextItem(input: {
  pasted_text: string;
  title?: string;
}): Promise<MagicInboxItem> {
  return apiFetch<MagicInboxItem>("/magic-inbox/", {
    method: "POST",
    body: {
      item_type: "text",
      pasted_text: input.pasted_text,
      ...(input.title ? { title: input.title } : {}),
    },
  });
}

/** Capture a link / URL. */
export function createLinkItem(input: {
  source_url: string;
  title?: string;
}): Promise<MagicInboxItem> {
  return apiFetch<MagicInboxItem>("/magic-inbox/", {
    method: "POST",
    body: {
      item_type: "link",
      source_url: input.source_url,
      ...(input.title ? { title: input.title } : {}),
    },
  });
}

/**
 * Capture a file with upload progress. Mirrors apiFetch's auth (cookie
 * credentials + X-CSRFToken, or a Bearer header cross-origin) but uses
 * XMLHttpRequest so we can report real per-file upload progress.
 */
export function uploadFileItemWithProgress(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<MagicInboxItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/magic-inbox/`);
    xhr.withCredentials = true; // send the HttpOnly auth cookies
    xhr.setRequestHeader("Accept", "application/json");
    const csrf = readCookie(CSRF_COOKIE_NAME);
    if (csrf) xhr.setRequestHeader("X-CSRFToken", csrf);
    // Bearer mode (split-origin): attach the access token explicitly. Null/no-op
    // in same-origin cookie mode. Without this, cross-origin uploads 401.
    const token = getAccessToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    // Do NOT set Content-Type — the browser adds the multipart boundary.

    xhr.upload.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as MagicInboxItem);
      } else {
        const message =
          data && typeof data === "object" && "detail" in data
            ? String((data as Record<string, unknown>).detail)
            : "Could not capture this file.";
        reject(new ApiError(message, xhr.status, data));
      }
    };
    xhr.onerror = () =>
      reject(
        new ApiError("Unable to reach the server. Please try again.", 0, null),
      );

    const formData = new FormData();
    formData.append("item_type", "file");
    formData.append("file", file);
    xhr.send(formData);
  });
}

/**
 * Analyze an item. Deterministic by default (no AI, no credits). Pass
 * `use_ai: true` for Smart analysis (key-gated, plan-gated, 3 credits on
 * success). Always resolves with `{ available, reason, ... }` when the feature
 * is on — a blocked Smart analysis is `available: false` (HTTP 200).
 */
export function analyzeMagicInboxItem(
  id: number,
  req: AnalyzeRequest,
): Promise<AnalyzeResult> {
  return apiFetch<AnalyzeResult>(`/magic-inbox/${id}/analyze/`, {
    method: "POST",
    body: req,
  });
}

/**
 * Apply the user's chosen suggestions. NEVER calls AI or charges credits.
 * Returns what was applied, what was skipped (with friendly reasons), and any
 * "continue elsewhere" routes.
 */
export function applyMagicInboxSuggestions(
  id: number,
  selected: SelectedSuggestion[],
): Promise<ApplyResult> {
  const body: ApplyRequest = { selected_suggestions: selected };
  return apiFetch<ApplyResult>(`/magic-inbox/${id}/apply/`, {
    method: "POST",
    body,
  });
}

/** Archive an item (soft, reversible on the backend). */
export function archiveMagicInboxItem(id: number): Promise<MagicInboxItem> {
  return apiFetch<MagicInboxItem>(`/magic-inbox/${id}/archive/`, {
    method: "POST",
  });
}

/** Permanently delete an item. */
export function deleteMagicInboxItem(id: number): Promise<void> {
  return apiFetch<void>(`/magic-inbox/${id}/`, { method: "DELETE" });
}

// ---- Pure helpers (no DOM — unit-testable in the Node env) ------------------

/** Credits charged for a successful Smart analysis. */
export const MAGIC_INBOX_AI_CREDITS = 3;

/** Trust copy shown next to the Smart analysis toggle. */
export function magicInboxCreditNotice(): string {
  return "Smart analysis uses 3 AI credits after successful analysis.";
}

/**
 * Friendly, actionable copy for a blocked Smart-analysis reason. Mirrors the
 * generator's `generateReasonMessage`.
 */
export function analyzeReasonMessage(
  reason: string | null | undefined,
): string {
  switch (reason) {
    case "consent_required":
      return "Turn on AI in Settings to use Smart analysis.";
    case "ai_feature_not_in_plan":
      return "Smart analysis is a Pro feature.";
    case "ai_credits_exhausted":
      return "You've used all your AI credits for this period.";
    case "budget":
      return "AI is paused for now to protect usage limits. Please try again later.";
    case "not_configured":
      return "AI isn't configured yet.";
    default:
      return "We couldn't run Smart analysis. You can still use the standard analysis.";
  }
}

/** Whether a blocked reason should route the user to the upgrade flow. */
export function isAnalyzeUpgradeReason(
  reason: string | null | undefined,
): boolean {
  return reason === "ai_feature_not_in_plan";
}

/** Whether a blocked reason is a usage/budget warning (amber) vs an error. */
export function isAnalyzeUsageReason(
  reason: string | null | undefined,
): boolean {
  return reason === "ai_credits_exhausted" || reason === "budget";
}

/** Status order for grouping the inbox list. */
export const INBOX_STATUS_ORDER: MagicInboxStatus[] = [
  "new",
  "analyzed",
  "applied",
  "failed",
  "archived",
];

/** Friendly labels for inbox statuses. */
export const INBOX_STATUS_LABELS: Record<MagicInboxStatus, string> = {
  new: "New",
  analyzed: "Analyzed",
  applied: "Applied",
  archived: "Archived",
  failed: "Failed",
};

/** Priority order, highest first — drives grouped/sorted suggestion display. */
export const SUGGESTION_PRIORITY_ORDER: SuggestionPriority[] = [
  "high",
  "medium",
  "low",
];

/** Friendly label for a suggestion priority bucket. */
export const SUGGESTION_PRIORITY_LABELS: Record<SuggestionPriority, string> = {
  high: "Recommended",
  medium: "Worth doing",
  low: "Optional",
};

/**
 * Group suggestions by priority, ordered high → medium → low. Empty buckets are
 * omitted so callers render only what exists.
 */
export function groupSuggestionsByPriority(
  suggestions: Suggestion[] | undefined,
): { priority: SuggestionPriority; items: Suggestion[] }[] {
  if (!suggestions || suggestions.length === 0) return [];
  return SUGGESTION_PRIORITY_ORDER.map((priority) => ({
    priority,
    items: suggestions.filter((s) => s.priority === priority),
  })).filter((group) => group.items.length > 0);
}

/**
 * Sort suggestions by priority (high → low), preserving original order within a
 * priority. Returns a new array; the input is not mutated.
 */
export function sortSuggestionsByPriority(
  suggestions: Suggestion[],
): Suggestion[] {
  const rank: Record<SuggestionPriority, number> = { high: 0, medium: 1, low: 2 };
  return suggestions
    .map((s, index) => ({ s, index }))
    .sort((a, b) => {
      const byPriority = rank[a.s.priority] - rank[b.s.priority];
      return byPriority !== 0 ? byPriority : a.index - b.index;
    })
    .map((entry) => entry.s);
}

/**
 * Friendly copy for an apply "skipped" reason key. Keeps the UI calm and honest
 * instead of leaking machine keys.
 */
export function applySkippedReasonMessage(reason: string): string {
  switch (reason) {
    case "already_applied":
      return "Already done — nothing changed.";
    case "missing_data":
      return "We needed more detail to complete this one.";
    case "not_supported":
      return "This step can't be completed automatically here.";
    case "continue_elsewhere":
      return "Finish this one in the linked tool.";
    case "duplicate":
      return "A matching item already exists.";
    case "error":
      return "Something went wrong with this one. Your other choices still applied.";
    default:
      return "Skipped.";
  }
}

/** Where a "continue elsewhere" route should send the user, with calm copy. */
export function routeDestination(
  route: { route: string; bundle_id?: number; application_id?: number },
): { href: string; label: string } | null {
  switch (route.route) {
    case "requirement_link_import":
      return {
        href: route.bundle_id
          ? `/dashboard/bundles/${route.bundle_id}`
          : "/dashboard/bundles",
        label: "Continue in the requirement importer",
      };
    case "application_document_generator":
      return {
        href: route.application_id
          ? `/dashboard/applications/${route.application_id}`
          : "/dashboard/applications",
        label: "Continue in the document generator",
      };
    default:
      return null;
  }
}
