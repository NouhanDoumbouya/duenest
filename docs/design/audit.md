# DueNest — Product Design Audit

> Grounded audit performed on branch `feature/world-class-duenest-product-design-system`
> (off `origin/main`). This documents the **actual** state of the codebase, not an
> idealized greenfield. It exists to drive the design backlog in
> [`396-tiny-product-features.md`](./396-tiny-product-features.md) and
> [`369-delightful-details.md`](./369-delightful-details.md).

## How this audit was produced

Inspected directly:

- Design tokens and motion system: `frontend/src/app/globals.css`
- UI primitives: `frontend/src/components/ui/*`
- Navigation source of truth: `frontend/src/lib/navigation.ts`
- Sidebar implementation: `frontend/src/components/layout/sidebar-nav.tsx`
- Route inventory: `frontend/src/app/**`
- Brand foundation: `brand/brand-strategy.md`, `brand/voice-and-tone.md`,
  `brand/messaging-guide.md`, `brand/visual-direction.md`,
  `brand/conversion-copy-guide.md`
- Marketing: `docs/marketing/launch-kit.md`, `docs/marketing/use-cases.md`

## Headline conclusion

DueNest is **not** an early-stage landing page. It is a large, mature, already-branded
product with ~30 dashboard modules, a real token-based design system, structured
feature-flagged navigation, motion utilities with `prefers-reduced-motion` handling,
mobile/PWA hardening, and an existing brand-and-messaging foundation.

The correct strategy is therefore **align, tighten, and complete — not rebuild.**
Wholesale rewrites would destroy working functionality and violate the repo's own
engineering rules (`AGENTS.md`: focused, reviewable, non-destructive changes).

---

## Current strengths (keep and protect)

- **Real design tokens.** Brand palette (Midnight Navy, Nest Teal, Due Amber, Soft
  Mint, Success Green), a layered shadow scale (`--shadow-card/elevated/floating`),
  a coherent radius scale (`--radius-sm…4xl`), and typography utilities
  (`.text-page-title`, `.text-section-title`, `.text-card-title`, `.text-metadata`).
- **Mature motion system.** `.reveal`, `.surface-hover`, `.live-scan`, `.radar-sweep`,
  `.tilt-card`, `.cta-sheen`, `.flow-line` — all with a full
  `@media (prefers-reduced-motion: reduce)` block. Motion discipline is already strong.
- **Mobile/PWA hardening already in place.** `overflow-x: clip`, 16px input floor to
  stop iOS zoom, `touch-action: manipulation` to kill the 300ms tap delay,
  `env(safe-area-inset-*)` padding in standalone mode, truncation `min-width: 0` fix.
- **Structured, feature-flagged navigation.** `lib/navigation.ts` is a single source of
  truth with grouped sections, collapsible parents, leaf feature keys, and a tested
  active-state resolver (`navigation.test.ts`). Sidebar persists expand state, has
  focus-visible rings and `aria-current`.
- **Broad, real feature coverage.** Vault, File Inbox, Scanner, Documents, Trash,
  Planning (Attention, Deadlines & Renewals, Calendar, Timeline), AI (Chat, Briefing,
  Ask documents, Draft, Pack Copilot), Bundles, Quick Share, Shared with me, Document
  requests, Secure rooms, Emergency access, Organizations, Trust & security, Billing,
  Founder Console, Feedback.
- **Existing brand foundation.** `brand/` already contains brand-strategy, voice-and-tone,
  messaging-guide, visual-direction, and conversion-copy-guide with honesty guardrails.
- **A11y baseline.** Focus-visible rings, semantic nav landmarks, `aria-expanded`/
  `aria-controls` on collapsibles.

---

## Weaknesses and gaps (the backlog targets)

### 1. Brand vocabulary vs. implementation drift — ✅ RESOLVED

