# Feature Verification Matrix

Date: 2026-06-13

This matrix tracks the current private-beta product surface for DueNest. Status
means:

- Done: implemented and usable in the current app.
- Partial: implemented foundation exists, but the experience or automation is
  intentionally limited.
- Planned: intentionally not in this beta scope.

| Area | Status | Verification notes |
| --- | --- | --- |
| Password authentication | Done | Backend-owned JWT login/register/refresh endpoints are implemented. SimpleJWT remains the auth foundation. |
| Google authentication foundation | Partial | Backend Google token verification exists; frontend button remains gated until Google client configuration is provided. |
| Authenticated dashboard shell | Done | Desktop sidebar and mobile hamburger drawer expose dashboard, setup, documents, bundles, timeline, trust, data, feedback, and founder console when allowed. |
| Document records | Done | User-owned document CRUD, computed status, attention flags, and list/detail flows are implemented. |
| Document file upload | Done | Authenticated upload supports PDF, JPG, PNG, DOC, and DOCX with client and backend validation. |
| Mobile upload / camera scan entry | Done | Upload UI now offers file picker plus image camera capture where the browser supports `capture="environment"`. |
| True scanner workflow | Partial | Camera uploads are image files. Cropping, edge detection, multi-page scan composition, and automatic OCR are not claimed. |
| File preview and download | Done | Files are served through owner-only API routes, not public media URLs. |
| File sharing | Done | Share links are token-gated, revocable, expiring, and optionally protected by access code. |
| File activity trail | Done | Preview, download, share, and share-access events are recorded without exposing access codes or raw tokens. |
| Reminder rules | Done | Owner-scoped reminder rules and upcoming reminder summaries are implemented. |
| Checklist templates | Done | System checklist templates can be seeded and used to create user checklists. |
| User checklists | Done | Checklist progress, item status, document/file links, and due dates are implemented. |
| Renewal/application bundles | Done | Bundles support requirements, readiness scoring, target dates, statuses, and linked documents/files. |
| Bundle-specific export | Done | Bundle JSON and CSV exports are owner-scoped, expiring, and downloadable through authenticated routes. |
| Vault-wide structured export | Done | Data controls can request metadata exports; raw files and secrets remain excluded. |
| Authenticated export download | Done | Dashboard export downloads use token-authenticated blob fetches instead of plain links. |
| Timeline | Done | Aggregated document, reminder, checklist, and bundle events are available and filterable. |
| Proof records | Done | Owner-scoped proof records can connect to documents, bundles, checklists, and files. |
| Emergency access packs | Done | Emergency packs expose only selected items and do not grant whole-vault access. |
| Trash, restore, permanent delete | Done | Recoverable trash and explicit permanent-delete flows are implemented for document vault maturity. |
| Version history | Done | Metadata/file-display snapshots are recorded and metadata restore creates a new version. |
| Extraction/OCR-assisted foundation | Partial | Extraction suggestions are staged for review; automatic production OCR is not claimed. |
| Trust/security pages | Done | Trust, security, privacy, terms, and data control surfaces exist and match the implemented limitations. |
| Account deletion request | Done | Account deletion is recorded as a cancellable request instead of immediate destructive deletion. |
| Founder console V1 | Done | Founder overview, activation, feature adoption, feedback, templates, errors, security, and user summaries exist. |
| Feedback capture | Done | Authenticated users can submit feedback; founder views can triage it. |
| Categories management UI | Partial | Category model/API foundation exists; full end-user category management polish is not in this pass. |
| Subscriptions/billing | Planned | Navigation labels this as future work. No billing or payment system is added. |
| Native mobile app | Planned | Mobile web responsiveness is supported; no native mobile application is in scope. |
