"""
Application Tracker V1 — deterministic application/renewal lifecycle (NO AI).

Turns a ``TrackedApplication`` (+ optional linked ``DocumentBundle``) into a
stable status payload: status + suggested status, deadline state, linked-pack
readiness summary, and deterministic next actions. Plus an account-wide summary
for the list page and Life Radar.

Design rules (V1):
  * **Deterministic & offline.** Built purely from the application's own fields
    and the deterministic ``build_pack_readiness`` of any linked pack. Makes no
    AI call, consumes no AI credits, never touches R2, exposes no file URLs.
  * **Never overrides the user's status.** ``suggested_status`` is computed and
    returned alongside the user-chosen ``status`` — the UI may offer it, but the
    user's value is authoritative.
"""

from __future__ import annotations

from datetime import date

from django.utils import timezone

from .models import TrackedApplication

# Deadline windows (days).
URGENT_DAYS = 7
SOON_DAYS = 30

Status = TrackedApplication.Status

# Lifecycle groupings.
CLOSED_STATUSES = {Status.ACCEPTED, Status.REJECTED, Status.WITHDRAWN}
WAITING_STATUSES = {Status.SUBMITTED, Status.UNDER_REVIEW, Status.INTERVIEW}


def get_application_deadline_state(application, *, today: date | None = None) -> dict:
    """Return ``{state, days_until_deadline}`` (deterministic)."""
    today = today or timezone.localdate()
    if application.status in CLOSED_STATUSES:
        return {"state": "completed", "days_until_deadline": None}
    if application.deadline_date is None:
        return {"state": "no_deadline", "days_until_deadline": None}

    days = (application.deadline_date - today).days
    # Once submitted / under review / interview, the deadline pressure is relieved.
    if application.status in WAITING_STATUSES or application.submitted_at:
        return {"state": "upcoming", "days_until_deadline": days}
    if days < 0:
        state = "overdue"
    elif days <= URGENT_DAYS:
        state = "urgent"
    elif days <= SOON_DAYS:
        state = "soon"
    else:
        state = "upcoming"
    return {"state": state, "days_until_deadline": days}


def get_application_readiness(application, user) -> dict | None:
    """Compact linked-pack readiness, or ``None`` when no pack is linked."""
    bundle = application.linked_bundle
    if bundle is None:
        return None
    from .pack_readiness import build_pack_readiness

    readiness = build_pack_readiness(bundle, user)
    summary = readiness["summary"]
    return {
        "id": bundle.id,
        "name": readiness["name"],
        "readiness_score": readiness["score"],
        "has_checklist": readiness["has_checklist"],
        "is_ready_to_share": readiness["is_ready_to_share"],
        "missing_count": summary["missing_count"],
        "warning_count": summary["warning_count"],
    }


def suggest_application_status(application, *, readiness: dict | None) -> str:
    """
    Deterministic suggested status (returned ALONGSIDE the user's status; never
    forcibly applied). Closed/submitted applications are left as-is.
    """
    status = application.status
    if status in CLOSED_STATUSES:
        return status
    if application.submitted_at or status in WAITING_STATUSES:
        return Status.UNDER_REVIEW if status == Status.SUBMITTED else status
    if readiness is not None:
        if not readiness["has_checklist"]:
            return Status.PLANNING
        if readiness["missing_count"] > 0:
            return Status.DOCUMENTS_MISSING
        if readiness["is_ready_to_share"]:
            return Status.READY_TO_SUBMIT
        return Status.CHECKLIST_CREATED
    return Status.PLANNING


