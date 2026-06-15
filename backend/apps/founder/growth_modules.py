"""
Services for the remaining Growth Command Center modules: audience segment rule
engine, auto-action generation, acquisition attribution capture, referral /
ambassador metrics, chart series, and CSV export builders.

Founder-only callers. Reads only counts + privacy-safe attribution metadata —
never document contents.
"""

from __future__ import annotations

import csv
import io
import secrets

from django.contrib.auth import get_user_model
from django.db.models import Count, Min, Q
from django.utils import timezone

from apps.documents.models import Document

from .growth import _pct, _range_bounds, build_growth_overview
from .models import (
    AmbassadorProfile,
    AudienceSegment,
    GrowthAction,
    MarketingCampaign,
    ProductEvent,
    ReferralAttribution,
    ReferralProfile,
    UserAttribution,
)
from .services import _date_span

User = get_user_model()

_ATTR_FIELDS = ("utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term")
_MAXLEN = 120


# ---------------------------------------------------------------------------
# Attribution
# ---------------------------------------------------------------------------
def capture_attribution(user, payload: dict | None) -> UserAttribution | None:
    """
    Upsert first/last-touch attribution for ``user`` from a UTM payload.

    First-touch values are written only once; last-touch is always refreshed.
    Best-effort and bounded — never raises into the signup/auth path.
    """
    if not user or not getattr(user, "is_authenticated", True):
        return None
    payload = payload or {}

    def clip(value) -> str:
        return str(value or "").strip()[:_MAXLEN]

    referrer = str(payload.get("referrer") or "")[:300]
    landing = str(payload.get("landing_page") or "")[:300]
    if not any(payload.get(k) for k in _ATTR_FIELDS) and not referrer and not landing:
        return None

    try:
        attr, _ = UserAttribution.objects.get_or_create(user=user)
        for key in _ATTR_FIELDS:
            value = clip(payload.get(key))
            if value:
                if not getattr(attr, f"first_{key}"):
                    setattr(attr, f"first_{key}", value)
                setattr(attr, f"last_{key}", value)
        if referrer:
            attr.first_referrer = attr.first_referrer or referrer
            attr.last_referrer = referrer
        if landing:
            attr.first_landing_page = attr.first_landing_page or landing
            attr.last_landing_page = landing
        attr.save()
        return attr
    except Exception:  # noqa: BLE001 — attribution must never break signup
        return None


# ---------------------------------------------------------------------------
# Referrals
# ---------------------------------------------------------------------------
def get_or_create_referral_profile(user) -> ReferralProfile:
    profile = ReferralProfile.objects.filter(user=user).first()
    if profile:
        return profile
    code = f"r{user.id}{secrets.token_hex(3)}"
    return ReferralProfile.objects.create(user=user, referral_code=code)


def record_referral_signup(referred_user, referral_code: str, *, campaign=None):
    """
    Log a referral attribution, preventing self-referral. Returns the created
    attribution or None.
    """
    code = (referral_code or "").strip()
    if not code:
        return None
    profile = ReferralProfile.objects.filter(referral_code=code).first()
    if not profile or profile.user_id == referred_user.id:
        return None  # unknown code or self-referral
    if ReferralAttribution.objects.filter(referred_user=referred_user).exists():
        return None  # already attributed
    return ReferralAttribution.objects.create(
        referrer=profile.user,
        referred_user=referred_user,
        referral_code=code,
        campaign=campaign,
    )


def referral_leaderboard(limit: int = 20) -> list[dict]:
    activated_owner_ids = set(
        Document.objects.filter(is_trashed=False).values_list("owner_id", flat=True)
    )
    rows: dict[int, dict] = {}
    qs = ReferralAttribution.objects.select_related("referrer")
    for attr in qs:
        row = rows.setdefault(
            attr.referrer_id,
            {
                "referrer_id": attr.referrer_id,
                "referrer_email": attr.referrer.email,
                "signups": 0,
                "activated": 0,
            },
        )
        row["signups"] += 1
        if attr.referred_user_id in activated_owner_ids:
            row["activated"] += 1
    return sorted(rows.values(), key=lambda r: r["signups"], reverse=True)[:limit]


