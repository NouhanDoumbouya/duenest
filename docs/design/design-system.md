# DueNest — Design System

> Source of truth: `frontend/src/app/globals.css` (tokens + motion) and
> `frontend/src/components/ui/*` (primitives). This document **describes** the system
> that exists so it can be used consistently — it does not invent new tokens.

## Principles applied

Calm, premium, fast, trustworthy. Quiet surfaces, strong hierarchy, purposeful space.
Every color, radius, shadow, and motion has a reason. See
[`interaction-principles.md`](./interaction-principles.md).

## Color tokens

Brand palette (`:root` in globals.css), exposed to Tailwind as `brand-*` utilities:

| Token | Value | Name | Usage |
| --- | --- | --- | --- |
| `--brand-navy` | `#0b1220` | Midnight Navy | Foreground text, headings |
| `--brand-teal` | `#14b8a6` | Nest Teal | Brand accent, scan/active motifs |
| `--brand-amber` | `#f59e0b` | Due Amber | Deadlines, "due/expiring" signals |
| `--brand-mint` | `#ccfbf1` | Soft Mint | Accent surfaces, active nav background |
| `--brand-success` | `#22c55e` | Success Green | Ready/complete, live status dots |

Semantic tokens (shadcn-style, light + `.dark`):

| Token | Light | Role |
| --- | --- | --- |
| `--background` | `#f7f8fb` | Cool neutral app surface (not pure white) |
| `--foreground` | `#0b1220` | Primary text |
| `--card` | `#ffffff` | Cards lift off the soft background |
| `--primary` | `#2563eb` (Trust Blue) | Primary actions, focus ring |
| `--secondary` / `--muted` | `#eef1f7` | Quiet fills |
| `--muted-foreground` | `#586a85` | Metadata, secondary text |
| `--accent` | `#ccfbf1` | Mint accent; `--accent-foreground` `#0f766e` |
| `--destructive` | `#ef4444` (Risk Red) | Destructive actions, errors |
| `--border` / `--input` | `#e6eaf2` | Soft cool lines |
| `--ring` | `#2563eb` | Focus rings |
| `--sidebar*` | white surface | Distinct command surface |

**Rule:** never hardcode hex in components. Use the semantic token utilities
(`bg-card`, `text-muted-foreground`, `border-border`, `bg-accent`,
`text-brand-amber`, etc.).

### Status color map (canonical — use everywhere)

| Status | Color basis | Meaning |
| --- | --- | --- |
| Ready / Complete / Prepared | `brand-success` | Positive, done |
| Expiring soon / Due | `brand-amber` | Attention, not panic |
| Overdue / Revoked / Error | `destructive` | Action required |
| Shared / Active link | `primary` | Informational, live |
| Draft / Needs review / Neutral | `muted-foreground` | Pending, low urgency |
| Private / Original | `brand-teal` | Trust, safety |

## Typography

- Families: `--font-sans` (body), `--font-heading` (h1–h3), `--font-geist-mono` (mono).
- `h1,h2,h3` use `font-heading`, `letter-spacing: 0` (intentionally not tight).
- Utilities (prefer these over ad-hoc sizes):
  - `.text-page-title` — page H1 (2xl→3xl, semibold)
  - `.text-page-subtitle` — supporting line (sm, muted, max-w-3xl)
  - `.text-section-title` — section heading (base, medium)
  - `.text-card-title` — card heading (sm, medium)
  - `.text-metadata` — xs muted metadata
- Body sets `font-feature-settings: "cv11","ss01"`, antialiased, `optimizeLegibility`.

## Spacing & layout

- Tailwind spacing scale (4px base). Page shells via `page-container` /
  `page-header` primitives. Prefer `gap-*` over margins for rhythm.
- `.truncate` is patched to `min-width: 0` so long filenames can't blow out mobile width.

## Radius

`--radius: 0.75rem` (12px, brand "md"). Scale: `sm` ×0.6, `md` ×0.8, `lg` ×1,
`xl` ×1.4, `2xl` ×1.8, `3xl` ×2.2, `4xl` ×2.6. Cards typically `lg`; pills/badges
full-round; large hero surfaces `2xl`+.

## Elevation (shadows)

| Token | Use |
| --- | --- |
| `--shadow-card` | Resting cards (1–3px, very soft) |
| `--shadow-elevated` | Hover/active lift, popovers, key cards |
| `--shadow-floating` | Modals, command palette, floating sheets |

`.surface-hover` = the canonical hover lift (`-translate-y-0.5` + `shadow-elevated`,
neutralized under reduced motion).

## Motion

Defined in globals.css with a complete reduced-motion fallback. Canonical durations:
150–260ms for interactions, 450–700ms for scroll reveals (shorter on mobile).

| Utility | Purpose |
| --- | --- |
| `.content-fade-in` | Page/content entrance (180ms) |
| `.reveal` / `.is-visible` | Scroll-into-view reveal (JS-toggled) |
| `.surface-hover` | Card hover lift |
| `.vault-bar-in` | Bottom-anchored bars (bulk actions, toast) |
| `.pulse-soft` | Calm live-status dot pulse |
| `.live-scan` | "Always checking" sweep on hero cards |
| `.radar-sweep` | Signature "watching" radar motif |
| `.tilt-card` / `.tilt-glare` | 2.5D pointer tilt (depth, no 3D engine) |
| `.cta-sheen` | Sheen sweep on primary CTA hover |
| `.flow-line` | System-flow connectors draw in on reveal |
| `.quick-share-qr-in` | QR entrance pop |

**Rule:** every new animation must (a) clarify state or improve perceived quality, and
(b) be inert under `prefers-reduced-motion: reduce`. No confetti, no childish bounce.

## Component primitives (`components/ui/`)

Existing: `button`, `badge`, `card`, `input`, `label`, `textarea`, `separator`,
`skeleton`, `toast`, `empty-state`, `confirm-dialog`, `page-container`, `page-header`,
`section-card`, `product-ui`, `file-preview-dialog`.

Gaps to promote from ad-hoc usage to documented primitives (see component-audit.md):
`tabs`, `drawer` / `bottom-sheet`, `dropdown`/`menu`, `tooltip`, `progress` (bar + ring),
`alert`/`banner`, `table`, and a shared `status-badge` map built on the status color map.

## Usage rules (quick reference)

1. Tokens over hex. Utilities over inline styles.
2. One primary action per view; everything else secondary/ghost.
3. Every card/row with a lifecycle shows a status badge from the canonical map.
4. Every list view has: loading skeleton, teaching empty state, honest error, success.
5. Motion respects reduced-motion. Always.
6. Focus-visible rings everywhere interactive (`ring-ring/50`).
7. Mobile tap targets ≥ 44px; primary mobile action sticky/bottom-anchored.
