# Bug Sweep Report

Date: 2026-06-13
Branch: `feature/product-quality-design-polish`

## Bugs Fixed

| Issue | Impact | Fix | Verification |
| --- | --- | --- | --- |
| Bundle-specific export missing | Users could prepare a bundle but could not export the bundle's requirements, linked documents, checklist progress, readiness, and proof context. | Added `/api/v1/document-bundles/:bundle_id/exports/` endpoints, JSON/CSV generation, owner-scoped downloads, frontend API helpers, and bundle detail UI. | `apps.documents.test_renewal_workspace` passed. |
| Bundle export type accepted by wrong endpoint | Bundle export choices could be generated incorrectly if posted to vault-wide exports. | Global export serializer now rejects bundle export types; bundle serializer accepts only bundle export types. | New API test covers rejection. |
| Export download used unauthenticated browser link | Data export download could fail because the route requires the stored JWT. | Data controls and bundle exports now download through authenticated blob fetches. | `npm run lint` passed. |
| Mobile dashboard nav incomplete | Horizontal mobile nav could hide important areas and did not behave like a full app menu. | Added mobile hamburger drawer with full dashboard navigation and Escape/overlay close behavior. | `npm run lint` passed. |
| Upload flow did not expose camera capture | Mobile users had no obvious scan/camera path. | Added image-only camera input with `capture="environment"` plus existing file picker. | `npm run lint` passed. |
| Upload limitations were unclear | The UI could imply more scanning/OCR support than exists. | Added concise copy explaining camera scans upload as images and OCR/cropping review is manual in beta. | Manual code review. |
| Authenticated landing-page redirect concern | A dashboard route might accidentally send signed-in users to `/`. | Searched for hardcoded root redirects/links. Only public share-page logo uses `/`. | `rg` route scan. |

## Security Sweep

- Bundle export rows use safe document and file summaries only.
- Export payloads do not include raw uploaded file bytes, storage paths, share
  tokens, access codes, access-code hashes, or raw OCR text.
- Bundle export endpoints require authentication and owner ownership of the
  bundle and export request.
- Other users receive `404` for another user's bundle export endpoint.

## Remaining Watch Items

- Full raw-file archive/ZIP export remains future work and must be designed with
  ownership checks, expiry, and private temporary storage.
- True scanner features need separate image processing/OCR work and should not
  be represented as implemented until built.
- Browser-based responsive QA should be run before private beta sign-off.
