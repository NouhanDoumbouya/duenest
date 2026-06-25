"""
Organization Dashboard V1 — the operational command center for a B2B portal.

A single deterministic READ over the existing portal data (PortalPerson /
PortalCase / PortalCaseDocumentRequest + the reused DocumentRequestLink /
SharingRoom / DocumentBundle primitives + the unified Audit Log). It computes
operational metrics ("how many uploads need review", "how many cases are
overdue") and a handful of small, bounded action queues ("review now", "overdue
cases", "missing documents", ...) so staff immediately know what to do next.

Reuses, never duplicates:
* ``portal_limits.build_organization_limit_payload`` for the plan/usage/limits card,
* ``portals.compute_case_progress`` for per-case readiness (only on bounded queues),
* the unified Audit Log for recent activity.

Privacy: returns only safe operational fields — never document contents, raw
public tokens, private file URLs, or storage keys. Deterministic — no AI, no AI
credits, no storage/R2 reads, no file decryption.
"""

from __future__ import annotations

from datetime import timedelta

from django.db.models import Avg, Count, Q
from django.utils import timezone

from .models import PortalCase, PortalCaseDocumentRequest, PortalPerson

# How far ahead "due soon" / "expiring" looks, in days.
DUE_SOON_DAYS = 7
# Hard cap on every action-queue list so the dashboard endpoint stays cheap and
# never leaks an unbounded result set.
QUEUE_LIMIT = 8
RECENT_ACTIVITY_LIMIT = 10


# ---- Public entry points ----------------------------------------------------


def build_dashboard_payload(organization, user) -> dict:
    """The full Organization Dashboard payload (single endpoint). No writes."""
    from .portal_limits import build_organization_limit_payload

    return {
        "organization": {"id": organization.id, "name": organization.name},
        "plan": build_organization_limit_payload(organization),
        "metrics": build_dashboard_metrics(organization),
        "queues": build_attention_queues(organization, user),
        "generated_at": timezone.now().isoformat(),
    }


# Kept as the documented name in the spec; thin alias over the payload builder.
def build_organization_dashboard_context(organization, user) -> dict:
    return build_dashboard_payload(organization, user)


# ---- Metrics ----------------------------------------------------------------


def build_dashboard_metrics(organization) -> dict:
    metrics = {}
    metrics.update(_people_metrics(organization))
    metrics.update(build_case_status_counts(organization))
    metrics.update(build_due_date_metrics(organization))
    metrics.update(build_review_metrics(organization))
    metrics.update(build_sharing_room_metrics(organization))
    metrics.update(build_missing_document_metrics(organization))
    metrics.update(_operational_health(organization, metrics))
    return metrics


def _people_metrics(organization) -> dict:
    people = PortalPerson.objects.filter(organization=organization)
    total = people.count()
    archived = people.filter(status=PortalPerson.Status.ARCHIVED).count()
    return {
        "total_people": total,
        # "Active" = not archived (still being worked, in any non-archived state).
        "active_people": total - archived,
    }


def build_case_status_counts(organization) -> dict:
    """One grouped query for all case-status counts."""
    rows = (
        PortalCase.objects.filter(organization=organization)
        .values("status")
        .annotate(count=Count("id"))
    )
    by_status = {row["status"]: row["count"] for row in rows}
    S = PortalCase.Status
    total = sum(by_status.values())
    active = sum(by_status.get(s, 0) for s in PortalCase.ACTIVE_STATUSES)
    return {
        "total_cases": total,
        "active_cases": active,
        "draft_cases": by_status.get(S.DRAFT, 0),
        "collecting_documents_cases": by_status.get(S.COLLECTING_DOCUMENTS, 0),
        "waiting_for_review_cases": by_status.get(S.WAITING_FOR_REVIEW, 0),
        "ready_cases": by_status.get(S.READY, 0),
        "submitted_cases": by_status.get(S.SUBMITTED, 0),
        "completed_cases": by_status.get(S.COMPLETED, 0),
        "blocked_cases": by_status.get(S.BLOCKED, 0),
        "archived_cases": by_status.get(S.ARCHIVED, 0),
    }


def build_due_date_metrics(organization) -> dict:
    today = timezone.now().date()
    soon = today + timedelta(days=DUE_SOON_DAYS)
    active = PortalCase.objects.filter(
        organization=organization, status__in=PortalCase.ACTIVE_STATUSES
    )
    return {
        "overdue_cases": active.filter(due_date__lt=today).count(),
        "due_soon_cases": active.filter(
            due_date__gte=today, due_date__lte=soon
        ).count(),
    }


