// Auth helpers for the DueNest frontend.
//
// Tokens are stored in HttpOnly cookies set by the backend — JavaScript never
// reads or writes access/refresh tokens. Auth state is derived from `/users/me/`
// (see getCurrentUser), not from any client-readable token. The API client
// (lib/api.ts) sends cookies automatically and handles CSRF + refresh.

import { apiFetch } from "./api";
import type {
  GoogleAuthRequest,
  GoogleAuthResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  User,
} from "@/types/auth";

// Legacy localStorage keys from the previous (insecure) token storage. We no
// longer write these; this is only used to clean them up on existing devices.
const LEGACY_TOKEN_KEYS = ["duenest.access", "duenest.refresh"];

/** One-time removal of any tokens left in localStorage by older builds. */
export function cleanupLegacyTokenStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_TOKEN_KEYS) {
    window.localStorage.removeItem(key);
  }
}

/**
 * Deprecated: tokens are HttpOnly cookies and cannot be read by JS. Always
 * returns null. Kept so existing imports compile; gate UI on getCurrentUser
 * instead. Calling it also opportunistically clears legacy localStorage tokens.
 */
export function getAccessToken(): null {
  cleanupLegacyTokenStorage();
  return null;
}

// ---- Auth API calls --------------------------------------------------------

/** Log in. The backend sets HttpOnly auth cookies; nothing is stored client-side. */
export async function login(
  credentials: LoginRequest,
): Promise<LoginResponse> {
  const result = await apiFetch<LoginResponse>("/auth/login/", {
    method: "POST",
    body: credentials,
  });
  cleanupLegacyTokenStorage();
  return result;
}

/**
 * Register a new account. The backend returns the created user (no auto-login),
 * so callers should redirect to /login afterwards.
 */
export async function register(payload: RegisterRequest): Promise<User> {
  return apiFetch<User>("/auth/register/", {
    method: "POST",
    body: payload,
  });
}

/**
 * Exchange a verified Google ID token for a DueNest session (cookies set by the
 * backend). Not yet called from the UI — Google buttons stay disabled until the
 * Identity client is configured; we never fake a Google login.
 */
export async function googleLogin(
  payload: GoogleAuthRequest,
): Promise<GoogleAuthResponse> {
  const result = await apiFetch<GoogleAuthResponse>("/auth/google/", {
    method: "POST",
    body: payload,
  });
  cleanupLegacyTokenStorage();
  return result;
}

/** Fetch the currently authenticated user (cookie-authenticated). */
export async function getCurrentUser(): Promise<User> {
  return apiFetch<User>("/users/me/");
}

// ---- Account recovery: password reset + email verification (SEC-007) -------
// These match the backend endpoints in apps/users (account_recovery.py).

/**
 * Request a password reset email. The backend ALWAYS responds with a generic
 * success message and never reveals whether the email has an account, so the
 * UI must show the same confirmation regardless of input.
 */
export async function requestPasswordReset(
  email: string,
): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>("/auth/password-reset/", {
    method: "POST",
    body: { email },
  });
}

/**
 * Confirm a password reset using the single-use `uid` + `token` from the email
 * link and a new password. Throws ApiError (400) if the link is invalid/expired
 * or the password fails the backend's validators.
 */
export async function confirmPasswordReset(payload: {
  uid: string;
  token: string;
  new_password: string;
}): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>("/auth/password-reset/confirm/", {
    method: "POST",
    body: payload,
  });
}

/**
 * Send (or resend) the signed-in user's email verification link. Requires an
 * authenticated session. `verified` is true if the email is already verified.
 */
export async function sendEmailVerification(): Promise<{
  detail: string;
  verified: boolean;
}> {
  return apiFetch<{ detail: string; verified: boolean }>(
    "/auth/email/send-verification/",
    { method: "POST", body: {} },
  );
}

/**
 * Confirm an email verification `token` from the verification link. Throws
 * ApiError (400) if the link is invalid/expired.
 */
export async function confirmEmailVerification(
  token: string,
): Promise<{ detail: string; verified: boolean }> {
  return apiFetch<{ detail: string; verified: boolean }>("/auth/email/verify/", {
    method: "POST",
    body: { token },
  });
}

/**
 * Refresh the session using the refresh cookie. Returns true on success. The
 * API client refreshes automatically on 401; this is for explicit callers.
 */
export async function refreshSession(): Promise<boolean> {
  try {
    await apiFetch("/auth/refresh/", { method: "POST", body: {} });
    return true;
  } catch {
    return false;
  }
}

/**
 * Log out: ask the backend to blacklist the refresh token and clear cookies,
 * and clean up any legacy localStorage tokens. Best-effort — resolves even if
 * the network call fails so logout always feels immediate.
 */
export async function logout(): Promise<void> {
  try {
    await apiFetch("/auth/logout/", { method: "POST", body: {} });
  } catch {
    // ignore — cookies will expire and the user is treated as logged out
  } finally {
    cleanupLegacyTokenStorage();
  }
}
