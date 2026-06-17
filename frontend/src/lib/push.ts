/**
 * PWA Web Push client helpers.
 *
 * Opt-in only: permission is requested exclusively from an explicit user action
 * (the settings toggle). Nothing here runs on page load. The browser
 * PushSubscription is registered with the backend, which owns delivery and the
 * VAPID key pair. We never store sensitive data here.
 */
import { apiFetch } from "./api";
import { supportsPush } from "./pwa";

const SW_URL = "/sw.js";

export type PushPublicKey = {
  enabled: boolean;
  public_key: string;
};

/** Standard base64url → Uint8Array conversion for applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** Coarse, non-identifying device label (browser + platform family). */
function deviceLabel(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent.toLowerCase();
  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("firefox/")
      ? "Firefox"
      : ua.includes("chrome/") || ua.includes("crios/")
        ? "Chrome"
        : ua.includes("safari/")
          ? "Safari"
          : "Browser";
  const platform = /android/.test(ua)
    ? "Android"
    : /iphone|ipad/.test(ua)
      ? "iOS"
      : /windows/.test(ua)
        ? "Windows"
        : /mac os/.test(ua)
          ? "Mac"
          : /linux/.test(ua)
            ? "Linux"
            : "";
  return platform ? `${browser} on ${platform}` : browser;
}

export function getPushPublicKey(): Promise<PushPublicKey> {
  return apiFetch<PushPublicKey>("/notifications/push/public-key/", { auth: true });
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

/** Whether this device currently has an active push subscription. */
export async function getPushSubscriptionState(): Promise<boolean> {
  if (!supportsPush()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "denied" | "unconfigured" | "error" };

/**
 * Request permission (user-initiated) and subscribe this device. Returns a
 * typed result so the UI can show calm, specific messaging.
 */
export async function subscribeToPush(): Promise<SubscribeResult> {
  if (!supportsPush()) return { ok: false, reason: "unsupported" };

  const key = await getPushPublicKey().catch(() => null);
  if (!key || !key.enabled || !key.public_key) {
    return { ok: false, reason: "unconfigured" };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: "denied" };

  try {
    const reg = await getRegistration();
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key.public_key) as BufferSource,
    });
    const json = sub.toJSON();
    await apiFetch("/notifications/push/subscribe/", {
      method: "POST",
      auth: true,
      body: {
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        device_label: deviceLabel(),
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Unsubscribe this device locally and tell the backend to drop the record. */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!supportsPush()) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_URL);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    const endpoint = sub?.endpoint;
    if (sub) await sub.unsubscribe();
    if (endpoint) {
      await apiFetch("/notifications/push/unsubscribe/", {
        method: "POST",
        auth: true,
        body: { endpoint },
      }).catch(() => undefined);
    }
    return true;
  } catch {
    return false;
  }
}
