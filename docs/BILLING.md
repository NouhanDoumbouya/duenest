# Billing, Plans & Promo Codes

CertaNest's own monetization layer (the `apps.billing` app). This is **separate**
from `apps.subscriptions`, which tracks a *user's own* recurring payments
(Netflix, Spotify, …). This document covers CertaNest's plans, entitlements,
checkout, promo codes, webhooks, and the founder billing console.

> **Status:** The data model, entitlement engine, promo engine, webhook handler,
> APIs, and UI are implemented. The **`manual` provider** runs fully offline and
> is the default. The **Stripe** adapter is written and provider-aware but has
> **not been exercised against live Stripe** in this environment (no
> credentials). Treat the Stripe path as integration-ready, not verified.

## Architecture

```
apps/billing/
  models.py        Plan, PlanEntitlement, CustomerBillingProfile,
                   UserSubscription, PromoCode, PromoRedemption,
                   BillingEvent, InvoiceRecord, ManualAccessGrant
  entitlements.py  Centralized "what can this user do?" service
  promo.py         Promo-code validation + redemption
  providers.py     Provider-aware adapters (manual, stripe)
  services.py      Checkout, portal, webhook processing, manual grants
  views.py/urls.py User + founder/admin APIs
```

### The `User.plan` bridge
The existing limit enforcement (`apps.users.plans` + `apps.documents.plan_usage`)
reads `User.plan` (`free` / `pro_placeholder`). The billing layer keeps that
field in sync via `entitlements.sync_user_plan(user)` whenever a subscription or
manual grant changes, so **no existing enforcement code had to change**. Numeric
Free limits in the seeded entitlements mirror `apps.users.plans.PLAN_LIMITS`.

## Plans & pricing

Seeded by `0002_seed_plans` and aligned to **launch pricing (USD)** by
`0010_usd_pricing_and_ai_limits` (editable later via Django admin):

| Plan | Price | Status |
| --- | --- | --- |
| **Free** | $0 | Active |
| **Pro** | **$7.99/mo** (`799`) · **$79/yr** (`7900`) | Active / purchasable |
| **Family** | — | **Coming soon** (public card, not purchasable) |
| **Teams** (`organization`) | Contact us | **Coming soon** (public card, not purchasable) |

Prices are integer minor units; currency is `usd`. Provider price IDs come from
env (`STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY`).

**Coming-soon plans** are `is_public=True` (shown on the pricing page) but
`is_active=False`. `services._get_purchasable_plan` enforces `is_active`, so
Family/Teams can never be checked out until activated. The public `/billing/plans/`
list returns all `is_public` plans; the frontend hides checkout for inactive ones.

### Free vs Pro limits

Non-AI resource limits are enforced via `apps.users.plans.PLAN_LIMITS` /
`apps.documents.plan_usage`. `PlanEntitlement` rows in the billing app are a
**display mirror** that powers the public pricing/comparison UI; migration `0013`
keeps them in sync with the enforced values. The `backend/storage-plan-limits`
branch is **implemented and merged**.

**Enforced Free limits:**

| Resource | Free limit |
| --- | --- |
| Storage | **100 MB** (104,857,600 bytes) — hard-enforced at upload |
| Documents | **30** |
| Files | **60** |
| Application packs / bundles | **1** |
| Tracked applications | **3** (active; archived excluded) |
| Active reminders | **10** (counts only enabled reminder rules on non-trashed documents) |
| Active share links | **5** |
| Active document request links | **5** (active statuses only; terminal states free a slot) |
| Active sharing rooms | **3** (active rooms only; expired/revoked/archived free a slot) |
| Emergency packs | **1** |
| Scanner | 5 pages per scanned PDF |
| AI credits | 10 credits/month |

**Pro limits:** 10 GB storage, 1,000 documents, 100 active tracked applications.
Files, bundles, active reminders, share links, and emergency packs are
effectively unlimited (high numeric cap). Scanner and AI: see sections below.

