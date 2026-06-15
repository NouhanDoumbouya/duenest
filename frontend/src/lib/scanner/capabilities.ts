import type { ScannerCapabilities } from "./types";

/**
 * Feature-detect every browser API the scanner touches. Detection is defensive:
 * an unsupported capability simply reports `false` and the UI degrades, never
 * throws. Safe to call on the server (returns all-false except where inert).
 */
export function detectCapabilities(): ScannerCapabilities {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      camera: false,
      torch: false,
      vibration: false,
      speech: false,
      orientation: false,
      webShare: false,
      serviceWorker: false,
      backgroundSync: false,
      secureContext: false,
    };
  }

  const secureContext = window.isSecureContext === true;
  const camera =
    secureContext && !!navigator.mediaDevices?.getUserMedia;

  return {
    camera,
    // Torch is a per-track constraint; real support is only known once a track
    // exists. This advertises the platform *might* support it.
    torch:
      camera &&
      typeof MediaStreamTrack !== "undefined" &&
      "getCapabilities" in MediaStreamTrack.prototype,
    vibration: typeof navigator.vibrate === "function",
    speech:
      "SpeechRecognition" in window || "webkitSpeechRecognition" in window,
    orientation: typeof window.DeviceOrientationEvent !== "undefined",
    webShare:
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function",
    serviceWorker: "serviceWorker" in navigator,
    backgroundSync: "serviceWorker" in navigator && "SyncManager" in window,
    secureContext,
  };
}

/** Fire a haptic pulse if the device/browser supports it. No-op otherwise. */
export function haptic(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    // Vibration can throw on some locked-down contexts — ignore.
  }
}

/** Respect the user's reduced-motion preference. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
