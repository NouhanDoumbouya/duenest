# Fill & Sign + Signature Audit Trail

## Scope

Prepare a **filled / signed copy** of a PDF document. The original is never modified; the
prepared copy is a new, encrypted `DocumentFile`. A signature **audit trail** records who
prepared it, how, when, and the SHA-256 hashes of the original and prepared files.

## What it does NOT claim

- **Not a legal e-signature.** This produces a *prepared copy*. Legal acceptance depends on
  the recipient and jurisdiction.
- The `DocumentSignatureRecord` is **tamper-evidence / audit**, not a legal certification of
  signature validity.
- PDF only. Image-only scans are **rejected with a clear message** — no fake fill.

## Status

- **Backend: implemented and tested** (`apps/documents`).
- **Frontend: API client + types implemented** (`lib/fill-sign.ts`, `types/fill-sign.ts`).
  The annotation **canvas UI** is the next slice — primitives are ready (see below).

## Models (`apps/documents/models.py`, migration 0028)

- `PreparedDocument` — `owner`, `document` (nullable), `original_file` → `prepared_file`
  (both `DocumentFile`), `preparation_type` (`fill_sign`), `annotations` (overlay spec).
- `DocumentSignatureRecord` — `owner`, `prepared`, `signer_name`, `signer_email`,
  `signature_method` (`drawn`/`typed`/`uploaded`/`none`), `signed_at`,
  `original_file_hash`, `prepared_file_hash`, `audit_payload`.

## Service (`apps/documents/fill_sign.py`)

`prepare_signed_copy(user, source_file, annotations, signer_*, signature_method)`:

1. Decrypts the original via the existing pipeline (`read_plaintext`).
2. Validates it is a PDF (content-type / extension / `%PDF` magic) — else `FillSignError`.
3. Renders a **transparent overlay** per page with `fpdf2` (text/date/initials/check) and
   `Pillow` (signature image), then **flattens** onto the original pages with `pypdf`.
4. Stores the result as a **new encrypted `DocumentFile`** (`encrypt_bytes_into_record`).
   The original is preserved byte-for-byte.
5. Records SHA-256 hashes of original + prepared and creates the audit rows.

Coordinates are normalised (0..1) from the page **top-left**, so the UI can place marks
resolution-independently.

## API (owner-scoped)

- `POST /api/v1/files/<id>/fill-sign/` — body `{ annotations: [...], signer_name?,
  signer_email?, signature_method? }` → `201` `PreparedDocument` (with nested
  `prepared_file` + `signature_records`). Gated on the `fill_sign` feature flag (defaults
  enabled; premium-gateable via `apps.features`).
- `GET /api/v1/fill-sign/prepared/?original_file=&document=` — list the user's prepared
  copies + audit records.

### Annotation spec

`{ page, x, y, type, value?, font_size?, image?, width?, height? }` where `type` ∈
`text|date|initials|check|signature`; `image` is a base64/data-URL PNG for `signature`.

## Frontend client

- `lib/fill-sign.ts`: `prepareSignedCopy(fileId, payload)`, `listPreparedDocuments(...)`.
- Next slice — the annotation canvas — reuses existing primitives:
  `getDocumentFileDownloadBlob` (bytes) → `rasterizePdf(bytes, {maxWidth})` (page canvases)
  → click-to-place overlay (normalised coords) + a signature pad (canvas → PNG) →
  `prepareSignedCopy`. Modal a11y via `useFocusTrap`.

## Security

- Owner-scoped (`_owned_file_queryset`); non-owners get 404.
- Original is never mutated; prepared copy is a separate encrypted record.
- Prepared copies inherit the standard `DocumentFile` permission/sharing flows.
- No public exposure by default.

## Tests (`apps/documents/test_fill_sign.py`, 7 — real, no mocks)

Prepared copy + hashes; original unchanged byte-for-byte; non-PDF rejected; out-of-range
page rejected; owner isolation; list scoping/filtering; auth required.

## Limitations / future

- UI annotation canvas (multi-page placement, saved signatures) — next slice.
- Rotated/non-zero-origin page boxes are assumed standard in the MVP overlay.
- Output → attach to Application Pack / SafeSend reuses existing `DocumentFile` flows.