The Application Tracker (`resource "applications"`, Free 3 / Pro 100) counts only
active (non-archived) applications; archiving frees a slot. The tracker itself is
deterministic (no AI) and available to Free and Pro.

Document Request Links (`resource "document_request_links"`, Free **5** / Pro
**100**) count only **active** links — `draft`, `requested`, `opened`,
`uploaded`, `under_review`, `needs_replacement`. Terminal states (`accepted`,
`rejected`, `expired`, `cancelled`) free a slot. The flow is deterministic (no
AI). Public uploads against a link also enforce the **owner's** file and storage
limits, since the uploaded file lands in the owner's vault.

Sharing Rooms (`resource "sharing_rooms"`, Free **3** / Pro **50**) count only
**active** rooms; `expired`, `revoked`, and `archived` rooms free a slot. A
Sharing Room is a secure, owner-scoped workspace that bundles selected
documents/files plus Document Request Links behind one public token (see
`docs/api-spec.md` §35). The flow is deterministic (no AI).

**Storage quota method:** storage used is the sum of stored `DocumentFile.file_size`
values for the user's non-trashed files, computed from the database. Cloudflare R2
is never queried for quota calculation — these are product limits, separate from
R2 infrastructure. R2 remains private (no public bucket, credentials untouched).
Storage is enforced at upload in: normal document file upload, file inbox upload,
scanner save/upload, and file-version replacement. Helpers:
`get_user_storage_used_bytes`, `get_user_storage_limit_bytes`,
`get_user_storage_remaining_bytes`, `can_upload_bytes`, `enforce_storage_limit`.
Friendly copy when the Free limit is hit: "You've reached your Free storage limit
of 100MB. Upgrade to Pro for 10GB."

**Plan-limit violation format:** all limit violations return `HTTP 403` with body
`{ detail, code: "plan_limit_exceeded", resource, limit, plan }`. The `resource`
discriminator (e.g. `"documents"`, `"files"`, `"bundles"`, `"reminders"`,
`"active_share_links"`, `"document_request_links"`, `"sharing_rooms"`,
`"emergency_packs"`, `"storage_bytes"`) identifies which limit was hit. The frontend's single global upgrade paywall keys on
`code: "plan_limit_exceeded"`.

### AI plan limits (monthly credits — enforced)

Seeded by migration `0012` (after `0010`/`0011`):

| | Free | Pro |
| --- | --- | --- |
| `ai_credits_per_month` | **10 credits/month** | **200 credits/month** |
| `ai_indexed_documents` | 3 | 300 |
| Basic AI features (summary, Q&A, deadline extraction, reminder suggestion, extraction) | on | on |
| Premium AI features (multi-doc Q&A, document draft, pack copilot, readiness checks, requirement checklist) | **off** | on |

**Credit costs per feature** (defaults; unknown features default to 1):

| Feature key | Credits |
| --- | --- |
| `document_summary` | 1 |
| `document_qa` | 1 |
| `deadline_extraction` | 1 |
| `reminder_suggestion` | 1 |
| `document_extraction` | 1 |
| `share_readiness` | 2 |
| `bundle_readiness` | 2 |
| `pack_copilot` | 3 |
| `document_draft` | 3 |
| `requirement_link_checklist` | 5 (future) |
| `magic_inbox_triage` | 3 |
| `multi_document_qa` | 5 |
| `long_application_review` | 5 (future) |
| `application_document_generation` — email types (`recommendation_request_email`, `application_email`) | **3** |
| `application_document_generation` — letter types (`cover_letter`, `motivation_letter`, `missing_document_explanation`, `visa_explanation_letter`) | **5** |
| `application_document_generation` — SOP + CV/resume types (`statement_of_purpose`, `ats_resume`, `academic_cv`, `scholarship_cv`) | **8** |

