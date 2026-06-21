# Pricing / Plan & Feature Gates

> Documents **existing**, mature code (`apps/billing`, `apps/features`). Recorded for
> Phase 17. No fake billing is introduced.

## Scope

Real plans, entitlements, and a feature-gate service, plus per-feature flags. Premium
features can be gated without faking checkout.

## Models (`apps/billing/models.py`)

`Plan`, `PlanEntitlement`, `CustomerBillingProfile`, `UserSubscription`, `PromoCode`,
`PromoRedemption`, `BillingEvent`, `InvoiceRecord`, `ManualAccessGrant`,
`FeatureUsageCounter`, plus receipt/email settings.

## Entitlement service (`apps/billing/entitlements.py`)

- `get_effective_subscription(user)`, `get_user_plan(user)`, `get_user_subscription_status`,
  `is_pro(user)`.
- `get_user_entitlements(user)` → dict keyed by `feature_key` (the gate source of truth),
  honoring `ManualAccessGrant` (manual/dev plan assignment) without a payment.

## Feature flags (`apps/features`)

`is_feature_enabled(key, user)` / `require_feature_enabled(key, user)` (503 when paused).
Unknown keys default **enabled** (`FEATURE_DEFAULTS`), so new gated features ship on and
are pausable/premium-gateable later — e.g. the new `fill_sign` flag.

## Billing not configured

Stripe integration exists (webhook + `test_webhook_security.py`). When Stripe keys are
absent the system must **not** fake checkout/payment success — premium can be granted via
`ManualAccessGrant` for dev/testing only.

## Plan intent (per product decision)

- **Free:** basic Vault/scanner/reminders, limited packs, basic SafeSend (stays free).
- **Premium:** advanced tools, Fill & Sign, AI (intake/chat/generation), advanced SafeSend,
  custom QR, more packs.
- **Portal/Org:** document requests, applicant profiles, review workflows, templates.

## Security

No secrets logged; webhook signature verified; entitlements are server-derived.

## Status

Implemented + tested. Live payments need Stripe keys; gating works today via flags +
entitlements + manual grants.
