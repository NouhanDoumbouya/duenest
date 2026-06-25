// Minimal fetch wrapper for talking to the CertaNest backend.
//
// Auth model: tokens live in HttpOnly cookies set by the backend. The browser
// sends them automatically, so every request uses `credentials: "include"`.
// JavaScript never reads the access/refresh tokens. For unsafe methods we send
// the CSRF token (double-submit) read from the readable CSRF cookie.

// Default to the SAME-ORIGIN path so the Next rewrite (see next.config.ts)
// proxies to the backend and auth cookies stay first-party. Override with an
// absolute URL only for a split-origin setup (then handle CORS/CSRF/cookies).
import {
  USE_BEARER_AUTH,
  getStoredAccessToken,
  getStoredRefreshToken,
  storeTokens,
} from "./auth-tokens";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "/api/v1";

const CSRF_COOKIE_NAME =
  process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? "duenest_csrftoken";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Error thrown for any non-2xx response, carrying status + parsed body. */
export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;
  /**
   * Safe correlation id from the `X-Request-ID` response header, when present.
   * It's a random per-request id (never a token/session) that a founder can use
   * to find the matching server-side logs/operational events. Shown to users as
   * "Reference: …". Empty for network failures (no response was received).
   */
  readonly requestId: string;

  constructor(
    message: string,
    status: number,
    data: unknown,
    requestId = "",
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    this.requestId = requestId;
  }
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /**
   * Request body. A plain object is serialized to JSON; a `FormData` instance
   * is sent as multipart (the browser sets the boundary). Omit for GET/DELETE.
   */
  body?: unknown;
  /**
   * Deprecated/no-op: authentication now flows through HttpOnly cookies, which
   * are always sent. Kept so existing call sites compile unchanged.
   */
  auth?: boolean;
  /** Internal: prevents infinite refresh loops. */
  _retried?: boolean;
}

/** Read a browser cookie value by name (CSRF token is readable; tokens are not). */
export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function withCsrf(headers: Headers): Headers {
  const token = readCookie(CSRF_COOKIE_NAME);
  if (token) headers.set("X-CSRFToken", token);
  return headers;
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "string" && data) return data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    const firstValue = Object.values(record)[0];
    if (typeof firstValue === "string") return firstValue;
    if (Array.isArray(firstValue) && typeof firstValue[0] === "string") {
      return firstValue[0];
    }
  }
  return fallback;
}

// Single-flight refresh so a burst of 401s triggers only one refresh call.
let refreshInFlight: Promise<boolean> | null = null;

function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    // Cookie mode: the refresh cookie is sent automatically (empty body).
    // Bearer mode (cross-origin): send the stored refresh token in the body and
    // persist the rotated tokens from the response for subsequent requests.
    const refreshToken = USE_BEARER_AUTH ? getStoredRefreshToken() : null;
    const body =
      USE_BEARER_AUTH && refreshToken
        ? JSON.stringify({ refresh: refreshToken })
        : "{}";
    refreshInFlight = fetch(`${API_BASE_URL}/auth/refresh/`, {
      method: "POST",
      headers: withCsrf(new Headers({ "Content-Type": "application/json" })),
      credentials: "include",
      body,
    })
      .then(async (res) => {
        if (!res.ok) return false;
        if (USE_BEARER_AUTH) {
          const data: unknown = await res.json().catch(() => null);
          if (data && typeof data === "object") {
            storeTokens(data as { access?: string; refresh?: string });
          }
        }
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  // `auth` is accepted for backward compatibility but ignored (cookies are
  // always sent); make sure it isn't forwarded to fetch().
  const { body, _retried, headers, auth, ...init } = options;
  void auth;
  const isFormData =
    typeof FormData !== "undefined" && body instanceof FormData;
  const method = (init.method ?? "GET").toUpperCase();

  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");
  // For FormData we must NOT set Content-Type — the browser adds the multipart
  // boundary itself. Only JSON bodies get an explicit content type.
  if (body !== undefined && !isFormData) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (UNSAFE_METHODS.has(method)) withCsrf(requestHeaders);
  // Bearer mode (cross-origin deployment): attach the stored access token. The
  // backend's CookieJWTAuthentication prefers the Authorization header over the
  // cookie and skips CSRF for header auth, so this works cross-site.
  if (USE_BEARER_AUTH) {
    const accessToken = getStoredAccessToken();
    if (accessToken) {
      requestHeaders.set("Authorization", `Bearer ${accessToken}`);
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      method,
      headers: requestHeaders,
      credentials: "include",
      body:
        body === undefined
          ? undefined
          : isFormData
            ? (body as FormData)
            : JSON.stringify(body),
    });
  } catch (cause) {
    // fetch() only rejects for network-level failures — the backend is
    // unreachable, the request was blocked by CORS, or the device is offline.
    // There is NO HTTP status here (the browser never let us read a response).
    // Log safe diagnostics in development only: never the body, tokens, cookies,
    // or credentials.
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[api] ${method} ${API_BASE_URL}${path} failed before a response ` +
          `(likely CORS misconfig, offline, or backend down):`,
        cause instanceof Error ? cause.message : cause,
      );
    }
    throw new ApiError(
      "Unable to reach the server. Check your connection and try again.",
      0,
      null,
    );
  }

  // On 401, attempt a single token refresh and replay the request once. Skip
  // the auth endpoints themselves to avoid refresh loops.
  if (response.status === 401 && !_retried && !path.startsWith("/auth/")) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return apiFetch<T>(path, { ...init, body, headers, _retried: true });
    }
  }

  // 204 No Content and other empty bodies should not be JSON-parsed.
  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  const data: unknown = isJson ? await response.json() : null;

  if (!response.ok) {
    // Surface free-plan limit hits globally so a single listener can show the
    // upgrade modal, instead of every create flow wiring it up individually.
    if (
      response.status === 403 &&
      typeof window !== "undefined" &&
      data &&
      typeof data === "object" &&
      (data as Record<string, unknown>).code === "plan_limit_exceeded"
    ) {
      window.dispatchEvent(
        new CustomEvent("duenest:plan-limit", { detail: data }),
      );
    }
    throw new ApiError(
      extractErrorMessage(data, "Something went wrong. Please try again."),
      response.status,
      data,
      response.headers.get("X-Request-ID") ?? "",
    );
  }

  return data as T;
}
