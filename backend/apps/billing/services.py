"""
Billing orchestration: checkout, portal, webhook processing (idempotent),
manual grants, and the status payload the UI reads.

Webhook events are the source of truth for provider-backed subscriptions. The
``manual`` provider activates subscriptions directly (no real payment) so the
whole flow can be exercised offline.
"""

from __future__ import annotations

import hashlib

from django.db import IntegrityError, transaction
from django.utils import timezone

from . import entitlements, promo as promo_service
from .models import (
    BillingEmailSettings,
    BillingEvent,
    CustomerBillingProfile,
    InvoiceRecord,
    ManualAccessGrant,
    Plan,
    PromoCode,
    UserSubscription,
)
from .providers import BillingError, get_provider, get_provider_name

VALID_INTERVALS = ("month", "year")


def notify_billing(user, notification_type, title, message, severity="info", suffix=""):
    """
    Create an in-app billing notification. Imported lazily to avoid an import
    cycle and never raises — a notification failure must not break billing.
    """
    if user is None:
        return
    try:
        from apps.notifications.services import (
            NotificationCandidate,
            create_notification,
            sanitize_metadata,
        )

        create_notification(
            NotificationCandidate(
                user=user,
                type=notification_type,
                title=title[:255],
                message=message,
                severity=severity,
                source_type="billing",
                source_id=str(user.id),
                action_url="/dashboard/settings/billing",
                scheduled_for=timezone.now(),
                dedupe_key=f"billing:{user.id}:{notification_type}:{suffix}"[:255],
                metadata=sanitize_metadata({}),
            )
        )
    except Exception:  # noqa: BLE001 — notifications must never break billing
        pass


def get_or_create_billing_profile(user) -> CustomerBillingProfile:
    profile, _ = CustomerBillingProfile.objects.get_or_create(
        user=user,
        defaults={
            "provider": get_provider_name(),
            "billing_email": user.email or "",
        },
    )
    return profile


def _get_purchasable_plan(plan_key: str) -> Plan:
    plan = Plan.objects.filter(key=plan_key, is_active=True).first()
    if plan is None or plan.is_free:
        raise BillingError("Unknown or non-purchasable plan.")
    return plan


def start_checkout(user, plan_key: str, interval: str, raw_promo: str = "") -> dict:
    """
    Validate inputs, optionally apply a promo, and create a provider checkout
    session. In manual mode the subscription is activated immediately.
    """
    if interval not in VALID_INTERVALS:
        raise BillingError("Invalid billing interval.")
    plan = _get_purchasable_plan(plan_key)

    promo_code = None
    if raw_promo:
        result = promo_service.validate_promo_code(
            raw_promo, user=user, plan_key=plan_key, interval=interval
        )
        if not result.valid:
            raise BillingError(result.reason)
        promo_code = result.code

    profile = get_or_create_billing_profile(user)
    provider = get_provider()
    session = provider.create_checkout_session(
        user=user, plan=plan, interval=interval, promo_code=promo_code, profile=profile
    )

    if session.get("manual"):
        _activate_manual_subscription(user, plan, interval, promo_code)
    return session


def _activate_manual_subscription(user, plan, interval, promo_code) -> UserSubscription:
    """Dev/test path: activate a subscription without a real payment."""
    amount = plan.yearly_price if interval == "year" else plan.monthly_price
    now = timezone.now()
    period_end = now + timezone.timedelta(days=365 if interval == "year" else 30)
    # Start a trial when the plan offers one.
    trial_start = trial_end = None
    sub_status = UserSubscription.Status.ACTIVE
    if plan.trial_days:
        trial_start = now
        trial_end = now + timezone.timedelta(days=plan.trial_days)
        period_end = trial_end
        sub_status = UserSubscription.Status.TRIALING
    sub, _ = UserSubscription.objects.update_or_create(
        user=user,
        provider="manual",
        defaults=dict(
            plan=plan,
            status=sub_status,
            billing_interval=interval,
            currency=plan.currency,
            amount=amount or 0,
            current_period_start=now,
            current_period_end=period_end,
            trial_start=trial_start,
            trial_end=trial_end,
            cancel_at_period_end=False,
            canceled_at=None,
            active_promo_code=promo_code,
        ),
    )
    if promo_code:
        promo_service.record_redemption(
            promo_code, user, subscription=sub, currency=plan.currency
        )
    entitlements.sync_user_plan(user)
    # A real (non-trial) manual activation is a "payment" in dev/demo: mirror an
    # invoice and send a branded receipt if receipts are on for the manual
    # provider. Trials don't charge, so they get no receipt.
    if sub.status == UserSubscription.Status.ACTIVE and (amount or 0) > 0:
        _record_manual_payment(sub)
    return sub


