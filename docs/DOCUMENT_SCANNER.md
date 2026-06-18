# Document Scanner

A mobile-first, in-browser document scanner: capture with the camera, auto-detect
edges, refine corners, flatten perspective, apply a non-destructive filter,
build a PDF, and upload to the existing encrypted vault — with an
offline-resilient queue.

It is a **Next.js feature** (the DueNest frontend is a Next.js SPA, not Django
templates) that reuses the **existing encrypted `DocumentFile` pipeline** rather
than introducing a parallel storage path.

- Route: `/dashboard/scanner` (also linked under **Vault → Scan** in the sidebar)
- Backend endpoint: `POST /api/v1/scanner/upload-scanned-document/`
  (URL name `upload_scanned_document`)

---

## Frontend architecture

All scanner code is isolated under:

```
frontend/src/lib/scanner/        # framework-free logic modules
  capabilities.ts   feature detection + haptics + reduced-motion
  camera.ts         getUserMedia, torch (typed CameraError)
  opencv.ts         CDN loader, edge detection, perspective warp (Mat-safe)
  orientation.ts    DeviceOrientation bubble level (smoothed)
  voice.ts          Web Speech command controller
  filters.ts        non-destructive document filters + rich filter metadata
  quality.ts        local scan-quality heuristics (brightness/contrast/blur)
  pdf.ts            jsPDF generation (lazy-loaded)
  queue.ts          localForage offline queue + Web Crypto encryption
  client.ts         upload + flush queued scans
  sw.ts             service worker registration + background-sync helpers
  types.ts          shared types

frontend/src/components/scanner/
  ScannerExperience.tsx   state machine + camera/crop/enhance/upload screens
  CropEditor.tsx          4-corner editor with magnifier + 44px touch zones
  Toasts.tsx              accessible toast provider (aria-live)

frontend/public/scanner-sw.js   conservative service worker
```

### Filters & scan quality (non-destructive)

The warped/cropped page is kept as an untouched **base canvas**; filters are
always re-derived from it (`filters.ts`), so switching filters or reverting to
**Original** never compounds processing or loses quality. Rotation in the
preview rotates the base too, so a later filter change keeps the orientation.

- Filters: **Original, Auto, Light, Grayscale, B&W** are implemented; **ID /
  Passport, Receipt, Low-Light, Signature / Stamp** are implemented as
  color-preserving variants and tagged `planTier: "pro"` + `isExperimental`.
  `Auto` is the default and is deliberately gentle so it never over-darkens.
- Filter metadata (`FILTERS`) carries `planTier` (`free|pro|experimental|
  internal_only`), `preservesColor`, `destructiveRisk`, `supportsBatchApply`,
  etc. so advanced filters can be plan-gated later. **No paywall is enforced in
  code** — the tags are descriptive only, and B&W is shown but never auto-applied
  to color documents.
- **Adjust** (hidden by default): optional **brightness**, **contrast**,
  **sharpness** (unsharp mask) sliders and a **denoise** toggle (3×3 mean),
  composed on top of the chosen filter (`applyAdjustments` / `renderPage`), fully
  non-destructive (re-derived from the cached filtered base), and captured per
  page in a multi-page scan. Neutral is a no-op; "Reset adjustments" restores it.
  (Brightness/contrast are a cheap LUT pass; sharpness/denoise are light
  convolutions run only when enabled.)
- The pixel math (`applyFilterToImageData`, `applyAdjustmentsToImageData`) and
  quality heuristics (`analyzeImageData` / `qualityWarnings` in `quality.ts`)
  are pure and unit-tested (`filters.test.ts`, `quality.test.ts`). Quality warnings
  (dark / bright / low-contrast / blurry / low-resolution) are **non-blocking** —
  the user can always save anyway. All analysis is local; no image content
  leaves the browser.

### Multi-page scans

Single-page scanning is unchanged and fast: capture → review → **Save to Vault**.
For multiple pages, the review screen offers **Add page**, which commits the
current page and returns to capture. The page strip shows thumbnails with
**delete** and **move left/right (reorder)**; **Apply filter to all** copies the
current filter onto every committed page. **Save** renders every page (each with
its own filter + adjustments, in strip order) into a single PDF via
`generatePdfBlob`. Capacity is bounded (`MAX_PAGES = 25`). Committed pages,
thumbnails and the per-page pre-warp frames live only in memory and are cleared
on "Scan another"/unmount.

