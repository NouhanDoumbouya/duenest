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
from .portal_limits import enforce_portal_enabled
from .services import ADMIN_ROLES, require_membership, require_role


class _PortalBase(APIView):
    permission_classes = [IsAuthenticated]

    def get_org(self, request, org_id, *, write=False, require_enabled=True):
        # Two gates: the b2b_portals feature flag controls BETA exposure (503 when
        # off), and the organization's entitlement controls actual portal usage
        # (portal_not_enabled 403 when the org isn't on a Teams plan). The limits
        # endpoint passes require_enabled=False so it can report the disabled state.
        require_feature_enabled("b2b_portals", request.user)
        org = get_object_or_404(Organization, pk=org_id, archived_at__isnull=True)
        if write:
            require_role(request.user, org, ADMIN_ROLES)
        else:
            require_membership(request.user, org)
        if require_enabled:
            enforce_portal_enabled(org)
        return org

    def get_person(self, org, person_id):
        return get_object_or_404(PortalPerson, pk=person_id, organization=org)

    def get_case(self, org, case_id):
        return get_object_or_404(PortalCase, pk=case_id, organization=org)

    def get_case_request(self, org, case_id, case_request_id):
        from .models import PortalCaseDocumentRequest

        case = self.get_case(org, case_id)
        return get_object_or_404(
            PortalCaseDocumentRequest, pk=case_request_id, case=case
        )


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
    """GET → review queue (uploads awaiting review). Filters: status, case_id,
    person_id, search. Readable by any org member."""

    def get(self, request, org_id):
        from . import portal_reviews

        org = self.get_org(request, org_id)
        filters = {
            "status": request.query_params.get("status"),
            "case_id": request.query_params.get("case_id"),
            "person_id": request.query_params.get("person_id"),
            "search": request.query_params.get("search"),
        }
        items = portal_reviews.build_portal_review_queue(org, request.user, filters)
        return Response({"items": items, "count": len(items)})


class PortalCaseReviewItemsView(_PortalBase):
    """GET → all review items for a case (any status)."""

    def get(self, request, org_id, case_id):
        from . import portal_reviews

        org = self.get_org(request, org_id)
        case = self.get_case(org, case_id)
        items = portal_reviews.build_case_review_items(case, request.user)
        return Response({"items": items, "count": len(items)})


class PortalCaseRequestStartReviewView(_PortalBase):
    """POST → move an uploaded item to 'under review'. Admin/owner only."""

    def post(self, request, org_id, case_id, case_request_id):
        from . import portal_reviews

        org = self.get_org(request, org_id, write=True)
        cr = self.get_case_request(org, case_id, case_request_id)
        portal_reviews.start_case_request_review(cr, request.user)
        return Response(portal_reviews.build_case_review_item(cr, organization=org))


class PortalCaseRequestReviewView(_PortalBase):
    """POST {decision, note, notify_recipient} → accept / reject / needs_replacement.
    Admin/owner only. Accept satisfies the linked pack requirement."""

    def post(self, request, org_id, case_id, case_request_id):
        from . import portal_reviews

        org = self.get_org(request, org_id, write=True)
        cr = self.get_case_request(org, case_id, case_request_id)
        try:
            result = portal_reviews.review_case_document_request(
                cr, request.user,
                decision=request.data.get("decision"),
                note=(request.data.get("note") or "").strip(),
                notify_recipient=bool(request.data.get("notify_recipient")),
            )
        except portal_reviews.ReviewError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result)


class PortalCaseRequestDecisionsView(_PortalBase):
    """GET → the decision history for a case request."""

    def get(self, request, org_id, case_id, case_request_id):
        from . import portal_reviews

        org = self.get_org(request, org_id)
        cr = self.get_case_request(org, case_id, case_request_id)
        return Response({"decisions": portal_reviews.build_case_request_decisions(cr)})


class _PortalCaseRequestFileView(_PortalBase):
    """Org-scoped proxy for the uploaded file of a case request. Streams the
    decrypted bytes (permission-first) — never a raw storage URL. Any org member
    may view; the uploaded file is owned by the org owner."""

    def _resolve(self, request, org_id, case_id, case_request_id):
        from . import portal_reviews

        org = self.get_org(request, org_id)
        cr = self.get_case_request(org, case_id, case_request_id)
        return portal_reviews.resolve_case_request_file(cr)


class PortalCaseRequestFilePreviewView(_PortalCaseRequestFileView):
    def get(self, request, org_id, case_id, case_request_id):
        from apps.documents.views import _inline_file_response

        f = self._resolve(request, org_id, case_id, case_request_id)
        if f is None:
            return Response({"detail": "No uploaded file."}, status=status.HTTP_404_NOT_FOUND)
        if not f.is_previewable:
            return Response(
                {"detail": "This file type cannot be previewed."},
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            )
        return _inline_file_response(f)


class PortalCaseRequestFileDownloadView(_PortalCaseRequestFileView):
    def get(self, request, org_id, case_id, case_request_id):
        from apps.documents.views import _file_response

        f = self._resolve(request, org_id, case_id, case_request_id)
        if f is None:
            return Response({"detail": "No uploaded file."}, status=status.HTTP_404_NOT_FOUND)
        return _file_response(f, as_attachment=True)


class PortalDashboardView(_PortalBase):
    """GET → the Organization Dashboard V1 payload (operational metrics + bounded
    action queues + plan usage). Read-only; any active org member may read. No
    audit event is recorded for opening the dashboard (avoids noisy logs)."""

    def get(self, request, org_id):
        from . import portal_dashboard

        org = self.get_org(request, org_id)
        return Response(portal_dashboard.build_dashboard_payload(org, request.user))


class PortalLimitsView(_PortalBase):
    """GET → the organization's portal plan, limits, usage, and remaining. Readable
    by any member (even when the portal is not enabled, so the UI can show the
    paywall/coming-soon state)."""

    def get(self, request, org_id):
        from .portal_limits import build_organization_limit_payload

        org = self.get_org(request, org_id, require_enabled=False)
        return Response(build_organization_limit_payload(org))
