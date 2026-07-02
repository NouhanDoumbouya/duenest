"""
Founder Growth Command Center — aggregation, UTM building, and the rule-based
insight/action engine.

Privacy: this module reads only first-party counts and ``ProductEvent`` metadata.
It never touches document contents, OCR text, or file names. All callers are
gated by :class:`apps.founder.permissions.IsFounderUser`.

Reuses the existing analytics primitives in ``apps.founder.services`` so funnel
and date-range logic stays consistent with the rest of the founder console.
"""

from __future__ import annotations

import math
import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from django.contrib.auth import get_user_model
from django.db.models import Count, Min
from django.utils import timezone

from apps.documents.models import (
    Document,
    DocumentFileShareLink,
    DocumentReminderRule,
    EmergencyAccessPack,
)
from apps.users import plans as user_plans

from .models import GrowthAction, MarketingCampaign, ProductEvent
from .services import _active_users_since, _distinct_users, _range_config, _since

User = get_user_model()

_ALLOWED_SCHEMES = {"http", "https"}
_UTM_KEYS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _pct(part: int, whole: int) -> float | None:
    """Percentage of ``part`` over ``whole`` (1 dp), or None when undefined."""
    if not whole:
        return None
    return round(100.0 * part / whole, 1)


def _trend(current: int, previous: int) -> dict:
    if not previous:
        return {"direction": "flat", "change_pct": None, "previous": previous}
    change = round(100.0 * (current - previous) / previous, 1)
    direction = "up" if change > 0 else "down" if change < 0 else "flat"
    return {"direction": direction, "change_pct": change, "previous": previous}


def _range_bounds(range_key: str | None):
    """Return (since, previous_since) datetimes; None means all-time."""
    _, days = _range_config(range_key)
    if days is None:
        return None, None
    return _since(days), _since(days * 2)


# ---------------------------------------------------------------------------
# UTM link builder
# ---------------------------------------------------------------------------
def normalize_utm_value(value: str) -> str:
    """Lowercase, trim, and collapse whitespace to underscores."""
    return re.sub(r"\s+", "_", (value or "").strip().lower())


def build_utm_url(
    base_url: str,
    *,
    source: str,
    medium: str,
    campaign: str,
    content: str = "",
    term: str = "",
) -> str:
    """
    Build a UTM-tagged URL. Validates the base URL, normalizes UTM values, and
    preserves any pre-existing query params. Raises ``ValueError`` on bad input.
    """
    parsed = urlparse((base_url or "").strip())
    if parsed.scheme not in _ALLOWED_SCHEMES or not parsed.netloc:
        raise ValueError("Enter a valid http(s) URL, e.g. https://certanest.com/.")

    source = normalize_utm_value(source)
    medium = normalize_utm_value(medium)
    campaign = normalize_utm_value(campaign)
    if not (source and medium and campaign):
        raise ValueError("Source, medium, and campaign are required.")

    # Preserve existing params; UTM values win on conflict.
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["utm_source"] = source
    query["utm_medium"] = medium
    query["utm_campaign"] = campaign
    if content:
        query["utm_content"] = normalize_utm_value(content)
    if term:
        query["utm_term"] = normalize_utm_value(term)

    return urlunparse(parsed._replace(query=urlencode(query)))


