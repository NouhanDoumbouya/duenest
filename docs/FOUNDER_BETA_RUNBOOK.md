# CertaNest — Founder Private Beta Runbook

The operator's guide to inviting and supporting a small, controlled group of beta
users and organizations **with confidence**. It defines what "ready for private
beta" means, the exact steps to onboard an org, and how to triage failures —
without ever seeing a user's private document contents.

Related, already-existing artifacts (do not duplicate — use them):
- `docs/private-beta-launch-checklist.md` — the surface/security/backend/frontend checklist.
- `docs/PRIVATE_BETA_OPERATIONAL_READINESS.md` — email + scheduler + Redis/Sentry setup.
- `docs/GO_LIVE_CHECKLIST.md` — DNS, Stripe, scheduler, device checks.
- `docs/SECURITY_PRIVACY_CHECKLIST.md` — encryption, tokens, logging, launch blockers.
- The founder console **Launch readiness** tracker (`/founder/launch`) and
  **observability** (`/founder`).

---

## 1. The private-beta readiness standard

CertaNest is "ready for private beta" when **all** of the following hold:

1. A small controlled group can use the core flows end-to-end.
2. **Known limitations are documented** (`docs/BETA_TESTER_GUIDE.md`).
3. The founder can **see and support failures** (observability + jobs + errors).
4. **Data privacy is not compromised** — private contents/URLs/tokens are never
   exposed to founders, logs, or the readiness report.
5. **Payments stay test/sandbox** unless explicitly switched later.
6. **Feature flags are understood** and set deliberately (founder-only for risky,
   beta/Teams for B2B, disabled for unfinished).
7. **Integrations are import-only / read-only** (no sync, no write-back).
8. **No sensitive offline caching** (the PWA serves a privacy-safe `/offline`).
9. **Public links and sharing are safe** (expiry, revocation, safe-failure states).
10. **Backups / deployment risks are documented** (`docs/DEPLOYMENT.md`,
    `docs/GO_LIVE_CHECKLIST.md`).

Run the automated check (below) and read the checklist docs before inviting anyone.

## 2. Automated readiness check (run this first)

A safe, read-only, boolean-only probe (no secrets, no email, no AI, no Google):

```bash
python manage.py beta_readiness_check
python manage.py beta_readiness_check --json                  # for automation
python manage.py beta_readiness_check --include-database-counts
```

It reuses the same live system status the founder console shows and prints a gate
list ending in **READY / ATTENTION / BLOCKED**. Founders can also fetch the same
report in-app: `GET /api/v1/founder/beta-readiness/` (founder-only).

Treat any `[FAIL]` as a launch blocker; review every `[WARN]` before inviting
users. The command does **not** gate deploys — it informs you.

## 3. Before inviting a user

1. **Founder account** — confirm a staff/superuser account exists and is on the
   `FOUNDER_EMAILS` allowlist; sign in to `/founder` and confirm access.
2. **Run** `python manage.py beta_readiness_check` — resolve `[FAIL]` items.
3. **Migrations** — `python manage.py migrate` applied on the deployed backend.
4. **Feature flags** — seed and review (section 5).
5. **Email** — verify real delivery, not console (see
   `docs/PRIVATE_BETA_OPERATIONAL_READINESS.md` §1).
6. **Scheduler** — confirm `process_due_notifications` runs on a cron/scheduler
   (§2 of the operational readiness doc).
7. **Storage** — confirm R2 is configured and **private** (the readiness check's
   *Private file storage* gate).
8. **Observability** — `/founder` shows green; no unresolved critical events.

## 4. Onboard a beta organization (Teams beta)

CertaNest already has the command — **use it, don't duplicate it**:

```bash
python manage.py set_organization_plan --org-id <id> --plan teams_beta --portal-enabled true
```