Credits are tracked via a `FeatureUsageCounter` row keyed `"ai_credits"` (monthly
period). The plan allowance is the `"ai_credits_per_month"` entitlement. **Credits
are spent only after a genuinely successful AI call** (`available && reason=="ok"`);
blocked, failed, refused, budget-paused, or consent-missing calls never consume a
credit.

**Single-document Q&A** (with `document_id`) uses the `document_qa` key (basic, Free).
**Whole-vault Q&A** (no `document_id`) uses `multi_document_qa` (Pro-only).

**AI Application Document Generator** (`application_document_generation`) is
**Pro-only** — Free users receive a `200 { available: false, reason: "ai_feature_not_in_plan" }` response with upgrade copy (not an error). Credit cost is
variable by document type (3 / 5 / 8, see table above) and is charged only after
a successful model-backed generation; every other path (consent missing, plan
blocked, provider error, budget block, validation failure) charges 0 credits.
**Editing the draft (`PATCH`), export (PDF/DOCX), and save-to-pack make no AI
call and consume no AI credits**; editing exists so users can review and refine
before export. The structured `warnings` and the `quality_score`/`ats_score`
shown on a draft are **deterministic, AI-free recomputes** — re-running them by
editing content is always free. Export and save-to-pack do consume file count and
storage quota under the normal Free/Pro plan limits (Free: 30 files / 100 MB;
Pro: 1 000 files / 10 GB).

**Magic Inbox smart triage** (`magic_inbox_triage`) is **Pro-only**
(`ai_magic_inbox` entitlement, seeded by billing migration
`0016_ai_magic_inbox_flag`: Free off, Pro/Teams on). AI triage costs **3
credits**, charged **only** after a successful model-backed analysis; every other
path (consent missing, plan blocked, credits exhausted, budget paused, provider
error/not-configured, refusal) charges **0**. **Capturing an item, the
always-on deterministic analysis, and applying suggestions make no AI call and
consume no AI credits.** File intake counts against the normal Free/Pro file and
storage limits.

These are **product entitlements**. They sit alongside — and never replace — the
**infrastructure AI budget guard** (`AI_DAILY_TOKEN_CAP_USER`,
`AI_DAILY_TOKEN_CAP_GLOBAL`, `AI_MONTHLY_COST_LIMIT_USD`), which stays fully active
and fails closed. Entitlement helpers: `entitlements.can_use_ai_feature(user, feature)`,
`remaining_ai_credits(user)`, `can_index_document_for_ai(user)`.

**Backward-compatibility note:** the `ai_actions_per_day` entitlement (seeded in
migration `0010`) is retained in the database for backward compatibility but is **no
longer used for enforcement**. All enforcement is based on `ai_credits_per_month`.

### Model routing

- **Free users:** Haiku only.
- **Pro users:** Haiku by default; Sonnet for heavier features when
  `AI_PRO_SONNET_ENABLED=true` (default off).
- **Opus:** reserved for founder/admin or a deliberate `AI_MODEL` operator override,
  and for system (user=None) calls. Opus is **never** the default model for normal
  Free/Pro AI.

New env vars: `AI_MODEL_HAIKU`, `AI_MODEL_SONNET`, `AI_PRO_SONNET_ENABLED` (default
false). The existing `AI_MODEL` remains the operator/founder override.

### B2B shared AI credit pools

Organization-level credit pools, admin-set limits, and paid top-ups/overages are
**future work** — not implemented in this branch. Planned branch:
**`backend/ai-org-credit-pools`**.

### Scanner plan rules

The scanner stays **mostly free** — it's an acquisition/trust feature, and
CertaNest is a life-admin system, not a paid scanner app. Free users **scan and
save within their vault limits** (never "X scans/month"); Pro unlocks the serious
document workflows.

