# CertaNest Encryption

CertaNest applies **application-level encryption at rest** to uploaded files and
selected sensitive fields. The server can still decrypt after permission checks
(this is **not** zero-knowledge encryption and is **not** "military-grade").

> **Key-loss warning:** Losing the active KEK — or any historical KEK that data
> still references — makes that data **unrecoverable**. Production keys must be
> stored in a proper secret manager and backed up.

## 1. Architecture (envelope encryption)

Each encrypted blob (file or field value) has:

- a unique **Data Encryption Key (DEK)**: 32 random bytes, never reused;
- a unique **AES-GCM nonce**: 12 random bytes, never reused with a DEK;
- ciphertext sealed with **AES-256-GCM** (the 16-byte GCM tag is appended by
  `AESGCM` and verified on every open);
- the DEK **wrapped** with the active **Key Encryption Key (KEK)** using
  **AES Key Wrap with Padding (RFC 5649)**;
- **Associated Authenticated Data (AAD)** binding the ciphertext to immutable
  metadata so it cannot be moved between records undetected.

Library: Python [`cryptography`](https://cryptography.io)
(`hazmat.primitives.ciphers.aead.AESGCM`,
`hazmat.primitives.keywrap.aes_key_wrap_with_padding` /
`aes_key_unwrap_with_padding`). No custom cryptography is used.

Code: `backend/apps/core/security/encryption.py` and `key_provider.py`.

### File AAD
```
duenest:file:v1:{file_uuid}:{owner_id}
```
`file_uuid` is an immutable per-file UUID; `owner_id` is the uploader. Mutable
fields (filename, status, dates) are deliberately excluded.

### Field AAD
```
duenest:field:v1:{model}:{field}:{record_id}
```

## 2. Per-file DEK & file metadata

`DocumentFile` stores envelope metadata (never the DEK or KEK):
`file_uuid`, `encryption_status`, `encryption_algorithm` (`AES-256-GCM`),
`encryption_version`, `kek_version`, `wrapped_dek`, `nonce`,
`ciphertext_sha256` (hash of **encrypted** bytes), `plaintext_size_bytes`,
`ciphertext_size_bytes`, `encrypted_at`, `encryption_error`.

Files are capped at 10 MB, so encryption/decryption is performed in memory with
the one-shot `AESGCM` API.

## 3. KEK environment variables

KEKs are loaded **only** from configuration (never the database, never logs,
never API responses, never the frontend, never committed):

```
DUENEST_ACTIVE_KEK_VERSION=v1
DUENEST_KEK_V1_B64=<base64 of 32 random bytes>
# additional versions for rotation:
DUENEST_KEK_V2_B64=...
```

- Each KEK must decode to exactly 32 bytes.
- In **production** the app **fails closed** at startup if the active KEK is
  missing or malformed (`production.py` calls `key_provider.validate_configuration()`).
- **Local dev** uses a deterministic, clearly-insecure fallback key if no env
  key is set, so the app and tests run out of the box. Never use it in prod.
- Generate a real key: `python manage.py generate_encryption_key`.

## 4. Key versioning & rotation

Every encrypted file records the `kek_version` whose KEK wrapped its DEK. New
uploads use the active version; old files unwrap with their stored version, so
multiple versions can coexist.

Rotation **re-wraps DEKs only** — it never decrypts or rewrites file content:

```
python manage.py rotate_file_keys --from-version v1 --to-version v2 --dry-run
python manage.py rotate_file_keys --from-version v1 --to-version v2
```

Both versions must be configured during rotation. **Do not retire an old KEK**
until no records reference it and backups are handled.

## 5. Existing-file migration

Legacy files uploaded before encryption are `plaintext_legacy` and are still
served (read path detects the status) until migrated:

```
python manage.py encrypt_existing_files --dry-run
python manage.py encrypt_existing_files --verify --batch-size 50
python manage.py encrypt_existing_files --file-id 123 --verify
```

The command writes ciphertext to a new storage object and deletes the plaintext
object **only after** verification (with `--verify`). `--dry-run` modifies
nothing. Per-file failures are isolated and mark the record `encryption_failed`.

## 6. Access-code hashing

Quick Share, Emergency Access, and file/secure-room access codes are stored
**hashed** with Django's password hashers (`make_password` /`check_password`)
in `access_code_hash`. Plaintext codes are never stored, serialized, logged, or
shown in the founder console. (This predates this pass and is unchanged.)

## 7. Token storage

Public tokens (Quick Share, Emergency Access, Secure Room, file share links) are
high-entropy random `secrets.token_urlsafe(32)` values stored as-is, excluded
from serializers and founder views, and never logged. Hashing lookup tokens at
rest (SHA-256/HMAC) is recommended future work (**security debt, P2**).

## 8. Password hashing

Django password hashing is used unchanged. `PASSWORD_HASHERS` lists PBKDF2 first
(Django's secure default — no extra dependency). **Argon2** is the recommended
future upgrade once `argon2-cffi` is installed and supported by the deployment
environment. Passwords are never stored plaintext or reversibly encrypted.

## 9. What is / isn't encrypted

**Encrypted at rest (this pass):**
- `DocumentFile` content — covers documents, File Inbox, Quick Share, Emergency
  Access, Secure Rooms, checklist attachments, and bundle exports (all reference
  `DocumentFile`).
- `ProofRecord.notes` (P1 field encryption).

**Not encrypted (plaintext metadata / out of scope):**
- Titles, types, dates, sizes, MIME types, countries, statuses (kept queryable).
- `Document.notes` (used by search) and other searchable text.
- `OrganizationDocumentFile`, `DocumentRequestSubmission` files, and generated
  export artifacts (`DocumentExportRequest.file`) — **deferred** (see Known
  limitations).

## 10. Permission-first decryption

Decryption only happens **after** authorization. Every preview/download/export/
public path validates auth or token → authorization/scope → not trashed →
share/emergency/room not revoked/expired → access code (if required) → **then**
unwrap DEK → decrypt → stream. See `read_plaintext` in
`backend/apps/documents/file_encryption.py`.

## 11. Logging restrictions

Never logged: KEK, DEK, wrapped DEK, plaintext/decrypted bytes, raw OCR text,
access codes, share/emergency tokens, passwords, private notes, file paths or
names. Safe logs use file id, user id, key version, status, and an error
category only (e.g. `file_decryption_failed file_id=123 kek_version=v1
error_category=auth_failure`).

## 12. Operational requirements (production)

- Store KEKs in a secret manager; back them up; restrict access.
- Keep historical KEKs until their data is rotated away.
- Run `encrypt_existing_files` to migrate any legacy plaintext before launch.
- Switch media storage to private object storage with signed access.

## 13. Known limitations

- Server can decrypt (not zero-knowledge) — required for previews and public
  sharing flows.
- Org-uploaded files, request submissions, and export artifacts are not yet
  encrypted at rest.
- Public lookup tokens are stored unhashed (high-entropy; excluded from logs and
  serializers).
- Argon2 password hashing not yet enabled.
- Local-dev uses a deterministic insecure KEK fallback.
