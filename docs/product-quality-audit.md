# Product Quality Audit

Date: 2026-06-13
Branch: `feature/product-quality-design-polish`

## Scope

This pass reviewed the Documents module, renewal/application bundles, mobile
dashboard navigation, upload/scan entry points, structured export surfaces, and
Founder Console V1 readiness.

## Findings and Actions

| Area | Finding | Action |
| --- | --- | --- |
| Bundle exports | Bundle pages had readiness and requirements but no bundle-specific export. | Added owner-scoped JSON and CSV bundle exports with backend tests and UI. |
| Export downloads | Account data export used a plain link even though the backend route requires auth. | Replaced it with a token-authenticated blob download. Bundle exports use the same pattern. |
| Mobile navigation | Mobile dashboard navigation used a horizontal strip and could hide deeper destinations. | Added a hamburger drawer with the full authenticated navigation set and founder access gating. |
| Upload / scan | Upload flow had one generic file picker and no clear camera entry point. | Added separate Choose and Scan controls, image camera capture where supported, and honest scanner/OCR limitation copy. |
| Authenticated root redirects | Hardcoded dashboard redirects/links to `/` were audited. | Only a public share-page logo links to `/`; no authenticated dashboard route was found sending users to the landing page. |
| Bundle export security | Bundle export payload needed to avoid sensitive implementation details. | Payload excludes raw files, storage paths, share tokens, access-code hashes, access codes, and raw OCR text. |

## Current Limitations

- Camera scan support depends on the browser and device. CertaNest now gives the
  browser the right image capture hint, but it does not perform edge detection,
  multi-page scan merging, image cleanup, or automatic production OCR.
- Bundle exports are metadata-only. They intentionally do not include raw
  uploaded files or ZIP archives.
- Google sign-in remains dependent on real Google client configuration; the app
  does not fake Google authentication.
- Mobile QA in this pass is code and lint/build based unless a browser session
  is run separately before merge.

## Verification Run So Far

- `python manage.py check` passed.
- `python manage.py test` passed.
- `python manage.py test apps.documents` passed.
- `python manage.py test apps.documents.test_renewal_workspace` passed.
- `python manage.py test apps.documents.test_vault_maturity` passed.
- `npm run lint` passed.
- `npm run build` passed after rerunning with network access for Google Fonts.

The first sandboxed `npm run build` attempt failed because Next.js could not
fetch Google Fonts without network access; the approved rerun completed
successfully.

## Product Operations UI Refinement Notes

Branch: `feature/product-ops-ui-masterpiece-refinement`

Additional actions in this pass:

- Added reusable product-operations UI primitives for metrics, trust notices,
  inline alerts, segmented workflows, compact data rows, and drawer shells.
- Converted Bundle Detail from a long single-column stack into a tabbed
  workspace with a persistent readiness/action rail.
- Refined Calendar into an owner-scoped planning surface with summary metrics,
  a trust notice, shared segmented controls, and an Escape-close event drawer.
- Refined Secure Rooms into a wider operations layout with room metrics, a
  compact inventory list, safe empty/loading states, and a creation/trust side
  panel.
- Strengthened one-time public share/room security so a successful download
  consumes the token just like a preview.

Deferred from this pass:

- Dedicated public access-code throttles.
- Aggregate ZIP file-count/byte caps and chunked ZIP writes.
- Full route-level App Router `loading.tsx` / `error.tsx` coverage.
- Browser-based visual QA screenshots across every dashboard and founder route.

## Calendar UI Polish Notes

Branch: `feature/calendar-ui-polish`

Additional Calendar actions in this pass:

- Rebuilt `/dashboard/calendar` around a clearer planning header, concise
  private-calendar trust copy, and primary Add document / Export `.ics` actions.
- Refined Calendar metrics so overdue and this-week states carry clearer
  context and stronger urgency treatment.
- Converted Upcoming into an agenda-style view with grouped sections, richer
  event rows, type/urgency badges, and direct linked-resource actions.
- Strengthened Month view with clearer cell boundaries, today highlighting,
  category-colored event pills, more readable labels, and day selection.
- Added a Day drawer that lists all events for a selected date, including an
  intentional no-events state.
- Expanded Event detail into a planning panel with why-it-matters copy, next
  recommended action, linked-resource action, and `.ics` export.
- Added a right-side planning summary with loaded/visible counts, range context,
  next recommended review, and safe-summary trust signals.
- Updated the dashboard upcoming-calendar widget to use the same planning
  language and a bounded 90-day event range.

Deferred from this pass:

- Browser screenshot QA across desktop and mobile.
- Automated frontend interaction tests for view switching, filter chips, and
  day drawer behavior.
