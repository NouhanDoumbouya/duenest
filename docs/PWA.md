# CertaNest PWA Lite Foundation

CertaNest is installable and app-like **without caching sensitive private data**.
This document describes what the PWA Lite Foundation includes, what it
deliberately excludes, and the security rules that shape it.

> CertaNest stores passports, visas, IDs, insurance, financial, organization and
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
- A reusable **PWA status card** (Settings → Data controls)
- **Opt-in Web Push** (see §9): per-device subscribe/unsubscribe, privacy-safe
  lock-screen copy, and `push`/`notificationclick` handling in the service worker

## 2. What it intentionally excludes (this sprint)

- No offline private vault access
- No caching of `/api/*` or any authenticated/private response
- No background sync of private document uploads (only the existing scanner
  OpenCV/queue behaviour is preserved)

> Note: Web Push (PushSubscription backend, VAPID keys, push delivery) was
> excluded in the original PWA sprint and has since shipped as an opt-in
> foundation — see §9.

## 3. Why private documents are not cached offline

Offline document access would require storing decrypted (or re-decryptable)
file bytes/metadata on the device, outside the server's authorization and
encryption guarantees. For a vault of identity and financial documents that is
an unacceptable exposure (lost/shared device, forensic recovery, other apps).
CertaNest keeps private data server-side behind authenticated, ownership-checked
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

A mobile-first, dismissible bottom banner orchestrated by `PwaProvider`
(`frontend/src/components/pwa/pwa-provider.tsx`) and rendered by `InstallPrompt`
(`install-prompt.tsx`).

**Where it shows (allow-list):**

- Public/marketing + auth routes (exact match): `/`, `/pricing`, `/login`,
  `/register`.
- App areas (prefix match): `/dashboard`, `/onboarding`.

**Where it is suppressed:**

- Sensitive app flows (override the allow-list): `/dashboard/scanner` (active
  capture), `/dashboard/settings/billing` (checkout/payment).
- Public token viewers — `/emergency/[token]`, `/quick-share/[token]` (SafeSend),
  `/share/*`, `/rooms/*`, etc. — are simply not in the allow-list, so the prompt
  never appears while someone is entering an access code.
- **Desktop**: the banner is mobile-only (`matchMedia('(max-width: 768px)')`),
  even though desktop Chrome also fires `beforeinstallprompt`.

**When it shows:**

- Not on first paint — an ~8s delay after landing on an allowed route.
- Only if the app is **not** already installed/standalone and the user has not
  dismissed it recently.
- Android/Chrome: only once a `beforeinstallprompt` event has been captured.
- iOS/iPadOS: shown as guidance (there is no `beforeinstallprompt` on iOS).

**Behavior:**

- Android/Chrome: tapping **Install** calls the captured event's `prompt()` and
  awaits `userChoice`; the `appinstalled` event also hides it permanently.
- iOS/iPadOS: shows the **Tap Share → Add to Home Screen → Add** steps with a
  single **Got it** button (no programmatic install is possible).
- Dismissal ("Maybe later" / "Got it" / ✕) is remembered locally for 30 days (a
  non-identifying timestamp in `localStorage`; no sensitive data).
- It never requests notification permission at the same time, never pushes page
  content (fixed overlay with safe-area bottom padding), and yields to nothing
  critical (it sits above content and is always dismissible).

> Not every browser supports `beforeinstallprompt` (it is Chromium-only). On
> browsers without it and without iOS guidance applicability, no install UI is
> shown rather than a broken affordance.

## 7. iOS install notes

- iOS installs via **Safari → Share → Add to Home Screen** (no `beforeinstallprompt`).
- `apple-mobile-web-app-capable` + `black-translucent` status bar are set.
- iOS PWAs do **not** support Web Push the same way; push will require iOS 16.4+
  installed-PWA support and is out of scope this sprint.

## 8. Android / Chrome install notes

- Meets installability (manifest + icons + service worker + HTTPS).
- `beforeinstallprompt` drives the in-app Install button; the OS may also show
  its own install affordance.

## 9. Push notifications (implemented foundation)

Web Push is implemented as an **opt-in, privacy-safe** foundation. It is fully
disabled until a deployment supplies VAPID keys, and it never prompts on page
load — only from the explicit "Enable on this device" control in
`/dashboard/notifications/settings`.

End-to-end flow:

1. **VAPID keys** are read from the environment (`VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`). When unset, push is off everywhere
   (the public-key endpoint reports `enabled: false`).
2. The settings card requests `Notification.requestPermission()` **only on the
   user's click**, then
   `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`.
