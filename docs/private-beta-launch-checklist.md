# DueNest Private Beta Launch Checklist

**Status:** Draft  
**Scope:** Documents-first private beta readiness  
**Last updated:** 2026-06-13

This checklist tracks the minimum readiness bar for a small private beta. It is
not a public production launch checklist.

## Product Surface

- [x] Authenticated dashboard with document summary and Attention Needed.
- [x] Document vault CRUD, search, filters, sorting, empty states, and mobile-friendly layouts.
- [x] File upload, preview, download, activity, trash, restore, and secure file sharing.
- [x] Renewal reminders, checklists, bundles, readiness scoring, and timeline.
- [x] OCR-assisted extraction foundation with owner review before apply.
- [x] Version history, metadata restore, proof records, emergency packs, document activity, and metadata exports.
- [x] Document onboarding setup checklist and first-use route.
- [x] Demo data create/clear controls using clearly labeled fake records.
- [x] Trust Center, public security page, privacy draft, and terms draft.
- [x] Account data summary, metadata export request, deletion request, and cancellation.

## Security Gates

- [x] Protected endpoints require authentication unless explicitly public share endpoints.
- [x] Owner-scoped document, file, reminder, checklist, bundle, proof, emergency pack, export, onboarding, demo, and account-control access.
- [x] File and export APIs avoid exposing internal storage paths.
- [x] Share access codes are stored hashed and returned only when newly generated where applicable.
- [x] Demo data is fake, labeled, owner-scoped, and removable.
- [x] Account deletion is request-based and cancellable while pending.
- [ ] Review production token storage strategy before broader launch.
- [ ] Add production object storage with private buckets and signed/proxied file access.
- [ ] Add malware/content scanning strategy before accepting broad public uploads.
- [ ] Legal review for privacy and terms copy before public launch.

## Backend Checks

- [x] Django migrations exist for new onboarding and deletion-request models.
- [x] Backend tests cover onboarding state ownership, setup checklist progress, demo owner scope, account summary/deletion, trust summary, and account export scoping.
- [ ] Full backend test suite should pass before merging.
- [ ] Run `python manage.py migrate` after pulling changes locally or deploying.

## Frontend Checks

- [x] Dashboard setup card.
- [x] `/dashboard/onboarding` setup workspace.
- [x] `/dashboard/trust` Trust Center.
- [x] `/dashboard/settings/data` data controls.
- [x] `/demo`, `/security`, `/privacy`, and `/terms` public pages.
- [x] Mobile dashboard navigation exposes the new dashboard routes.
- [ ] Frontend lint and production build should pass before merging.

## Known Limitations

- Metadata exports do not include raw uploaded file archives.
- Account deletion requests are tracked, but automated deletion execution is not implemented.
- Notification sending for reminder rules is not implemented.
- Public legal pages are beta drafts and need review.
- Local development token storage remains a known production-hardening item.
