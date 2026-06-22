// Client-side auth-token store for the CROSS-ORIGIN deployment.
//
// CertaNest is designed for HttpOnly-cookie auth when the frontend and backend
// share an origin (the Next dev/proxy setup: NEXT_PUBLIC_API_BASE_URL=/api/v1).
// In that mode JavaScript never touches the tokens — the cookie store carries
// them — and this module stays inert.
//
// When the frontend (e.g. Vercel) and backend (e.g. Railway) are on DIFFERENT
// origins, the browser will not expose the backend's HttpOnly cookies to the
// frontend page, so cookie auth cannot work. In that case CertaNest authenticates
// with the access token returned by /auth/login/ via an `Authorization: Bearer`
// header, and this module persists the access/refresh pair.
//
// Trade-off: Bearer tokens in localStorage are readable by JS (XSS exposure),
// which is why it is enabled ONLY for the cross-origin deployment. Never logged.

// Single source of truth for the Bearer-token localStorage keys. Every reader
// and writer in the app imports these — never hardcode the strings elsewhere.
export const ACCESS_TOKEN_KEY = "duenest_access_token";
export const REFRESH_TOKEN_KEY = "duenest_refresh_token";

const ACCESS_KEY = ACCESS_TOKEN_KEY;
const REFRESH_KEY = REFRESH_TOKEN_KEY;

/**
 * True when the API base URL is an absolute, cross-origin URL — i.e. the
 * split frontend/backend deployment that cannot use cookies. Derived from the
 * public env var so it is consistent on server and client.
 */
export const USE_BEARER_AUTH = /^https?:\/\//i.test(
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "",
);

export function storeTokens(tokens: {
  access?: string | null;
  refresh?: string | null;
}): void {
  if (!USE_BEARER_AUTH || typeof window === "undefined") return;
  try {
    if (tokens.access) window.localStorage.setItem(ACCESS_KEY, tokens.access);
    if (tokens.refresh) window.localStorage.setItem(REFRESH_KEY, tokens.refresh);
  } catch {
    /* storage disabled (private mode) — requests will just 401 and re-prompt */
  }
}

export function getStoredAccessToken(): string | null {
  if (!USE_BEARER_AUTH || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACCESS_KEY);
  } catch {
    return null;
  }
}

export function getStoredRefreshToken(): string | null {
  if (!USE_BEARER_AUTH || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function clearStoredTokens(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
}
