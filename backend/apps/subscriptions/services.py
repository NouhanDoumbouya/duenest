"""
Recurrence, cost, and urgency logic for the Subscription tracker.

All functions are pure/owner-safe helpers: they either operate on a single
:class:`Subscription` instance or take a ``user`` and only ever query that
user's own rows. There is **no live currency conversion** — monetary aggregates
are grouped by currency so we never invent an exchange rate.
"""

from __future__ import annotations

import calendar
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.utils import timezone

from .models import Subscription, SubscriptionCategory


def add_months(value: date, months: int) -> date:
    """
    Add (or subtract) whole months to a date, clamping the day to the last day
    of the target month so e.g. Jan 31 + 1 month → Feb 28/29. Kept dependency-
    free (no python-dateutil) to match the project's lean requirements.
    """
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(value.day, last_day))


def advance_billing_date(subscription: "Subscription") -> date | None:
    """
    The next billing date advanced by exactly one billing cycle, or ``None``
    when it cannot be determined (no current date, or an underspecified custom
    cycle).
    """
    current = subscription.next_billing_date
    if current is None:
        return None
    cycle = subscription.billing_cycle
    if cycle == Subscription.BillingCycle.WEEKLY:
        return current + timedelta(weeks=1)
    if cycle == Subscription.BillingCycle.MONTHLY:
        return add_months(current, 1)
    if cycle == Subscription.BillingCycle.QUARTERLY:
        return add_months(current, 3)
    if cycle == Subscription.BillingCycle.YEARLY:
        return add_months(current, 12)
    if cycle == Subscription.BillingCycle.CUSTOM:
        count = subscription.custom_interval_count
        unit = subscription.custom_interval_unit
        if not count or not unit:
            return None
        if unit == Subscription.IntervalUnit.DAYS:
            return current + timedelta(days=count)
        if unit == Subscription.IntervalUnit.WEEKS:
            return current + timedelta(weeks=count)
        if unit == Subscription.IntervalUnit.MONTHS:
            return add_months(current, count)
        if unit == Subscription.IntervalUnit.YEARS:
            return add_months(current, 12 * count)
    return None

# How many days ahead each "soon" bucket looks.
RENEWS_SOON_DAYS = 7
UPCOMING_DAYS = 30
DEADLINE_SOON_DAYS = 7
TRIAL_ENDING_DAYS = 7

# Months covered by ONE billing cycle, used to derive a monthly-equivalent cost
# as ``amount / cycle_months``. A week is 12/52 of a month, so a weekly cost
# works out to ``amount * 52 / 12`` per month. ``custom`` is handled separately
# because its period is data-driven.
_CYCLE_MONTHS = {
    Subscription.BillingCycle.WEEKLY: Decimal(12) / Decimal(52),
    Subscription.BillingCycle.MONTHLY: Decimal(1),
    Subscription.BillingCycle.QUARTERLY: Decimal(3),
    Subscription.BillingCycle.YEARLY: Decimal(12),
}

# Approximate months per custom interval unit.
_UNIT_MONTHS = {
    Subscription.IntervalUnit.DAYS: Decimal(1) / Decimal(30),
    Subscription.IntervalUnit.WEEKS: Decimal(1) / Decimal("4.345"),
    Subscription.IntervalUnit.MONTHS: Decimal(1),
    Subscription.IntervalUnit.YEARS: Decimal(12),
}

_ACTIVE_STATUSES = {Subscription.Status.ACTIVE, Subscription.Status.TRIAL}


def _q2(value: Decimal) -> Decimal:
    """Round a money value to 2 d.p. (half up)."""
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def cycle_months(subscription: Subscription) -> Decimal | None:
    """
    Number of months one billing cycle spans, or ``None`` when it cannot be
    determined (an underspecified custom cycle). ``None`` means the subscription
    is excluded from monthly/yearly aggregates and flagged as custom.
    """
    cycle = subscription.billing_cycle
    if cycle in _CYCLE_MONTHS:
        return _CYCLE_MONTHS[cycle]
    if cycle == Subscription.BillingCycle.CUSTOM:
        count = subscription.custom_interval_count
        unit = subscription.custom_interval_unit
        if not count or unit not in _UNIT_MONTHS:
            return None
        return _UNIT_MONTHS[unit] * Decimal(count)
    return None


