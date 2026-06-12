// Auth helpers for the DueNest frontend.
//
// TODO: Move token handling to HttpOnly secure cookies before production.
// localStorage is used here for development speed only and is vulnerable to
// XSS. Keep the call sites below stable so only this file has to change when
// the cookie/BFF strategy lands.

import { apiFetch } from "./api";
import type {
  AuthTokens,
  GoogleAuthRequest,
  GoogleAuthResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  User,
} from "@/types/auth";

const ACCESS_TOKEN_KEY = "duenest.access";
const REFRESH_TOKEN_KEY = "duenest.refresh";

// ---- Dev token storage helpers --------------------------------------------
// All reads are guarded with `typeof window` so they are safe to import from
// server components without crashing during SSR.

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveTokens(tokens: AuthTokens): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
}

export function clearTokens(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

// ---- Auth API calls --------------------------------------------------------

/** Log in, persist the returned tokens, and return them. */
export async function login(
  credentials: LoginRequest,
): Promise<LoginResponse> {
  const tokens = await apiFetch<LoginResponse>("/auth/login/", {
    method: "POST",
    body: credentials,
  });
  saveTokens(tokens);
  return tokens;
}

/**
 * Register a new account.
 *
 * The current backend register endpoint returns the created user (no tokens),
 * so callers should redirect to /login afterwards.
 */
export async function register(payload: RegisterRequest): Promise<User> {
  return apiFetch<User>("/auth/register/", {
    method: "POST",
    body: payload,
  });
}

/**
 * Exchange a verified Google ID token for DueNest tokens via the backend.
 *
 * NOTE: this is wired to the backend contract but is not yet called from the
 * UI — the "Continue with Google" buttons stay disabled until the Google
 * Identity client is configured. We never fake a Google login.
 */
export async function googleLogin(
  payload: GoogleAuthRequest,
): Promise<GoogleAuthResponse> {
  const result = await apiFetch<GoogleAuthResponse>("/auth/google/", {
    method: "POST",
    body: payload,
  });
  saveTokens(result);
  return result;
}

/** Fetch the currently authenticated user using the stored access token. */
export async function getCurrentUser(): Promise<User> {
  return apiFetch<User>("/users/me/", { auth: true });
}

/**
 * Use the stored refresh token to obtain a fresh access token, persisting it.
 * Returns the new access token, or null if there is no refresh token.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  const data = await apiFetch<{ access: string; refresh?: string }>(
    "/auth/refresh/",
    { method: "POST", body: { refresh } },
  );

  saveTokens({ access: data.access, refresh: data.refresh ?? refresh });
  return data.access;
}

/** Clear local tokens. (Backend logout/blacklist can be wired in later.) */
export function logout(): void {
  clearTokens();
}
