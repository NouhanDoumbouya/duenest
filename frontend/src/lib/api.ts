// Minimal fetch wrapper for talking to the DueNest backend.
//
// Keep this dependency-free and predictable: a single `apiFetch` helper that
// adds JSON headers, attaches the dev access token, and normalizes errors into
// a typed `ApiError` the UI can render.

import { getAccessToken } from "./auth";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000/api/v1";

/** Error thrown for any non-2xx response, carrying status + parsed body. */
export class ApiError extends Error {
  readonly status: number;
  readonly data: unknown;

  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /** Plain object serialized to JSON, or undefined for GET/DELETE. */
  body?: unknown;
  /** Attach the stored access token as a Bearer header. Default: false. */
  auth?: boolean;
}

/**
 * Try to read a useful message out of a DRF error body, which can look like
 * `{ "detail": "..." }`, `{ "field": ["msg"] }`, or a plain string.
 */
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

export async function apiFetch<T>(
  path: string,
  { body, auth = false, headers, ...init }: ApiFetchOptions = {},
): Promise<T> {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");
  if (body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }
  if (auth) {
    const token = getAccessToken();
    if (token) requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Network-level failure (server down, CORS, offline).
    throw new ApiError("Unable to reach the server. Please try again.", 0, null);
  }

  // 204 No Content and other empty bodies should not be JSON-parsed.
  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  const data: unknown = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(
      extractErrorMessage(data, "Something went wrong. Please try again."),
      response.status,
      data,
    );
  }

  return data as T;
}