This sets the org's entitlement (`OrganizationPlanProfile`) so the B2B portal and
its limits are governed at the org level. Then walk the full B2B loop yourself
(section 7 of `docs/qa/PRIVATE_BETA_QA.md`) before handing the org to a real admin.

## 5. Feature flag review for beta

Seed flags so they're founder-editable (idempotent; preserves overrides):

```bash
python manage.py seed_feature_flags          # create any missing rows
python manage.py seed_feature_flags --reset  # also reset to registry defaults
```

Recommended beta posture (set in Django admin or `/founder/feature-controls`):

| Flag | Beta posture |
|---|---|
| `documents` and core vault | enabled |
| `b2b_portals` | founder-only → enable per beta org (Teams) |
| `redaction_watermarking` | founder-only until verified |
| `ai_features` + AI sub-flags | founder-only; enable per Pro/beta user with consent |
| `integrations`, `google_integrations` | founder-only → enable for beta users |
| `google_drive_import`, `google_calendar_import`, `gmail_import` | founder-only; enable only the import flows that are merged |
| anything unfinished | disabled |

Rule: **do not enable everything globally.** Founder-only for risky, beta/Teams
for B2B, Pro-gated for paid personal features, disabled for unfinished.

## 6. Launch gates — DO NOT invite beta users if…

- migrations are not applied,
- password reset is broken,
- file upload or **public request upload** (`/request/<token>`) is broken,
- R2 is public, or any **private file URL / R2 object key** is exposed,
- the founder cannot access observability, **or a normal user can reach `/founder`**,
- emails fail silently (delivery not configured, but the app pretends it sent),
- scheduled jobs are invisible or failing,
- AI calls are not capped (metering/budget guard off) or AI runs without consent,
- Google scopes are broader than read-only import,
- **Stripe is accidentally in live mode** (the readiness check's *Stripe mode* gate),
- a public-link token appears in logs or any founder/observability payload.

## 7. Handling common failures

| Symptom | Where to look | Likely cause |
|---|---|---|
| Emails not arriving | `/founder` email health; `docs/...OPERATIONAL_READINESS.md` §1 | provider not configured / DNS not verified |
| Reminders never fire | `/founder` jobs; `ScheduledJobRun` | no scheduler/cron running `process_due_notifications` |
| Upload fails | `/founder` observability (category `upload`/`storage`) | storage misconfig / size/type rejected |
| Portal 503 | feature flags | `b2b_portals` disabled for that user/org |
| Integration "Not configured" | readiness check *Google OAuth* gate | `GOOGLE_OAUTH_*` env unset |
| Spike in critical events | `/founder` → resolve events | inspect `error_code`/`source` (metadata is scrubbed) |

Founders see **safe aggregates only** — never document contents, file names, OCR
text, private notes, tokens, raw IPs, or storage keys.

## 8. Rollback / fallback plan

- **Kill a risky feature instantly:** set its feature flag to `disabled` in
  `/founder/feature-controls` (or Django admin). Endpoints 503 and nav hides — no
  redeploy needed.
- **Pause integrations:** disable `integrations` (and per-provider flags).
- **Pause AI:** disable `ai_features` (all AI sub-features fail closed).
- **Pause B2B onboarding:** disable `b2b_portals` or set the org plan status to
  `disabled` via `set_organization_plan ... --status disabled`.
- **Stop a bad deploy:** redeploy the previous known-good build; migrations in this
  codebase are additive — avoid destructive down-migrations during beta.
- **Communicate:** if data may be affected, tell beta users honestly and point to
  `support@certanest.com`.

## 9. Support triage workflow

1. Reproduce from the user's described route (`docs/qa/PRIVATE_BETA_QA.md`).
2. Check `/founder` observability + jobs for matching `OperationalEvent`s.
3. Use **support notes** on the user/org founder pages to record context.
4. If it's config, fix the env/flag and re-run `beta_readiness_check`.
5. Never request a user's private files to "debug" — reproduce with demo data.
