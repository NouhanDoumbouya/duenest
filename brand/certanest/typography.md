# CertaNest — Typography

> Foundation only. Not yet applied to production. The live app currently uses
> Inter + Sora; CertaNest proposes Inter + **Manrope**.

## Typefaces

| Role | Typeface | Fallback stack |
| --- | --- | --- |
| Headings / display | **Manrope** | `Manrope, Inter, system-ui, sans-serif` |
| Body / UI | **Inter** | `Inter, system-ui, -apple-system, sans-serif` |
| Mono / technical labels | **Geist Mono** (or JetBrains Mono) | `"Geist Mono", "JetBrains Mono", ui-monospace, monospace` |

**Why this pairing:** Manrope is geometric, modern, and slightly warm — premium
without being cold. Inter is a clean, highly legible workhorse for dense UI. A mono
face is used for technical labels (document IDs, expiry dates, status codes, file
metadata) to signal precision and trust.

## Type scale (suggested)

| Token | Size / line-height | Weight | Font | Use |
| --- | --- | --- | --- | --- |
| Display | 48 / 56 | 700 | Manrope | Landing hero |
| H1 | 36 / 44 | 700 | Manrope | Page titles |
| H2 | 28 / 36 | 600 | Manrope | Section titles |
| H3 | 22 / 30 | 600 | Manrope | Card / group titles |
| Body L | 18 / 28 | 400 | Inter | Lead paragraphs |
| Body | 16 / 26 | 400 | Inter | Default text |
| Small | 14 / 20 | 400 | Inter | Secondary text |
| Label | 12 / 16 | 600 | Inter | Buttons, chips (often uppercase, tracked) |
| Mono | 13 / 20 | 500 | Geist Mono | Dates, IDs, technical labels |

## Rules

- **Headings:** Manrope, tight letter-spacing (`-0.02em` to `-0.03em`) on large
  sizes. Keep weights to 600–700 for hierarchy without shouting.
- **Body:** Inter, normal tracking, generous line-height (1.6) for calm reading.
- **Mono:** Use only for genuinely technical content — expiry dates, reference
  numbers, statuses like `READY` / `EXPIRES_SOON`. Do not use mono for paragraphs.
- **Numbers in data:** prefer Inter tabular figures or the mono face for aligned
  tables (deadlines, renewal dates).
- Avoid more than 2–3 weights on a single screen. Hierarchy comes from size and
  weight, not from many colors.

## Web font loading (future implementation note)

When this brand is approved, load Manrope alongside Inter via `next/font/google`
in `frontend/src/app/layout.tsx`, exposing `--font-heading: Manrope` and keeping
`--font-sans: Inter`. The mono face can come from Geist Mono (already referenced as
`--font-geist-mono`) or JetBrains Mono. **Do not change this until the brand
direction is approved.**