def monthly_equivalent(subscription: Subscription) -> Decimal | None:
    """Monthly-equivalent cost, or ``None`` if the cycle is indeterminate."""
    months = cycle_months(subscription)
    if not months or months <= 0:
        return None
    return _q2(Decimal(subscription.amount) / months)


def yearly_equivalent(subscription: Subscription) -> Decimal | None:
    """Yearly-equivalent cost, or ``None`` if the cycle is indeterminate."""
    monthly = monthly_equivalent(subscription)
    if monthly is None:
        return None
    return _q2(monthly * Decimal(12))


def days_until(value: date | None, today: date | None = None) -> int | None:
    if value is None:
        return None
    today = today or timezone.localdate()
    return (value - today).days


def subscription_urgency(subscription: Subscription, today: date | None = None) -> str:
    """
    A single urgency label for the next billing date. Owner-set status is
    respected: cancelled/paused/expired subscriptions are never "overdue".
    """
    today = today or timezone.localdate()
    nbd = subscription.next_billing_date
    if nbd is None:
        return "normal"
    days = (nbd - today).days
    is_active = subscription.status in _ACTIVE_STATUSES
    if days < 0:
        return "overdue" if is_active else "normal"
    if days == 0:
        return "renews_today"
    if days <= RENEWS_SOON_DAYS:
        return "renews_soon"
    if days <= UPCOMING_DAYS:
        return "upcoming"
    return "normal"


def cancellation_deadline_soon(
    subscription: Subscription, today: date | None = None
) -> bool:
    days = days_until(subscription.cancellation_deadline, today)
    return days is not None and 0 <= days <= DEADLINE_SOON_DAYS


def trial_ending_soon(subscription: Subscription, today: date | None = None) -> bool:
    if subscription.status != Subscription.Status.TRIAL:
        return False
    days = days_until(subscription.next_billing_date, today)
    return days is not None and 0 <= days <= TRIAL_ENDING_DAYS


def compute_subscription_state(
    subscription: Subscription, today: date | None = None
) -> dict:
    """
    Derived, read-only fields for a single subscription, used by the serializer
    and the detail rail. Never mutates the instance.
    """
    today = today or timezone.localdate()
    monthly = monthly_equivalent(subscription)
    yearly = yearly_equivalent(subscription)
    return {
        "urgency": subscription_urgency(subscription, today),
        "days_until_renewal": days_until(subscription.next_billing_date, today),
        "days_until_cancellation_deadline": days_until(
            subscription.cancellation_deadline, today
        ),
        "monthly_equivalent": str(monthly) if monthly is not None else None,
        "yearly_equivalent": str(yearly) if yearly is not None else None,
        "cost_is_estimable": monthly is not None,
        "cancellation_deadline_soon": cancellation_deadline_soon(subscription, today),
        "trial_ending_soon": trial_ending_soon(subscription, today),
    }


# ---- Summary ---------------------------------------------------------------


