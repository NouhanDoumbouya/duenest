# Security — Fill & Sign + Signature Audit Trail

## What this is (and isn't)

A **prepared signed copy** with a tamper-evidence audit trail. It is **not** a legal
e-signature, and the audit record is **not** a legal certification of signature validity.
The UI and API both state this explicitly.

## Ownership & authorization

- `POST /api/v1/files/<id>/fill-sign/` and `GET /api/v1/fill-sign/prepared/` require
  authentication (`IsAuthenticated`).
- The source file is resolved through `_owned_file_queryset(request.user)` — a non-owner
  gets **404** (no existence leak), proven by `test_owner_isolation`.
- `PreparedDocumentListView` filters strictly by `owner=request.user`; a second user sees
  none of another user's prepared copies (`test_list_prepared_documents_owner_scoped`).
- Gated by the `fill_sign` feature flag (defaults enabled; pausable / premium-gateable via
  `apps.features`).

## Originals are preserved

- The service reads the original via the existing decryption pipeline and **never mutates
  it**. The prepared copy is a **separate** `DocumentFile`. `test_…_creates_encrypted_…`
  asserts the original is byte-for-byte unchanged after preparation.

## Encryption at rest

- The prepared copy is stored with the same envelope encryption as every other file:
  `encrypt_bytes_into_record` (AES-256-GCM, per-file wrapped DEK, AAD bound to the file
  UUID + owner). No plaintext PDF is written to disk.

## Input validation (no fake fill)

- **PDF only.** Non-PDF input (checked via content-type / extension / `%PDF` magic) is
  rejected with a clear `400` — `test_non_pdf_rejected_without_faking`.
- Annotations referencing a non-existent page are rejected (`test_out_of_range_page_rejected`).
- Empty annotation sets are rejected.
- Signature images are base64-decoded with validation and opened via Pillow inside a
  guarded block; a malformed image yields a `400`, not a 500.
- `pypdf` parse failures on a corrupt PDF are surfaced as a `400` (`FillSignError`).

## Audit integrity

- `DocumentSignatureRecord` stores SHA-256 hashes of **both** the original and prepared
  files (`sha256_hex`), plus signer name/method and `signed_at`. The hashes let a holder
  later verify the prepared file hasn't changed since preparation.
- Records are owner-scoped and read-only over the API.

## Data exposure

- No public exposure of prepared copies or audit records by default — everything is
  owner-scoped. Prepared copies inherit the standard `DocumentFile` sharing flows
  (SafeSend / explicit share links), which require their own confirmation.
- The audit UI shows **truncated** hashes; no internal storage paths or DEK material are
  ever serialized.

## Honest limitations

- Not legal e-signature; acceptance depends on recipient and jurisdiction.
- The hash chain is tamper-**evident**, not tamper-**proof**, and is not notarised.
- Rotated / non-zero-origin PDF page boxes are assumed standard by the MVP overlay.
