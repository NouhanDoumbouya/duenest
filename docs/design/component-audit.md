# DueNest — Component Audit

> Inventory of `frontend/src/components/ui/*` plus feature-folder components, with a
> plan to promote ad-hoc patterns into documented, reusable primitives. Built on the
> tokens in [`design-system.md`](./design-system.md).

## Existing shared primitives (`components/ui/`)

| Component | Status | Notes |
| --- | --- | --- |
| `button` | ✅ Good | Confirm variants (primary/secondary/ghost/destructive) are documented and used consistently. |
| `badge` | ⚠️ Partial | Exists; needs a canonical **status-badge map** layer (see below). |
| `card` | ✅ Good | Base surface; pair with `.surface-hover`. |
| `input`, `label`, `textarea` | ✅ Good | 16px mobile floor handled in globals.css. |
| `separator` | ✅ Good | |
| `skeleton` | ✅ Good | Ensure every list view actually uses it. |
| `toast` | ✅ Good | Standardize Undo affordance for reversible actions. |
| `empty-state` | ✅ Good | Ensure **every** module uses it with a teaching message + CTA. |
| `confirm-dialog` | ✅ Good | Use for all irreversible actions; must name exact consequence. |
| `page-container`, `page-header` | ✅ Good | Page shell; keeps titles/subtitles consistent. |
| `section-card` | ✅ Good | |
| `product-ui` | ✅ Review | Grab-bag; audit whether pieces should be split out. |
| `file-preview-dialog` | ✅ Good | |

## Primitives to promote (currently likely ad-hoc per feature)

| Proposed primitive | Why | Priority |
| --- | --- | --- |
| `tabs` | ✅ **Built.** `components/ui/tabs.tsx` — controlled underlined tabs with optional icon/count and full ARIA roving-tabindex keyboard nav (Arrow/Home/End). `document-tabs.tsx` now delegates to it. Ready to wire Vault smart-views, Bundles, Document Tools. | P0 |
| `status-badge` | ✅ **Built.** `components/ui/status-badge.tsx` over pure vocabulary in `lib/status-badge.ts` (unit-tested). One mapping from lifecycle status → tone + label, built on the [status color map](./design-system.md#status-color-map-canonical--use-everywhere). First wired into Quick Share. Roll out to Vault/Bundles/Requests next. | P0 |
| `drawer` / `bottom-sheet` | Mobile document actions, filters, share flows. Mobile-first. | P0 |
| `dropdown` / `menu` | Row/card overflow actions ("⋯"). | P1 |
| `tooltip` | Help affordances on sensitive flows (Fill & Sign, SafeSend rules, AI scope). | P1 |
| `progress` (bar + ring) | Pack readiness %, upload progress, AI generation. Tiny ring on pack cards. | P1 |
| `alert` / `banner` | Inline trust notes, soft warnings (blurry scan, formatting may change). | P1 |
| `table` | Documents list/table view, requests, founder console. | P2 |
| `command-palette` | Already exists (`components/command-palette/`) — document and ensure global ⌘K. | P1 |

## State-coverage matrix (the "feels finished" lever)

Every module must define all four states. Mark as work proceeds.

| Module | Loading | Empty | Error | Success |
| --- | --- | --- | --- | --- |
| Vault / Documents | ▢ | ▢ | ▢ | ▢ |
| File Inbox | ▢ | ▢ | ▢ | ▢ |
| Scanner | ▢ | ▢ | ▢ | ▢ |
| Deadlines & Renewals | ▢ | ▢ | ▢ | ▢ |
| Bundles (Application Packs) | ▢ | ▢ | ▢ | ▢ |
| Quick Share (SafeSend) | ▢ | ▢ | ▢ | ▢ |
| Document requests | ▢ | ▢ | ▢ | ▢ |
| Secure rooms | ▢ | ▢ | ▢ | ▢ |
| Emergency access | ▢ | ▢ | ▢ | ▢ |
| AI (Chat/Ask/Draft/Briefing/Pack Copilot) | ▢ | ▢ | ▢ | ▢ |
| Organizations | ▢ | ▢ | ▢ | ▢ |
| Founder Console | ▢ | ▢ | ▢ | ▢ |
| Settings | ▢ | ▢ | ▢ | ▢ |

(▢ = to verify/complete in the states-systematization phase. Filling this matrix from
real inspection is itself a backlog item.)

## Card variants to standardize

- **Document card** (Vault): thumbnail/icon, name, type/category, status badges, quick
  actions, in-N-packs/shared/expiry indicators.
- **Pack card** (Bundles): title, readiness ring, missing-count, status, next action.
- **Deadline card**: date, urgency (amber), linked document/pack, mark-renewed.
- **Quick Share card**: link status (active/expiring/revoked/expired), access rules, QR,
  revoke.
- **AI message card**: role, review-before-acting affordances, source snippets if present.

Each should share: padding scale, `--radius-lg`, `--shadow-card` resting / `.surface-hover`
on hover, status badge from the canonical map, exactly one primary action.