# ---------------------------------------------------------------------------
# Funnel
# ---------------------------------------------------------------------------
def build_growth_funnel(range_key: str | None = None, *, campaign_key: str | None = None) -> dict:
    """
    Visitor → Signup → First document → First reminder → First SafeSend →
    Emergency setup. Counts are real and owner-distinct; conversion rates are
    computed between consecutive steps. ``campaign_key`` filters event-derived
    steps by utm_campaign when provided.
    """
    since, _ = _range_bounds(range_key)

    def _docs():
        qs = Document.objects.filter(is_trashed=False)
        return qs.filter(created_at__gte=since) if since else qs

    def _by_owner(qs, field="owner"):
        if since:
            qs = qs.filter(created_at__gte=since)
        return _distinct_users(qs, field)

    visitor_events = ProductEvent.objects.filter(event_source=ProductEvent.Source.FRONTEND)
    if since:
        visitor_events = visitor_events.filter(created_at__gte=since)
    if campaign_key:
        visitor_events = visitor_events.filter(metadata__utm_campaign=campaign_key)
    visitors = (
        visitor_events.exclude(session_id="").values("session_id").distinct().count()
    )

    signup_qs = User.objects.all()
    if since:
        signup_qs = signup_qs.filter(date_joined__gte=since)
    signups = signup_qs.count()

    steps = [
        {"key": "visitor", "label": "Visitor", "count": visitors, "estimated": True},
        {"key": "signup", "label": "Signup", "count": signups},
        {
            "key": "first_document_added",
            "label": "First document added",
            "count": _by_owner(Document.objects.filter(is_trashed=False)),
        },
        {
            "key": "first_reminder_created",
            "label": "First reminder created",
            "count": _by_owner(DocumentReminderRule.objects.all()),
        },
        {
            "key": "first_safe_send_created",
            "label": "First SafeSend created",
            "count": _by_owner(DocumentFileShareLink.objects.all()),
        },
        {
            "key": "emergency_setup_started",
            "label": "Emergency setup started",
            "count": _by_owner(EmergencyAccessPack.objects.all()),
        },
    ]

    # Conversion between consecutive steps + identify the biggest leak.
    biggest = None
    for i, step in enumerate(steps):
        if i == 0:
            step["conversion_from_prev"] = None
            continue
        prev = steps[i - 1]["count"]
        step["conversion_from_prev"] = _pct(step["count"], prev)
        if prev > 0:
            drop = prev - step["count"]
            drop_pct = round(100.0 * drop / prev, 1)
            if biggest is None or drop_pct > biggest["drop_pct"]:
                biggest = {
                    "from": steps[i - 1]["label"],
                    "to": step["label"],
                    "drop_pct": drop_pct,
                    "lost_users": drop,
                }

    total_conversion = _pct(steps[-1]["count"], steps[1]["count"])  # signup → last
    return {
        "range": _range_config(range_key)[0],
        "steps": steps,
        "biggest_drop_off": biggest,
        "total_conversion_signup_to_activated": total_conversion,
    }


def _percentile(values: list[float], p: float) -> float | None:
    """Linear-interpolated percentile of ``values`` (1 dp). None when empty."""
    if not values:
        return None
    s = sorted(values)
    if len(s) == 1:
        return round(s[0], 1)
    k = (len(s) - 1) * (p / 100.0)
    lo, hi = math.floor(k), math.ceil(k)
    if lo == hi:
        return round(s[int(k)], 1)
    return round(s[lo] + (s[hi] - s[lo]) * (k - lo), 1)


def build_time_to_value(range_key: str | None = None) -> dict:
    """Time-to-first-value: latency (hours) from signup to each first milestone.

    Complements the funnel's "how many" with "how fast" — it surfaces where
    activation stalls, not just whether users convert. Computed purely from the
    earliest owned record per user vs. that user's ``date_joined`` (no event
    dependency, so it is robust even for signups made before event
    instrumentation existed). Founder-only (caller-gated); reads no document
    content. ``range_key`` restricts to users who signed up within the window.
    """
    since, _ = _range_bounds(range_key)

    milestones = (
        ("first_document", "First document added",
         Document.objects.filter(is_trashed=False)),
        ("first_reminder", "First reminder created",
         DocumentReminderRule.objects.all()),
        ("first_share", "First SafeSend created",
         DocumentFileShareLink.objects.all()),
    )

    out = []
    for key, label, qs in milestones:
        first_by_owner = dict(
            qs.values_list("owner")
            .annotate(first_at=Min("created_at"))
            .values_list("owner", "first_at")
        )
        joined_qs = User.objects.filter(pk__in=first_by_owner.keys())
        if since:
            joined_qs = joined_qs.filter(date_joined__gte=since)
        joined_by_owner = dict(joined_qs.values_list("pk", "date_joined"))

        latencies = []
        for owner_id, first_at in first_by_owner.items():
            joined = joined_by_owner.get(owner_id)
            # Guard against clock skew / pre-join records (never negative latency).
            if joined and first_at and first_at >= joined:
                latencies.append((first_at - joined).total_seconds() / 3600.0)

        out.append({
            "key": key,
            "label": label,
            "reached": len(latencies),
            "median_hours": _percentile(latencies, 50),
            "p75_hours": _percentile(latencies, 75),
            "within_24h_pct": (
                _pct(sum(1 for h in latencies if h <= 24), len(latencies))
                if latencies else None
            ),
        })

    return {"range": _range_config(range_key)[0], "milestones": out}


