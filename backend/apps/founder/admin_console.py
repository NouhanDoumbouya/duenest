"""
Founder Admin Tools V1 — safe support-console aggregations.

Read-only builders for the founder/operator support console: organizations,
a per-user/per-org support view, and plan-limit / storage / AI-usage overviews.
Everything here REUSES the existing safe helpers and exposes only aggregates and
safe ids — NEVER document contents, OCR text, AI prompts/responses, full email
bodies, private file URLs, R2 object keys, raw tokens, or secrets. No Stripe
calls, no AI calls.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Count, Sum
from django.utils import timezone

from apps.documents.models import DocumentFile
from apps.documents.plan_usage import (
    compute_plan_usage,
    get_user_storage_limit_bytes,
    get_user_storage_used_bytes,
)
from apps.organizations.models import Organization, OrganizationMembership
from apps.organizations.portal_limits import build_organization_limit_payload

from .models import FounderSupportNote, OperationalEvent
from .services import build_founder_user_summary

User = get_user_model()

_LIST_CAP = 200


def _month_start():
    now = timezone.now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def serialize_support_note(note: FounderSupportNote) -> dict:
    return {
        "id": note.id,
        "note_type": note.note_type,
        "status": note.status,
        "body": note.body,
        "created_at": note.created_at.isoformat(),
        "updated_at": note.updated_at.isoformat(),
        "created_by": note.created_by.email if note.created_by else None,
        "target_user": note.target_user_id,
        "target_organization": note.target_organization_id,
    }


def _safe_event(event: OperationalEvent) -> dict:
    return {
        "id": event.id,
        "created_at": event.created_at.isoformat(),
        "severity": event.severity,
        "category": event.category,
        "source": event.source,
        "status": event.status,
        "message": event.message,
        "error_code": event.error_code,
        "correlation_id": event.correlation_id,
        "resolved": event.resolved,
    }


# ---- Organizations ----------------------------------------------------------


def _org_summary(org: Organization) -> dict:
    payload = build_organization_limit_payload(org)
    usage = payload.get("usage", {})
    owner = org.created_by
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "country": org.country,
        "organization_type": org.organization_type,
        "owner": {"id": owner.id, "email": owner.email} if owner else None,
        "plan": payload.get("plan"),
        "portal_enabled": payload.get("portal_enabled", False),
        "members": usage.get("members", 0),
        "people": usage.get("portal_people", 0),
        "active_cases": usage.get("active_portal_cases", 0),
        "active_requests": usage.get("active_document_requests", 0),
        "active_rooms": usage.get("active_sharing_rooms", 0),
        "is_archived": org.is_archived,
        "created_at": org.created_at.isoformat(),
    }


def build_organizations_list(
    *, search: str = "", plan: str = "", portal: bool | None = None
) -> list[dict]:
    qs = Organization.objects.select_related("created_by").order_by("name")
    if search:
        qs = qs.filter(name__icontains=search)
    items = [_org_summary(o) for o in qs[:_LIST_CAP]]
    if plan:
        items = [i for i in items if i["plan"] == plan]
    if portal is not None:
        items = [i for i in items if i["portal_enabled"] is portal]
    return items


def build_organization_detail(org: Organization) -> dict:
    payload = build_organization_limit_payload(org)
    members = [
        {
            "user_id": m.user_id,
            "email": m.user.email,
            "role": m.role,
            "status": m.status,
            "joined_at": m.joined_at.isoformat() if m.joined_at else None,
        }
        for m in OrganizationMembership.objects.filter(organization=org)
        .select_related("user")
        .order_by("role", "user__email")[:100]
    ]
    recent_events = [
        _safe_event(e)
        for e in OperationalEvent.objects.filter(organization=org).order_by(
            "-created_at"
        )[:15]
    ]
    notes = [
        serialize_support_note(n)
        for n in FounderSupportNote.objects.filter(target_organization=org)
    ]
    return {
        **_org_summary(org),
        "limits": payload.get("limits", {}),
        "usage": payload.get("usage", {}),
        "remaining": payload.get("remaining", {}),
        "members_list": members,
        "recent_events": recent_events,
        "support_notes": notes,
    }


# ---- User detail (enriches the existing safe summary) -----------------------


def build_founder_user_detail(user) -> dict:
    base = build_founder_user_summary(user)
    plan = compute_plan_usage(user)

    from apps.ai.metering import usage_summary

    ai_today = usage_summary(user)
    month_rows = _user_ai_month(user)

    memberships = [
        {
            "organization_id": m.organization_id,
            "name": m.organization.name,
            "role": m.role,
            "status": m.status,
            "plan": build_organization_limit_payload(m.organization).get("plan"),
        }
        for m in OrganizationMembership.objects.filter(user=user)
        .select_related("organization")
        .order_by("organization__name")
    ]
    recent_events = [
        _safe_event(e)
        for e in OperationalEvent.objects.filter(user=user).order_by("-created_at")[
            :15
        ]
    ]
    notes = [
        serialize_support_note(n)
        for n in FounderSupportNote.objects.filter(target_user=user)
    ]
    return {
        **base,
        "plan_usage": plan,
        "ai": {
            "daily_tokens_used": ai_today.get("daily_tokens_used", 0),
            "daily_token_cap": ai_today.get("daily_token_cap"),
            "paused": ai_today.get("paused", False),
            **month_rows,
        },
        "organizations": memberships,
        "recent_events": recent_events,
        "support_notes": notes,
    }


def _user_ai_month(user) -> dict:
    from apps.ai.models import AiUsage

    rows = AiUsage.objects.filter(user=user, created_at__gte=_month_start())
    agg = rows.aggregate(
        requests=Count("id"),
        tokens=Sum("total_tokens"),
        cost=Sum("estimated_cost_usd"),
    )
    return {
        "month_requests": agg["requests"] or 0,
        "month_tokens": agg["tokens"] or 0,
        "month_cost_usd": float(agg["cost"] or 0),
    }


# ---- Plans & limits ---------------------------------------------------------


def build_plans_limits_overview() -> dict:
    # User plan distribution (read the safe `User.plan` field).
    user_plans = {
        row["plan"]: row["n"]
        for row in User.objects.values("plan").annotate(n=Count("id"))
    }
    # Organization plan distribution (via the safe limit payload).
    org_plan_counts: dict[str, int] = {}
    orgs_over: list[dict] = []
    for org in Organization.objects.select_related("created_by")[:_LIST_CAP]:
        payload = build_organization_limit_payload(org)
        plan = payload.get("plan") or "free"
        org_plan_counts[plan] = org_plan_counts.get(plan, 0) + 1
        usage = payload.get("usage", {})
        limits = payload.get("limits", {})
        at_limit = [
            key
            for key, limit in limits.items()
            if isinstance(limit, int) and usage.get(key, 0) >= limit
        ]
        if at_limit:
            orgs_over.append(
                {"id": org.id, "name": org.name, "plan": plan, "at_limit": at_limit}
            )

    # Users at/over their storage limit (efficient: rank by stored bytes).
    users_over_storage = _users_over_storage_limit()

    return {
        "user_plans": user_plans,
        "organization_plans": org_plan_counts,
        "organizations_at_limit": orgs_over,
        "users_over_storage": users_over_storage,
    }


def _top_storage_user_ids(limit: int = 20) -> list[int]:
    rows = (
        DocumentFile.objects.filter(is_trashed=False, document__owner__isnull=False)
        .values("document__owner")
        .annotate(bytes=Sum("file_size"))
        .order_by("-bytes")[:limit]
    )
    return [r["document__owner"] for r in rows if r["document__owner"]]


def _users_over_storage_limit() -> list[dict]:
    out: list[dict] = []
    for user in User.objects.filter(id__in=_top_storage_user_ids(30)):
        used = get_user_storage_used_bytes(user)
        limit = get_user_storage_limit_bytes(user)
        if limit and used >= limit:
            out.append(
                {
                    "id": user.id,
                    "email": user.email,
                    "used_bytes": used,
                    "limit_bytes": limit,
                }
            )
    return out


# ---- Storage ----------------------------------------------------------------


def build_storage_overview() -> dict:
    totals = DocumentFile.objects.filter(is_trashed=False).aggregate(
        total_bytes=Sum("file_size"), total_files=Count("id")
    )
    top_users = []
    for user in User.objects.filter(id__in=_top_storage_user_ids(15)):
        used = get_user_storage_used_bytes(user)
        limit = get_user_storage_limit_bytes(user)
        top_users.append(
            {
                "id": user.id,
                "email": user.email,
                "used_bytes": used,
                "limit_bytes": limit,
                "percent": round(used / limit * 100) if limit else None,
            }
        )
    top_users.sort(key=lambda u: u["used_bytes"], reverse=True)

    upload_failures_24h = OperationalEvent.objects.filter(
        category__in=("upload", "storage"),
        created_at__gte=timezone.now() - timezone.timedelta(hours=24),
    ).count()

    return {
        "total_bytes": totals["total_bytes"] or 0,
        "total_files": totals["total_files"] or 0,
        "top_users": top_users,
        "upload_failures_24h": upload_failures_24h,
    }


# ---- AI usage ---------------------------------------------------------------


def build_ai_usage_overview() -> dict:
    from apps.ai.models import AiUsage

    now = timezone.now()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = _month_start()

    def _window(qs) -> dict:
        agg = qs.aggregate(
            requests=Count("id"),
            tokens=Sum("total_tokens"),
            cost=Sum("estimated_cost_usd"),
        )
        return {
            "requests": agg["requests"] or 0,
            "tokens": agg["tokens"] or 0,
            "cost_usd": float(agg["cost"] or 0),
        }

    month_rows = AiUsage.objects.filter(created_at__gte=month_start)
    by_reason = {
        row["reason"]: row["n"]
        for row in month_rows.exclude(status="success")
        .values("reason")
        .annotate(n=Count("id"))
    }
    top_users = [
        {"user_id": row["user"], "tokens": row["tokens"] or 0, "requests": row["n"]}
        for row in month_rows.filter(user__isnull=False)
        .values("user")
        .annotate(tokens=Sum("total_tokens"), n=Count("id"))
        .order_by("-tokens")[:15]
    ]
    # Resolve emails for the top users in one query.
    emails = {
        u.id: u.email
        for u in User.objects.filter(id__in=[t["user_id"] for t in top_users])
    }
    for t in top_users:
        t["email"] = emails.get(t["user_id"], "")

    return {
        "configured": bool(getattr(settings, "AI_CONFIGURED", False)),
        "embeddings_configured": bool(
            getattr(settings, "EMBEDDINGS_CONFIGURED", False)
        ),
        "today": _window(AiUsage.objects.filter(created_at__gte=day_start)),
        "month": _window(month_rows),
        "failures_by_reason": by_reason,
        "top_users": top_users,
        "caps": {
            "daily_token_cap_user": getattr(settings, "AI_DAILY_TOKEN_CAP_USER", None),
            "daily_token_cap_global": getattr(
                settings, "AI_DAILY_TOKEN_CAP_GLOBAL", None
            ),
            "monthly_cost_limit_usd": getattr(
                settings, "AI_MONTHLY_COST_LIMIT_USD", None
            ),
        },
    }
