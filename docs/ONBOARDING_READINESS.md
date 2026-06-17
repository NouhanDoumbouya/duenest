# Readiness Setup (onboarding & activation)

An action-based onboarding flow that gets a new user to their first "aha" moment
fast: *"I added an important document, DueNest knows when it expires, and it will
remind me before it's due."* It teaches through action, not slides.

- Route: `/dashboard/readiness-setup`
- Entry point: the **Readiness checklist** card on the dashboard
  (`Start readiness setup` / `Continue your readiness setup`).

## Flow (`ReadinessSetupFlow.tsx`)
1. **Welcome** — readiness promise + Start / Skip.
2. **Use-case** — one of 8 goals (international student, applications, travel,
   family, subscriptions, emergency, vault, not sure). Personalizes the rest.
3. **First document** — Upload a file, Scan (hands off to `/dashboard/scanner`),
   or Add details manually. Goal-based name suggestions prefill the draft.
4. **Details** — name, category (real categories), optional collapsed notes.
   Category + reminder defaults are auto-suggested from the document name.
5. **Expiry & reminder** — optional expiry date + reminder timing
   (7/30/60/90 days / none). "No expiry date" is always allowed.
6. **Success / Life Radar preview** — a real mini Life Radar card (name ·
   category · expiry status · reminder status) + **one** personalized next action
   and a quiet "Go to dashboard" link.

## What's reused (no new model, no migration)
The existing `UserOnboardingState` (backend) already tracks activation timestamps
and computes the setup checklist **from real owner-scoped data**. This feature:

- Stores the selected **goal** and **current step** inside
  `UserOnboardingState.metadata` (via the existing `PATCH /onboarding/state/`),
  merged so existing metadata keys are never clobbered → progress survives refresh.
- Creates the first document through existing APIs:
  - manual → `POST /documents/`
  - upload → `POST /files/` then `POST /files/:id/create-document/`
  - scan → existing `/dashboard/scanner`
- Creates the reminder through `POST /documents/:id/reminder-rules/`.
- Marks completion via `POST /onboarding/complete/` and skip via
  `POST /onboarding/dismiss/`.
- Reuses the dashboard checklist card (`getDocumentSetupChecklist`) — completion
  reflects **real data**, not clicked states.

**No backend code, models, migrations, or endpoints were added.**

## Pure helpers (`lib/readiness.ts`, unit-tested)
`getOnboardingGoalOptions`, `getDocumentSuggestionsForGoal`,
`getDefaultCategoryForDocument`, `getDefaultReminderForDocument`,
`buildFirstLifeRadarPreview`, `formatExpiryRelative`,
`getPersonalizedNextAction`, `computeReadinessChecklist`, `shouldShowOnboarding`,
`shouldShowReadinessChecklist`, `getOnboardingRedirect`,
`formatOnboardingProgress`, `read/mergeReadinessMetadata`. Covered by
`lib/readiness.test.ts` (16 tests).

## Personalization
Goal drives document suggestions, the suggested category, reminder defaults, and
the single next action (e.g. international student → visa/travel bundle;
subscriptions → add a subscription; emergency/family → Emergency Access;
vault → upload another document).

## Accessibility
`aria-live` status region for upload/save/success; a labelled progress bar
(`role="progressbar"`); labelled inputs and option buttons with `aria-pressed`;
keyboard-operable; reduced-motion respected on the progress bar; large touch
targets; `role="alert"` errors.

## Edge cases handled
Refresh mid-flow (goal/step resume from metadata; uploaded file persists as an
inbox file); upload failure (retry / manual fallback); reminder failure (document
still saved); no-expiry documents; skip → dashboard; existing users are not
forced (entry is a dashboard card, not a forced redirect).

## Empty-dashboard quick start
Brand-new accounts (`BrandNewState` in `dashboard/page.tsx`) show a goal-based
**"Start with one thing"** — life goals, not feature names — from the pure
`getQuickStartGoals()` helper (`lib/readiness.ts`, unit-tested): four primary
cards (track a document, scan, track a subscription, prepare a pack) plus a
**"More ways to start"** disclosure (share safely, emergency access) so mobile
never feels crowded, with a calm privacy line. Each card fires the existing
privacy-safe `empty_state_cta_used` event with a non-sensitive `{ goal }` tag.

## Checklist dismiss
The dashboard readiness checklist now has a quiet **Hide** control. It sets the
`readiness_checklist_dismissed` metadata flag via `PATCH /onboarding/state/`
(optimistic + best-effort) and the dashboard honours it, so the card can be
dismissed without completing onboarding.

## Limitations / follow-ups
- New users are **guided** via the dashboard card, not auto-redirected after
  signup. An auto-redirect was intentionally deferred to avoid redirect-loop /
  auth-timing risk; `getOnboardingRedirect()` exists if we wire it later.
- **Restart/replay** of the readiness flow from Settings is not wired yet — the
  `/dashboard/readiness-setup` route is reachable, but a discoverable
  settings/help entry was deferred (the data/settings page is account-deletion
  focused, so it wasn't a clean/simple fit).
- The mid-flow document **draft** (name/category/expiry) is not persisted
  server-side; refresh resumes at the document step rather than re-filling fields.
- Analytics events beyond the existing `onboarding_completed` were not added.
