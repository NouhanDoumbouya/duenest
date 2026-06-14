# Security & Privacy Checklist

Living checklist for DueNest. ✅ done · 🟡 partial · ⛔ not started / blocker.
See `docs/ENCRYPTION.md` for the encryption design and `docs/security-plan.md`
for the broader plan.

## Encryption at rest
- ✅ Uploaded `DocumentFile` content encrypted with AES-256-GCM envelope.
- ✅ Per-file 32-byte DEK, unique 12-byte nonce, never reused.
- ✅ DEKs wrapped with AES Key Wrap with Padding under an env-loaded KEK.
- ✅ AAD binds ciphertext to immutable `file_uuid` + owner.
- ✅ Key versioning + rotation command (`rotate_file_keys`).
- ✅ Legacy migration command (`encrypt_existing_files`, dry-run + verify).
- ✅ Permission-first decryption on all preview/download/zip/share paths.
- ✅ P1 field encryption: `ProofRecord.notes` (AAD-bound, migrated).
- 🟡 Org files, request submissions, export artifacts — **deferred**.

## Key management
- ✅ KEKs loaded from environment only; never in DB, logs, API, or frontend.
- ✅ Production fails closed if the active KEK is missing/invalid.
- ✅ `generate_encryption_key` for local dev; `.env.example` placeholders only.
- ⛔ Production secret manager + key backup — **required before launch**.

## Access codes & tokens
- ✅ Access codes hashed (`make_password`), never stored/serialized/logged plain.
- ✅ Public tokens high-entropy random; excluded from serializers/founder views.
- 🟡 Lookup-token hashing at rest — recommended (P2).

## Passwords
- ✅ Django hashing; explicit `PASSWORD_HASHERS` with PBKDF2 first.
- 🟡 Argon2 upgrade pending `argon2-cffi` + deploy support.

## Logging
- ✅ No keys, DEKs, plaintext, OCR text, access codes, tokens, or paths in logs.
- ✅ Decryption failures log safe category only; user sees a generic message.

## Founder visibility
- ✅ Security overview shows encrypted / plaintext-legacy / failed counts,
  active KEK version, and files-by-key-version (no key material).

## Launch readiness (encryption-related blockers)
- ✅ All new uploads encrypted.
- ⛔ Legacy plaintext migration complete in production.
- ✅ Access codes hashed.
- ✅ No raw keys/tokens/codes in logs.
- ✅ Key rotation documented.
- ⛔ Production secret management, backups, monitoring, external review.

> Encryption being implemented does **not** make DueNest production-ready.
> Deployment hardening, backups, monitoring, email, and an external security
> review are still required.
