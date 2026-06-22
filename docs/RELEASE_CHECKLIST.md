# Release Checklist

A practical pre-release checklist for CertaNest. See `PRIVATE_BETA_READINESS.md`
for the broader readiness snapshot and `FEATURE_FLAGS.md` for kill-switch usage.

## Before each beta deploy

- [ ] `python manage.py check` clean.
- [ ] `python manage.py makemigrations --check --dry-run` → "No changes detected".
- [ ] Run migrations after deploy.
- [ ] `python manage.py seed_feature_flags` (create any new flag rows).
- [ ] Backend tests green for changed apps.
- [ ] Frontend `npm run lint` + `npx tsc --noEmit` clean; production `npm run
      build` in a networked environment.

## Feature flags (kill switches)

- [ ] Confirm risky features have the intended `visibility`:
  - Pause fast via Django admin or `PATCH /founder/feature-flags/<key>/`
    (set `visibility=disabled`). Takes effect next request, no deploy.
- [ ] Launch-blocker view: any **launch-critical** feature left `disabled`,
      `founder_only`, or `beta_only` is **not public-ready**:
  - `founder_only` → internal testing only.
  - `beta_only` → beta-ready, **not** public-ready.
  - `disabled` → a launch blocker until re-enabled.
- [ ] `email_reminders`: works in dev, but production delivery (provider,
      domain auth, scheduler) must be configured before it counts as ready —
      mark clearly if still pending.

## Public launch (not done during private beta)

- [ ] Real-device / real-browser QA of the core journeys.
- [ ] Production deployment + monitoring/alerting + **backups**.
- [ ] Production transactional email provider + sending-domain auth + bounce
      handling.
- [ ] Server-side route protection / HttpOnly cookie auth.
- [ ] Password reset flow.
- [ ] Legal review of Privacy / Terms / Data-Deletion drafts.
- [ ] Provision + monitor `support@` / `security@` inboxes.

## Do not claim

Production launch readiness until deployment, monitoring, backups, production
email, and real beta testing are complete. No perfect OCR accuracy, no perfect
screenshot prevention, no real Nearby Share.
