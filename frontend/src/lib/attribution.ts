/**
 * Lightweight, privacy-safe acquisition attribution capture for the SPA.
 *
 * On landing we stash any UTM params (+ referral code + referrer/landing path)
 * into sessionStorage so they survive navigation to /register or /login. The
 * register payload and the post-login `captureAttribution` call then forward
 * them to the backend. No personal data is stored — only marketing params.
 */

const KEY = "duenest_attribution";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export type AttributionPayload = Partial<Record<(typeof UTM_KEYS)[number], string>> & {
  referrer?: string;
  landing_page?: string;
  referral_code?: string;
};

/** Read UTM/ref params from the current URL and persist first-touch in storage. */
export function captureUtmToSession(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const captured: AttributionPayload = {};
    for (const key of UTM_KEYS) {
      const value = params.get(key);
      if (value) captured[key] = value.slice(0, 120);
    }
    const ref = params.get("ref") || params.get("referral_code");
    if (ref) captured.referral_code = ref.slice(0, 40);

    if (Object.keys(captured).length === 0) return;

    // Preserve the earliest (first-touch) capture; don't overwrite if present.
    const existing = readStoredAttribution();
    if (Object.keys(existing).length > 0) return;

    captured.referrer = (document.referrer || "").slice(0, 300);
    captured.landing_page = window.location.pathname.slice(0, 300);
    window.sessionStorage.setItem(KEY, JSON.stringify(captured));
  } catch {
    /* storage blocked / SSR — ignore */
  }
}

export function readStoredAttribution(): AttributionPayload {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AttributionPayload) : {};
  } catch {
    return {};
  }
}