**Per-page re-edit:** tapping a committed thumbnail re-opens that page (it is
pulled from the list, remembering its slot via `editingIndex`) so you can
re-crop (**Edit crop** → corner editor), re-rotate, re-filter and re-adjust;
committing drops it back into the same position. Each page stores its pre-warp
frame + quad to make re-cropping possible.

**Export quality:** the save screen offers **Standard** (JPEG q≈0.72) or **HD**
(q≈0.92) for the generated PDF.

Scanned files land in the **File Inbox** as encrypted files; adding expiry /
category / reminder / bundle happens when organizing the inbox file into a
Document (the scanner links there from the done screen rather than faking
attachment).

### Capability detection & graceful degradation

Every browser API is feature-detected (`detectCapabilities`) and degrades safely:

| Capability        | If unsupported |
|-------------------|----------------|
| Camera            | Idle screen offers "Import an image"; HTTPS warning if insecure context |
| OpenCV.js (CDN)   | Auto edge detection off; **manual crop still works**; warp falls back to bounding-box crop |
| Device orientation| Bubble level hidden; text shows "Orientation unavailable" |
| Torch             | Torch button hidden (only shown when the live track reports `torch`) |
| Web Speech        | Mic button hidden; voice never required |
| Vibration         | Haptics are no-ops |
| Service worker    | OpenCV re-downloads; queue flushes on the `online` event |
| Background Sync   | Falls back to the `online` event + manual "Retry now" |

### OpenCV.js

Loaded once from `https://docs.opencv.org/4.10.0/opencv.js` with a timeout and
error handler. Detection runs on a 480px-wide downscaled frame on a throttled
loop (~8 fps) inside `requestAnimationFrame`, pauses when the camera screen is
not active and after capture. **Every `cv.Mat` is `.delete()`d in `finally`**,
including per-contour temporaries, to avoid WASM heap leaks across repeated scans.

### Offline queue & encryption

`queue.ts` uses **localForage** (IndexedDB). When Web Crypto is available, each
queued PDF is encrypted with **AES-256-GCM** under a **non-extractable**
`CryptoKey` generated once and stored in IndexedDB.

**Honest scope of the encryption:** a non-extractable key cannot be exported by
JavaScript, so the queued blob is unreadable via casual IndexedDB inspection,
disk forensics, or another origin. It is **not** protection against a malicious
script already running on this origin (that script could call `decrypt`). When
Web Crypto is unavailable the blob is stored unencrypted (`encrypted: false`).

Queued items **auto-delete after a successful upload**, and `purgeStale()` removes
anything older than 7 days so sensitive scans never linger.

### Service worker / PWA (honest behaviour)

`scanner-sw.js` is deliberately minimal:

- **Caches only** the immutable OpenCV.js library (cache-first, versioned name).
- **Never** caches `/api/` responses, navigations, or any authenticated/private
  document — private files are never served from cache.
- On a Background Sync event (where supported) it **messages open clients to
  flush** the queue. It does **not** perform headless uploads, because that would
  require the worker to reuse the non-extractable decryption key and the CSRF
  double-submit cookie from the worker context — partially unsupported and
  fragile. The reliable path is the app's `online` event + manual retry; Background
  Sync is a progressive enhancement on top.

### Accessibility

- `aria-live="polite"` status region announces: Camera ready, Document detected
  hold steady, No document found, Captured, Adjust document corners, Processing
  scan, PDF ready, Upload complete, Scan queued for upload when online.
- All icon controls have `aria-label`; capture/controls meet 44×44px touch targets.
- Crop handles are keyboard-adjustable (arrow keys; Shift = larger step).
- Reduced motion: the shutter flash is skipped when `prefers-reduced-motion`.
- Non-voice, non-orientation, non-auto-capture fallbacks all exist.

---

## Backend

`backend/apps/documents/scanner.py` is self-contained and reuses stable
primitives (`encrypt_bytes_into_record`, `DocumentExtraction`, `enforce_plan_limit`).

Pipeline (`UploadScannedDocumentView.post`):

1. **Auth** — `IsAuthenticated`; the file becomes a normal owner-scoped inbox file.
2. **Rate limit** — DRF `ScopedRateThrottle`, scope `scanner_upload` (per user).
3. **Plan limit** — counts against the user's file allowance.
4. **Validation** — size (`SCANNER_MAX_UPLOAD_MB`), non-empty, MIME
   (`SCANNER_ALLOWED_MIME_TYPES`), and PDF magic-byte + structural parse (`pypdf`).
5. **Malware scan** — ClamAV via `clamd` when `CLAMD_ENABLED` (see below).
6. **Compression** — lossless `pypdf` stream compression + metadata strip.
7. **Encrypt + store** — through the shared AES-256-GCM envelope pipeline.
8. **OCR** — best effort (see below).
9. **Response** — secure JSON; never a raw storage path.

