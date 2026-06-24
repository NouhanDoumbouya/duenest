"""
B2B Portals MVP — owner/staff endpoints (authenticated, org-scoped, feature-gated).

All routes live under ``organizations/{org_id}/portal/...``. Access requires an
ACTIVE organization membership; writes require an admin/owner role. The whole
surface is gated behind the ``b2b_portals`` feature flag. No public portal surface
exists — recipients continue through the existing Document Request Link / Sharing
Room public routes. Deterministic — no AI.
"""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.features.flags import require_feature_enabled

from . import portals
from .models import Organization, PortalCase, PortalPerson
from .services import ADMIN_ROLES, require_membership, require_role


class _PortalBase(APIView):
    permission_classes = [IsAuthenticated]

    def get_org(self, request, org_id, *, write=False):
        require_feature_enabled("b2b_portals", request.user)
        org = get_object_or_404(Organization, pk=org_id, archived_at__isnull=True)
        if write:
            require_role(request.user, org, ADMIN_ROLES)
        else:
            require_membership(request.user, org)
        return org

    def get_person(self, org, person_id):
        return get_object_or_404(PortalPerson, pk=person_id, organization=org)

    def get_case(self, org, case_id):
        return get_object_or_404(PortalCase, pk=case_id, organization=org)


class PortalSummaryView(_PortalBase):
    def get(self, request, org_id):
        org = self.get_org(request, org_id)
        return Response(portals.build_portal_dashboard_context(org, request.user))


class PortalPeopleView(_PortalBase):
    def get(self, request, org_id):
        org = self.get_org(request, org_id)
        qs = PortalPerson.objects.filter(organization=org)
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        data = [portals.build_portal_person_payload(p) for p in qs]
        return Response({"people": data, "count": len(data)})

    def post(self, request, org_id):
        org = self.get_org(request, org_id, write=True)
        try:
            person = portals.create_portal_person(org, request.user, request.data)
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            portals.build_portal_person_payload(person), status=status.HTTP_201_CREATED
        )


class PortalPersonDetailView(_PortalBase):
    EDITABLE = {"full_name", "email", "phone", "person_type", "status", "notes"}

    def get(self, request, org_id, person_id):
        org = self.get_org(request, org_id)
        person = self.get_person(org, person_id)
        return Response(portals.build_portal_person_payload(person))

    def patch(self, request, org_id, person_id):
        org = self.get_org(request, org_id, write=True)
        person = self.get_person(org, person_id)
        for field in self.EDITABLE:
            if field in request.data:
                setattr(person, field, str(request.data[field])[:255])
        person.save()
        return Response(portals.build_portal_person_payload(person))


class PortalPersonArchiveView(_PortalBase):
    def post(self, request, org_id, person_id):
        org = self.get_org(request, org_id, write=True)
        person = portals.archive_portal_person(self.get_person(org, person_id), request.user)
        return Response(portals.build_portal_person_payload(person))


class PortalCasesView(_PortalBase):
    def get(self, request, org_id):
        org = self.get_org(request, org_id)
        qs = PortalCase.objects.filter(organization=org).select_related("person")
        status_filter = request.query_params.get("status")
        if status_filter:
            qs = qs.filter(status=status_filter)
        person_filter = request.query_params.get("person")
        if person_filter:
            qs = qs.filter(person_id=person_filter)
        if request.query_params.get("active") == "true":
            qs = qs.exclude(status=PortalCase.Status.ARCHIVED)
        data = [portals.build_portal_case_payload(c) for c in qs]
        return Response({"cases": data, "count": len(data)})

    def post(self, request, org_id):
        org = self.get_org(request, org_id, write=True)
        person = self.get_person(org, request.data.get("person"))
        try:
            case = portals.create_portal_case(org, request.user, person, request.data)
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            portals.build_portal_case_payload(case), status=status.HTTP_201_CREATED
        )


class PortalCaseDetailView(_PortalBase):
    EDITABLE = {"title", "case_type", "priority", "due_date", "notes"}

    def get(self, request, org_id, case_id):
        org = self.get_org(request, org_id)
        return Response(portals.build_portal_case_payload(self.get_case(org, case_id)))

    def patch(self, request, org_id, case_id):
        org = self.get_org(request, org_id, write=True)
        case = self.get_case(org, case_id)
        for field in self.EDITABLE:
            if field in request.data:
                if field == "due_date":
                    case.due_date = portals._date(request.data[field])
                else:
                    setattr(case, field, str(request.data[field])[:255])
        # Status changes go through the service (audited).
        new_status = request.data.get("status")
        case.save()
        if new_status and new_status != case.status:
            try:
                portals.update_portal_case_status(case, request.user, new_status)
            except portals.PortalError as exc:
                return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(portals.build_portal_case_payload(case))


class PortalCaseArchiveView(_PortalBase):
    def post(self, request, org_id, case_id):
        org = self.get_org(request, org_id, write=True)
        case = portals.archive_portal_case(self.get_case(org, case_id), request.user)
        return Response(portals.build_portal_case_payload(case))


class PortalCaseCreatePackView(_PortalBase):
    def post(self, request, org_id, case_id):
        org = self.get_org(request, org_id, write=True)
        case = self.get_case(org, case_id)
        portals.create_case_pack(case, request.user, requirements=request.data.get("requirements"))
        return Response(portals.build_portal_case_payload(case), status=status.HTTP_201_CREATED)


class PortalCaseCreateRoomView(_PortalBase):
    def post(self, request, org_id, case_id):
        org = self.get_org(request, org_id, write=True)
        case = self.get_case(org, case_id)
        portals.create_case_room(case, request.user)
        return Response(portals.build_portal_case_payload(case), status=status.HTTP_201_CREATED)


class PortalCaseCreateRequestView(_PortalBase):
    def post(self, request, org_id, case_id):
        org = self.get_org(request, org_id, write=True)
        case = self.get_case(org, case_id)
        try:
            portals.create_case_document_request(case, request.user, payload=request.data)
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(portals.build_portal_case_payload(case), status=status.HTTP_201_CREATED)


class PortalCaseProgressView(_PortalBase):
    def get(self, request, org_id, case_id):
        org = self.get_org(request, org_id)
        return Response(portals.compute_case_progress(self.get_case(org, case_id)))


class PortalReviewQueueView(_PortalBase):
    def get(self, request, org_id):
        org = self.get_org(request, org_id)
        items = portals.build_review_queue(org)
        return Response({"items": items, "count": len(items)})
