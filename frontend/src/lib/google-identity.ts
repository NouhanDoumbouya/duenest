// Google Identity Services (GIS) loader for "Sign in with Google".
//
// This is the ID-token flow: GIS renders Google's button, the user authenticates
// with Google, and GIS hands us a short-lived **ID token** (a signed JWT) which we
// forward to the backend `POST /auth/google/` for server-side verification.
//
// Security notes:
// - We only ever use the PUBLIC client id (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`). The
//   OAuth client *secret* is backend-only and never reaches the browser.
// - This is the same Google Web OAuth client used by the Drive/Calendar/Gmail
//   integrations — it is NOT a second auth system.
// - The ID token is held only in memory long enough to call the backend; it is
//   never stored (localStorage/sessionStorage) and never logged.

const GIS_SRC = "https://accounts.google.com/gsi/client";

/** Minimal typing of the `window.google.accounts.id` surface we use. */
export interface GoogleCredentialResponse {
  credential?: string;
  select_by?: string;
}

export interface GoogleIdInitConfig {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  use_fedcm_for_prompt?: boolean;
}

export interface GoogleButtonOptions {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  width?: number;
}

export interface GoogleAccountsId {
  initialize(config: GoogleIdInitConfig): void;
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
  cancel?(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

/**
 * The frontend-public Google OAuth Web client id. Read at call time so it stays
 * Next.js build-time inlinable in the app and overridable via env in tests.
 * Returns "" when unset — callers MUST treat that as "Google sign-in unavailable"
 * and fall back gracefully (never crash, never fake a login).
 */
export function getGoogleClientId(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
}

let loaderPromise: Promise<GoogleAccountsId> | null = null;

/**
 * Load the Google Identity Services script exactly once and resolve with the
 * `google.accounts.id` API. Deduplicates concurrent calls and reuses an existing
 * script tag. Rejects (and resets, so a later attempt can retry) if the script
 * fails to load or the API never appears.
 */
export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Identity unavailable (no window)."));
  }
  if (window.google?.accounts?.id) {
    return Promise.resolve(window.google.accounts.id);
  }
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<GoogleAccountsId>((resolve, reject) => {
    const ready = () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else {
        loaderPromise = null;
        reject(new Error("Google Identity Services did not initialize."));
      }
    };
    const fail = () => {
      loaderPromise = null;
      reject(new Error("Failed to load Google Identity Services."));
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`,
    );
    if (existing) {
      if (window.google?.accounts?.id) {
        ready();
      } else {
        existing.addEventListener("load", ready, { once: true });
        existing.addEventListener("error", fail, { once: true });
      }
      return;
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", ready, { once: true });
    script.addEventListener("error", fail, { once: true });
    document.head.appendChild(script);
  });

  return loaderPromise;
}