def _record_manual_payment(sub) -> None:
    """Mirror a manual (no real charge) payment as an InvoiceRecord and send a
    branded receipt. Gated on receipts being enabled for the manual provider;
    never raises into the checkout flow."""
    try:
        from . import receipts

        cfg = receipts.ReceiptSettings.load()
        if not (cfg.enabled and cfg.send_for_manual):
            return
        now = timezone.now()
        invoice, _ = InvoiceRecord.objects.update_or_create(
            provider_invoice_id=f"manual-{sub.id}-{int(now.timestamp())}",
            defaults=dict(
                user=sub.user,
                subscription=sub,
                amount_due=sub.amount,
                amount_paid=sub.amount,
                currency=sub.currency,
                status="paid",
                period_start=sub.current_period_start,
                period_end=sub.current_period_end,
                paid_at=now,
            ),
        )
        receipts.send_receipt_for_invoice(invoice)
    except Exception:  # noqa: BLE001 — receipts must never break billing
        pass


def open_billing_portal(user) -> dict:
    profile = get_or_create_billing_profile(user)
    provider = get_provider()
    return provider.create_portal_session(user=user, profile=profile)


def cancel_subscription(user, at_period_end: bool = True) -> UserSubscription | None:
    """Mark the user's subscription to cancel at period end (manual provider)."""
    sub = entitlements.get_effective_subscription(user)
    if not sub:
        return None
    sub.cancel_at_period_end = True
    sub.canceled_at = timezone.now()
    sub.save(update_fields=["cancel_at_period_end", "canceled_at", "updated_at"])
    return sub


def resume_subscription(user) -> UserSubscription | None:
    sub = entitlements.get_effective_subscription(user)
    if not sub or not sub.cancel_at_period_end:
        return None
    sub.cancel_at_period_end = False
    sub.canceled_at = None
    sub.save(update_fields=["cancel_at_period_end", "canceled_at", "updated_at"])
    entitlements.sync_user_plan(user)
    return sub


# ---- Manual admin grants ---------------------------------------------------


def grant_manual_access(
    *, user, plan, grant_status, reason="", granted_by=None, ends_at=None
) -> ManualAccessGrant:
    grant = ManualAccessGrant.objects.create(
        user=user,
        plan=plan,
        grant_status=grant_status,
        reason=reason,
        granted_by=granted_by,
        ends_at=ends_at,
    )
    entitlements.sync_user_plan(user)
    return grant


def revoke_manual_access(grant: ManualAccessGrant) -> None:
    grant.is_active = False
    grant.save(update_fields=["is_active", "updated_at"])
    entitlements.sync_user_plan(grant.user)


# ---- Webhook processing (idempotent) ---------------------------------------

_STRIPE_STATUS_MAP = {
    "trialing": UserSubscription.Status.TRIALING,
    "active": UserSubscription.Status.ACTIVE,
    "past_due": UserSubscription.Status.PAST_DUE,
    "canceled": UserSubscription.Status.CANCELED,
    "unpaid": UserSubscription.Status.UNPAID,
    "incomplete": UserSubscription.Status.INCOMPLETE,
    "incomplete_expired": UserSubscription.Status.INCOMPLETE_EXPIRED,
}


def _resolve_user_from_event(obj: dict):
    """Best-effort: map a provider object to a local user."""
    ref = obj.get("client_reference_id") or (obj.get("metadata") or {}).get("user_id")
    if ref:
        from apps.users.models import User

        user = User.objects.filter(pk=ref).first()
        if user:
            return user
    customer_id = obj.get("customer")
    if customer_id:
        profile = CustomerBillingProfile.objects.filter(
            provider_customer_id=customer_id
        ).first()
        if profile:
            return profile.user
        sub = UserSubscription.objects.filter(
            provider_customer_id=customer_id
        ).first()
        if sub:
            return sub.user
    return None


def handle_webhook(payload: bytes, sig_header: str) -> dict:
    """
    Verify, dedupe, and apply a provider webhook event. Returns a small status
    dict. Never raises on unknown event types.
    """
    provider = get_provider()
    event = provider.verify_and_parse_webhook(payload, sig_header)
    event_id = str(event.get("id"))
    event_type = str(event.get("type"))
    payload_hash = hashlib.sha256(payload).hexdigest()

    # Idempotency: a unique provider_event_id guards against double-processing.
    try:
        with transaction.atomic():
            record = BillingEvent.objects.create(
                provider=provider.name,
                provider_event_id=event_id,
                event_type=event_type,
                payload_hash=payload_hash,
                status=BillingEvent.Status.PROCESSED,
            )
    except IntegrityError:
        return {"status": "ignored", "reason": "duplicate", "event_id": event_id}

    try:
        obj = (event.get("data") or {}).get("object") or {}
        _apply_event(event_type, obj, record)
    except Exception as exc:  # noqa: BLE001 — record failure, ack to avoid retries storm
        record.status = BillingEvent.Status.FAILED
        record.error_message = str(exc)[:255]
        record.save(update_fields=["status", "error_message"])
        return {"status": "error", "event_id": event_id}
    return {"status": "processed", "event_type": event_type, "event_id": event_id}


