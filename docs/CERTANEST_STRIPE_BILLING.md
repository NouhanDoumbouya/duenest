# CertaNest — Stripe Subscription Billing (Deployment)

> How to switch the existing, provider-agnostic billing system from the `manual`
> provider (local/dev) to live **Stripe** subscriptions in production. The code
> is already implemented (`apps/billing`); this is the configuration + dashboard
> setup. Related: [`DEPLOYMENT.md`](DEPLOYMENT.md),
> [`CERTANEST_PRODUCTION_DOMAINS.md`](CERTANEST_PRODUCTION_DOMAINS.md).

## How it works (no card data stored)

- `apps/billing` has a **provider abstraction** (`providers.py`): `manual`
  (offline dev/test) and `stripe`. `BILLING_PROVIDER` selects which is active.
- Checkout uses **Stripe Checkout** (`mode=subscription`, hosted page) — the
  backend creates a session and returns `session.url`; the frontend redirects to
  it. **No Stripe.js or card data touches our servers.**
- Customers manage their plan via the **Stripe Customer Portal**.
- Subscription state is synced by **idempotent webhooks** (deduped on a unique
  `provider_event_id` in `BillingEvent`). We store only Stripe **IDs + state**
  (`CustomerBillingProfile.provider_customer_id`,
  `UserSubscription.provider_subscription_id`, status, period dates, etc.).
- Production **fails closed**: `config/settings/production.py` calls
  `validate_billing_configuration()`, which refuses to boot if
  `BILLING_PROVIDER=manual` or if Stripe is selected without its keys.

## Endpoints (already live)

| Method | Path | Auth |
| --- | --- | --- |
| `POST` | `/api/v1/billing/checkout/` | user (JWT) |
| `POST` | `/api/v1/billing/portal/` | user (JWT) |
| `GET`  | `/api/v1/billing/status/` | user (JWT) |
| `POST` | `/api/v1/billing/webhook/stripe/` | **public** (Stripe signature; CSRF-exempt; no JWT) |

> The webhook path is `…/billing/webhook/stripe/` (the project's existing
> convention), not `…/billing/stripe/webhook/`.

## 1. Stripe Dashboard — products & prices

1. In Stripe, create **Products** with recurring **Prices** (do not hardcode in
   code). For CertaNest the plans are `pro` and `organization`:
   - **CertaNest Pro** → a monthly price + a yearly price.
   - **CertaNest Organization** (per-seat) → monthly + yearly, if offered.
2. Copy each **Price ID** (`price_...`). Two ways to configure them (the first
   non-empty wins):
   - **Env (recommended):** set `STRIPE_PRICE_PRO_MONTHLY` etc. (below).
   - **DB:** Founder admin can set `monthly/yearly_provider_price_id` on a
     `Plan` row — this overrides the env value.
3. (Optional) Create **promotion codes** in Stripe; the checkout passes
   `allow_promotion_codes` and can apply a specific promo.

## 2. Railway (backend) env vars

```env
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_live_...            # SECRET — backend only, never exposed
STRIPE_PUBLISHABLE_KEY=pk_live_...       # client-safe (only key safe to expose)
STRIPE_WEBHOOK_SECRET=whsec_...          # from the webhook you create in step 4

# Price IDs (per plan/interval) — from step 1
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_ORG_SEAT_MONTHLY=price_...   # if Organization is offered
STRIPE_PRICE_ORG_SEAT_YEARLY=price_...

# Where Stripe returns the user (use the app domain)
BILLING_SUCCESS_URL=https://app.certanest.com/dashboard/settings/billing?checkout=success
BILLING_CANCEL_URL=https://app.certanest.com/dashboard/settings/billing?checkout=cancelled
BILLING_PORTAL_RETURN_URL=https://app.certanest.com/dashboard/settings/billing
```

`requirements.txt` now pins `stripe==15.2.1` (lazy-imported; only used when
`BILLING_PROVIDER=stripe`).

## 3. Vercel (frontend) env vars

The hosted-Checkout flow redirects to `session.url`, so the frontend does **not**
need a secret key. **Never** put `STRIPE_SECRET_KEY` or `STRIPE_WEBHOOK_SECRET`
in Vercel. Only if you later add Stripe.js/Elements would you expose:

```env
# Optional, only if Stripe.js is added later (client-safe publishable key):
# NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

## 4. Stripe webhook endpoint

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**.
2. URL: `https://api.certanest.com/api/v1/billing/webhook/stripe/`
3. Select events (minimum):
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded` (and/or `invoice.paid`)
   - `invoice.payment_failed`
   - `invoice.payment_action_required`
   - `customer.subscription.trial_will_end` *(trial-ending heads-up email)*
   - `invoice.upcoming` *(renewal heads-up email before the next charge)*
   - *(optional, handled too:* `charge.refunded`*)*
4. Copy the endpoint's **Signing secret** (`whsec_...`) into
   `STRIPE_WEBHOOK_SECRET` (step 2). The signature is verified against the **raw
   request body**; a forged/invalid signature is rejected with 400.

## 5. Manual production test (test mode first)

1. Set Railway to **test** keys (`sk_test_`, `pk_test_`) + a test-mode webhook.
2. `GET /api/v1/health/` → `{"service":"certanest-backend"}`.
3. Sign in to `app.certanest.com`, start an upgrade → `POST /billing/checkout/`
   returns a `url`; you're redirected to Stripe Checkout.
4. Pay with the Stripe test card `4242 4242 4242 4242` (any future expiry/CVC).
5. Stripe fires `checkout.session.completed` + `customer.subscription.created`
   to the webhook; confirm in **Stripe → Webhooks** (200s) and in Railway logs.
6. `GET /billing/status/` now shows the active/trialing subscription;
   `is_pro(user)` is true.
7. Cancel via either path: `POST /billing/cancel/` (the in-app button) now calls
   Stripe directly (`cancel_at_period_end=true`) — access continues until period
   end, then a webhook flips status; `POST /billing/resume/` undoes it. The Stripe
   Customer Portal (`POST /billing/portal/`) still works too. If the provider is
   unreachable, cancel returns `502` and does NOT mark the plan canceled locally.
8. Replay a webhook from the Stripe dashboard → handler returns
   `{"status":"ignored","reason":"duplicate"}` (idempotent).
9. When verified, swap to **live** keys + a live webhook and repeat a real charge.

## 6. Security & rollback

- Secrets only in Railway; only `STRIPE_PUBLISHABLE_KEY` is ever client-safe.
- We store Stripe IDs + subscription state only — **no card numbers**.
- Webhook is signature-verified, CSRF-exempt, and JWT-free (as Stripe requires).
- **Rollback:** set `BILLING_PROVIDER=manual` only in a non-prod env
  (`BILLING_ALLOW_MANUAL_PROVIDER=true`); production refuses `manual`. To pause
  new charges, disable the Stripe webhook + remove price env vars; existing
  subscriptions are unaffected. No DB migration is involved in this change.

## Helpers for gating (when you add it later)

Plan checks already exist in `apps/billing/entitlements.py` — use these rather
than re-reading Stripe:

- `is_pro(user)` — has paid (Pro-or-better) access (manual grant **or** active sub).
- `get_effective_subscription(user)` / `get_user_subscription_status(user)`.
- `has_feature(user, key)` / `enforce_feature_usage(user, key)` for limits.