3. The browser `PushSubscription` is POSTed to
   `/api/v1/notifications/push/subscribe/` and stored per device
   (`PushWebSubscription`). The user's `push_enabled` preference is set true.
4. When a notification is first delivered in-app (`deliver_notification`),
   `apps/notifications/push.py` sends a **generic** Web Push to the user's
   devices (gated on `push_enabled` + configured VAPID + an existing
   subscription). `pywebpush` is imported lazily; absent it, delivery is a no-op.
5. In lean mode the push is sent inline; in scale-ready mode
   (`ENABLE_BACKGROUND_JOBS=true`) `deliver_notification` dispatches the
   `send_push` Celery task onto the dedicated `push` queue so the slow,
   network-bound web-push never blocks the notification flow.
6. `sw.js` handles `push` (shows a generic notification) and `notificationclick`
   (focuses an existing tab via a `PUSH_NAVIGATE` message, else opens the URL).
7. Subscriptions reported gone (HTTP 404/410) are deleted automatically.

Endpoints: `GET /notifications/push/public-key/`,
`POST /notifications/push/subscribe/`, `POST /notifications/push/unsubscribe/`.

Generate a key pair with `python -m py_vapid --gen` (or any VAPID generator) and
keep the private key in the environment only — never commit it.

### Quiet hours

Users can set a daily quiet-hours window (in their notification timezone) from
the push settings card. During quiet hours, **device pushes are held back but
in-app notifications are never suppressed** — the user still sees everything next
time they open CertaNest. The window may wrap midnight (e.g. 22:00 → 07:00).

### Not yet included (future)

- Per-notification-type push controls (currently push mirrors any first in-app
  delivery the user's category preferences already allowed).
- iOS Web Push requires iOS 16.4+ and the app installed to the Home Screen.

## 10. Security / privacy rules for push messages

Push payloads must be **generic and lock-screen-safe** — never include document
numbers, filenames, names, or emergency details.

Safe examples:

- `An important CertaNest reminder needs your attention.`
- `Emergency access activity detected. Open CertaNest to review.`
- `A shared item was accessed. Open CertaNest for details.`
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
- [ ] Install prompt does **not** appear on `/dashboard/scanner` or while entering
      a code on `/emergency/[token]` / `/quick-share/[token]`
- [ ] Install prompt does **not** appear on desktop widths
- [ ] Offline banner appears/disappears with connectivity
- [ ] Dashboard loads online; scanner still works (OpenCV cache + queue flush)
- [ ] `npm run lint` and `npm run build` pass

### Testing the install prompt by platform

**Chrome on Android (native install):**

1. Deploy (or `next start` over HTTPS) — the SW only registers in production.
2. Open the site in Chrome on Android; visit an allowed route (e.g. `/` or
   `/dashboard`) and wait ~8s.
3. The CertaNest install banner appears with **Install** / **Maybe later**.
4. Tap **Install** → the native Chrome install sheet appears → confirm.
5. The app opens standalone; the banner no longer appears (`appinstalled` +
   standalone detection).
6. DevTools → Application → Manifest also shows installability and an **Install**
   affordance for desktop testing.

**iOS / iPadOS Safari (manual Add to Home Screen):**

1. Open the site in Safari (not an in-app/Chrome iOS webview).
2. On an allowed route the banner shows **Tap Share → Add to Home Screen → Add**
   with a **Got it** button (iOS has no `beforeinstallprompt`).
3. Use Safari's **Share → Add to Home Screen → Add** to install.
4. Launch from the home screen → opens standalone; the banner no longer shows.

**Clearing an installed PWA to retest:**

- Android: long-press the CertaNest icon → Uninstall (or Chrome → Site settings →
  remove). Then Chrome → DevTools → Application → Clear storage to reset the
  dismissal timestamp.
- iOS: long-press the home-screen icon → Remove App.
- Re-arm the in-app banner without uninstalling by clearing the
  `duenest:pwa-install-dismissed-at` key in `localStorage` (or Application →
  Clear storage) and reloading on an allowed route.

## 12. Deployment notes

- The service worker only registers in **production** builds (`NODE_ENV === 'production'`),
  so local `next dev` is unaffected.
- Serve over HTTPS (required for service workers + installability).
- `sw.js` and `manifest.webmanifest` are served from `frontend/public/` at the
  site root; ensure the host does not add long-lived immutable caching to `sw.js`
  (browsers re-check it, but avoid CDN pinning the old worker).
- Bump `VERSION` in `sw.js` on each release that changes cached assets.
