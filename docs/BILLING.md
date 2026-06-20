# Billing, Plans & Promo Codes

DueNest's own monetization layer (the `apps.billing` app). This is **separate**
from `apps.subscriptions`, which tracks a *user's own* recurring payments
(Netflix, Spotify, …). This document covers DueNest's plans, entitlements,
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

Seeded by migration `0002_seed_plans` (editable later via Django admin without
code changes): **Free**, **Pro** ($5.99/mo, $59/yr), **Organization** (per-seat
pilot). Prices are stored as integer minor units. Suggested regional/beta prices
live in `Plan.metadata`. Provider price IDs come from env (`STRIPE_PRICE_*`).

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

DueNest can email a **branded receipt** when a subscription payment succeeds
(Stripe `invoice.paid` / `invoice.payment_succeeded`, and the manual/dev provider
on a non-trial activation). Receipts are **off by default** and founder-configured
from the founder console (Billing tab) via `ReceiptSettings` (singleton):

- `enabled` — master switch.
- `mode` — `email_link` (branded email + provider's hosted invoice/PDF),
  `email_pdf` (branded email + a DueNest-generated `fpdf2` PDF attachment), or
  `email_only`.
- `send_for_manual` — also send for the offline manual provider (dev/demo).
- `business_legal_name` / `business_address` / `tax_id` / `support_email` —
  optional merchant details printed on the receipt (blank shows DueNest branding
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