def get_application_next_actions(
    application, *, readiness: dict | None, deadline: dict
) -> list[dict]:
    """Deterministic, prioritized next steps for one application."""
    actions: list[dict] = []
    status = application.status

    if status in CLOSED_STATUSES:
        return actions  # closed — nothing to do

    if status in WAITING_STATUSES or application.submitted_at:
        actions.append(
            {
                "type": "await_decision",
                "label": "Awaiting decision",
                "description": "This application has been submitted.",
                "priority": "low",
            }
        )
        return actions

    if readiness is None:
        actions.append(
            {
                "type": "link_pack",
                "label": "Link an application pack",
                "description": "Connect a pack to track required documents and readiness.",
                "priority": "medium",
            }
        )
    elif not readiness["has_checklist"]:
        actions.append(
            {
                "type": "add_requirements",
                "label": "Add required documents",
                "description": "Turn the linked pack into a readiness checklist.",
                "priority": "medium",
                "bundle_id": readiness["id"],
            }
        )
    elif readiness["missing_count"] > 0:
        actions.append(
            {
                "type": "finish_missing_documents",
                "label": f"Finish {readiness['missing_count']} missing document(s)",
                "description": "Complete the pack before submitting.",
                "priority": "high",
                "bundle_id": readiness["id"],
            }
        )
    elif readiness["is_ready_to_share"]:
        actions.append(
            {
                "type": "submit_application",
                "label": "Submit application",
                "description": "All required documents are ready.",
                "priority": "high",
                "bundle_id": readiness["id"],
            }
        )

    if deadline["state"] == "overdue":
        actions.append(
            {
                "type": "resolve_overdue",
                "label": "Deadline has passed",
                "description": "Submit now or update the application status.",
                "priority": "high",
            }
        )
    return actions


def build_application_tracker_payload(application, user, *, today: date | None = None) -> dict:
    """Full deterministic payload for one application (never raises)."""
    today = today or timezone.localdate()
    readiness = get_application_readiness(application, user)
    deadline = get_application_deadline_state(application, today=today)
    suggested = suggest_application_status(application, readiness=readiness)
    next_actions = get_application_next_actions(
        application, readiness=readiness, deadline=deadline
    )

    return {
        "id": application.id,
        "title": application.title,
        "type": application.application_type,
        "status": application.status,
        "status_label": application.get_status_display(),
        "suggested_status": suggested,
        "suggested_status_label": Status(suggested).label,
        "priority": application.priority,
        "source_url": application.source_url or None,
        "organization_name": application.organization_name or None,
        "deadline_date": application.deadline_date.isoformat()
        if application.deadline_date
        else None,
        "days_until_deadline": deadline["days_until_deadline"],
        "deadline_state": deadline["state"],
        "submitted_at": application.submitted_at.isoformat()
        if application.submitted_at
        else None,
        "decision_date": application.decision_date.isoformat()
        if application.decision_date
        else None,
        "target_start_date": application.target_start_date.isoformat()
        if application.target_start_date
        else None,
        "linked_pack": readiness,
        "next_actions": next_actions,
        "notes": application.notes,
        "is_archived": application.is_archived,
        "created_at": application.created_at.isoformat(),
        "updated_at": application.updated_at.isoformat(),
    }


def build_application_tracker_summary(user, *, today: date | None = None) -> dict:
    """Account-wide deterministic counts for the list page + Life Radar."""
    today = today or timezone.localdate()
    apps_qs = list(
        TrackedApplication.objects.filter(owner=user, is_archived=False)
        .select_related("linked_bundle")
    )
    total = len(apps_qs)
    urgent = ready = submitted = overdue = completed = 0
    for app in apps_qs:
        if app.status in CLOSED_STATUSES:
            completed += 1
            continue
        if app.status == Status.READY_TO_SUBMIT:
            ready += 1
        if app.status in WAITING_STATUSES or app.submitted_at:
            submitted += 1
            continue
        deadline = get_application_deadline_state(app, today=today)
        if deadline["state"] == "overdue":
            overdue += 1
        elif deadline["state"] == "urgent":
            urgent += 1

    archived = TrackedApplication.objects.filter(owner=user, is_archived=True).count()
    return {
        "total_active": total,
        "urgent": urgent,
        "ready_to_submit": ready,
        "submitted": submitted,
        "overdue": overdue,
        "completed": completed,
        "archived": archived,
    }


def application_counts_for_life_radar(user, *, today: date | None = None) -> dict:
    """Compact counts Life Radar folds into its summary (additive)."""
    summary = build_application_tracker_summary(user, today=today)
    return {
        "active_applications": summary["total_active"],
        "urgent_applications": summary["urgent"] + summary["overdue"],
        "ready_to_submit_applications": summary["ready_to_submit"],
        "overdue_applications": summary["overdue"],
    }