def ambassador_leaderboard() -> list[dict]:
    activated_owner_ids = set(
        Document.objects.filter(is_trashed=False).values_list("owner_id", flat=True)
    )
    out = []
    for amb in AmbassadorProfile.objects.all():
        signups = 0
        activated = 0
        if amb.referral_code:
            refs = ReferralAttribution.objects.filter(referral_code=amb.referral_code)
            signups = refs.count()
            activated = sum(
                1 for r in refs if r.referred_user_id in activated_owner_ids
            )
        out.append(
            {
                "id": amb.id,
                "name": amb.name,
                "community": amb.community,
                "campus": amb.campus,
                "status": amb.status,
                "referral_code": amb.referral_code,
                "signups": signups,
                "activated": activated,
            }
        )
    return sorted(out, key=lambda r: r["signups"], reverse=True)


# ---------------------------------------------------------------------------
# Audience segments (simple, safe rule engine)
# ---------------------------------------------------------------------------
def evaluate_segment_queryset(rules: dict):
    """Return a User queryset matching the segment rules. Unknown keys ignored."""
    rules = rules or {}
    qs = User.objects.all()

    if rules.get("plan"):
        qs = qs.filter(plan=rules["plan"])

    goal = rules.get("goal")
    if goal:
        qs = qs.filter(onboarding_state__metadata__readiness_goal=goal)

    source = rules.get("source")
    if source:
        qs = qs.filter(attribution__first_utm_source=source)

    campaign = rules.get("campaign")
    if campaign:
        qs = qs.filter(attribution__first_utm_campaign=campaign)

    if rules.get("signed_up_after"):
        qs = qs.filter(date_joined__date__gte=rules["signed_up_after"])
    if rules.get("signed_up_before"):
        qs = qs.filter(date_joined__date__lte=rules["signed_up_before"])

    activated_ids = (
        Document.objects.filter(is_trashed=False).values_list("owner_id", flat=True)
    )
    activation = rules.get("activation")
    if activation == "activated":
        qs = qs.filter(id__in=activated_ids)
    elif activation == "not_activated":
        qs = qs.exclude(id__in=activated_ids)

    min_documents = rules.get("min_documents")
    if min_documents:
        qs = qs.annotate(
            _doc_count=Count("documents", filter=Q(documents__is_trashed=False))
        ).filter(_doc_count__gte=int(min_documents))

    return qs.distinct()


def segment_summary(segment: AudienceSegment) -> dict:
    try:
        users = evaluate_segment_queryset(segment.rules_json)
        size = users.count()
        user_ids = list(users.values_list("id", flat=True))
    except Exception:  # noqa: BLE001 — malformed rules shouldn't 500 the list
        return {"size": 0, "activation_rate": None, "avg_documents": None, "error": "Invalid rules."}

    if not user_ids:
        return {"size": 0, "activation_rate": None, "avg_documents": None}

    doc_qs = Document.objects.filter(owner_id__in=user_ids, is_trashed=False)
    activated = doc_qs.values("owner").distinct().count()
    total_docs = doc_qs.count()
    return {
        "size": size,
        "activation_rate": _pct(activated, size),
        "avg_documents": round(total_docs / size, 2) if size else None,
    }


# ---------------------------------------------------------------------------
# Auto-generated actions
# ---------------------------------------------------------------------------
def generate_auto_actions() -> list[GrowthAction]:
    """Turn critical/high insights into de-duplicated GrowthActions."""
    overview = build_growth_overview()
    created: list[GrowthAction] = []
    for insight in overview.get("insights", []):
        if insight.get("severity") not in ("critical", "high"):
            continue
        rule_key = f"insight:{insight['key']}"
        already = GrowthAction.objects.filter(
            rule_key=rule_key,
            status__in=[GrowthAction.Status.OPEN, GrowthAction.Status.IN_PROGRESS],
        ).exists()
        if already:
            continue
        created.append(
            GrowthAction.objects.create(
                title=insight["title"],
                description=insight["body"],
                reason="Auto-generated from a growth insight.",
                action_type=insight.get("action_type", ""),
                priority=insight.get("priority", GrowthAction.Priority.MEDIUM),
                related_metric=insight["key"],
                rule_key=rule_key,
                created_automatically=True,
            )
        )
    return created


