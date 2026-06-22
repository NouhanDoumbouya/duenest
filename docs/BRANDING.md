# CertaNest — Branding, Domains & Email

> The product is **CertaNest** (formerly DueNest). This doc records the brand,
> the domain/email plan, and which internal identifiers intentionally still use
> the `duenest` string so engineers know what is safe to rename later.

## Brand

- **Name:** CertaNest (always one word, capital C and N).
- **Meaning:** certainty + nest — a secure home for important life-admin.
- **Main tagline:** Life documents, deadlines, and proof — ready when life asks.
- **Short tagline:** Your life-admin, securely organized.
- **Logo:** Secure Nest Mark. Official assets in `brand/certanest/assets/final/`.
- **Palette / type / UI rules:** see `brand/certanest/` (colors.md, typography.md, ui-style.md).

## Domains

| Domain | Purpose |
| --- | --- |
| `certanest.com` | Marketing / landing site (canonical `NEXT_PUBLIC_SITE_URL`) |
| `app.certanest.com` | Main application (frontend) |
| `api.certanest.com` | Backend API |
| `mail.certanest.com` | Resend sending domain (email) |

These are **not** hardcoded for local development. The frontend reads
`NEXT_PUBLIC_SITE_URL` (falls back to `https://certanest.com` only for
production-style metadata), and the API base stays env-driven
(`NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1` locally). Auth cookie
sharing across subdomains is configured via `AUTH_COOKIE_DOMAIN` (e.g.
`.certanest.com` in prod, empty in dev).

## Email senders (prepared — Resend not required to be configured yet)

| Address | Use |
| --- | --- |
| `CertaNest <notifications@mail.certanest.com>` | Transactional / notification email |
| `CertaNest Security <security@mail.certanest.com>` | Security / sensitive email |
| `support@certanest.com` | Support / reply-to (`SUPPORT_EMAIL`) |

Configure in the backend environment (see `backend/.env.example`):

```env
DEFAULT_FROM_EMAIL=CertaNest <notifications@mail.certanest.com>
SUPPORT_EMAIL=support@certanest.com
```

Local development keeps `DEFAULT_FROM_EMAIL=CertaNest <noreply@localhost>` and the
console email backend, so nothing breaks without Resend.

Email design rules live in `brand/certanest/email-style.md` (Warm Ivory bg, white
card, CertaNest logo, one clear CTA, no document contents or raw public links in
email, trust line "Private until you share it.").

## Internal identifiers intentionally kept as `duenest` (for now)

These are **not user-facing** and changing them is risky (would require data
migrations, cache invalidation, log-pipeline updates, or coordinated infra
renames). They were deliberately left unchanged in this rebrand pass:

- **Auth cookies:** `duenest_access`, `duenest_refresh`, `duenest_csrftoken`
  (frontend `proxy.ts` defaults must match backend — rename together later).
- **Env var names:** `DUENEST_ACTIVE_KEK_VERSION`, `DUENEST_KEK_V1_B64`,
  `DUENEST_APP_BASE_URL`, `DUENEST_FEATURE_*`, `DUENEST_DEMO_DATA`.
- **Encryption headers:** `duenest:file:v1:…`, `duenest:field:v1:…`
  (changing these breaks decryption of existing data).
- **Loggers / cache prefix:** `duenest.encryption`, `duenest.scanner`, … and the
  `"duenest"` cache key prefix.
- **Celery app name:** `Celery("duenest")`.
- **DB `related_name`:** `duenest_subscriptions` (would need a migration).
- **Service-worker cache names:** `duenest-static-v1`, etc. (bump when convenient).
- **Frontend internals:** SafeSend helpers `normalizeDueNestCode` /
  `formatDueNestCode` / `forDueNestUser`, the `DN-` SafeSend code prefix,
  localStorage keys (`duenest:sidebar`, …), CSS animation names (`duenest-*`),
  and download-filename prefixes (`duenest-export-`, `duenest-bundle-`).
- **Infra/docs:** container/service names (`duenest-backend`, `duenest-prod`,
  `duenest-worker`) and the git repository URL (`…/duenest.git`).

When the infrastructure is migrated to the CertaNest namespace, rename these in a
dedicated, coordinated change (with the matching migrations/cache-busting), not as
part of a visual rebrand.
