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
| **Prepare & share** | Bundles | `/dashboard/bundles` | `bundles` |
| | Quick Share | `/dashboard/quick-share` | `quick_share` |
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

## Brand ↔ implementation vocabulary drift (decision required)

The brand/messaging docs name features differently from the implemented labels:

| Brand canonical name | Implemented label | Route |
| --- | --- | --- |
| **SafeSend** | Quick Share | `/dashboard/quick-share` |
| **Application Packs** | Bundles | `/dashboard/bundles` |
| **Custom QR** | (inside Quick Share) | — |
| **AI Assistant** (one area) | Chat / Briefing / Ask documents / Draft / Pack Copilot | `/dashboard/*` |

**This must be resolved before broad copy work**, otherwise the marketing site, brand
docs, and app keep contradicting each other. Two clean options:

- **Option A — Make implemented labels authoritative.** Update `brand/messaging-guide.md`
  and marketing copy to say "Quick Share" and "Bundles". Lowest code risk.
- **Option B — Make brand names authoritative.** Rename display labels in
  `lib/navigation.ts` to "SafeSend" / "Application Packs", keep routes the same (labels
  are display-only, so no redirects needed), update `navigation.test.ts`. Higher polish,
  better marketing alignment.

Recommendation: **Option B** for the consumer-facing labels (SafeSend, Application Packs
are stronger, more ownable names), because routes are unaffected — only the human-readable
`label` strings change. The AI split (Chat/Briefing/Ask/Draft/Pack Copilot) is fine as
distinct tools but should sit under an "Assistant" mental model in marketing.

> No labels are changed in this Phase 1 docs branch. This is recorded as the decision the
> product owner must make first.

## Navigation rules (to preserve)

- Single source of truth in `lib/navigation.ts`; never hardcode nav elsewhere.
- Feature-flag visibility via `featureKey`; default-visible when no flag.
- Active section auto-expands; manual expand persisted to `localStorage`.
- `aria-current="page"` on active leaf; focus-visible rings on all nav controls.
- Keep routes stable. If a label changes, it's display-only — no redirect needed. If a
  *route* ever changes, add a redirect.
- Don't overload the sidebar: max ~6 groups; group related features; short labels.