def _apply_event(event_type: str, obj: dict, record: BillingEvent) -> None:
    if event_type in ("customer.subscription.created", "customer.subscription.updated"):
        _upsert_subscription_from_event(obj, record)
    elif event_type == "customer.subscription.deleted":
        _mark_subscription_canceled(obj, record)
    elif event_type == "checkout.session.completed":
        _handle_checkout_completed(obj, record)
    elif event_type in ("invoice.paid", "invoice.payment_succeeded"):
        _record_invoice(obj, record, paid=True)
    elif event_type in ("invoice.payment_failed", "invoice.payment_action_required"):
        _handle_payment_failed(obj, record)
    elif event_type == "charge.refunded":
        _handle_refund(obj, record)
    else:
        record.status = BillingEvent.Status.IGNORED
        record.save(update_fields=["status"])


def _handle_refund(obj, record):
    """Email a refund confirmation. Resolves the user via the charge's customer."""
    customer = obj.get("customer", "")
    user = None
    if customer:
        sub = (
            UserSubscription.objects.filter(provider_customer_id=customer)
            .select_related("user")
            .first()
        )
        if sub:
            user = sub.user
        if user is None:
            prof = (
                CustomerBillingProfile.objects.filter(provider_customer_id=customer)
                .select_related("user")
                .first()
            )
            if prof:
                user = prof.user
    if user is None:
        record.status = BillingEvent.Status.IGNORED
        record.save(update_fields=["status"])
        return
    from .lifecycle_email import send_refund_email

    send_refund_email(
        user,
        amount_minor=obj.get("amount_refunded", 0) or 0,
        currency=obj.get("currency", "usd") or "usd",
    )


def _user_subscription_for(obj, record):
    user = _resolve_user_from_event(obj)
    if user:
        record.user = user
        record.save(update_fields=["user"])
    sub_id = obj.get("id") if obj.get("object") == "subscription" else obj.get("subscription")
    sub = None
    if sub_id:
        sub = UserSubscription.objects.filter(provider_subscription_id=sub_id).first()
    if sub is None and user is not None:
        sub = entitlements.get_effective_subscription(user)
    return user, sub, sub_id


def _plan_terms_from_obj(obj):
    """
    Resolve (plan, interval, amount) from a subscription object's price ID by
    matching it against the configured provider price IDs on each Plan. Returns
    (None, None, None) when no price is present or it doesn't match a plan.
    """
    from django.db.models import Q

    items = (obj.get("items") or {}).get("data") or []
    price = items[0].get("price") if items and isinstance(items[0], dict) else None
    if not price:
        return None, None, None
    price_id = price.get("id")
    interval = (price.get("recurring") or {}).get("interval")
    amount = price.get("unit_amount")
    plan = None
    if price_id:
        plan = Plan.objects.filter(
            Q(monthly_provider_price_id=price_id)
            | Q(yearly_provider_price_id=price_id)
        ).first()
    return plan, interval, amount


def _upsert_subscription_from_event(obj, record):
    user, sub, sub_id = _user_subscription_for(obj, record)
    if user is None:
        record.status = BillingEvent.Status.IGNORED
        record.save(update_fields=["status"])
        return
    status = _STRIPE_STATUS_MAP.get(obj.get("status", ""), UserSubscription.Status.ACTIVE)
    # Resolve the plan from the subscription's price ID (authoritative), not from
    # the user's current plan — a brand-new payer would otherwise resolve to Free.
    plan, interval, amount = _plan_terms_from_obj(obj)
    if plan is None:
        plan = (
            (sub.plan if sub else None)
            or Plan.objects.filter(key="pro").first()
        )
    defaults = dict(
        plan=plan,
        provider=record.provider,
        provider_subscription_id=sub_id or "",
        provider_customer_id=obj.get("customer", ""),
        status=status,
        cancel_at_period_end=bool(obj.get("cancel_at_period_end")),
    )
    if interval:
        defaults["billing_interval"] = interval
    if amount is not None:
        defaults["amount"] = amount
    end_ts = obj.get("current_period_end")
    if end_ts:
        defaults["current_period_end"] = timezone.datetime.fromtimestamp(
            end_ts, tz=timezone.get_current_timezone()
        )
    if sub:
        for k, v in defaults.items():
            setattr(sub, k, v)
        sub.save()
    else:
        sub = UserSubscription.objects.create(user=user, **defaults)
    record.subscription = sub
    record.save(update_fields=["subscription"])
    entitlements.sync_user_plan(user)