# ---------------------------------------------------------------------------
# Overview KPIs
# ---------------------------------------------------------------------------
def _top_attribution(field_key: str, since) -> dict | None:
    qs = ProductEvent.objects.filter(event_type=ProductEvent.EventType.USER_SIGNED_UP)
    if since:
        qs = qs.filter(created_at__gte=since)
    counts: dict[str, int] = {}
    for meta in qs.values_list("metadata", flat=True):
        value = (meta or {}).get(field_key)
        if value:
            counts[str(value)] = counts.get(str(value), 0) + 1
    if not counts:
        return None
    name, count = max(counts.items(), key=lambda kv: kv[1])
    return {"name": name, "signups": count}


def build_growth_overview(range_key: str | None = None) -> dict:
    since, prev_since = _range_bounds(range_key)

    users = User.objects.all()
    signups = users.filter(date_joined__gte=since).count() if since else users.count()
    total_users = users.count()

    docs = Document.objects.filter(is_trashed=False)
    activated = _distinct_users(
        docs.filter(created_at__gte=since) if since else docs, "owner"
    )
    activation_rate = _pct(activated, signups)

    active_7d = _active_users_since(_since(7))

    plan_counts = {
        row["plan"]: row["c"] for row in users.values("plan").annotate(c=Count("id"))
    }
    free_users = plan_counts.get(user_plans.PLAN_FREE, 0)
    pro_users = plan_counts.get(user_plans.PLAN_PRO_PLACEHOLDER, 0)

    # Previous-period comparisons (only for windowed ranges).
    prev_signups = (
        users.filter(date_joined__gte=prev_since, date_joined__lt=since).count()
        if since
        else 0
    )
    prev_activated = (
        _distinct_users(
            docs.filter(created_at__gte=prev_since, created_at__lt=since), "owner"
        )
        if since
        else 0
    )

    funnel = build_growth_funnel(range_key)
    top_channel = _top_attribution("utm_source", since)
    best_campaign = _top_attribution("utm_campaign", since)

    overview = {
        "range": _range_config(range_key)[0],
        "kpis": {
            "signups": {
                "value": signups,
                "trend": _trend(signups, prev_signups) if since else None,
                "explanation": "New accounts created in this period.",
            },
            "activated_users": {
                "value": activated,
                "trend": _trend(activated, prev_activated) if since else None,
                "explanation": "Users who added at least one document (primary activation).",
            },
            "activation_rate": {
                "value": activation_rate,
                "unit": "%",
                "explanation": "Share of signups who added a first document.",
            },
            "active_users_7d": {
                "value": active_7d,
                "explanation": "Users active in the last 7 days.",
            },
            "free_users": {"value": free_users, "explanation": "Users on the Free plan."},
            "pro_users": {"value": pro_users, "explanation": "Users on the Pro plan."},
            "mrr": {
                "value": None,
                "available": False,
                "explanation": "Requires billing — not connected yet.",
            },
            "total_users": {"value": total_users},
        },
        "top_channel": top_channel,
        "best_campaign": best_campaign,
        "biggest_drop_off": funnel["biggest_drop_off"],
    }
    insights = build_growth_insights(overview, funnel)
    overview["insights"] = insights
    overview["recommended_action"] = insights[0] if insights else None
    return overview


