// Shared auth-related types for the DueNest frontend.

/** A DueNest user as returned by GET /api/v1/users/me/. */
export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
}

/** Credentials accepted by POST /api/v1/auth/login/ (SimpleJWT uses username). */
export interface LoginCredentials {
  username: string;
  password: string;
}

/** Payload accepted by POST /api/v1/auth/register/. */
export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

/** The access/refresh pair returned by SimpleJWT on login. */
export interface AuthTokens {
  access: string;
  refresh: string;
}
