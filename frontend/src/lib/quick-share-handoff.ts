/**
 * In-memory, one-time handoff of a freshly created Quick Share's plaintext access
 * code from the creation wizard to the detail page (SEC-011).
 *
 * The generated access code is a secret the recipient needs; it must NOT be
 * persisted to sessionStorage/localStorage where it could linger or be read by
 * other scripts. It lives only in this module-level variable, which survives the
 * client-side navigation (same JS runtime, no full reload) and is consumed
 * exactly once. After a reload it is gone — the code is shown only once.
 */

export type QuickShareHandoff = {
  id: number | string;
  code?: string;
  pkg?: string;
};

let pending: QuickShareHandoff | null = null;

export function setQuickShareHandoff(value: QuickShareHandoff): void {
  pending = value;
}

/** Return and clear the handoff for this id (one-time). */
export function takeQuickShareHandoff(
  id: number | string,
): QuickShareHandoff | null {
  if (pending && String(pending.id) === String(id)) {
    const value = pending;
    pending = null;
    return value;
  }
  return null;
}
