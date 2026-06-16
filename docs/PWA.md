# DueNest PWA Lite Foundation

DueNest is installable and app-like **without caching sensitive private data**.
This document describes what the PWA Lite Foundation includes, what it
deliberately excludes, and the security rules that shape it.

> DueNest stores passports, visas, IDs, insurance, financial, organization and
> emergency documents. Caching is therefore intentionally conservative: **no
> private documents, no decrypted files, no authenticated API responses, and no
> navigation HTML are ever stored on the device.**

## 1. What PWA Lite includes

- Web app manifest (`frontend/public/manifest.webmanifest`)
- Installable icons (regular + maskable) + apple-touch-icon
- Standalone display mode, brand theme color, safe-area support
- A single, security-first **service worker** (`frontend/public/sw.js`)
- A calm **offline fallback** page (`/offline`)
- Service worker **update handling** with a user-initiated "Update available" banner
- A polite, dismissible **install prompt** (Android/Chrome + iOS guidance)
- Offline/online awareness banner
- A reusable **PWA status card** (Settings → Data controls) with a disabled
  "push notifications coming soon" opt-in
- Push-notification **frontend preparation** (feature detection only)

## 2. What it intentionally excludes (this sprint)

- No offline private vault access
- No caching of `/api/*` or any authenticated/private response
- No background sync of private document uploads (only the existing scanner
  OpenCV/queue behaviour is preserved)
- No PushSubscription backend, VAPID keys, Celery push delivery, or push triggers
  (these depend on the security + scale-ready Redis/Celery/notification work and
  ship in a later sprint)

## 3. Why private documents are not cached offline

Offline document access would require storing decrypted (or re-decryptable)
file bytes/metadata on the device, outside the server's authorization and
encryption guarantees. For a vault of identity and financial documents that is
an unacceptable exposure (lost/shared device, forensic recovery, other apps).
DueNest keeps private data server-side behind authenticated, ownership-checked
endpoints and shows a calm offline page instead.

## 4. How service worker caching works

One unified worker at scope `/` (it also absorbs the former scanner worker so the
two never conflict — a browser allows one registration per scope).

**Only cached (public, non-sensitive):**

| Cache | Contents | Strategy |
|---|---|---|
| `duenest-shell-v1` | `/offline`, manifest, app icons | precache |
| `duenest-static-v1` | `/_next/static/*`, `/icons/*`, `/brand/*`, fonts/images | stale-while-revalidate |
| `duenest-scanner-v1` | OpenCV library (`docs.opencv.org/**/opencv.js`) | cache-first |

**Never cached (network-only / never stored):**

- `/api/*` (all backend responses)
- `/share/*`, `/quick-share/*`, `/emergency/*`, `/rooms/*`, `/org-room/*`,
  `/org-request/*`, `/org-invite/*`, `/invite/*`
- billing / account / security routes (these are navigations — see below)
- **all navigation HTML** (network-first → `/offline` on failure; the response
  is never written to a cache, so authenticated dashboard markup is never stored)
- any request with an `Authorization` header
- any non-GET request
- any cross-origin request (except the OpenCV library)

No JWTs, access codes, share codes, file bytes, or private metadata are stored.

## 5. How updates work

1. A new `sw.js` installs and **waits** (it does not auto-activate).
2. The app detects the waiting worker and shows an "A new version is ready" banner.
3. The user taps **Refresh** → the app posts `SKIP_WAITING` → the new worker
   activates → the page reloads once (`controllerchange`).
4. The refresh is **user-initiated** — never applied automatically mid-upload or
   mid-scan.

Bump the `VERSION` constant in `sw.js` to ship a new worker + roll caches.

## 6. How the install prompt works

- Shown only on value routes (`/dashboard`, `/onboarding`), after an ~8s delay,
  and never on the landing page.
- Android/Chrome: uses the captured `beforeinstallprompt` event → native install.
- iOS/iPadOS: shows **Share → Add to Home Screen** guidance (iOS has no
  programmatic install).
- Dismissal is remembered locally for 30 days (a non-identifying timestamp in
  `localStorage`; no sensitive data).
- It never requests notification permission at the same time.

## 7. iOS install notes

- iOS installs via **Safari → Share → Add to Home Screen** (no `beforeinstallprompt`).
- `apple-mobile-web-app-capable` + `black-translucent` status bar are set.
- iOS PWAs do **not** support Web Push the same way; push will require iOS 16.4+
  installed-PWA support and is out of scope this sprint.

## 8. Android / Chrome install notes

- Meets installability (manifest + icons + service worker + HTTPS).
- `beforeinstallprompt` drives the in-app Install button; the OS may also show
  its own install affordance.

## 9. Future push-notification integration plan

Implement only **after** the security + scale-ready (Redis/Celery/notification)
foundations are merged:

1. Generate **VAPID** keys; expose the public key to the frontend.
2. After the user opts in (explicit, post-setup), call `Notification.requestPermission()`.
3. `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
4. POST the `PushSubscription` to a new backend endpoint; store it per user.
5. Deliver reminder / emergency / security pushes via a Celery task → web-push.
6. Handle `push` + `notificationclick` events in `sw.js`.

Frontend is **prepared** (capability detection in `frontend/src/lib/pwa.ts`,
disabled opt-in UI) but does **not** subscribe yet.

## 10. Security / privacy rules for push messages

Push payloads must be **generic and lock-screen-safe** — never include document
numbers, filenames, names, or emergency details.

Safe examples:

- `An important DueNest reminder needs your attention.`
- `Emergency access activity detected. Open DueNest to review.`
- `A shared item was accessed. Open DueNest for details.`
- `A security event needs your review.`

Unsafe (never):

- `Your passport G123456 expires tomorrow.`
- `Your visa file was opened by John.`
- `Your emergency location was revealed.`

## 11. Testing checklist

- [ ] `/manifest.webmanifest` reachable; icons load
- [ ] Installable in Chrome; opens standalone
- [ ] iOS install guidance displays in Safari
- [ ] `/offline` renders the calm fallback
- [ ] SW does **not** cache `/api/*`, preview/download, emergency/share routes
- [ ] Update banner appears for a new worker; Refresh applies it
- [ ] Install prompt dismiss is remembered
- [ ] Offline banner appears/disappears with connectivity
- [ ] Dashboard loads online; scanner still works (OpenCV cache + queue flush)
- [ ] `npm run lint` and `npm run build` pass

## 12. Deployment notes

- The service worker only registers in **production** builds (`NODE_ENV === 'production'`),
  so local `next dev` is unaffected.
- Serve over HTTPS (required for service workers + installability).
- `sw.js` and `manifest.webmanifest` are served from `frontend/public/` at the
  site root; ensure the host does not add long-lived immutable caching to `sw.js`
  (browsers re-check it, but avoid CDN pinning the old worker).
- Bump `VERSION` in `sw.js` on each release that changes cached assets.
