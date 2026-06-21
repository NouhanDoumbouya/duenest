# DueNest — Navigation Map

> Source of truth: `frontend/src/lib/navigation.ts` (tested by `navigation.test.ts`).
> This map documents the **implemented** structure and the brand-vocabulary drift that
> must be resolved.

## Implemented sidebar (grouped)

| Group | Item | Route | Feature flag |
| --- | --- | --- | --- |
| **Main** | Overview | `/dashboard` | — |
| **Life admin** | Vault | `/dashboard/vault` | — |
| | ↳ Documents | `/dashboard/documents` | — |
| | ↳ File Inbox | `/dashboard/files` | `file_inbox` |
| | ↳ Scan | `/dashboard/scanner` | — |
| | ↳ Trash | `/dashboard/trash` | — |
| | Planning | `/dashboard/planning` | — |
| | ↳ Attention | `/dashboard/attention` | — |
| | ↳ Deadlines & Renewals | `/dashboard/reminders` | — |
| | ↳ Calendar | `/dashboard/calendar` | — |
| | ↳ Timeline | `/dashboard/timeline` | — |
| **Assistant** | Chat | `/dashboard/assistant` | `ai_chat` |
| | Briefing | `/dashboard/briefing` | `ai_briefing` |
| | Ask documents | `/dashboard/ask` | `ai_document_qa` |
| | Draft | `/dashboard/draft` | `ai_document_drafting` |
| | Pack Copilot | `/dashboard/pack-copilot` | `ai_pack_copilot` |
| **Prepare & share** | Application Packs | `/dashboard/bundles` | `bundles` |
| | SafeSend | `/dashboard/quick-share` | `quick_share` |
| | Shared with me | `/dashboard/shared-with-me` | `shared_with_me` |
| | Document requests | `/dashboard/requests` | `share_requests` |
| | Secure rooms | `/dashboard/share-rooms` | `secure_rooms` |
| | Emergency access | `/dashboard/emergency` | `emergency_access` |
| **Workspaces** | Organizations | `/dashboard/organizations` | `organizations` |
| **Account** | Trust & security | `/dashboard/trust` | — |
| | Plan & Billing | `/dashboard/settings/billing` | — |
| | Data & privacy | `/dashboard/settings/data` | — |
| | AI & privacy | `/dashboard/settings/ai` | `ai_features` |
| | Feedback | `/dashboard/feedback` | `feedback` |
| **Founder** | Founder Console | `/founder` | (access-gated) |

Mobile uses `bottom-nav.tsx`; topbar/shell via `dashboard-shell.tsx` and `site-header.tsx`.

## Brand ↔ implementation vocabulary drift — ✅ RESOLVED

**Decision (product owner): adopt the brand names app-wide (Option B).** The user-facing
display labels were renamed to match the brand; routes, feature keys, types, and API
identifiers are unchanged.

| Brand name (now used everywhere) | Old display label | Route (unchanged) | Internal identifiers (unchanged) |
| --- | --- | --- | --- |
| **SafeSend** | Quick Share | `/dashboard/quick-share` | `quick_share`, `QuickShare*`, `getQuickShares` |
| **Application Packs** | Bundles | `/dashboard/bundles` | `bundles`, `Bundle*`, `getBundles`, `bundle_type`, `in_bundle` |
| **Custom QR** | (inside SafeSend) | — | — |
| **AI Assistant** (mental model) | Chat / Briefing / Ask documents / Draft / Pack Copilot | `/dashboard/*` | unchanged |

Implemented across these commits on this branch:
- `Quick Share → SafeSend` app-wide (display text only; `SafeSend` already existed as the
  brand concept in `lib/safesend.ts`).
- `Bundles → Application Packs` on feature surfaces, then public/billing copy, then
  remaining dashboard copy. Inline short references use "pack"; the feature/nav uses
  "Application Packs".

Rationale: routes are unaffected (only human-readable `label`/copy strings changed, so no
redirects), and the brand had already invested in these stronger, more ownable names.
The data model intentionally keeps "bundle"/"quick share" identifiers — UI vocabulary and
storage vocabulary are decoupled.

## Navigation rules (to preserve)

- Single source of truth in `lib/navigation.ts`; never hardcode nav elsewhere.
- Feature-flag visibility via `featureKey`; default-visible when no flag.
- Active section auto-expands; manual expand persisted to `localStorage`.
- `aria-current="page"` on active leaf; focus-visible rings on all nav controls.
- Keep routes stable. If a label changes, it's display-only — no redirect needed. If a
  *route* ever changes, add a redirect.
- Don't overload the sidebar: max ~6 groups; group related features; short labels.
