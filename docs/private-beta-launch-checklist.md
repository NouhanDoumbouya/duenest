# CertaNest Private Beta Launch Checklist

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
- [x] Version history, metadata restore, proof records, emergency packs, document activity, vault metadata exports, and bundle-specific metadata exports.
- [x] Document onboarding setup checklist and first-use route.
- [x] Demo data create/clear controls using clearly labeled fake records.
- [x] Trust Center, public security page, privacy draft, and terms draft.
- [x] Account data summary, metadata export request, deletion request, and cancellation.
- [x] Founder Console V1 for aggregate product health, analytics, activation, adoption, feature completion, feedback, templates, beta users, launch readiness, country activity, errors, security, audit logs, and privacy-safe user support metadata.
- [x] Public waitlist, invite links, invite-code validation, and founder waitlist/invite management for controlled private beta access.

## Security Gates

- [x] Protected endpoints require authentication unless explicitly public share endpoints.
- [x] Owner-scoped document, file, reminder, checklist, bundle, proof, emergency pack, export, onboarding, demo, and account-control access.
- [x] File and export APIs avoid exposing internal storage paths.
- [x] Share access codes are stored hashed and returned only when newly generated where applicable.
- [x] Demo data is fake, labeled, owner-scoped, and removable.
- [x] Account deletion is request-based and cancellable while pending.
- [x] Founder endpoints are staff/superuser-only and avoid document contents, raw OCR text, access codes, share tokens, internal file paths, private notes, exact IP addresses, and physical locations.
- [x] Waitlist list, waitlist emails, invite notes, and invite management APIs are founder-only.
- [x] `PRIVATE_BETA_ENABLED=true` requires valid invite codes for new password and first-time Google signups.
- [ ] Review production token storage strategy before broader launch.
- [ ] Add production object storage with private buckets and signed/proxied file access.
- [ ] Add malware/content scanning strategy before accepting broad public uploads.
- [ ] Legal review for privacy and terms copy before public launch.

## Backend Checks

- [x] Django migrations exist for new onboarding and deletion-request models.
- [x] Backend tests cover onboarding state ownership, setup checklist progress, demo owner scope, account summary/deletion, trust summary, account export scoping, and bundle export ownership/secrecy.
- [x] Full backend test suite passes for the current branch.
- [ ] Run `python manage.py migrate` after pulling changes locally or deploying.
- [x] Backend tests cover Founder Console access control, dashboard privacy, analytics privacy, activation, adoption, feature completion, launch readiness, beta users, country activity, feedback, template mutation, error logs, security overview, support metadata, audit logging, and product-event sanitization.
- [x] Backend tests cover waitlist submission, duplicate active waitlist protection, founder waitlist/invite access control, invite validation, invite disable, and private-beta signup enforcement.

## Frontend Checks

- [x] Dashboard setup card.
- [x] `/dashboard/onboarding` setup workspace.
- [x] `/dashboard/trust` Trust Center.
- [x] `/dashboard/settings/data` data controls.
- [x] `/demo`, `/security`, `/privacy`, and `/terms` public pages.
- [x] `/waitlist` public beta request page and `/invite/:code` invite landing page.
- [x] Mobile dashboard navigation exposes dashboard routes through a hamburger drawer.
- [x] Frontend lint passes for the current branch.
- [x] Frontend production build passes for the current branch.
- [x] Standalone `/founder` operational console routes and `/dashboard/feedback` user feedback form are implemented.

## Known Limitations

- Metadata exports do not include raw uploaded file archives.
- Camera scan entry uploads image files only; automated cropping, multi-page scanning, and production OCR are not implemented.
- Account deletion requests are tracked, but automated deletion execution is not implemented.
- Reminder notification generation is implemented through a management command,
  but production scheduler monitoring still needs deployment setup.
- Reminder emails can use Django's email backend, but no production
  transactional email provider/domain authentication is configured yet.
- Waitlist confirmation and invite email hooks exist, but no transactional
  email provider is configured yet.
- Public legal pages are beta drafts and need review.
- Local development token storage remains a known production-hardening item.
- Founder Console V1 does not implement billing analytics, advanced segmentation, consent-based sensitive support access, AI analytics, churn prediction, or a full incident response center.
