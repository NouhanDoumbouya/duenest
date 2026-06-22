# Quick Share 2.0

Quick Share is CertaNest's premium way to hand someone selected documents — like a
secure pass — without exposing the rest of your vault.

## Modes (all implemented)

1. **Secure Link** — the session's random token is the shareable URL/claim path.
2. **CertaNest Code** — a short, human-typable code (`dn_code`, e.g. `DN-4KQ7-PXMR`)
   the recipient enters on the Receive page; resolved server-side to the share.
3. **QR Share** — a QR encoding the claim path **only** (never file IDs or storage
   paths).
4. **Shared by Me** — the sender's management view (active / pending / expired /
   revoked) with per-share activity.
5. **Shared with Me** — the recipient's accepted shares.
6. **Bundle Sharing** — share a whole bundle; it expands to the bundle's current
   files via the canonical `collect_bundle_files()`.
7. **Premium Secure Viewer** — the recipient/public viewer.

### Nearby Share is intentionally NOT included

There is **no Nearby Share** in CertaNest, by design. QR already solves in-person
sharing, the CertaNest code solves account-to-account claiming, and secure links
solve remote sharing. A "Nearby Share" that only re-wrapped QR/code would be
misleading. A real one (WebRTC/BLE/NFC/OS share-sheet) is a future roadmap item
only and must be properly built, secured, and tested before shipping. See
`docs/roadmap.md`.

## Send flow

A four-step wizard: **Select → Method → Protection → Review → Create**.
- Select what to share: files, a document's files, or a bundle (with a selected
  items summary and a sensitive-item warning).
- Choose a method (Secure Link / CertaNest Code / QR) — all resolve to one real
  session; the choice only sets which delivery the result screen leads with.
- Protection: basic (expiry, view-only / allow download) and advanced (access
  code, one-time, max claims, sender approval, watermark, save-to-vault).
- Review, then create. The result screen shows the link/code/QR, item summary,
  permission chips, expiry countdown, revoke button, and activity log.

## CertaNest Code

- A unique, high-entropy, human-typable code generated **independently of the
  secret token** (reading it aloud never weakens the token).
- The recipient enters it on the Receive page; a **rate-limited** endpoint
  resolves it and hands off to the normal, fully-guarded claim flow.
- Separately, an optional **access code** for a share is stored **hashed**
  (`make_password`), never in plain text, and shown to the owner only once.

## QR

- Encodes the claim path only; opening it runs the same server-side checks as the
  link. Large, mobile-first QR hero with copy-link, expiry countdown, item
  summary, permission chips, revoke, and "view as recipient".

## Premium Secure Viewer

Surfaces: sender identity (where safe), selected items only (bundle grouping for
bundle shares), expiry countdown, permission chips, view-only/download state,
save-to-vault (when allowed), access-code gate, and friendly invalid / expired /
revoked / deleted-file / loading states. When watermarking is enabled, previews
show a tiled watermark.

> Watermarking helps discourage misuse, but no web app can fully prevent
> screenshots on every device.

## Activity logs

Each session has an owner-facing trail (opened, claim started/accepted/declined,
previewed, downloaded, copy saved, approved/denied, revoked, expired,
access-code verified/failed). **Tokens and access codes are never logged.**

## Deferred

- Real Nearby Share (WebRTC/BLE/NFC) — roadmap only.
- See `docs/SECURE_SHARING_SECURITY.md` for the enforced permission model.