def _mark_subscription_canceled(obj, record):
    sub_id = obj.get("id")
    sub = UserSubscription.objects.filter(provider_subscription_id=sub_id).first()
    if sub:
        sub.status = UserSubscription.Status.CANCELED
        sub.canceled_at = timezone.now()
        sub.save(update_fields=["status", "canceled_at", "updated_at"])
        entitlements.sync_user_plan(sub.user)
        notify_billing(
            sub.user,
            "billing_canceled",
            "Your plan was canceled",
            "Your CertaNest plan has been canceled. Your documents are safe — "
            "resubscribe anytime to unlock Pro again.",
            severity="warning",
            suffix=str(sub.id),
        )
        from .lifecycle_email import send_subscription_canceled_email

        send_subscription_canceled_email(sub.user, sub)


def _handle_checkout_completed(obj, record):
    user = _resolve_user_from_event(obj)
    if user is None:
        record.status = BillingEvent.Status.IGNORED
        record.save(update_fields=["status"])
        return
    # Persist the customer id for future portal/webhook resolution.
    customer_id = obj.get("customer")
    if customer_id:
        profile = get_or_create_billing_profile(user)
        profile.provider_customer_id = customer_id
        profile.save(update_fields=["provider_customer_id"])
    # The follow-up subscription.created/updated event carries authoritative
    # state; here we just ensure a paid record exists if a subscription id came.
    _upsert_subscription_from_event(
        {**obj, "object": "checkout"}, record
    ) if obj.get("subscription") else None


def _handle_payment_failed(obj, record):
    user, sub, _ = _user_subscription_for(obj, record)
    if sub is None:
        record.status = BillingEvent.Status.IGNORED
        record.save(update_fields=["status"])
        return
    grace_days = BillingEmailSettings.load().grace_period_days
    sub.status = UserSubscription.Status.GRACE_PERIOD
    sub.grace_period_until = timezone.now() + timezone.timedelta(days=grace_days)
    sub.save(update_fields=["status", "grace_period_until", "updated_at"])
    if user:
        entitlements.sync_user_plan(user)
        notify_billing(
            user,
            "billing_payment_failed",
            "Payment failed",
            "We couldn't process your payment. Your Pro features stay active "
            "during the grace period — update your payment method to keep Pro.",
            severity="urgent",
            suffix=sub.grace_period_until.strftime("%Y%m%d") if sub.grace_period_until else "",
        )
        from .lifecycle_email import send_payment_failed_email

        send_payment_failed_email(user, sub)


def _maybe_send_receipt(invoice) -> None:
    """Send a branded receipt if enabled; receipt failures never break billing."""
    try:
        from . import receipts

        receipts.send_receipt_for_invoice(invoice)
    except Exception:  # noqa: BLE001 — receipts must never break billing
        pass


def _record_invoice(obj, record, paid: bool):
    user, sub, _ = _user_subscription_for(obj, record)
    invoice_id = obj.get("id")
    if not invoice_id or user is None:
        record.status = BillingEvent.Status.IGNORED
        record.save(update_fields=["status"])
        return
    invoice, _ = InvoiceRecord.objects.update_or_create(
        provider_invoice_id=invoice_id,
        defaults=dict(
            user=user,
            subscription=sub,
            amount_due=obj.get("amount_due", 0) or 0,
            amount_paid=obj.get("amount_paid", 0) or 0,
            tax_amount=obj.get("tax", 0) or 0,
            currency=obj.get("currency", "usd") or "usd",
            status=obj.get("status", ""),
            hosted_invoice_url=obj.get("hosted_invoice_url", "") or "",
            invoice_pdf_url=obj.get("invoice_pdf", "") or "",
            paid_at=timezone.now() if paid else None,
        ),
    )
    # A successful payment after a grace period restores active state.
    if paid and sub and sub.status in (
        UserSubscription.Status.GRACE_PERIOD,
        UserSubscription.Status.PAST_DUE,
    ):
        sub.status = UserSubscription.Status.ACTIVE
        sub.grace_period_until = None
        sub.save(update_fields=["status", "grace_period_until", "updated_at"])
        entitlements.sync_user_plan(user)
    # Branded receipt (founder-gated, idempotent). Never break webhook handling.
    if paid:
        _maybe_send_receipt(invoice)