def build_summary(user, today: date | None = None) -> dict:
    """
    Owner-scoped roll-up for the subscriptions command center.

    Monetary totals are grouped by currency (no FX). Subscriptions with an
    indeterminate custom cycle are counted but excluded from cost totals and
    reported separately under ``cost_unestimable_count``.
    """
    today = today or timezone.localdate()
    subs = list(
        Subscription.objects.filter(owner=user, is_archived=False).select_related(
            "category"
        )
    )

    active = [s for s in subs if s.status in _ACTIVE_STATUSES]
    monthly_by_currency: dict[str, Decimal] = defaultdict(Decimal)
    yearly_by_currency: dict[str, Decimal] = defaultdict(Decimal)
    unestimable = 0

    by_category: dict[str, int] = defaultdict(int)
    by_status: dict[str, int] = defaultdict(int)

    renewals_this_week = 0
    renewals_this_month = 0
    trials_ending = 0
    deadlines_soon = 0

    for s in subs:
        by_status[s.status] += 1
        cat_name = s.category.name if s.category else "Uncategorized"
        by_category[cat_name] += 1

        if s.status in _ACTIVE_STATUSES:
            monthly = monthly_equivalent(s)
            yearly = yearly_equivalent(s)
            if monthly is None:
                unestimable += 1
            else:
                monthly_by_currency[s.currency] += monthly
                yearly_by_currency[s.currency] += yearly

        days = days_until(s.next_billing_date, today)
        if days is not None and s.status in _ACTIVE_STATUSES:
            if 0 <= days <= RENEWS_SOON_DAYS:
                renewals_this_week += 1
            if 0 <= days <= UPCOMING_DAYS:
                renewals_this_month += 1
        if trial_ending_soon(s, today):
            trials_ending += 1
        if cancellation_deadline_soon(s, today):
            deadlines_soon += 1

    # Top upcoming renewals (active, future-dated), nearest first.
    upcoming = sorted(
        (s for s in active if s.next_billing_date and s.next_billing_date >= today),
        key=lambda s: (s.next_billing_date, s.name.lower()),
    )[:5]

    return {
        "active_count": len(active),
        "total_count": len(subs),
        "monthly_cost_by_currency": {
            cur: str(_q2(amt)) for cur, amt in sorted(monthly_by_currency.items())
        },
        "yearly_cost_by_currency": {
            cur: str(_q2(amt)) for cur, amt in sorted(yearly_by_currency.items())
        },
        "cost_unestimable_count": unestimable,
        "renewals_this_week": renewals_this_week,
        "renewals_this_month": renewals_this_month,
        "trials_ending_soon": trials_ending,
        "cancellation_deadlines_soon": deadlines_soon,
        "by_category": dict(sorted(by_category.items())),
        "by_status": dict(by_status),
        "top_upcoming_renewals": [
            {
                "id": s.id,
                "name": s.name,
                "provider": s.provider,
                "amount": str(s.amount),
                "currency": s.currency,
                "next_billing_date": s.next_billing_date.isoformat(),
                "days_until_renewal": (s.next_billing_date - today).days,
                "auto_renew": s.auto_renew,
            }
            for s in upcoming
        ],
    }


# ---- Attention -------------------------------------------------------------

# A simple, transparent "high yearly cost" threshold for the value/waste hint.
# Manual/heuristic only — DueNest never inspects bank or usage data.
HIGH_YEARLY_COST_THRESHOLD = Decimal(500)


def subscription_attention(user, today: date | None = None) -> list[dict]:
    """
    Owner-scoped list of subscriptions that need attention, each with one or
    more human reasons. Drives the Attention Needed integration. Cancelled,
    expired, and archived subscriptions are excluded.
    """
    today = today or timezone.localdate()
    subs = (
        Subscription.objects.filter(owner=user, is_archived=False)
        .exclude(status=Subscription.Status.CANCELLED)
        .exclude(status=Subscription.Status.EXPIRED)
        .select_related("category")
    )

    results: list[dict] = []
    for s in subs:
        reasons: list[str] = []
        days = days_until(s.next_billing_date, today)
        is_active = s.status in _ACTIVE_STATUSES

        if s.next_billing_date is None:
            reasons.append("Missing next billing date")
        elif is_active and days is not None and days < 0:
            reasons.append("Renewal overdue")
        elif is_active and days is not None and 0 <= days <= RENEWS_SOON_DAYS:
            reasons.append("Renews within 7 days")

        if trial_ending_soon(s, today):
            reasons.append("Trial ending soon")
        if cancellation_deadline_soon(s, today):
            reasons.append("Cancellation deadline soon")
        if (
            s.auto_renew
            and is_active
            and days is not None
            and 0 <= days <= RENEWS_SOON_DAYS
        ):
            reasons.append("Auto-renews soon")

        yearly = yearly_equivalent(s)
        if yearly is not None and yearly >= HIGH_YEARLY_COST_THRESHOLD:
            reasons.append("High yearly cost")

        if not reasons:
            continue
        results.append(
            {
                "id": s.id,
                "name": s.name,
                "provider": s.provider,
                "category": s.category.name if s.category else None,
                "amount": str(s.amount),
                "currency": s.currency,
                "billing_cycle": s.billing_cycle,
                "status": s.status,
                "auto_renew": s.auto_renew,
                "next_billing_date": (
                    s.next_billing_date.isoformat() if s.next_billing_date else None
                ),
                "cancellation_deadline": (
                    s.cancellation_deadline.isoformat()
                    if s.cancellation_deadline
                    else None
                ),
                "urgency": subscription_urgency(s, today),
                "days_until_renewal": days,
                "reasons": reasons,
            }
        )

    # Most urgent first: overdue, then soonest renewal, then name.
    urgency_rank = {
        "overdue": 0,
        "renews_today": 1,
        "renews_soon": 2,
        "upcoming": 3,
        "normal": 4,
    }
    results.sort(
        key=lambda r: (
            urgency_rank.get(r["urgency"], 5),
            r["days_until_renewal"] if r["days_until_renewal"] is not None else 9999,
            r["name"].lower(),
        )
    )
    return results


