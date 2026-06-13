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

- Camera scan support depends on the browser and device. DueNest now gives the
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
