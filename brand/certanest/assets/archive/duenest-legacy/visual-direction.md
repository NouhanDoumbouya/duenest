# DueNest — Visual Direction

The visual system already exists in `/brand` and is implemented via
`brand/colors/duenest_tailwind_tokens.ts` and `duenest_theme.css`. This document
captures the intended direction so future work stays consistent.

## Brand feel

Secure · organized · premium · calm · modern · document-focused · mobile-friendly.
Not boring; not playful in sensitive flows.

## Color (source: `brand/colors/duenest_brand_tokens.json`)

| Token | Hex | Use |
|---|---|---|
| Midnight Navy | `#0B1220` | Trust, deep surfaces, headings |
| Nest Teal | `#14B8A6` | Readiness/brand accent (`brand-teal`) |
| Trust Blue | `#2563EB` | Secondary accent, links |
| Due Amber | `#F59E0B` | Warnings only (`brand-amber`) |
| Success Green | `#22C55E` | Success/ready states (`brand-success`) |
| Risk Red | `#EF4444` | Destructive / urgent only |
| Soft Mint / Cloud White / Slate / Line Gray | — | Neutrals & backgrounds |

Rules: calm palette; warm/neutral backgrounds; amber strictly for warnings; red
strictly for destructive/urgent. Avoid neon, heavy gradients, and childish colors.

## Typography

- **Display/headings:** Sora
- **Body:** Inter
- Strong hierarchy, readable, mobile-friendly. (Loaded via the framework font
  loader in `app/layout.tsx`.)

## Iconography

Consistent stroke width, clear meaning, not decorative-only. Mental-model mapping:

- Vault → vault/shield-file · File Inbox → inbox · Scan → scan/camera
- Deadlines & Renewals → calendar/bell · Application Packs → package/checklist
- SafeSend → send-lock · Custom QR → QR · Emergency → medical/emergency shield
- AI Assistant → spark/assistant (avoid implying "magic")

Do **not** use a plain file icon as the main brand identity. The brand mark
should communicate nest + secure documents + readiness.

## Layout & spacing

Calm spacing, clear cards, generous whitespace, no cramped dashboards, good
mobile density. Radii and shadows are tokenized (`borderRadius`, `shadow` in the
brand tokens). Maintain accessible contrast and responsive behavior.
