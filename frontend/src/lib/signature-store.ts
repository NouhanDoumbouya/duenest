// Local-first storage for a reusable Fill & Sign signature (a PNG data URL).
//
// Stored in localStorage on this device only — never uploaded as a profile
// signature. Mirrors the QR-style persistence pattern (loadDefaultQrStyle).
// TODO(account-sync): optionally persist to the user's account/settings so the
// signature follows them across devices.

const KEY = "duenest:fill-sign:signature";

export function loadSavedSignature(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveSignature(dataUrl: string): void {
  try {
    window.localStorage.setItem(KEY, dataUrl);
  } catch {
    /* storage unavailable (private mode / disabled) — non-fatal */
  }
}

export function clearSavedSignature(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
