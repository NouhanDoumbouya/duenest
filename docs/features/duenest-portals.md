# CertaNest Portals (Organizations)

> Documents **existing** code (`apps/organizations`). Recorded for Phase 17.

## Scope

Organizations request, collect, review, and track documents from applicants/clients —
a document-collection portal. **Not** scheduling, payroll, time tracking, workforce
management, or team chat.

## Models (`apps/organizations/models.py`)

`Organization`, `OrganizationMembership`, `OrganizationInvite`, `OrganizationActivity`,
`OrganizationDocument(File)`, `DocumentCollectionCampaign`, `CampaignRequirement`,
`CampaignTargetMember`, `DocumentRequest`, `DocumentRequestSubmission`,
`OrganizationRequestTemplate`, `OrganizationBundle`, `OrganizationSecureRoom(Item)`,
`OrganizationReadinessReport`.

## API (selected)

- `organization`, `organization-invite-detail`, `organization-invite-accept` — org +
  membership.
- `public-organization-document-request` + `…-upload` — public, token-scoped document
  request + upload (no recipient account required).
- `public-organization-secure-room` — public secure room view.

## Security

- Strict membership/role permissions; non-members cannot access org data.
- Public upload is **token-scoped** and account-free for the recipient (see
  `docs/security/public-upload-links.md`); tests:
  `apps/organizations/test_public_upload_security.py`.
- Org files use encrypted storage (`apps/organizations/file_encryption.py`).

## Status

Backend implemented + tested (incl. public-upload security). Frontend at
`/dashboard/organizations`, plus public `org-request/[token]`, `org-room/[token]`,
`org-invite/[token]`.
