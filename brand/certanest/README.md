# CertaNest Brand Foundation

> **Status:** Approved and rolled out. **CertaNest** is the official brand
> (formerly DueNest). The foundation in this folder is the source of truth for the
> brand; the rebrand is being integrated across the app. See `docs/BRANDING.md`
> for domains, email senders, and the internal identifiers still named `duenest`.

## What CertaNest is

A secure life-admin platform — a calm, protective "nest" that keeps important
documents, deadlines, renewals, subscriptions, and reusable application packs
organized and **ready when life asks**.

- **Main tagline:** Life documents, deadlines, and proof — ready when life asks.
- **Short tagline:** Your life-admin, securely organized.

## Files in this folder

| File | Purpose |
| --- | --- |
| `brand-guidelines.md` | Master overview: name, meaning, personality, do/don't |
| `messaging.md` | Taglines, positioning, voice, trust copy, sample hero |
| `colors.md` | Full palette, usage rules, semantic mapping, a11y notes |
| `typography.md` | Manrope / Inter / mono pairing, scale, rules |
| `logo-usage.md` | The 3 logo concepts, variants, color & spacing rules |
| `email-style.md` | Transactional email layout & tone |
| `ui-style.md` | Product UI direction: surfaces, components, patterns |
| `assets/final/svg/` | **Official** logo SVGs (icon, horizontal, mono, dark, app-icon, review board) |
| `assets/final/favicon/` | **Official** favicon (simplified single-wall) + favicon PNGs |
| `assets/final/png/` | Rasterized app-icon PNGs (512 / 1024) |
| `assets/archive/` | Superseded concept drafts + archived legacy DueNest brand assets |

## Logo concepts

1. **Secure Nest Mark** — abstract protective nest + nested checkmark. ⭐ Recommended.
2. **Vaulted Document** — rounded vault holding a folded document + check.
3. **Certainty Loop** — abstract protective loop suggesting C and N.

## Preview

An isolated frontend preview route renders all of this together (logos, palette,
type, buttons, cards, inputs, badges, email header/footer, hero copy):

```
frontend/src/app/brand-preview/page.tsx  →  http://localhost:3000/brand-preview
```

It uses the CertaNest palette via inline tokens and does **not** modify the live
design system or any shipping page.

## Rebrand status

- Official logo, palette, and typography are integrated into the app
  (`globals.css`, `layout.tsx`, logo component, manifest, favicon/app-icon).
- Legacy DueNest brand assets have been archived under `assets/archive/duenest-legacy/`.
- Some non-user-facing internals are intentionally still named `duenest`
  (cookies, env vars, encryption headers, loggers, cache names, repo URL) — see
  `docs/BRANDING.md`. These will be migrated in a separate, coordinated change.
- `brand-preview` (`/brand-preview`) remains an internal review route, noindexed.
