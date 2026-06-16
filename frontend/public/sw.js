/*
 * DueNest unified service worker (PWA Lite Foundation).
 *
 * SECURITY-FIRST CACHING. DueNest stores passports, visas, IDs, insurance,
 * financial and emergency documents, so this worker is deliberately conservative:
 *
 *   NEVER cached:
 *     - /api/* (all backend responses, authenticated or not)
 *     - document preview/download routes, emergency, share/quick-share, billing,
 *       account/security routes (these are navigations served network-first and
 *       their RESPONSES are never written to any cache)
 *     - any request carrying an Authorization header
 *     - any non-GET request
 *     - any navigation HTML (so authenticated dashboard markup/JSON is never
 *       stored in a shared cache)
 *
 *   ONLY cached (public, non-sensitive):
 *     - the offline fallback page (/offline) + app icons/manifest (precache)
 *     - hashed, immutable Next.js static assets (/_next/static/*)
 *     - public brand assets and the OpenCV scanner library (cross-origin, versioned)
 *
 * It also preserves the existing scanner behaviour (OpenCV cache-first +
 * Background Sync flush messaging) so the two workers can be a single
 * registration at scope "/" without conflicting. No JWTs, access codes, share
 * codes, file bytes or private metadata are ever stored here.
 */

const VERSION = "v1";
const STATIC_CACHE = `duenest-static-${VERSION}`;
const SHELL_CACHE = `duenest-shell-${VERSION}`;
const SCANNER_CACHE = `duenest-scanner-${VERSION}`;
const CACHE_ALLOWLIST = [STATIC_CACHE, SHELL_CACHE, SCANNER_CACHE];

const OFFLINE_URL = "/offline";
const PRECACHE_SHELL = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
];

const OPENCV_HOST = "docs.opencv.org";

// Same-origin path prefixes whose responses must NEVER be cached. Navigations to
// these are still served (network-first) but their responses are not stored.
const NEVER_CACHE_PREFIXES = [
  "/api/",
  "/share/",
  "/quick-share/",
  "/emergency/",
  "/rooms/",
  "/org-room/",
  "/org-request/",
  "/org-invite/",
  "/invite/",
];

// File extensions that are safe, public, cacheable static assets.
const STATIC_EXT = /\.(?:css|js|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp|avif|ico|webmanifest)$/i;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // Best-effort precache: a single failure must not abort installation.
      Promise.allSettled(
        PRECACHE_SHELL.map((url) =>
          fetch(url, { credentials: "omit" }).then((res) => {
            if (res && res.ok) return cache.put(url, res.clone());
          }),
        ),
      ),
    ),
  );
  // New worker installs but waits — the app shows an "Update available" prompt
  // and only activates on the user's explicit SKIP_WAITING.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("duenest-") && !CACHE_ALLOWLIST.includes(key),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isNeverCache(url) {
  return NEVER_CACHE_PREFIXES.some((p) => url.pathname.startsWith(p));
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/manifest.webmanifest" ||
    STATIC_EXT.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Rule: only ever consider GET, and never anything with ambient credentials
  // in an Authorization header (defense in depth for token-based callers).
  if (request.method !== "GET") return;
  if (request.headers.get("authorization")) return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // OpenCV scanner library (cross-origin, large, immutable) — cache-first.
  if (url.hostname === OPENCV_HOST && url.pathname.endsWith("opencv.js")) {
    event.respondWith(cacheFirst(request, SCANNER_CACHE));
    return;
  }

  // Anything else cross-origin: leave entirely to the network.
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first, fall back to the calm offline page. The HTML
  // response is NEVER cached, so authenticated pages are never stored.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL, { cacheName: SHELL_CACHE }).then(
          (res) => res || new Response("You are offline.", { status: 503 }),
        ),
      ),
    );
    return;
  }

  // Sensitive same-origin routes (API + private flows): network-only.
  if (isNeverCache(url)) return;

  // Public, immutable static assets: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  // Everything else: straight to the network (not cached).
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok && res.type === "basic") cache.put(request, res.clone());
      return res;
    })
    .catch(() => cached);
  return cached || network;
}

// ---- Update flow -----------------------------------------------------------
// The app posts SKIP_WAITING when the user accepts "Update available"; we then
// activate immediately and the page reloads on controllerchange.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") self.skipWaiting();
  if (data.type === "FLUSH_NOW") void notifyClientsToFlush();
});

// ---- Scanner offline-queue integration (preserved behaviour) ---------------
self.addEventListener("sync", (event) => {
  if (event.tag === "duenest-flush-scans") {
    event.waitUntil(notifyClientsToFlush());
  }
});

async function notifyClientsToFlush() {
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  for (const client of clients) {
    client.postMessage({ type: "FLUSH_QUEUED_SCANS" });
  }
}
