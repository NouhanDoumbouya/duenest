# File Upload Security

## Current controls (`apps/documents`)
- **Size limit**: `MAX_FILE_SIZE = 10 MB` (rejected in `validate_file`).
- **Extension allowlist**: `.pdf .jpg .jpeg .png .doc .docx`. Everything else is
  rejected — including high-risk types (`svg`, `html`, `js`, `exe`, `bat`, `sh`,
  `php`, `jar`, `apk`, archives), which are **not** allowed.
- **Content-Type check**: client-reported `Content-Type` must be in
  `ALLOWED_CONTENT_TYPES` (defence-in-depth; treated as spoofable).
- **Randomized storage paths**: `documents/user_<id>/.../<uuid><ext>` — the
  user-supplied filename never builds the storage path, so path traversal is not
  possible. `original_filename` is stored separately for display only.
- **No execution**: uploads live under private `MEDIA_ROOT`, served only through
  authenticated, ownership-checked API endpoints — never as executable/static
  content, never by public URL.
- **Encryption at rest**: stored bytes are AES-256-GCM ciphertext (see
  `docs/ENCRYPTION.md`); previews/downloads decrypt only after authorization.
- **Safe display**: filenames render as React text (escaped); MIME/extension
  shown as plain text; no raw storage path exposed.

## Known gaps (production requirements, not yet implemented)
- **Magic-byte sniffing**: real MIME should be detected from file content
  (e.g. `python-magic`/libmagic) rather than trusting the extension +
  client Content-Type. Deferred (requires libmagic in every environment).
- **Antivirus scanning**: e.g. ClamAV before a file is marked available.
- **Per-user storage quota** enforcement / monitoring.

## If archive or new types are ever added
Restrict, sniff real type, scan, and never auto-extract server-side. Default to
deny; widen the allowlist deliberately.
