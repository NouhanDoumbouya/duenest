# OCR & Document Intelligence

This document describes how DueNest assists users in turning raw files into
organized, actionable documents. It reflects the current implementation and is
intentionally honest about its limits.

## Philosophy

Document Intelligence is a **review-staged assistant**, not an automatic
pipeline. DueNest may suggest a document's details, but **the owner always
reviews and explicitly applies** anything before it changes their document.
DueNest does not claim perfect extraction accuracy.

## Architecture

- **Model:** `DocumentExtraction` (one OCR-assisted attempt per file).
  - Owner-scoped (`owner` FK); tied to a `Document` + `DocumentFile`.
  - `extraction_status`: `pending` / `processing` / `completed` / `failed` /
    `needs_review`.
  - `provider`: `manual` / `local_text` / `local_ocr` (Tesseract) / `ai` (Claude,
    opt-in — see below) / `future_ocr`.
  - `raw_text` (owner-only), `extracted_fields` (JSON), `confidence_score`,
    `error_message`, `reviewed_at`, `applied_at`.
- **Service:** `extract_file_details(file)` in `apps/documents/services.py`:
  1. **PDF text layer** via `pypdf` — fast, exact, no OCR, no external calls.
  2. **Tesseract OCR** (`pytesseract`) for images and scanned PDFs **only if the
     `tesseract` binary is installed** (`tesseract_available()`).
  3. If neither yields text, the result is staged as `needs_review` rather than
     failing — an honest fallback.
- **Endpoints** (nested under a document + file, owner-validated):
  - `POST/GET /documents/:id/files/:fid/extractions/`
  - `GET /documents/:id/files/:fid/extractions/:eid/`
  - `POST /documents/:id/files/:fid/extractions/:eid/apply/`

No file is sent to any third-party service. The local path (`local_text` /
`local_ocr`) is the default and stays fully on-box.

### Optional AI assist (`provider: ai`)

When `settings.AI_CONFIGURED` is true (an `ANTHROPIC_API_KEY` is set) **and** the
per-user `ai_features` + `ai_document_extraction` flags are on, `extract_file_details`
sends the already-extracted **text** (not the file) to Claude
(`apps/documents/ai_extract.py`) for more accurate field suggestions —
especially `expiry_date` and `document_type`. This is the only path that sends
content off-box; it is off by default, opt-in per user, and degrades silently to
the local regex fields on any failure (no key, flag off, refusal, bad output).
Suggestions remain review-gated: applying them to a document still requires
explicit owner review. See `docs/architecture.md` (AI foundation) and
`docs/FEATURE_FLAGS.md` (the `ai_*` keys).

## Category system

Categories are a shared, app-wide controlled vocabulary (`DocumentCategory`),
referenced optionally by a document (`category` FK + `category_name`). Users also
have free-form **tags** (`DocumentTag`, owner-scoped). A document's category is
**always user-changeable** — OCR never locks a user into a guess.

Recommended category vocabulary (extend as needed): Identity, Immigration &
Visa, Education, Finance & Tax, Insurance, Health, Work, Travel, Housing, Legal,
Vehicle, Subscriptions & Receipts, Emergency, Family, Organization, Other.

## Suggestion review flow

1. An extraction produces `extracted_fields` + a `confidence_score`, staged as
   `completed`/`needs_review`.
2. The owner reviews suggestions in the document's file UI
   (`components/documents/document-file-extraction.tsx`).
3. The owner explicitly **applies** chosen fields (only the allowlisted fields in
   `services.py` can be written back onto a Document).
4. Applying sets `applied_at`; nothing is written without that explicit action.

## Security & privacy rules (enforced)

- OCR runs only for **authorized, owner-owned** files.
- OCR does not run on **deleted/trashed** files.
- `raw_text` is **owner-only** and never returned by public/share endpoints or
  shown in founder views/logs.
- Files are **encrypted at rest**; extraction reads decrypted bytes only in
  memory for the owner's own file, and temporary plaintext is not persisted.
- OCR never blocks upload; failures degrade to a friendly `needs_review`.
- Applying suggestions to important fields requires explicit owner review.

## Limitations (honest)

- OCR availability depends on the `tesseract` binary being installed in the
  deployment; otherwise only the PDF text layer is used.
- Extraction accuracy is **not guaranteed** — detected dates, numbers, issuers,
  and categories may be wrong and must be reviewed.
- Detected document numbers should be masked where displayed.

## Deferred (not implemented yet)

- Remembering/learning from user corrections.
- Subcategories.
- Auto-applying any suggestion without review.
- A hosted/third-party OCR provider (would require explicit disclosure + consent).
- Per-file OCR-status chips in the File Inbox (inbox files are not yet attached to
  a document, so they have no extraction; status surfaces on the document file UI).
