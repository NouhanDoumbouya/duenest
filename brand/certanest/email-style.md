# CertaNest — Email Style

> Foundation only. Reference for transactional/notification email design once the
> rebrand is approved. Not yet implemented.

## Principles

CertaNest emails should feel **calm, secure, and considered** — like a trusted
note, not a marketing blast. They reduce anxiety about a deadline or a share; they
never manufacture urgency.

## Layout

- Single column, max width **600px**, centered.
- Background: Warm Ivory `#F8F6F1`. Content card: White `#FFFFFF`, rounded 16px,
  subtle border `#E2E8F0`, gentle shadow.
- Generous padding (32–40px). One clear primary action per email.

## Header

- Left-aligned **CertaNest** horizontal logo (Concept 1), ~140px wide.
- Thin Certa Teal `#0F766E` keyline or a small teal accent — no heavy banner, no
  gradient.

## Body

- Headline: Manrope 600, Primary Ink `#0B1220`.
- Body: Inter 400, ~16px, line-height 1.6, Ink for primary, Slate `#64748B` for
  secondary.
- Primary button: Certa Teal `#0F766E` background, White text, rounded 10px,
  comfortable padding. Success confirmations may use Secure Emerald `#10B981`.
- Use Mono (Geist/JetBrains) only for technical details — dates, reference codes.

## Footer

- Slate `#64748B`, ~12–13px, on Soft Sand `#EFE7DA` or ivory.
- Include: who it's from (CertaNest), why they received it, a manage/unsubscribe
  link for non-essential mail, and a short trust line.
- Trust line examples: "Private until you share it." / "You can revoke access at
  any time." / "This link follows your sharing rules."

## Tone by email type

| Type | Tone | Accent |
| --- | --- | --- |
| Renewal / deadline reminder | Calm, helpful, early | Teal |
| Share received | Reassuring, clear about access | Teal |
| Action completed / verified | Positive confirmation | Emerald |
| Security / sensitive | Precise, trustworthy, no alarm | Ink + Teal |
| Overdue / failed | Direct but not panicky | Danger Red, sparingly |

## Sample (plain structure)

```txt
[ CertaNest logo ]
────────────────────────────────────────

Your passport renewal is coming up

Hi Alex — your passport in CertaNest is marked to renew on
2026-09-14 (in 84 days). Everything you need is already in
your nest and ready to go.

        [  Review renewal  ]   ← Certa Teal button

Original documents are always preserved. Private until you share.
────────────────────────────────────────
You're receiving this because you set a renewal reminder in
CertaNest. Manage reminders · Unsubscribe
```

## Don'ts

- ❌ No fake urgency, countdown pressure, or alarmist subject lines.
- ❌ No gradients, no large hero images, no more than one primary action.
- ❌ Never embed private document contents or public raw links in email.
