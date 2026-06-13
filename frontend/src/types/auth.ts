// Shared auth-related types for the DueNest frontend.

/** Billing/plan placeholder — drives internal usage limits, no real payments. */
export type UserPlan = "free" | "pro_placeholder";

/** A DueNest user as returned by GET /api/v1/users/me/. */
export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  plan: UserPlan;
}

/** The access/refresh pair returned by SimpleJWT. */
export interface AuthTokens {
  access: string;
  refresh: string;
}

/** Credentials sent to POST /api/v1/auth/login/ (SimpleJWT uses username). */
export interface LoginRequest {
  username: string;
  password: string;
}

/** POST /api/v1/auth/login/ returns the token pair. */
export type LoginResponse = AuthTokens;

/** Payload sent to POST /api/v1/auth/register/. */
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  invite_code?: string;
}

/** Payload sent to POST /api/v1/auth/google/ (Google ID token from the client). */
export interface GoogleAuthRequest {
  id_token: string;
  invite_code?: string;
}

/** POST /api/v1/auth/google/ returns tokens plus the user. */
export interface GoogleAuthResponse extends AuthTokens {
  user: User;
}
