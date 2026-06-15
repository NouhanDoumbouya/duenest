/*
 * DueNest scanner service worker.
 *
 * Deliberately conservative for a privacy-sensitive app:
 *   - Caches ONLY the heavy, immutable OpenCV.js library (so it loads once).
 *   - NEVER caches API responses, navigations, or anything authenticated —
 *     private documents must never be served from cache.
 *   - Background Sync (where supported) wakes open clients to flush the offline
 *     upload queue. It does not perform headless uploads (see DOCUMENT_SCANNER.md
 *     for why), so the app also flushes on the 'online' event as the reliable
 *     fallback.
 */
const CACHE_VERSION = "duenest-scanner-v1";
const OPENCV_HOST = "docs.opencv.org";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  void event;
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith("duenest-scanner-") && key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Cache-first ONLY for the OpenCV library: large, versioned, non-sensitive.
  if (url.hostname === OPENCV_HOST && url.pathname.endsWith("opencv.js")) {
    event.respondWith(
      caches.open(CACHE_VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Everything else (app pages, /api/, documents) is left to the network. We
  // never cache authenticated or private content.
});

self.addEventListener("sync", (event) => {
  if (event.tag === "duenest-flush-scans") {
    event.waitUntil(notifyClientsToFlush());
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "FLUSH_NOW") {
    void notifyClientsToFlush();
  }
});

async function notifyClientsToFlush() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "FLUSH_QUEUED_SCANS" });
  }
}
