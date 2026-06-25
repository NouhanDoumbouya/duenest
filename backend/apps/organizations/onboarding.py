"""
B2B portal onboarding (Onboarding & Demo Workspaces V1).

A DETERMINISTIC setup guide for an organization's portal: the checklist steps are
derived from the org's real data (no AI), and the one non-derivable bit — whether
an admin dismissed the guide, plus the optional demo workspace — lives on
``OrganizationOnboarding``. Payloads expose only safe ids/booleans.
"""

from __future__ import annotations

from django.utils import timezone

from apps.documents.models import DocumentFolder

from .models import (
    OrganizationCaseTemplate,
    OrganizationOnboarding,
    PortalCase,
    PortalCaseDocumentRequest,
    PortalCaseReviewDecision,
    PortalPerson,
    PortalReminderBatch,
)


def get_or_create_onboarding(org) -> OrganizationOnboarding:
    obj, _ = OrganizationOnboarding.objects.get_or_create(organization=org)
    return obj


# Ordered checklist: (key, title, description, predicate).
def _steps_state(org) -> list[dict]:
    has_template = OrganizationCaseTemplate.objects.filter(organization=org).exists()
    has_person = PortalPerson.objects.filter(organization=org).exists()
    has_case = PortalCase.objects.filter(organization=org).exists()
    has_request = PortalCaseDocumentRequest.objects.filter(
        case__organization=org
    ).exists()
    has_review = PortalCaseReviewDecision.objects.filter(organization=org).exists()
    has_folder = DocumentFolder.objects.filter(organization=org).exists()
    has_reminder = PortalReminderBatch.objects.filter(organization=org).exists()
    has_activity = has_review or has_reminder

    return [
        {
            "key": "create_template",
            "title": "Create a template",
            "description": "A reusable case blueprint with the documents you collect.",
            "done": has_template,
        },
        {
            "key": "add_person",
            "title": "Add a person",
            "description": "A client, student, or applicant you're helping.",
            "done": has_person,
        },
        {
            "key": "create_case",
            "title": "Create a case",
            "description": "The documents a person needs, tracked in one place.",
            "done": has_case,
        },
        {
            "key": "request_documents",
            "title": "Request documents",
            "description": "Send a secure upload link — no account needed.",
            "done": has_request,
        },
        {
            "key": "review_upload",
            "title": "Review an upload",
            "description": "Accept, reject, or ask for a replacement.",
            "done": has_review,
        },
        {
            "key": "organize_case_folder",
            "title": "Organize files",
            "description": "Group documents into folders (a lens, not access control).",
            "done": has_folder,
        },
        {
            "key": "send_reminder",
            "title": "Send a reminder",
            "description": "Nudge recipients who still owe documents.",
            "done": has_reminder,
        },
        {
            "key": "check_audit_or_activity",
            "title": "Check activity",
            "description": "Review the audit trail and operational activity.",
            "done": has_activity,
        },
    ]


def _next_action(steps: list[dict]) -> dict | None:
    """The single next best step — deterministic (first incomplete)."""
    for step in steps:
        if not step["done"]:
            return {"key": step["key"], "title": step["title"], "hint": step["description"]}
    return None


def build_org_onboarding_payload(org) -> dict:
    state = get_or_create_onboarding(org)
    steps = _steps_state(org)
    completed = sum(1 for s in steps if s["done"])
    return {
        "mode": "organization",
        "organization_id": org.id,
        "steps": steps,
        "completed_count": completed,
        "total_count": len(steps),
        "percent": round(completed / len(steps) * 100) if steps else 0,
        "next_action": _next_action(steps),
        "dismissed": state.dismissed_at is not None,
        "has_demo": state.has_demo,
        "demo_created_at": (
            state.demo_created_at.isoformat() if state.demo_created_at else None
        ),
    }


def dismiss_org_onboarding(org, *, dismissed: bool = True) -> OrganizationOnboarding:
    state = get_or_create_onboarding(org)
    state.dismissed_at = timezone.now() if dismissed else None
    state.save(update_fields=["dismissed_at", "updated_at"])
    return state