# ---------------------------------------------------------------------------
# Insight engine (rule-based, honest)
# ---------------------------------------------------------------------------
_MIN_SIGNUPS_FOR_INSIGHT = 10


def build_growth_insights(overview: dict, funnel: dict) -> list[dict]:
    insights: list[dict] = []
    signups = overview["kpis"]["signups"]["value"]
    activation_rate = overview["kpis"]["activation_rate"]["value"]

    if signups < _MIN_SIGNUPS_FOR_INSIGHT:
        return [
            {
                "key": "not_enough_data",
                "title": "Not enough data yet",
                "body": "Keep collecting signups and events. Insights unlock once "
                f"you pass {_MIN_SIGNUPS_FOR_INSIGHT} signups in the selected range.",
                "severity": "info",
                "action_type": "create_utm_link",
                "priority": GrowthAction.Priority.LOW,
            }
        ]

    if activation_rate is not None and activation_rate < 40:
        insights.append(
            {
                "key": "low_activation",
                "title": "Many users sign up but don’t add a first document",
                "body": f"Only {activation_rate}% of signups add a document. Improve "
                "onboarding or send a “start with your passport” email.",
                "severity": "critical",
                "action_type": "improve_onboarding",
                "priority": GrowthAction.Priority.HIGH,
            }
        )

    leak = funnel.get("biggest_drop_off")
    if leak and leak["drop_pct"] >= 50:
        insights.append(
            {
                "key": "biggest_leak",
                "title": f"Biggest leak: {leak['from']} → {leak['to']}",
                "body": f"{leak['drop_pct']}% of users drop between {leak['from']} and "
                f"{leak['to']} ({leak['lost_users']} users). Investigate this step.",
                "severity": "high",
                "action_type": "investigate_drop_off",
                "priority": GrowthAction.Priority.HIGH,
            }
        )

    if not insights:
        insights.append(
            {
                "key": "healthy",
                "title": "Funnel looks healthy",
                "body": "No critical leaks detected in this range. Focus on bringing "
                "more quality traffic through your best channel.",
                "severity": "info",
                "action_type": "launch_campaign",
                "priority": GrowthAction.Priority.MEDIUM,
            }
        )
    return insights


# ---------------------------------------------------------------------------
# Campaign metrics (event-derived; real-time)
# ---------------------------------------------------------------------------
def campaign_metrics(campaign: MarketingCampaign, range_key: str | None = None) -> dict:
    """Live metrics from ProductEvent attribution metadata (utm_campaign)."""
    since, _ = _range_bounds(range_key)
    key = campaign.attribution_key
    events = ProductEvent.objects.filter(metadata__utm_campaign=key)
    if since:
        events = events.filter(created_at__gte=since)

    visitors = events.exclude(session_id="").values("session_id").distinct().count()
    signups = events.filter(
        event_type=ProductEvent.EventType.USER_SIGNED_UP
    ).count()
    attributed_user_ids = set(
        events.filter(user__isnull=False).values_list("user_id", flat=True)
    )
    activated = (
        _distinct_users(
            Document.objects.filter(
                owner_id__in=attributed_user_ids, is_trashed=False
            ),
            "owner",
        )
        if attributed_user_ids
        else 0
    )
    cost = float(campaign.budget_amount) if campaign.budget_amount else None
    cpa = round(cost / signups, 2) if cost and signups else None
    return {
        "visitors": visitors,
        "signups": signups,
        "activated_users": activated,
        "conversion_rate": _pct(signups, visitors),
        "activation_rate": _pct(activated, signups),
        "cost": cost,
        "cpa": cpa,
    }