Success (`201`):

```json
{
  "status": "success",
  "document_id": 123,
  "file_uuid": "…",
  "preview_url": "https://…/api/v1/files/123/preview/",
  "download_url": "https://…/api/v1/files/123/download/",
  "ocr_text_stored": true,
  "size_bytes": 84211
}
```

Errors return `{"error": "…"}` with an appropriate status (400/413/415/422/429/503).

### Malware scanning (ClamAV)

Settings: `CLAMD_ENABLED` (default `False`), `CLAMD_SOCKET_PATH`
(default `/var/run/clamav/clamd.ctl`), `CLAMD_FAIL_CLOSED` (default `True`).

- Disabled (default): no AV runs — no false claim of scanning.
- Enabled + infected: upload rejected (`400`), file not stored.
- Enabled + engine/daemon error: rejected `503` when fail-closed (recommended for
  production); allowed through only if `CLAMD_FAIL_CLOSED=False` (explicit dev opt-in).

It never fakes a clean result. Requires the `clamav-daemon` system package and
the `clamd` Python client (in `requirements.txt`).

### OCR

Settings: `SCANNER_OCR_ENABLED` (default `True`), `SCANNER_OCR_REQUIRED`
(default `False`), `SCANNER_OCR_TIMEOUT_SECONDS`, `SCANNER_OCR_MAX_PAGES`.

OCR runs synchronously over the **plaintext bytes in memory** before encryption.
This matters: the stored record is ciphertext, so the existing
`extract_file_details` (which reads the stored field) degrades to `needs_review`
for encrypted files — the scanner path uses `extract_details_from_bytes` /
`scanner.extract_ocr_text` instead and gets a real result.

Extracted text is stored as a `DocumentExtraction` record (`needs_review` status,
suggestions only). OCR is **best effort**: any failure is logged and the upload
still succeeds, unless `SCANNER_OCR_REQUIRED=True`. It requires the **Tesseract**
binary (images and scanned PDFs) and **poppler** (`pdf2image`, for PDF
rasterisation) as system packages; when absent, extraction degrades gracefully.

---

## System dependencies

```
tesseract-ocr      # OCR engine (pytesseract)
poppler-utils      # PDF rasterisation (pdf2image)
clamav-daemon      # optional malware scanning (only if CLAMD_ENABLED)
```

Python packages (already in `backend/requirements.txt`): `pytesseract`,
`pdf2image`, `pypdf`, `Pillow`, and `clamd` (optional, import-guarded).

Frontend packages (`frontend/package.json`): `jspdf`, `localforage`,
`lucide-react`. OpenCV.js is loaded at runtime from a CDN (not bundled).

---

## Environment variables

```
SCANNER_MAX_UPLOAD_MB=15
SCANNER_ALLOWED_MIME_TYPES=application/pdf,image/jpeg,image/png
SCANNER_OCR_ENABLED=True
SCANNER_OCR_REQUIRED=False
SCANNER_OCR_TIMEOUT_SECONDS=20
SCANNER_OCR_MAX_PAGES=10
CLAMD_ENABLED=False
CLAMD_SOCKET_PATH=/var/run/clamav/clamd.ctl
CLAMD_FAIL_CLOSED=True
```

---

## Testing status

- Backend: `apps/documents/test_scanner.py` — 14 tests (validation, encrypted
  storage reuse, malware fail-closed/fail-open/found, lossless compression,
  OCR best-effort, filename sanitisation). All passing.
- Frontend: `tsc --noEmit`, `eslint`, and `next build` all pass; `/dashboard/scanner`
  prerenders.

**Not runtime-tested here (require a real device/secure browser):** live camera,
OpenCV edge detection, torch, device orientation, voice commands, haptics, and
Background Sync. These are implemented with feature detection + graceful
fallbacks but should be QA'd on a physical phone over HTTPS.

---

## Advanced document-preparation tools (controlled launch)

Beyond capture→save, the scanner offers optional **prepare / protect / organize /
share** steps. The basic flow (capture → review → fix → save) is unchanged; every
advanced affordance appears only on the post-save success screen and only when
its feature flag is enabled for the viewer, so normal users never see an
unlaunched tool.

All keys live in the central registry (`apps/features/models.py`) and default to
**`founder_only`** — coded, testable, and deployable, but invisible until a
founder deliberately launches each one (`beta_only` / `enabled`). See
[FEATURE_FLAGS.md](./FEATURE_FLAGS.md).

