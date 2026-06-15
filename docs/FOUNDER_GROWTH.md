# Founder Growth Command Center

A founder-only growth system inside the existing Founder Console
(`Founder Console → Growth`). It answers: what's happening, why, which channels
work, and what to do next — built on the existing first-party analytics instead
of any external ad-platform integration.

- Frontend: `/founder/growth` (Overview), `/founder/growth/campaigns`,
  `/founder/growth/utm-builder`, `/founder/growth/actions`.
- Backend: `/api/v1/founder/growth/...` — every endpoint requires
  `IsFounderUser` (staff/superuser). `FounderShell` guards the frontend routes.

## Scope of this PR (first increment)
Built end-to-end: **Growth Overview, Marketing Funnel, Campaign Tracker, UTM
Link Builder, Action Center**, plus the rule-based **insight engine** and
lightweight (dependency-free) visualizations.

**Deferred (documented, not built):** Content Calendar, dynamic Audience Segment
rule engine, dedicated Beta CRM UI (the founder console already has Beta Users +
Analytics + Activation Funnel + Invites), Ambassador UI, CSV exports, and
signup-time UTM attribution wiring. The data foundations for these largely exist
already (`ProductEvent`, `BetaUserProfile`, `InviteCode`).

## What's reused (no duplication)
- `ProductEvent` — first-party, privacy-minimized events power the funnel,
  overview, channel/campaign attribution (via `metadata.utm_*`) and campaign
  metrics. No new event model was added.
- `IsFounderUser`, `FounderShell` guard — access control, backend + frontend.
- `apps.founder.services` analytics primitives (`build_activation_funnel`,
  `_range_config`, `_distinct_users`, `_active_users_since`) — reused by
  `apps/founder/growth.py` so logic stays consistent.

## New models (`apps/founder/models.py`, migration `0008`)
- `MarketingCampaign` — name/slug, channel/source/medium/utm campaign, status,
  budget, goal, landing + generated UTM URL, tags, notes, created/updated_by.
- `CampaignLink` — saved UTM links per campaign (metrics computed live).
- `GrowthAction` — Action Center items (priority, status, type, campaign link,
  `rule_key` for de-duping future auto-generated actions).

## Modules
1. **Growth Overview** — KPI cards (signups, activated users, activation rate,
   7-day active, free/Pro), previous-period trends, top channel, best campaign,
   biggest funnel drop-off, and a hero "biggest growth opportunity" insight.
   MRR/ARR are **honestly reported as unavailable** (no billing integration —
   the plan field is Free/Pro-placeholder only).
2. **Marketing Funnel** — Visitor → Signup → First document → First reminder →
   First SafeSend → Emergency setup, with per-step conversion + biggest leak,
   date-range and campaign filtering. Counts are real and owner-distinct;
   "Visitor" is an estimate from distinct frontend sessions and labelled `(est.)`.
3. **Campaign Tracker** — create/edit/list campaigns, auto-slug, auto-generated
   UTM URL, live event-derived metrics (visitors/signups/activated/CPA),
   status workflow, copy link.
4. **UTM Builder** — validates the base URL, normalizes UTM values, preserves
   existing query params, copy/open, optional save as a campaign link.
5. **Action Center** — manual + (foundation for) auto actions with priority,
   done/snooze/dismiss, resolved drawer.

## Insight engine (rule-based, honest)
`build_growth_insights` returns data-backed insights and shows
**"Not enough data yet"** below ~10 signups. Rules cover low activation, the
biggest funnel leak, and a healthy-funnel fallback.

## Privacy & security
- Founder-only on every endpoint; no normal-user or unauthenticated access
  (covered by tests).
- Reads only counts and `ProductEvent` metadata — **never** document contents,
  file names, or OCR text.
- UTM metadata size is bounded; campaign tags are capped/sanitized.
- No external analytics vendor added.

## Performance
- Funnel/overview use owner-distinct aggregate queries (no per-user loops);
  campaign list `prefetch_related("links")`; list endpoints use the project's
  standard pagination. Date ranges bound the windows.

## Tests
`apps/founder/test_growth.py` (11 tests): access control (anon/normal/founder),
campaign create/update (+ slug/URL generation), UTM build/normalize/validation,
funnel + overview shape, action create/resolve. Full founder suite: 38 passing.

## Limitations / follow-ups
- **Attribution at signup is not wired** — campaign metrics populate only once
  `ProductEvent`s carry `metadata.utm_campaign` (the registration flow doesn't
  persist first/last-touch UTM yet). Documented as the next step.
- Visitor counts depend on frontend `ProductEvent`s; with none, the funnel shows
  0 visitors honestly.
- Auto-generated `GrowthAction`s aren't scheduled yet (the model + `rule_key`
  de-dupe field are in place); actions are currently created manually.
- Deferred modules listed above.