def build_review_metrics(organization) -> dict:
    """Document-request counts by the AUTHORITATIVE link status, scoped to the
    org's non-archived cases."""
    from apps.documents.models import DocumentRequestLink as DR

    links = DR.objects.filter(
        portal_case_links__case__organization=organization,
    ).exclude(portal_case_links__case__status=PortalCase.Status.ARCHIVED)
    agg = links.aggregate(
        active=Count("id", filter=Q(status__in=DR.ACTIVE_STATUSES), distinct=True),
        needing_review=Count(
            "id",
            filter=Q(status__in=(DR.Status.UPLOADED, DR.Status.UNDER_REVIEW)),
            distinct=True,
        ),
        accepted=Count("id", filter=Q(status=DR.Status.ACCEPTED), distinct=True),
        rejected=Count("id", filter=Q(status=DR.Status.REJECTED), distinct=True),
        needs_replacement=Count(
            "id", filter=Q(status=DR.Status.NEEDS_REPLACEMENT), distinct=True
        ),
    )
    return {
        "active_document_requests": agg["active"] or 0,
        "uploaded_requests_needing_review": agg["needing_review"] or 0,
        "accepted_requests": agg["accepted"] or 0,
        "rejected_requests": agg["rejected"] or 0,
        "needs_replacement_requests": agg["needs_replacement"] or 0,
    }


def build_sharing_room_metrics(organization) -> dict:
    from apps.documents.models import SharingRoom

    soon = timezone.now() + timedelta(days=DUE_SOON_DAYS)
    rooms = SharingRoom.objects.filter(
        portal_cases__organization=organization,
        status__in=SharingRoom.ACTIVE_STATUSES,
    ).distinct()
    return {
        "active_sharing_rooms": rooms.count(),
        "expiring_sharing_rooms": rooms.filter(
            expires_at__isnull=False,
            expires_at__gte=timezone.now(),
            expires_at__lte=soon,
        ).count(),
    }


def build_missing_document_metrics(organization) -> dict:
    """Total required pack requirements still missing across the org's active
    cases. Aggregated directly (no per-case loop)."""
    from apps.documents.models import DocumentBundleRequirement as Req

    missing = (
        Req.objects.filter(
            bundle__portal_cases__organization=organization,
            bundle__portal_cases__status__in=PortalCase.ACTIVE_STATUSES,
            is_required=True,
            status=Req.Status.MISSING,
        )
        .distinct()
        .count()
    )
    return {"missing_required_documents": missing}


def _operational_health(organization, metrics: dict) -> dict:
    """Lightweight derived health signals. Percentages are integers 0–100."""
    from apps.documents.models import DocumentBundle

    active = metrics.get("active_cases", 0) or 0
    avg = (
        DocumentBundle.objects.filter(
            portal_cases__organization=organization,
            portal_cases__status__in=PortalCase.ACTIVE_STATUSES,
        )
        .distinct()
        .aggregate(v=Avg("readiness_score"))
    )["v"]
    return {
        "readiness_average": int(round(avg)) if avg is not None else None,
        "percent_cases_ready": _pct(metrics.get("ready_cases", 0), active),
        "percent_cases_blocked_or_overdue": _pct(
            (metrics.get("blocked_cases", 0) or 0)
            + (metrics.get("overdue_cases", 0) or 0),
            active,
        ),
    }


def _pct(part: int, whole: int) -> int:
    if not whole:
        return 0
    return int(round((part / whole) * 100))


# ---- Attention queues -------------------------------------------------------


def build_attention_queues(organization, user) -> dict:
    return {
        "review_now": _review_now_queue(organization),
        "overdue_cases": _overdue_cases_queue(organization),
        "missing_documents": _missing_documents_queue(organization),
        "needs_replacement": _needs_replacement_queue(organization),
        "ready_cases": _ready_cases_queue(organization),
        "recent_activity": build_recent_activity(organization, user),
    }


def _case_action_url(case) -> str:
    # Relative app route only — never a public token/URL.
    return f"/dashboard/organizations/{case.organization_id}/portal/cases/{case.id}"


def safe_case_summary(case, *, progress: dict | None = None) -> dict:
    """Safe operational summary of a case for a queue item. No tokens/URLs/content."""
    today = timezone.now().date()
    overdue = bool(case.due_date and case.due_date < today and case.status in PortalCase.ACTIVE_STATUSES)
    out = {
        "case_id": case.id,
        "case_title": case.title,
        "person_name": case.person.full_name if case.person_id else "",
        "person_id": case.person_id,
        "status": case.status,
        "priority": case.priority,
        "due_date": case.due_date.isoformat() if case.due_date else None,
        "is_overdue": overdue,
        "updated_at": case.updated_at.isoformat(),
        "action_url": _case_action_url(case),
    }
    if progress is not None:
        out["missing_requirements"] = progress.get("missing_requirements", 0)
        out["uploads_needing_review"] = progress.get("uploads_needing_review", 0)
        out["readiness_score"] = progress.get("readiness_score", 0)
    return out


def safe_person_summary(person) -> dict:
    return {
        "person_id": person.id,
        "full_name": person.full_name,
        "person_type": person.person_type,
        "status": person.status,
        "action_url": (
            f"/dashboard/organizations/{person.organization_id}/portal"
            f"?person={person.id}"
        ),
    }