| Flag key | Tool | Notes |
| --- | --- | --- |
| `scan_to_safesend` | "Share safely" → Quick Share with the scan preselected | Reuses the existing, server-gated `quick_share` flow; no link is created without explicit confirmation. |
| `scan_to_bundle` | "Add to bundle" → bundles area | Honest route only; the scan is in File Inbox. Deep one-tap linking is backlog (see below). |
| `scan_to_reminder` | "Add reminder" → File Inbox with the file's expiry field focused | Reminders derive from a document's expiry date; no AI extraction. |
| `scanner_advanced_tools` | Master gate for the "Prepare copy" tools surface | Per-tool keys below also apply. |
| `scan_safe_copy` | "Prepare copy" — create a new file; original never modified | |
| `scan_watermark` | Burned-in watermark on the prepared copy | Rasterised into the image (`lib/scanner/watermark.ts`); non-recoverable, but a **labelling aid, not a security control**. |
| `scan_compression` | Smaller / Standard / High-quality tiers + before→after size | No guaranteed target size. |
| `scan_page_export` | Choose which scanned pages go into the copy | Also covers combining scanned pages into one PDF. |
| `scan_redaction` | Burn-in area redaction on scanned image pages | Experimental; founder-only. See redaction section when implemented. |

The copy pipeline reuses the same `buildPageCanvases()` as save, so a prepared
copy is byte-identical in construction to a normal save plus the chosen
transforms. Copies upload as a **separate `…-copy.pdf` inbox file**; the original
is never overwritten.

### Backlog (deferred, with reasons)

**Shipped since (existing-file PDF tools, `pdf-lib`, client-side):**

- **Merge** — File Inbox bulk action ("Merge N PDFs") combines selected inbox
  PDFs into one new file. Gated by `document_merge`. See `lib/pdf/merge.ts`.
- **Export selected pages (split)** — per-PDF "Export pages" action picks pages
  into a new PDF. Gated by `document_page_extract`. See `lib/pdf/extract.ts`.

Merge + export copy pages structurally (no rasterisation, no quality loss;
bytes never leave the browser; originals preserved); both `founder_only`.

- **Secure redaction of existing PDFs** — per-PDF "Redact" action rasterises the
  PDF with `pdf.js` (`lib/pdf/rasterize.ts`), reuses the scanner `RedactionEditor`
  to draw areas, burns opaque rectangles in, and rebuilds an **image-only** PDF
  (no text layer survives → redacted content is non-recoverable). Gated by
  `document_redaction` (experimental, `founder_only`). The original is untouched;
  the result is a new `…-redacted.pdf`. **Note:** `pdf.js`'s worker is loaded
  from a CDN pinned to the bundled version (same runtime-CDN model as OpenCV);
  the document bytes are processed locally and never uploaded.

- **Import a PDF into the scanner** — the scanner's import accepts PDFs:
  `rasterizePdf` turns each page into a scan page so an existing PDF flows into
  the same multi-page review / prepare-copy / export tools as a fresh capture.
  Gated by `scan_pdf_import` (`founder_only`). When disabled, picking a PDF shows
  a calm "not available" message instead of a confusing image error.
- **Shrink (compress) a PDF** — per-PDF "Shrink" action rasterises + re-encodes
  at a chosen quality (`lib/pdf/compress.ts`). Honest framing: best for scanned /
  image-heavy PDFs; the copy is image-based (no selectable text), and if the
  result isn't actually smaller (e.g. a text PDF) **no copy is saved** and the
  user is told. Shows before→after size. Gated by `document_compress`.

**Shipped since (Document Organization v2):** duplicate detection (checksum/
name/size), version-history tab + restore + file-level "New version", filename
templates, scan modes, image-preview zoom, "Unsorted" badge, batch Move-to-Vault,
extra timeline events (reminder / added-to-bundle / shared-via-SafeSend), and
**lossless per-page replace/add** in a saved PDF (`lib/pdf/pages.ts` via pdf-lib —
existing pages keep their text layer; only the new page is an image; saved as a
new version; gated `document_page_edit`).

Still deferred — separate, scoped branches; **not** faked in the UI:

- **Scan-to-Bundle deep link** into a specific requirement (wire the existing
  `linkRequirementFile` endpoint into the requirement UI). (`feature/scan-to-bundle-deep-link`)
- **"Possible duplicate" / "Has newer version" badges** — the former needs a
  cross-file checksum aggregate per list (cost vs. upload-time dedup); the latter
  is misleading (versions are history, not staleness). Deliberately not shown.
