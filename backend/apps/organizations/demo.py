"""
Organization demo workspace (Onboarding & Demo Workspaces V1).

Creates a safe, clearly-labeled SAMPLE B2B workflow so a beta org can experience
the portal end-to-end without real applicants or sensitive files. It REUSES the
existing org services (templates, custom fields/statuses, people, cases, folders)
so it can never drift from real behaviour.

SAFETY:
* Idempotent — a second call returns the existing demo (no duplicates).
* Sends NO email by default (the demo person has no email; requests are created
  with ``send_request_emails=False``).
* Makes NO AI call and consumes NO AI credits.
* Creates NO real-looking identity data — requirement titles are obvious
  placeholders ("Passport copy (placeholder)") and the person is "Demo Applicant";
  no document files, numbers, or contents are created.
* Every object is tagged ``[Demo]`` and its id is recorded in
  ``OrganizationOnboarding.demo_refs`` so the whole workspace can be cleaned up.
"""

from __future__ import annotations

from django.db import transaction
from django.utils import timezone

from apps.documents import folders as folders_svc
from apps.documents.models import DocumentFolder
from . import custom_fields, portal_templates, portals
from .models import (
    OrganizationCaseStatusDefinition,
    OrganizationCaseTemplate,
    OrganizationCustomField,
    PortalCase,
    PortalCaseDocumentRequest,
    PortalPerson,
)
from .onboarding import get_or_create_onboarding

DEMO_MARKER = "DUENEST_DEMO_DATA"
DEMO_TEMPLATE_NAME = "Scholarship Application Demo"


def _demo_note(text: str) -> str:
    return f"[Demo: {DEMO_MARKER}] {text}"


def _summary(state, *, created: bool) -> dict:
    return {
        "created": created,
        "demo_created_at": (
            state.demo_created_at.isoformat() if state.demo_created_at else None
        ),
        "refs": state.demo_refs or {},
    }


def create_organization_demo_workspace(org, user) -> dict:
    """Idempotently create the sample workspace. Returns a safe summary."""
    state = get_or_create_onboarding(org)
    if state.demo_created_at:
        return _summary(state, created=False)

    with transaction.atomic():
        refs: dict = {"statuses": [], "fields": [], "folders": []}

        # 1) Sample custom case statuses (layer on the fixed system statuses).
        for label, category, system in (
            ("Collecting documents (demo)", "collecting", "documents_missing"),
            ("In review (demo)", "reviewing", "under_review"),
            ("Ready to submit (demo)", "ready", "ready_to_submit"),
        ):
            try:
                s = custom_fields.create_case_status_definition(
                    org,
                    user,
                    {
                        "label": label,
                        "category": category,
                        "maps_to_system_status": system,
                        "description": _demo_note("Sample status."),
                    },
                )
                refs["statuses"].append(s.id)
            except Exception:  # noqa: BLE001 — best-effort (e.g. cap reached)
                pass

        # 2) Sample custom fields.
        for label in ("Intake month (demo)", "Program (demo)", "Priority (demo)"):
            try:
                f = custom_fields.create_custom_field(
                    org,
                    user,
                    {
                        "label": label,
                        "target": "case",
                        "field_type": "short_text",
                        "description": _demo_note("Sample field."),
                    },
                )
                refs["fields"].append(f.id)
            except Exception:  # noqa: BLE001
                pass

        # 3) Sample template with placeholder requirements (names only — no files).
        template = portal_templates.create_case_template(
            org,
            user,
            {
                "name": DEMO_TEMPLATE_NAME,
                "description": _demo_note("Sample scholarship application template."),
                "case_type": "scholarship",
                "auto_create_pack": True,
                "auto_create_room": False,
                "auto_create_requests": True,
                "requirements": [
                    {"title": "Passport copy (placeholder)"},
                    {"title": "Academic transcript (placeholder)"},
                    {"title": "Recommendation letter (placeholder)"},
                    {"title": "Personal statement (placeholder)"},
                ],
            },
        )
        refs["template"] = template.id

        # 4) Sample person — NO email, so nothing is ever sent.
        person = portals.create_portal_person(
            org,
            user,
            {
                "full_name": "Demo Applicant",
                "person_type": "student",
                "notes": _demo_note("Sample applicant — not a real person."),
            },
        )
        refs["person"] = person.id

        # 5) Sample case from the template (requests created, NO emails sent).
        result = portal_templates.create_case_from_template(
            org,
            user,
            template,
            person,
            {
                "title": "Scholarship Application — Demo Applicant",
                "create_requests": True,
                "create_pack": True,
                "create_room": False,
                "send_request_emails": False,
            },
        )
        case_id = result["case"]["id"]
        refs["case"] = case_id
        case = PortalCase.objects.get(id=case_id)
        refs["bundle"] = case.linked_bundle_id
        refs["request_links"] = [
            r
            for r in PortalCaseDocumentRequest.objects.filter(case=case).values_list(
                "document_request_id", flat=True
            )
            if r
        ]

        # 6) Sample folder structure (metadata-only lens; org-scoped → owner=None).
        try:
            people = folders_svc.create_folder(None, org, user, {"name": "People (demo)"})
            applicant = folders_svc.create_folder(
                None, org, user, {"name": "Demo Applicant", "parent": people.id}
            )
            scholarship = folders_svc.create_folder(
                None, org, user, {"name": "Scholarship Application", "parent": applicant.id}
            )
            refs["folders"] = [people.id, applicant.id, scholarship.id]
        except Exception:  # noqa: BLE001
            pass

        state.demo_created_at = timezone.now()
        state.demo_created_by = user
        state.demo_refs = refs
        state.save(
            update_fields=[
                "demo_created_at",
                "demo_created_by",
                "demo_refs",
                "updated_at",
            ]
        )

    return _summary(state, created=True)


def cleanup_organization_demo_workspace(org) -> dict:
    """Remove the demo workspace (best-effort, by tracked ids). Idempotent."""
    state = get_or_create_onboarding(org)
    if not state.demo_created_at:
        return {"removed": False}

    refs = state.demo_refs or {}
    with transaction.atomic():
        # Underlying request links + pack first (they aren't cascaded by the case).
        if refs.get("request_links"):
            from apps.documents.models import DocumentRequestLink

            DocumentRequestLink.objects.filter(id__in=refs["request_links"]).delete()
        if refs.get("bundle"):
            from apps.documents.models import DocumentBundle

            DocumentBundle.objects.filter(id=refs["bundle"]).delete()
        if refs.get("case"):
            PortalCase.objects.filter(id=refs["case"], organization=org).delete()
        if refs.get("person"):
            PortalPerson.objects.filter(id=refs["person"], organization=org).delete()
        if refs.get("template"):
            OrganizationCaseTemplate.objects.filter(
                id=refs["template"], organization=org
            ).delete()
        OrganizationCaseStatusDefinition.objects.filter(
            id__in=refs.get("statuses", []), organization=org
        ).delete()
        OrganizationCustomField.objects.filter(
            id__in=refs.get("fields", []), organization=org
        ).delete()
        DocumentFolder.objects.filter(
            id__in=refs.get("folders", []), organization=org
        ).delete()

        state.demo_created_at = None
        state.demo_created_by = None
        state.demo_refs = {}
        state.save(
            update_fields=[
                "demo_created_at",
                "demo_created_by",
                "demo_refs",
                "updated_at",
            ]
        )
    return {"removed": True}