# ---- Calendar / Timeline event sources -------------------------------------
#
# These are consumed by the documents calendar/timeline aggregators (which own
# the public Calendar/Timeline endpoints) via a lazy import, keeping the event
# shape consistent across the whole product without coupling the apps tightly.


@dataclass
class SubscriptionDateEvent:
    """A single dated subscription event in a source-agnostic shape."""

    subscription_id: int
    event_type: str  # subscription_renewal | subscription_cancellation_deadline | subscription_trial_ending
    title: str
    description: str
    date: date
    metadata: dict = field(default_factory=dict)


def subscription_events(user, *, today: date | None = None) -> list[SubscriptionDateEvent]:
    """
    All dated events for the user's active subscriptions, owner-scoped and free
    of sensitive payment data (no card labels, no account emails).
    """
    today = today or timezone.localdate()
    subs = (
        Subscription.objects.filter(owner=user, is_archived=False)
        .exclude(status=Subscription.Status.CANCELLED)
        .exclude(status=Subscription.Status.EXPIRED)
    )
    events: list[SubscriptionDateEvent] = []
    for s in subs:
        if s.next_billing_date:
            if s.status == Subscription.Status.TRIAL:
                etype = "subscription_trial_ending"
                title = f"{s.name} trial renews"
                desc = f"Your {s.name} trial converts to a paid plan."
            else:
                etype = "subscription_renewal"
                title = f"{s.name} renews"
                desc = f"{s.name} renews ({s.amount} {s.currency})."
            events.append(
                SubscriptionDateEvent(
                    subscription_id=s.id,
                    event_type=etype,
                    title=title,
                    description=desc,
                    date=s.next_billing_date,
                    metadata={
                        "amount": str(s.amount),
                        "currency": s.currency,
                        "auto_renew": s.auto_renew,
                        "billing_cycle": s.billing_cycle,
                    },
                )
            )
        if s.cancellation_deadline:
            events.append(
                SubscriptionDateEvent(
                    subscription_id=s.id,
                    event_type="subscription_cancellation_deadline",
                    title=f"Cancel {s.name} before this date",
                    description=(
                        f"Last day to cancel {s.name} before it renews."
                    ),
                    date=s.cancellation_deadline,
                    metadata={"auto_renew": s.auto_renew},
                )
            )
    return events


# ---- Default category seeding ----------------------------------------------

DEFAULT_CATEGORIES = [
    ("Streaming", "monitor-play", "#ef4444"),
    ("Software", "app-window", "#6366f1"),
    ("Cloud & Hosting", "server", "#0ea5e9"),
    ("Domain", "globe", "#14b8a6"),
    ("Insurance", "shield-check", "#22c55e"),
    ("Telecom", "smartphone", "#f59e0b"),
    ("Utilities", "plug", "#84cc16"),
    ("Education", "graduation-cap", "#8b5cf6"),
    ("Finance", "landmark", "#0d9488"),
    ("Gym & Health", "dumbbell", "#ec4899"),
    ("Professional Membership", "briefcase", "#3b82f6"),
    ("Transport", "car-front", "#f97316"),
    ("Other", "tag", "#64748b"),
]


def seed_default_categories() -> int:
    """
    Idempotently create the system subscription categories. Safe to call from a
    data migration or a management context. Returns the number created.
    """
    created = 0
    for order, (name, icon, color) in enumerate(DEFAULT_CATEGORIES):
        _, was_created = SubscriptionCategory.objects.get_or_create(
            owner=None,
            slug=slug_for(name),
            defaults={
                "name": name,
                "icon": icon,
                "color": color,
                "is_system": True,
                "sort_order": order,
            },
        )
        if was_created:
            created += 1
    return created


def slug_for(name: str) -> str:
    from django.utils.text import slugify

    return slugify(name)
