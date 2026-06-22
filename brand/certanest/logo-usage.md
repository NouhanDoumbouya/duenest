# CertaNest — Logo Usage

> Foundation only. SVG marks are hand-built and should be exported to PNG/ICO
> from a vector tool before production — but the geometry below is final.

## Official logo (APPROVED) — Concept 1, Secure Nest Mark

The approved, micro-polished CertaNest logo. **Use these `certanest-*` files.** The
`concept-1-*` files (v1 and `-refined-`) are superseded and kept only for history.

| File | Use |
| --- | --- |
| `certanest-logo-icon.svg` | Icon only (light backgrounds) |
| `certanest-logo-horizontal.svg` | Icon + wordmark (light) — primary lockup |
| `certanest-logo-mono.svg` | Monochrome (single-ink) lockup |
| `certanest-logo-dark.svg` | Dark-background lockup |
| `certanest-favicon.svg` | Simplified single-wall tile for ≤24px |
| `certanest-app-icon.svg` | 1024px rounded app / PWA tile |
| `certanest-logo-preview-final.svg` | Review board on Ivory / White / Ink / Teal |

**Background rules (from the review board):**
- **Warm Ivory / White:** teal walls `#0F766E`, emerald check `#10B981`, wordmark Ink + Teal.
- **Primary Ink:** teal-tint walls `#5EEAD4`, emerald check `#10B981`, wordmark Ivory + teal-tint.
- **Certa Teal:** Warm Ivory walls `#F8F6F1`, Primary Ink check `#0B1220`, wordmark Ivory.

**Final micro-polish (v2 → final):** checkmark −6% so the nest leads; outer wall
endpoints raised and opening tightened for a more protective, less-basket feel;
inner wall opacity 0.5 on color versions; icon→wordmark gap set to a consistent
~16px; uniform 4px stroke throughout.

## The three concepts (history)

### Concept 1 — Secure Nest Mark  ⭐ Recommended
Two soft, protective curved lines form an abstract nest/cradle, with an emerald
checkmark nested inside. It says *secure home* + *certainty* without any literal
bird, egg, shield, or lock. Calm, premium, and abstract — the strongest fit for
the brand personality. **Primary recommendation.**

**Use the refined `-refined-` files — this is the production direction.** The
original v1 files are kept only for before/after comparison.

| File | Use |
| --- | --- |
| `concept-1-refined-icon.svg` | Icon only (light) |
| `concept-1-refined-horizontal.svg` | Icon + wordmark (light) |
| `concept-1-refined-mono.svg` | Monochrome lockup |
| `concept-1-refined-dark.svg` | Dark-background lockup |
| `concept-1-refined-favicon.svg` | Simplified single-wall tile for ≤24px |
| `concept-1-refined-app-icon.svg` | 1024px rounded app/PWA tile |
| `concept-1-refined-grid.svg` | Construction grid / keyline reference |
| `concept-1-secure-nest.svg` *(v1)* | Superseded — comparison only |
| `concept-1-horizontal.svg` *(v1)* | Superseded — comparison only |
| `concept-1-mono.svg` / `concept-1-dark.svg` *(v1)* | Superseded — comparison only |

**What changed in the refinement (v1 → v2):**
- Checkmark ~15% smaller and re-centered so it nests rather than dominates.
- Cradle walls rise vertically before curving in — a protective vault-nest, not a smile.
- Side endpoints raised (`y27 → y19`) for a more enclosing, secure container.
- Uniform 4px stroke across all paths (was 4.5 / 4.5 / 5) — consistent weight & spacing.
- Built on a 4px grid with a 6px safe area; the full two-wall mark holds to ~24px,
  and a dedicated single-wall favicon covers 16–24px.

### Concept 2 — Vaulted Document
Files: `concept-2-vaulted-document.svg`, `concept-2-horizontal.svg`

A rounded vault container holding a folded document with a small checkmark. The
most literal and practical — clearly "secure documents." A strong, safe fallback
if a more explicit document cue is wanted, especially for app-store contexts.

### Concept 3 — Certainty Loop
Files: `concept-3-certainty-loop.svg`, `concept-3-horizontal.svg`

An abstract protective loop that subtly suggests **C** and **N**, with a rising
emerald stroke for forward certainty. The most abstract and "tech-premium" — great
for a favicon or motion, but reads less obviously as "documents."

## Variants provided

| Variant | Provided for |
| --- | --- |
| Icon-only | All 3 concepts |
| Horizontal lockup (icon + wordmark) | All 3 concepts |
| Monochrome | Concept 1 (`concept-1-mono.svg`) |
| Dark background | Concept 1 (`concept-1-dark.svg`) |
| Favicon concept | `assets/icons/favicon-concept.svg` |
| App icon concept | `assets/icons/app-icon-concept.svg` |

Mono and dark variants for Concepts 2 and 3 can be produced once a direction is
chosen — color swaps follow the same rules below.

## Wordmark

- Type the wordmark in **Manrope, weight 700**, letter-spacing ~`-0.6` at 30px.
- Two-tone treatment: **"Certa" in Primary Ink** `#0B1220`, **"Nest" in Certa
  Teal** `#0F766E`. On dark backgrounds, "Certa" becomes Warm Ivory and "Nest"
  becomes a lighter teal/mint for contrast.
- Monochrome: the entire lockup in a single color (Ink on light; Ivory on dark).

## Color rules

| Context | Cradle / container | Checkmark / accent | Wordmark |
| --- | --- | --- | --- |
| Light bg | Certa Teal `#0F766E` | Secure Emerald `#10B981` | Ink + Teal |
| Dark bg | Light teal `#5EEAD4` | Secure Emerald `#10B981` | Ivory + light teal |
| Monochrome | Single ink/ivory | Single ink/ivory | Single ink/ivory |

## Clear space & sizing

- Keep clear space around the mark equal to the height of the checkmark.
- Minimum icon size: **24px** on screen (use the simplified favicon concept below
  24px). Minimum horizontal lockup: **120px** wide.
- Do not let other elements crowd the mark.

## Don'ts

- ❌ Don't recolor outside the palette or add gradients.
- ❌ Don't stretch, skew, rotate, or add drop shadows/outlines.
- ❌ Don't reorder or respace the two-tone wordmark.
- ❌ Don't place the light logo on a busy or low-contrast background.
- ❌ Don't add a literal bird, egg, lock, or shield to "explain" the mark.

## Production note

These are SVG concept drafts. Before shipping, the chosen mark should be redrawn
on a precise grid and exported to the icon sizes the app already uses
(`frontend/public/icons/…`, favicon `.ico`, 180/192/512 PNGs). Do not swap the
now-archived legacy DueNest assets (see assets/archive/duenest-legacy/).