The brand/messaging docs defined canonical names the app didn't use. **Resolved on this
branch:** the product owner chose to adopt the brand names app-wide, and the user-facing
display labels were renamed (`Quick Share → SafeSend`, `Bundles → Application Packs`)
while routes, feature keys, types, and API identifiers were left unchanged. See
[navigation-map.md](./navigation-map.md#brand--implementation-vocabulary-drift--resolved)
for the decision record and identifier mapping.

### 2. No design-system documentation existed

`docs/design/` did not exist before this branch. Tokens, components, and patterns live
only in code, so there is no shared reference for spacing scale, component variants,
microcopy patterns, or the navigation map. (This branch creates that.)

### 3. `subscriptions` route — naming-risk flag

`/dashboard/subscriptions` exists. The product brief explicitly bans
subscription/finance/budgeting framing. This needs a targeted read to confirm it is
**document subscription-renewal tracking** (legitimate, a Deadlines concern) and not
finance language. Flagged for the copy-cleanup phase, not yet resolved here.

### 4. Component inventory is lean for the surface area

`components/ui/` has button, badge, card, input, label, textarea, separator, skeleton,
toast, empty-state, confirm-dialog, page-container, page-header, section-card,
product-ui, file-preview-dialog. Notable absences for a product this size: a documented
**Tabs**, **Drawer/BottomSheet**, **Dropdown/Menu**, **Tooltip**, **Progress/ring**,
**Alert/Banner**, and **Table** primitive. Many likely exist ad hoc inside feature
folders; they should be audited and promoted to shared primitives (see
component-audit.md).

### 5. Status/badge vocabulary is not centralized

Cards across Vault, Bundles, Quick Share, Requests each need status badges (Expires
soon, In N packs, Shared, Prepared copy, Needs review, Draft, Revoked, Expired). Without
a shared badge token map, these drift in color and wording. (See microcopy-patterns.md.)

### 6. Empty/loading/error/success states not systematized

An `empty-state` primitive exists, but there is no documented inventory ensuring **every**
module has teaching empty states, skeleton loaders, honest error recovery, and calm
success confirmations. This is the single biggest "feels finished" lever.

### 7. AI trust copy needs a consistent, reusable pattern

AI is split across five modules. The "AI suggests, you decide / review before sharing /
original preserved" guardrail copy must be a reusable pattern, not re-typed per screen.

---

## Honesty / risk scan (preliminary)

Brand docs already encode honesty guardrails (no fake testimonials, no
SOC 2/HIPAA/GDPR/E2EE/legally-binding overclaims, scenario quotes not testimonials).
A full codebase grep for banned language (`subscription`, `budget`, `finance`,
`guaranteed`, `legally binding`, `SOC 2`, `HIPAA`, `end-to-end encryption`,
`trusted by thousands`) is its own phase ("Copy + trust cleanup sweep") and is **not**
performed in this Phase 1 docs pass. The `subscriptions` route is the one pre-identified
flag.

---

## Highest-impact opportunities (ranked)

1. **Resolve brand↔route naming drift** (SafeSend/Quick Share, Application Packs/Bundles).
   One decision unlocks coherent copy everywhere.
2. **Systematize empty/loading/error/success states** across all modules.
3. **Promote ad-hoc components to documented shared primitives** (Tabs, Drawer, Menu,
   Tooltip, Progress, Table, Badge map).
4. **Centralize status-badge + microcopy vocabulary.**
5. **Reusable AI trust pattern.**
6. **Landing 10-second test pass** (separate slice).
7. **Run the copy/trust cleanup grep** and resolve the `subscriptions` framing.

## Files most likely to change in later phases

- `frontend/src/lib/navigation.ts` (if labels are renamed) + `navigation.test.ts`
- `frontend/src/components/ui/*` (new/promoted primitives)
- `frontend/src/app/globals.css` (only if a token gap is found — currently solid)
- Module pages under `frontend/src/app/(dashboard)/dashboard/*`
- `frontend/src/app/(marketing)/page.tsx`
- `brand/messaging-guide.md` (if brand language is realigned to routes)

## Implementation order (recommended)

Phase 1 (this branch): docs + ledgers. Then, in priority order: naming decision →
states systematization → component promotion → microcopy/badges → AI trust pattern →
landing → copy cleanup → mobile/a11y sweep → motion/delight polish.
