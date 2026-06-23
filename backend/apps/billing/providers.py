"""
Provider-aware billing adapters.

``manual`` works fully offline (local dev / tests / demos) and drives the same
subscription state machine without a real payment. ``stripe`` calls the Stripe
API and requires STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET; it is written to be
correct but is **not exercised in this environment** (no Stripe credentials).

Adding HitPay/Xendit/PayPal later means adding another adapter here — nothing
else in the app needs to know which provider is active.
"""

from __future__ import annotations

import json

from django.conf import settings


class BillingError(Exception):
    """A billing operation failed (bad config, provider error, etc.)."""


def get_provider_name() -> str:
    return getattr(settings, "BILLING_PROVIDER", "manual") or "manual"


def manual_provider_allowed() -> bool:
    """Whether the unsigned manual provider may run in this environment.

    Allowed only in DEBUG (local dev) or when explicitly enabled via
    ``BILLING_ALLOW_MANUAL_PROVIDER`` (dev/test). Production fails closed.
    """
    return bool(getattr(settings, "DEBUG", False)) or bool(
        getattr(settings, "BILLING_ALLOW_MANUAL_PROVIDER", False)
    )


def validate_billing_configuration() -> None:
    """Fail closed on insecure billing configuration (SEC-004).

    * ``manual`` provider is rejected unless explicitly allowed (never in prod).
    * ``stripe`` provider requires its secret/publishable/webhook keys so the
      webhook signature can actually be verified.

    Called at production boot (config/settings/production.py) and defensively by
    :func:`get_provider`, so a misconfigured deployment cannot silently accept
    unsigned webhooks or run without a paywall.
    """
    name = get_provider_name()
    if name == "manual":
        if not manual_provider_allowed():
            raise BillingError(
                "BILLING_PROVIDER=manual is not allowed in this environment. "
                "Set BILLING_PROVIDER=stripe (with its keys) for production."
            )
        return
    if name == "stripe":
        missing = [
            key
            for key in (
                "STRIPE_SECRET_KEY",
                "STRIPE_PUBLISHABLE_KEY",
                "STRIPE_WEBHOOK_SECRET",
            )
            if not getattr(settings, key, "")
        ]
        if missing:
            raise BillingError(
                "Stripe billing is selected but missing required configuration: "
                + ", ".join(missing)
            )
        return
    raise BillingError(f"Unknown BILLING_PROVIDER: {name!r}.")


# Maps a plan's (key, interval) to the STRIPE_PRICE_* setting holding its Stripe
# price ID, so prices can be configured entirely from the environment (Railway)
# with no DB edit. The per-plan DB value always takes precedence when set.
_ENV_PRICE_SETTINGS = {
    ("pro", "month"): "STRIPE_PRICE_PRO_MONTHLY",
    ("pro", "year"): "STRIPE_PRICE_PRO_YEARLY",
    ("organization", "month"): "STRIPE_PRICE_ORG_SEAT_MONTHLY",
    ("organization", "year"): "STRIPE_PRICE_ORG_SEAT_YEARLY",
    ("family", "month"): "STRIPE_PRICE_FAMILY_MONTHLY",
    ("family", "year"): "STRIPE_PRICE_FAMILY_YEARLY",
}


def _price_id_for(plan, interval: str) -> str:
    db_value = (
        plan.yearly_provider_price_id
        if interval == "year"
        else plan.monthly_provider_price_id
    )
    if db_value:
        return db_value
    setting_name = _ENV_PRICE_SETTINGS.get((plan.key, interval))
    return getattr(settings, setting_name, "") if setting_name else ""


# ---- Manual provider (offline dev/test) ------------------------------------


class ManualProvider:
    name = "manual"

    def create_checkout_session(self, *, user, plan, interval, promo_code=None, profile=None):
        # No real payment: the service activates the subscription directly and
        # sends the user straight to the success page. Dev/test convenience.
        return {"url": settings.BILLING_SUCCESS_URL, "session_id": f"manual_{user.id}", "manual": True}

    def create_portal_session(self, *, user, profile=None):
        return {"url": settings.BILLING_PORTAL_RETURN_URL, "manual": True}

    def verify_and_parse_webhook(self, payload: bytes, sig_header: str) -> dict:
        # Manual mode accepts a plain JSON body (used by tests / local tooling).
        try:
            data = json.loads(payload.decode("utf-8"))
        except (ValueError, UnicodeDecodeError) as exc:
            raise BillingError("Invalid webhook payload.") from exc
        if not data.get("id") or not data.get("type"):
            raise BillingError("Webhook payload missing id/type.")
        return data


# ---- Stripe provider (live; untested in this environment) ------------------


class StripeProvider:
    name = "stripe"

    def _client(self):
        if not settings.STRIPE_SECRET_KEY:
            raise BillingError(
                "Stripe is not configured. Set STRIPE_SECRET_KEY or use "
                "BILLING_PROVIDER=manual for local development."
            )
        try:
            import stripe  # lazy import; package optional in dev
        except ImportError as exc:  # pragma: no cover - depends on env
            raise BillingError(
                "The 'stripe' package is not installed. Run `pip install stripe`."
            ) from exc
        stripe.api_key = settings.STRIPE_SECRET_KEY
        return stripe

    def create_checkout_session(self, *, user, plan, interval, promo_code=None, profile=None):
        stripe = self._client()
        price_id = _price_id_for(plan, interval)
        if not price_id:
            raise BillingError("No provider price configured for this plan/interval.")
        params = {
            "mode": "subscription",
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": settings.BILLING_SUCCESS_URL,
            "cancel_url": settings.BILLING_CANCEL_URL,
            "client_reference_id": str(user.id),
            "metadata": {"user_id": str(user.id), "plan_key": plan.key},
            "allow_promotion_codes": True,
        }
        if plan.trial_days:
            params["subscription_data"] = {"trial_period_days": plan.trial_days}
        if profile and profile.provider_customer_id:
            params["customer"] = profile.provider_customer_id
        else:
            params["customer_email"] = user.email or None
        if promo_code and promo_code.provider_promotion_code_id:
            params["discounts"] = [
                {"promotion_code": promo_code.provider_promotion_code_id}
            ]
            params.pop("allow_promotion_codes", None)
        session = stripe.checkout.Session.create(**params)
        return {"url": session.url, "session_id": session.id, "manual": False}

    def create_portal_session(self, *, user, profile=None):
        stripe = self._client()
        if not (profile and profile.provider_customer_id):
            raise BillingError("No billing customer exists yet for this user.")
        session = stripe.billing_portal.Session.create(
            customer=profile.provider_customer_id,
            return_url=settings.BILLING_PORTAL_RETURN_URL,
        )
        return {"url": session.url, "manual": False}

    def verify_and_parse_webhook(self, payload: bytes, sig_header: str) -> dict:
        stripe = self._client()
        secret = settings.STRIPE_WEBHOOK_SECRET
        if not secret:
            raise BillingError("STRIPE_WEBHOOK_SECRET is not configured.")
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, secret)
        except Exception as exc:  # stripe.error.SignatureVerificationError etc.
            raise BillingError("Webhook signature verification failed.") from exc
        return event


def get_provider():
    name = get_provider_name()
    if name == "stripe":
        return StripeProvider()
    # Defense in depth: never hand back the unsigned manual provider where it is
    # not permitted (e.g. a production box misconfigured to BILLING_PROVIDER=manual).
    if not manual_provider_allowed():
        raise BillingError(
            "Manual billing provider is disabled in this environment."
        )
    return ManualProvider()
