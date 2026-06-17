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
- The pixel math (`applyFilterToImageData`) and quality heuristics
  (`analyzeImageData` / `qualityWarnings` in `quality.ts`) are pure and
  unit-tested (`filters.test.ts`, `quality.test.ts`). Quality warnings
  (dark / bright / low-contrast / blurry / low-resolution) are **non-blocking** —
  the user can always save anyway. All analysis is local; no image content
  leaves the browser.

### Multi-page scans

Single-page scanning is unchanged and fast: capture → review → **Save to Vault**.
For multiple pages, the review screen offers **Add page**, which commits the
current page (its rotated base + chosen filter) and returns to capture. The page
strip shows thumbnails with **delete** and **move left/right (reorder)**; **Apply
filter to all** copies the current filter onto every committed page. **Save** then
renders every page (each with its own filter, in strip order) into a single PDF
via `generatePdfBlob`. Capacity is bounded (`MAX_PAGES = 25`). Committed pages
and thumbnails live only in memory and are cleared on "Scan another"/unmount.

**Honest limitation:** a committed page can be deleted/reordered/recolored (via
"Apply filter to all") but not individually re-cropped or re-rotated after it is
added — delete and re-add to redo a page. Manual brightness/contrast sliders are
still not implemented. Scanned files land in the **File Inbox** as encrypted
files; adding expiry / category / reminder / bundle happens when organizing the
inbox file into a Document (the scanner links there from the done screen rather
than faking attachment).

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