# ---------------------------------------------------------------------------
# Charts
# ---------------------------------------------------------------------------
def build_growth_charts(range_key: str | None = None) -> dict:
    since, _ = _range_bounds(range_key)
    dates = _date_span(since)
    date_keys = [d.isoformat() for d in dates]

    signup_qs = User.objects.filter(date_joined__date__gte=dates[0])
    # Per-day bucketing in local time (DB-agnostic).
    signups_by_day = {k: 0 for k in date_keys}
    for joined in signup_qs.values_list("date_joined", flat=True):
        key = timezone.localtime(joined).date().isoformat()
        if key in signups_by_day:
            signups_by_day[key] += 1

    # Activated users over time = distinct owners by their FIRST document date.
    activated_by_day = {k: 0 for k in date_keys}
    first_docs = (
        Document.objects.filter(is_trashed=False)
        .values("owner")
        .annotate(first=Min("created_at"))
    )
    for row in first_docs:
        if not row["first"]:
            continue
        key = timezone.localtime(row["first"]).date().isoformat()
        if key in activated_by_day:
            activated_by_day[key] += 1

    # Acquisition channel comparison (from signup attribution metadata).
    channel: dict[str, int] = {}
    signup_events = ProductEvent.objects.filter(
        event_type=ProductEvent.EventType.USER_SIGNED_UP
    )
    if since:
        signup_events = signup_events.filter(created_at__gte=since)
    for meta in signup_events.values_list("metadata", flat=True):
        src = (meta or {}).get("utm_source") or "direct"
        channel[str(src)] = channel.get(str(src), 0) + 1

    # Action priority breakdown (open actions).
    priority_rows = (
        GrowthAction.objects.filter(
            status__in=[GrowthAction.Status.OPEN, GrowthAction.Status.IN_PROGRESS]
        )
        .values("priority")
        .annotate(c=Count("id"))
    )

    # Activation rate by active segment.
    segment_rates = []
    for seg in AudienceSegment.objects.filter(status=AudienceSegment.Status.ACTIVE)[:8]:
        summary = segment_summary(seg)
        segment_rates.append(
            {"name": seg.name, "activation_rate": summary["activation_rate"], "size": summary["size"]}
        )

    return {
        "range": range_key or "30d",
        "signups_over_time": [{"date": k, "count": signups_by_day[k]} for k in date_keys],
        "activated_over_time": [{"date": k, "count": activated_by_day[k]} for k in date_keys],
        "channel_comparison": sorted(
            ({"name": n, "signups": c} for n, c in channel.items()),
            key=lambda r: r["signups"],
            reverse=True,
        ),
        "action_priority_breakdown": [
            {"priority": r["priority"], "count": r["c"]} for r in priority_rows
        ],
        "activation_by_segment": segment_rates,
        "referral_leaderboard": referral_leaderboard(limit=10),
        "ambassador_leaderboard": ambassador_leaderboard()[:10],
    }


# ---------------------------------------------------------------------------
# CSV exports (founder-only; no document contents)
# ---------------------------------------------------------------------------
def _csv_response_text(header: list[str], rows: list[list]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(header)
    writer.writerows(rows)
    return buffer.getvalue()


def campaigns_csv() -> str:
    header = ["name", "slug", "channel", "source", "medium", "status", "generated_url"]
    rows = [
        [c.name, c.slug, c.channel, c.source, c.medium, c.status, c.generated_url]
        for c in MarketingCampaign.objects.all()
    ]
    return _csv_response_text(header, rows)


def referrals_csv() -> str:
    header = ["referrer_email", "signups", "activated"]
    rows = [[r["referrer_email"], r["signups"], r["activated"]] for r in referral_leaderboard(1000)]
    return _csv_response_text(header, rows)
