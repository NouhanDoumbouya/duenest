# DueNest Authentication & Sessions

DueNest uses Django + DRF + SimpleJWT. For beta, auth tokens are carried in
**HttpOnly cookies** (not JavaScript-readable storage), with CSRF protection on
the cookie path and server-side route protection in the Next.js frontend.

SimpleJWT rotation + blacklist behaviour is unchanged — only *where* the tokens
are carried changed.

---

## 1. Token model

| Token | Where it lives | Readable by JS? | Lifetime (default) |
| --- | --- | --- | --- |
| Access | `duenest_access` HttpOnly cookie | No | 15 min |
| Refresh | `duenest_refresh` HttpOnly cookie | No | 7 days |
| CSRF | `duenest_csrftoken` cookie | Yes (by design) | session |

Tokens are also returned in the login/refresh JSON body for backward-compatible
header clients (tests, server-to-server). The browser SPA ignores the body and
relies on cookies.

## 2. Endpoints

- `POST /api/v1/auth/login/` — validates credentials, sets auth + CSRF cookies.
- `POST /api/v1/auth/register/` — creates the user (no auto-login; redirect to login).
- `POST /api/v1/auth/google/` — verifies Google ID token, sets cookies.
- `POST /api/v1/auth/refresh/` — reads the refresh cookie (or body), rotates
  tokens (blacklisting the old refresh), sets new cookies.
- `POST /api/v1/auth/logout/` — blacklists the refresh token and clears cookies.
- `GET  /api/v1/auth/csrf/` — sets/refreshes the CSRF cookie.
- `GET  /api/v1/users/me/` — current user; the source of truth for auth state.

## 3. How a request is authenticated

`apps.users.cookie_auth.CookieJWTAuthentication` (the default DRF auth class):

1. If an `Authorization: Bearer …` header is present → header auth, no CSRF
   (no ambient credential). This keeps API/test clients working.
2. Otherwise read the access token from the `duenest_access` cookie. For unsafe
   methods (POST/PUT/PATCH/DELETE) Django CSRF is enforced (double-submit): the
   SPA must send `X-CSRFToken` matching the `duenest_csrftoken` cookie.

The frontend API client (`src/lib/api.ts`) sends `credentials: "include"` on
every request, adds `X-CSRFToken` on unsafe methods, and on a 401 attempts a
single refresh then replays the request once (single-flight, no loops).

## 4. Route protection (frontend)

`src/proxy.ts` (Next.js proxy, formerly "middleware") is the hard gate:

- `/dashboard/*` and `/founder/*` require an auth cookie, else redirect to `/login`.
- `/login` and `/register` redirect to `/dashboard` when already authenticated.
- It checks **cookie presence only** — token validity is enforced by the backend
  on every API call; founder role is enforced by the backend + the founder layout.
- All public routes are excluded from the matcher (see §6).

## 5. Deployment topologies

### Same registrable domain (recommended)

Frontend and backend share a site so cookies are visible to both:

- Dev (recommended): the frontend **proxies `/api/v1/*` to the backend** via
  `frontend/next.config.ts` (rewrite to `BACKEND_ORIGIN`), and the client uses the
  relative `NEXT_PUBLIC_API_BASE_URL=/api/v1`. This makes the API same-origin as
  the app, so the auth cookies are first-party and `proxy.ts` can see them — and
  it works whether you open the app via `localhost`, `127.0.0.1`, or a LAN IP
  (e.g. `http://172.16.114.9:3000`). For a LAN IP, add it to
  `DJANGO_DEV_EXTRA_ORIGINS` so Django trusts it for CSRF on writes.
  (Without the proxy you'd hit a `/dashboard → /login` loop, because cookies set
  on the backend host aren't visible to the frontend's `proxy.ts`.)
- Prod: e.g. `app.duenest.com` (frontend) + `api.duenest.com` (backend) with
  `AUTH_COOKIE_DOMAIN=.duenest.com`. SameSite=Lax, Secure.

Required prod env:
```
DJANGO_ALLOWED_HOSTS=api.duenest.com
DJANGO_CORS_ALLOWED_ORIGINS=https://app.duenest.com
DJANGO_CSRF_TRUSTED_ORIGINS=https://app.duenest.com,https://api.duenest.com
DJANGO_CORS_ALLOW_CREDENTIALS=True
AUTH_COOKIE_DOMAIN=.duenest.com
# (AUTH_COOKIE_SECURE / CSRF_COOKIE_SECURE are auto-forced True in production)
```

### Split domains (e.g. Vercel app + Railway API on unrelated domains)

Cookies must be cross-site:
```
AUTH_COOKIE_SAMESITE=None
AUTH_COOKIE_SECURE=True
CSRF_COOKIE_SAMESITE=None          # set via Django settings/env as needed
DJANGO_CORS_ALLOW_CREDENTIALS=True
DJANGO_CORS_ALLOWED_ORIGINS=https://your-app.vercel.app
DJANGO_CSRF_TRUSTED_ORIGINS=https://your-app.vercel.app,https://your-api.up.railway.app
```
**Limitation:** in a split-domain setup the backend's auth cookies are NOT
visible to the Next.js proxy (it runs on the frontend domain), so `src/proxy.ts`
cannot gate routes. Protection then relies on the client layout + backend (every
API call still enforces auth). Prefer the same-domain topology for beta.

## 6. Public routes (must stay reachable without a session)

The proxy matcher only covers `/dashboard/*`, `/founder/*`, `/login`, `/register`.
Everything else is public, including:

- landing `/`, `/pricing`, `/security`, `/privacy`, `/terms`, `/contact`
- public Quick Share claim: `/quick-share/[token]`
- public emergency viewer: `/emergency/[token]`
- public secure rooms: `/rooms/[token]`
- public share file: `/share/files/[token]`
- org public flows: `/org-invite/[token]`, `/org-request/[token]`, `/org-room/[token]`
- `/invite/[code]`, `/waitlist`

These call token-gated backend endpoints (with optional `X-Access-Code`) and do
not require login.

## 7. Migration from localStorage

Older builds stored tokens in `localStorage` (`duenest.access`/`duenest.refresh`).
The frontend no longer reads or writes them; `cleanupLegacyTokenStorage()` (in
`src/lib/auth.ts`) removes those keys on login/logout and whenever the deprecated
`getAccessToken()` is called. No user action is required.

## 8. Beta auth checklist

- [ ] Login works (cookies set, redirected to dashboard)
- [ ] Register works (then redirect to login)
- [ ] Refresh works (access auto-renews on 401)
- [ ] Logout works (cookies cleared, refresh blacklisted)
- [ ] Dashboard blocked when logged out (proxy redirect to /login)
- [ ] Founder route blocked for non-founder (clean 403 screen)
- [ ] Public share link still works (`/quick-share/[token]`)
- [ ] Emergency public viewer still works (`/emergency/[token]`)
- [ ] Quick Share code claim still works
- [ ] Secure room public flow still works (`/rooms/[token]`)

## 9. Known limitations / risks

- Split-domain deployments can't use proxy-based route gating (see §5).
- Header (Bearer) auth is intentionally retained for backward compatibility and
  is not subject to CSRF; restrict/disable it once all clients use cookies.
- CSRF uses Django's double-submit cookie; the SPA must be able to read the
  `duenest_csrftoken` cookie (same-site or properly configured cross-site).
- End-to-end browser cookie/CSRF/cross-domain behaviour should be verified on a
  staging deploy — backend behaviour is covered by tests, but a real browser
  round-trip across the chosen domains has not been exercised in CI.
