// Privacy-safe, fire-and-forget client analytics.
//
// Records a small allowlist of UI interaction events to the backend
// (/events/client/) for founder product analytics. It never throws, never
// blocks the UI, and must only ever carry NON-sensitive metadata (e.g.
// { card: "needs_attention" }) — never document titles, ids of private content,
// tokens, or other sensitive data.

import { apiFetch } from "./api";

export type ClientEventType =
  | "dashboard_viewed"
  | "vault_viewed"
  | "vault_card_clicked"
  | "quick_action_used"
  | "empty_state_cta_used"
  | "forgetting_check_used"
  | "dashboard_load_failed";

export function trackEvent(
  eventType: ClientEventType,
  options?: {
    objectType?: string;
    objectId?: string | number;
    /** Keep this small and non-sensitive (no titles/tokens/private ids). */
    metadata?: Record<string, string | number | boolean>;
  },
): void {
  // Best-effort: swallow every error so analytics can never affect the app.
  void apiFetch("/events/client/", {
    method: "POST",
    body: {
      event_type: eventType,
      object_type: options?.objectType,
      object_id: options?.objectId,
      metadata: options?.metadata,
    },
  }).catch(() => {});
}
