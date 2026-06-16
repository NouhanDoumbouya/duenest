/**
 * PWA feature-detection + lightweight local preferences.
 *
 * No sensitive data is ever stored here — only a non-identifying "install prompt
 * dismissed" timestamp in localStorage. Push is feature-detected for the future
 * flow but NOT subscribed in this sprint (see docs/PWA.md).
 */

export const INSTALL_DISMISS_KEY = "duenest:pwa-install-dismissed-at";
const DISMISS_DAYS = 30;

export function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** True when running as an installed/standalone PWA. */
export function isStandalone(): boolean {
  if (!isBrowser()) return false;
  const mq = window.matchMedia?.("(display-mode: standalone)")?.matches;
  // iOS Safari exposes navigator.standalone instead of display-mode.
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone;
  return Boolean(mq || iosStandalone);
}

export function isIos(): boolean {
  if (!isBrowser()) return false;
  const ua = window.navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ reports as Mac; detect touch + Mac as a heuristic.
  const iPadOS =
    window.navigator.platform === "MacIntel" &&
    (window.navigator as { maxTouchPoints?: number }).maxTouchPoints
      ? ((window.navigator as { maxTouchPoints?: number }).maxTouchPoints ?? 0) > 1
      : false;
  return iOS || iPadOS;
}

export function supportsServiceWorker(): boolean {
  return isBrowser() && "serviceWorker" in navigator;
}

/**
 * Coarse "mobile / small screen" check. The install prompt is a mobile-first
 * banner, so we don't surface it on desktop — even though desktop Chrome also
 * fires `beforeinstallprompt`.
 */
export function isMobileViewport(): boolean {
  if (!isBrowser()) return false;
  return window.matchMedia?.("(max-width: 768px)")?.matches ?? false;
}

export function supportsNotifications(): boolean {
  return isBrowser() && "Notification" in window;
}

export function supportsPush(): boolean {
  return (
    isBrowser() && "serviceWorker" in navigator && "PushManager" in window
  );
}

/** Coarse capability summary for the (disabled) notifications UI + docs. */
export type PwaCapabilities = {
  standalone: boolean;
  ios: boolean;
  serviceWorker: boolean;
  notifications: boolean;
  push: boolean;
  notificationPermission: NotificationPermission | "unsupported";
};

export function getPwaCapabilities(): PwaCapabilities {
  return {
    standalone: isStandalone(),
    ios: isIos(),
    serviceWorker: supportsServiceWorker(),
    notifications: supportsNotifications(),
    push: supportsPush(),
    notificationPermission: supportsNotifications()
      ? Notification.permission
      : "unsupported",
  };
}

export function isInstallDismissed(): boolean {
  if (!isBrowser()) return false;
  try {
    const raw = window.localStorage.getItem(INSTALL_DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function dismissInstall(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
  } catch {
    /* ignore storage failures */
  }
}

/** The Chromium beforeinstallprompt event (not in the standard lib types). */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