def _review_now_queue(organization) -> list[dict]:
    """Uploaded / under-review case requests awaiting a decision."""
    from apps.documents.models import DocumentRequestLink as DR

    rows = (
        PortalCaseDocumentRequest.objects.filter(
            case__organization=organization,
            document_request__status__in=(DR.Status.UPLOADED, DR.Status.UNDER_REVIEW),
        )
        .exclude(case__status=PortalCase.Status.ARCHIVED)
        .select_related("case", "case__person", "document_request")
        .order_by("-document_request__uploaded_at")[:QUEUE_LIMIT]
    )
    out = []
    for row in rows:
        link = row.document_request
        case = row.case
        out.append({
            "case_request_id": row.id,
            "case_id": case.id,
            "case_title": case.title,
            "person_name": case.person.full_name if case.person_id else "",
            "requested_document_title": link.requested_document_title,
            "status": link.status,
            "uploaded_at": link.uploaded_at.isoformat() if link.uploaded_at else None,
            "action_url": f"{_case_action_url(case)}#request-{row.id}",
        })
    return out


def _overdue_cases_queue(organization) -> list[dict]:
    today = timezone.now().date()
    cases = (
        PortalCase.objects.filter(
            organization=organization,
            status__in=PortalCase.ACTIVE_STATUSES,
            due_date__lt=today,
        )
        .select_related("person", "linked_bundle")
        .order_by("due_date")[:QUEUE_LIMIT]
    )
    return [_attention_case_item(c) for c in cases]


def _ready_cases_queue(organization) -> list[dict]:
    """Cases marked READY (all required satisfied, no pending review)."""
    cases = (
        PortalCase.objects.filter(
            organization=organization, status=PortalCase.Status.READY
        )
        .select_related("person", "linked_bundle")
        .order_by("-updated_at")[:QUEUE_LIMIT]
    )
    return [_attention_case_item(c) for c in cases]


def _missing_documents_queue(organization) -> list[dict]:
    """Active cases that still have missing required pack requirements. Includes a
    few short requirement titles (safe — titles only, never document content)."""
    from apps.documents.models import DocumentBundleRequirement as Req

    cases = (
        PortalCase.objects.filter(
            organization=organization,
            status__in=PortalCase.ACTIVE_STATUSES,
            linked_bundle__isnull=False,
            linked_bundle__requirements__is_required=True,
            linked_bundle__requirements__status=Req.Status.MISSING,
        )
        .select_related("person", "linked_bundle")
        .distinct()
        .order_by("due_date", "-updated_at")[:QUEUE_LIMIT]
    )
    out = []
    for case in cases:
        item = _attention_case_item(case)
        titles = list(
            Req.objects.filter(
                bundle_id=case.linked_bundle_id,
                is_required=True,
                status=Req.Status.MISSING,
            ).values_list("title", flat=True)[:5]
        )
        item["missing_document_titles"] = [t[:120] for t in titles]
        out.append(item)
    return out


def _needs_replacement_queue(organization) -> list[dict]:
    """Requests the recipient must re-send (needs_replacement) or that were
    rejected — the staff/recipient follow-up list."""
    from apps.documents.models import DocumentRequestLink as DR

    rows = (
        PortalCaseDocumentRequest.objects.filter(
            case__organization=organization,
            document_request__status__in=(
                DR.Status.NEEDS_REPLACEMENT, DR.Status.REJECTED
            ),
        )
        .exclude(case__status=PortalCase.Status.ARCHIVED)
        .select_related("case", "case__person", "document_request")
        .order_by("-updated_at")[:QUEUE_LIMIT]
    )
    out = []
    for row in rows:
        link = row.document_request
        case = row.case
        out.append({
            "case_request_id": row.id,
            "case_id": case.id,
            "case_title": case.title,
            "person_name": case.person.full_name if case.person_id else "",
            "requested_document_title": link.requested_document_title,
            "status": link.status,
            "action_url": f"{_case_action_url(case)}#request-{row.id}",
        })
    return out


def _attention_case_item(case) -> dict:
    from .portals import compute_case_progress

    return safe_case_summary(case, progress=compute_case_progress(case))


# ---- Recent activity --------------------------------------------------------


def build_recent_activity(organization, user) -> list[dict]:
    """Recent safe portal audit events for this org. Reuses the unified Audit Log
    (owner-scoped to the org owner, tagged with ``metadata.org_id``). Returns only
    safe labels — never tokens/URLs/content (already sanitized at write time)."""
    from apps.documents.models import AuditLogEntry

    from .portals import _org_owner_user

    owner = _org_owner_user(organization)
    if owner is None:
        return []
    # Owner-scoped, recent-first, bounded; filter to THIS org in Python (the owner
    # may also have personal events). The slice keeps it cheap.
    recent = (
        AuditLogEntry.objects.filter(owner=owner)
        .order_by("-created_at")[:120]
    )
    out = []
    for entry in recent:
        meta = entry.metadata or {}
        if meta.get("org_id") != organization.id:
            continue
        out.append({
            "id": entry.id,
            "event_type": entry.event_type,
            "severity": entry.severity,
            "object_label": entry.object_label,
            "related_object_label": entry.related_object_label,
            "actor_label": entry.actor_label,
            "created_at": entry.created_at.isoformat(),
        })
        if len(out) >= RECENT_ACTIVITY_LIMIT:
            break
    return out