| Capability | Free | Pro |
| --- | --- | --- |
| Scanner (edge detect, crop, rotate) | Included | Full |
| Basic filters (brightness/contrast/grayscale/B&W) | Included | Included |
| Standard PDF export | Included | Included |
| Multi-page scans | Up to 5 pages/PDF | Unlimited |
| HD PDF export | Limited | Included |
| Advanced enhancement (denoise/sharpen/magic/perspective) | Limited | Included |
| OCR / searchable text | Limited by AI plan | Within AI limits |
| AI extraction from scans | Within AI credits (Free: 10/mo) | Within AI credits (Pro: 200/mo) |
| Auto reminders from scans | Limited | Included (within AI limits) |

Seeded by migration `0011_scanner_plan_limits`:

- `scanner_scans_per_month` → **unlimited on Free** (was 5/month). Scans are
  bounded by the vault file/document/storage limits instead.
- `scanner_max_pages_per_pdf` → Free **5**, Pro unlimited. **Enforced now** in the
  scanner upload view (`apps.documents.scanner`): a Free PDF over the cap returns
  `403 plan_limit_exceeded` so the frontend upgrade paywall picks it up. Basic
  single/few-page scanning is never blocked.
- `scanner_hd_export`, `scanner_advanced_enhancement` → Pro-only **flags**.
  Helpers exist (`entitlements.can_use_scanner_hd(user)`,
  `can_use_scanner_advanced_enhancement(user)`, `scanner_max_pages(user)`).

OCR / AI extraction / auto-reminders from scans are governed by the AI plan
entitlements above (`ai_credits_per_month` / `ai_indexed_documents`) and the AI
budget guard — they are not separately metered here.

> **Follow-up: `scanner/plan-limits-enforcement`** — gate HD export + advanced
> enhancement in the scanner UI (client-side capabilities) with gentle upgrade
> copy. Defining the entitlements + page cap here keeps the scanner usable on
> Free and avoids risky scanner refactoring in the pricing branch.

### Stripe sandbox (USD) setup — live mode NOT enabled

In the Stripe **test** dashboard create two recurring USD prices and paste their
IDs into Railway (test keys only):

- *CertaNest Pro Monthly* — $7.99 USD / month → `STRIPE_PRICE_PRO_MONTHLY`
- *CertaNest Pro Annual* — $79 USD / year → `STRIPE_PRICE_PRO_YEARLY`

Do **not** switch Stripe to live mode in this branch. Family/Teams need no price
IDs (not purchasable).

## Entitlements & feature gating

Use `apps.billing.entitlements`:

```python
entitlements.is_pro(user)
entitlements.get_user_plan(user)            # effective Plan
entitlements.get_user_subscription_status(user)
entitlements.has_feature(user, "smart_intake_enabled")
entitlements.get_feature_limit(user, "documents_limit")  # None = unlimited
entitlements.build_upgrade_context(user, "documents_limit")
```

Downgrade/cancel **never deletes data** — over-limit Free users keep and can view
existing documents; only *new* creates above the limit are blocked (existing
behavior in `plan_usage.enforce_plan_limit`).

## Subscription states

`free, trialing, active, past_due, canceled, unpaid, incomplete,
incomplete_expired, grace_period, beta, founder, lifetime, manual_pro,
org_active, org_past_due`. A `cancel_at_period_end` subscription still grants
access until `current_period_end`; a `grace_period` grants access until
`grace_period_until`.

### Free trials

The **Pro** plan ships with a **14-day, no-card free trial** (`Plan.trial_days=14`,
set in migration `0006`; `trialing` grants paid access). Stripe checkout passes
`trial_period_days`; the manual provider starts a `trialing` sub directly. The
pricing UI shows "14-day free trial · no card required" and a "Start 14-day free
trial" CTA. Trial end:

- **Stripe** is provider-driven (trial-end invoice → `active`, or dunning if no card).
- **Manual / no-provider** trials are expired by the `sync_billing_access` cron
  when `trial_end` passes → status `free` + a `billing_trial_ended` email. Scoped
  to `provider_subscription_id=""` so it never fights Stripe webhooks.

