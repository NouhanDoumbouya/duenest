# Private Beta Readiness

A snapshot of what is implemented, verified, and still required before a public
production launch. This is an internal readiness note, not a launch claim.

## Implemented & verified

### Document Intelligence
- Review-staged extraction (`DocumentExtraction`): PDF text layer (`pypdf`) and
  optional local Tesseract OCR, with an honest `needs_review` fallback. No
  third-party pipeline; `raw_text` is owner-only. See
  `OCR_DOCUMENT_INTELLIGENCE.md`.
- Categories (shared vocabulary) + owner tags; category is user-changeable.
- File Inbox: upload, attach-to-document, create-document-from-file.

### Quick Share 2.0
- Secure Link, DueNest Code, QR, Shared by Me, Shared with Me, Bundle sharing,
  premium secure viewer with watermark/view-only/download/save-copy, expiry,
  revocation, hashed access codes, activity logs. **No Nearby Share.** See
  `QUICK_SHARE_2.md` and `SECURE_SHARING_SECURITY.md`.

### Public entry
- Landing, waitlist (graceful duplicate handling), invite validation (active /
  expiry / remaining-uses, atomic single-use consume), register→login→dashboard,
  safe `?next=` redirect, client-side dashboard guard. Legal/trust pages with
  honest beta-draft banners. `noindex` on sensitive token routes. Mobile nav menu.

### Notifications & email
- Notification model and preference model; APIs for list, summary, read,
  mark-all-read, dismiss, and preferences.
- Dashboard notification bell, `/dashboard/notifications`, and
  `/dashboard/notifications/settings`.
- `process_due_notifications` management command (dry-run, limit, user, type, now
  options); privacy-safe text + HTML email templates.
- Backend tests for document/subscription/emergency/org generation,
  deduplication, preference handling, API actions, dry-run, failed email, and
  timezone behavior.

## Verification run (actual results)

- Backend: `apps.documents` + `apps.quick_share` → **280 tests passing**
  (`Ran 280 tests … OK`). `apps.founder` + `apps.users` → 48 passing (public
  entry pass). `manage.py check` clean.
- Frontend: `npm run lint` and `npx tsc --noEmit` clean on recent changes.

> Note: this environment has no browser and intermittent network (offline Google
> Fonts blocks `npm run build`), so **live click-through smoke tests have not been
> run here**. They remain required before launch.

## Required before public launch (not done)

- Real-device / real-browser QA of the full journeys (upload→scan→review→share;
  send→claim→revoke; mobile).
- Production deployment, monitoring/alerting, and **backups**.
- Production transactional email provider + sending-domain authentication, bounce
  handling, and delivery monitoring. No Celery/Redis scheduler is deployed; add a
  platform scheduler/cron for `process_due_notifications`.
- Server-side route protection (currently a documented client-side guard) and a
  move toward HttpOnly cookie auth.
- Password reset flow (login currently says "support coming soon").
- Legal review of the Privacy/Terms/Data-Deletion drafts (clearly labeled drafts).
- A production OCR decision: ship as local-only, or add a clearly-disclosed
  provider with consent.

## Operator checklist (notifications)

- Run migrations after deployment.
- Configure `DUENEST_APP_BASE_URL` for the frontend domain.
- Keep the console email backend in local/dev only.
- Add a scheduler/cron entry: `python manage.py process_due_notifications --limit 100`.
- Monitor logs for failed delivery counts.
- Verify sample email bodies contain no document contents, tokens, access codes,
  raw OCR text, private notes, or files.

## Deferred micro-features (intentional)

- Document Intelligence: correction-learning, subcategories, category filter +
  OCR-status chips in the File Inbox (needs a category-list endpoint and a
  per-file extraction-status serializer field), "create reminder from detected
  expiry".
- Quick Share: real Nearby Share (WebRTC/BLE/NFC) — roadmap only.
- Public conversion analytics pipeline; founder delivery metrics; push/SMS.

## Honest non-claims

DueNest does not claim: perfect OCR accuracy, perfect screenshot prevention,
zero-knowledge or "military-grade" encryption, payment processing, or
lawyer-reviewed legal pages.
