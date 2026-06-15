interface SyncManagerLike {
  register(tag: string): Promise<void>;
}

/**
 * Register the scanner service worker. Returns the registration, or null when
 * service workers are unsupported. Failures are swallowed — the scanner works
 * fully without a service worker (OpenCV just re-downloads, queue flushes on the
 * 'online' event instead of via Background Sync).
 */
export async function registerScannerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register("/scanner-sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

/**
 * Ask the platform to flush queued scans when back online. Prefers Background
 * Sync (survives the page closing where supported); otherwise messages the
 * active worker as a best-effort nudge. The app's own 'online' handler remains
 * the reliable fallback.
 */
export async function requestBackgroundFlush(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const withSync = reg as ServiceWorkerRegistration & { sync?: SyncManagerLike };
    if (withSync.sync) {
      await withSync.sync.register("duenest-flush-scans");
      return true;
    }
    reg.active?.postMessage({ type: "FLUSH_NOW" });
    return false;
  } catch {
    return false;
  }
}

/** Subscribe to the worker's "flush now" messages. Returns an unsubscribe fn. */
export function onServiceWorkerFlush(handler: () => void): () => void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return () => {};
  }
  const listener = (event: MessageEvent) => {
    if (event.data && event.data.type === "FLUSH_QUEUED_SCANS") handler();
  };
  navigator.serviceWorker.addEventListener("message", listener);
  return () => navigator.serviceWorker.removeEventListener("message", listener);
}