Adjust or disable per plan via `Plan.trial_days` (admin) or reverse migration `0006`.

## Local development (manual provider)

Default config (`BILLING_PROVIDER=manual`, `BILLING_TEST_MODE=true`) needs no
Stripe account:

1. `POST /api/v1/billing/checkout/ {plan_key:"pro", interval:"month"}` activates
   a Pro subscription immediately and returns the success URL.
2. `GET /api/v1/billing/status/` reflects Pro; usage limits unlock.
3. The founder console can grant/revoke manual access and create promo codes.

## Stripe setup (production)

1. Create products + recurring prices in the Stripe dashboard.
2. Set env: `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`,
   `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, and the `STRIPE_PRICE_*`
   IDs. Put the price IDs on each `Plan` (`monthly_provider_price_id` /
   `yearly_provider_price_id`) via admin.
3. `pip install stripe` (imported lazily; optional in dev).
4. Configure a webhook endpoint pointing at
   `POST /api/v1/billing/webhook/stripe/` for: `checkout.session.completed`,
   `customer.subscription.created|updated|deleted`, `invoice.paid`,
   `invoice.payment_failed`, `invoice.payment_action_required`.
5. Local webhook testing: `stripe listen --forward-to
   localhost:8000/api/v1/billing/webhook/stripe/`.

### Webhooks
Signatures are verified inside the provider adapter
(`stripe.Webhook.construct_event`). Processing is **idempotent**: a unique
`BillingEvent.provider_event_id` means a re-delivered event is ignored. Unknown
event types never crash (recorded as `ignored`). Webhook state is the source of
truth — the success redirect alone is not trusted.

## Promo / reduction codes

Types: `percentage_discount, fixed_discount, trial_extension, free_months,
founder_discount, beta_access, student_discount, referral_credit, manual_code`.
Validation (`apps.billing.promo.validate_promo_code`) checks existence, active
window, plan/interval eligibility, and global + per-user redemption limits, and
returns calm user-facing reasons. Founders create codes in the billing console
or via `POST /api/v1/founder/billing/promo-codes/`.

## Founder / admin

`/api/v1/founder/billing/{overview,subscribers,promo-codes,manual-access,events}`
plus `receipts/{settings,test-send}` (staff/superuser only). The console shows
MRR/ARR **estimates derived from app data** (not provider financial reports),
subscribers, promo management, manual Pro/beta/founder grants (logged +
revocable), and the branded-receipt configuration (below).

## Branded receipts

CertaNest can email a **branded receipt** when a subscription payment succeeds
(Stripe `invoice.paid` / `invoice.payment_succeeded`, and the manual/dev provider
on a non-trial activation). Receipts are **off by default** and founder-configured
from the founder console (Billing tab) via `ReceiptSettings` (singleton):

- `enabled` — master switch.
- `mode` — `email_link` (branded email + provider's hosted invoice/PDF),
  `email_pdf` (branded email + a CertaNest-generated `fpdf2` PDF attachment), or
  `email_only`.
- `send_for_manual` — also send for the offline manual provider (dev/demo).
- `business_legal_name` / `business_address` / `tax_id` / `support_email` —
  optional merchant details printed on the receipt (blank shows CertaNest branding
  only; the template/PDF render them only when present).

Sending lives in `apps/billing/receipts.py`, reuses the branded email shell
(`templates/emails/payment_receipt.{html,txt}`), and is:

- **Idempotent** — guarded by `InvoiceRecord.receipt_sent_at` (atomic claim), so
  retried webhooks send exactly one receipt per invoice.
- **Non-fatal** — receipt failures never break webhook/checkout handling, and a
  failed send releases the claim so a later retry can resend.
- **Skipped when email isn't configured** (`EMAIL_CONFIGURED`) — logged, not sent.

`POST /founder/billing/receipts/test-send/` emails a sample receipt (in the
configured format) to the founder to preview it; it touches no `InvoiceRecord`.

Receipts carry a **sequential human number** (`DN-<year>-<seq>`, assigned under a
row lock on the settings singleton so concurrent sends never collide) and split
out a **tax line** when the provider invoice reports `tax`. Both surface in the
email, the generated PDF, and the user's Billing-history list
(`receipt_number` / `tax_amount` on `InvoiceRecord`).

## Lifecycle & dunning emails

Branded billing emails fire at existing trigger points (`apps/billing/
lifecycle_email.py`, sharing the `billing_lifecycle` template). They are
founder-editable transactional-registry entries (subject/body + on/off via the
founder **Emails** page) and flow through the shared suppression-aware sender:

| Key | Trigger | Category |
| --- | --- | --- |
| `billing_payment_failed` | `invoice.payment_failed` webhook (`_handle_payment_failed`) | transactional (essential) |
| `billing_payment_failed_followup` | `sync_billing_access` cron, N days after a failed payment (off unless configured) | transactional (essential) |
| `billing_trial_ending` | `sync_billing_access` cron, trial ends within the lead time | lifecycle |
| `billing_renewal_upcoming` | `sync_billing_access` cron, active sub renews within the lead time | lifecycle |
| `billing_subscription_canceled` | `customer.subscription.deleted` webhook + cron cancel-at-period-end expiry | lifecycle |
| `billing_refund` | `charge.refunded` webhook (`_handle_refund`) | transactional (essential) |
| `billing_trial_ended` | `sync_billing_access` cron, manual trial expired → Free | lifecycle |

Cron emails are **deduped** per cycle via `sub.metadata['lifecycle_emails']`, so
the daily run emails once per trial/renewal — not every run. Dunning is
`transactional` (essential, never suppressed by a marketing unsubscribe);
retention nudges are `lifecycle` (carry `List-Unsubscribe`, honour unsubscribe).

### Founder configuration

- **Content + on/off** for every email above is edited on the founder **Emails**
  page (`/dashboard/founder/emails`), which also has a **live HTML preview** and
  **"Send test to me"** per email (`/founder/email-preview/` + the per-key
  `…/test-send/` endpoints; sends even when an email is toggled off).
- **Timing & triggers** are founder-configurable on the **Billing** tab via the
  `BillingEmailSettings` singleton (`/founder/billing/email-settings/`):
  `trial_ending_days_before`, `renewal_upcoming_days_before`, `grace_period_days`,
  and `dunning_followup_days` (0 = off; validated `< grace_period_days`). The
  webhook reads the grace length; the cron reads the lead times + follow-up delay.

## Security

- Secret keys live only in backend env; only `STRIPE_PUBLISHABLE_KEY` is client-safe.
- Checkout/portal sessions are created server-side for authenticated users.
- The frontend never sends prices — only a validated `plan_key` + `interval`.
- Webhook signatures verified; idempotent; payloads not logged verbatim.
- Founder billing endpoints require `IsFounderUser`.
- Promo validation is rate-limited (`billing_promo` throttle scope).

## Tax & invoices

Use Stripe Tax / provider tax features in production (not custom-calculated
here). `InvoiceRecord` mirrors provider invoices (hosted URL + PDF) for in-app
billing history. Collect billing country via the provider checkout/portal.

## Limitations / TODO

- Live Stripe checkout/portal/webhook **not verified** in this environment.
- Monthly metered features (scanner scans/OCR pages per month) are defined as
  entitlements and surfaced, but **enforcement is not yet wired** into those
  create paths (documents/files/bundles/reminders/shares/emergency packs are
  enforced today via the existing `plan_usage`). Wiring monthly meters is a
  follow-up.
- Referral credits, family/org seat checkout, and storage/OCR add-ons are
  model-ready but not fully implemented in the UI.
