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
        # B2B Custom Fields and Statuses V1 — safe, bounded filters (ORM only).
        custom_status = request.query_params.get("custom_status")
        if custom_status:
            qs = qs.filter(custom_status_id=custom_status)
        cf_key = request.query_params.get("cf_key")
        cf_value = request.query_params.get("cf_value")
        if cf_key and cf_value is not None:
            # Exact match on the validated JSON value (single_select / boolean /
            # short_text). No raw SQL — Django JSONField lookup only.
            qs = qs.filter(custom_field_values__field__key=cf_key,
                           custom_field_values__value=cf_value).distinct()
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


class PortalReminderPreviewView(_PortalBase):
    """GET → reminder recipient preview for a reminder_type. Any active member may
    preview. Query: reminder_type (required), case_id, person_id,
    include_recently_reminded."""

    def get(self, request, org_id):
        from . import portal_reminders

        org = self.get_org(request, org_id)
        reminder_type = request.query_params.get("reminder_type") or ""
        filters = {
            "case_id": request.query_params.get("case_id"),
            "person_id": request.query_params.get("person_id"),
        }
        include_recent = request.query_params.get("include_recently_reminded") == "true"
        try:
            payload = portal_reminders.build_reminder_preview_payload(
                org, request.user, reminder_type,
                filters=filters, include_recently_reminded=include_recent,
            )
        except portal_reminders.ReminderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(payload)


class PortalReminderBatchesView(_PortalBase):
    """GET → recent reminder batches (member). POST → create + optionally send a
    batch (admin/owner only)."""

    def get(self, request, org_id):
        from . import portal_reminders
        from .models import PortalReminderBatch

        org = self.get_org(request, org_id)
        qs = PortalReminderBatch.objects.filter(organization=org)[:50]
        data = [portal_reminders.build_reminder_batch_payload(b) for b in qs]
        return Response({"batches": data, "count": len(data)})

    def post(self, request, org_id):
        from . import portal_reminders

        org = self.get_org(request, org_id, write=True)
        try:
            batch = portal_reminders.create_reminder_batch(
                org, request.user,
                request.data.get("reminder_type") or "",
                payload=request.data,
            )
        except portal_reminders.ReminderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            portal_reminders.build_reminder_batch_payload(batch, include_recipients=True),
            status=status.HTTP_201_CREATED,
        )


class PortalReminderBatchDetailView(_PortalBase):
    """GET → a reminder batch with its recipient outcomes (member)."""

    def get(self, request, org_id, batch_id):
        from . import portal_reminders
        from .models import PortalReminderBatch

        org = self.get_org(request, org_id)
        batch = get_object_or_404(PortalReminderBatch, pk=batch_id, organization=org)
        return Response(
            portal_reminders.build_reminder_batch_payload(batch, include_recipients=True)
        )


class PortalReminderBatchSendView(_PortalBase):
    """POST → send a draft batch (admin/owner only)."""

    def post(self, request, org_id, batch_id):
        from . import portal_reminders
        from .models import PortalReminderBatch

        org = self.get_org(request, org_id, write=True)
        batch = get_object_or_404(PortalReminderBatch, pk=batch_id, organization=org)
        portal_reminders.send_portal_reminder_batch(
            batch, request.user,
            override_recent=bool(request.data.get("override_recent_reminders")),
        )
        return Response(
            portal_reminders.build_reminder_batch_payload(batch, include_recipients=True)
        )


class PortalReminderBatchCancelView(_PortalBase):
    """POST → cancel a draft batch (admin/owner only)."""

    def post(self, request, org_id, batch_id):
        from . import portal_reminders
        from .models import PortalReminderBatch

        org = self.get_org(request, org_id, write=True)
        batch = get_object_or_404(PortalReminderBatch, pk=batch_id, organization=org)
        try:
            portal_reminders.cancel_reminder_batch(batch, request.user)
        except portal_reminders.ReminderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(portal_reminders.build_reminder_batch_payload(batch))


class _PortalFolderBase(_PortalBase):
    """Shared helpers for org-scoped document-organization endpoints. Reuses the
    ``apps.documents.folders`` service with ``organization`` scope (owner=None)."""

    def get_folder(self, org, folder_id):
        from apps.documents.models import DocumentFolder

        return get_object_or_404(DocumentFolder, pk=folder_id, organization=org)

    def get_collection(self, org, collection_id):
        from apps.documents.models import DocumentCollection

        return get_object_or_404(DocumentCollection, pk=collection_id, organization=org)


class PortalDocumentOrganizationView(_PortalFolderBase):
    """GET → the org's folder tree + tags + collections + structure preference."""

    def get(self, request, org_id):
        from apps.documents import folders as folders_svc
        from apps.documents.models import DocumentCollection, DocumentTag

        org = self.get_org(request, org_id)
        pref = folders_svc.get_structure_preference(org)
        tags = DocumentTag.objects.filter(organization=org)
        collections = DocumentCollection.objects.filter(organization=org)
        return Response({
            "folders": folders_svc.build_folder_tree(None, org),
            "tags": [folders_svc.build_tag_payload(t) for t in tags],
            "collections": [folders_svc.build_collection_payload(c) for c in collections],
            "preference": {
                "structure_mode": pref.structure_mode,
                "auto_create_case_folder": pref.auto_create_case_folder,
                "auto_create_person_folder": pref.auto_create_person_folder,
                "auto_file_accepted_uploads": pref.auto_file_accepted_uploads,
                "default_root_folder_id": pref.default_root_folder_id,
            },
        })


class PortalDocumentStructurePreferenceView(_PortalFolderBase):
    """PATCH → update the org's document structure preference (admin/owner)."""

    def patch(self, request, org_id):
        from apps.documents import folders as folders_svc

        org = self.get_org(request, org_id, write=True)
        pref = folders_svc.update_structure_preference(org, request.user, request.data)
        return Response({
            "structure_mode": pref.structure_mode,
            "auto_create_case_folder": pref.auto_create_case_folder,
            "auto_create_person_folder": pref.auto_create_person_folder,
            "auto_file_accepted_uploads": pref.auto_file_accepted_uploads,
            "default_root_folder_id": pref.default_root_folder_id,
        })


class PortalFoldersView(_PortalFolderBase):
    def get(self, request, org_id):
        from apps.documents import folders as folders_svc

        org = self.get_org(request, org_id)
        include_archived = request.query_params.get("include_archived") == "true"
        return Response({"folders": folders_svc.build_folder_tree(
            None, org, include_archived=include_archived)})

    def post(self, request, org_id):
        from apps.documents import folders as folders_svc

        org = self.get_org(request, org_id, write=True)
        try:
            folder = folders_svc.create_folder(None, org, request.user, request.data)
        except folders_svc.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders_svc.build_folder_payload(folder),
                        status=status.HTTP_201_CREATED)


class PortalFolderDetailView(_PortalFolderBase):
    def get(self, request, org_id, folder_id):
        from apps.documents import folders as folders_svc

        org = self.get_org(request, org_id)
        return Response(folders_svc.build_folder_payload(self.get_folder(org, folder_id)))

    def patch(self, request, org_id, folder_id):
        from apps.documents import folders as folders_svc

        org = self.get_org(request, org_id, write=True)
        try:
            folder = folders_svc.update_folder(
                self.get_folder(org, folder_id), request.user, request.data)
        except folders_svc.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders_svc.build_folder_payload(folder))


class PortalFolderArchiveView(_PortalFolderBase):
    def post(self, request, org_id, folder_id):
        from apps.documents import folders as folders_svc

        org = self.get_org(request, org_id, write=True)
        folder = folders_svc.archive_folder(self.get_folder(org, folder_id), request.user)
        return Response(folders_svc.build_folder_payload(folder))


class PortalFolderMoveView(_PortalFolderBase):
    def post(self, request, org_id, folder_id):
        from apps.documents import folders as folders_svc

        org = self.get_org(request, org_id, write=True)
        folder = self.get_folder(org, folder_id)
        new_parent = self.get_folder(org, request.data["parent_id"]) if request.data.get("parent_id") else None
        try:
            folders_svc.move_folder(folder, new_parent, request.user)
        except folders_svc.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders_svc.build_folder_payload(folder))


class PortalFolderContentsView(_PortalFolderBase):
    def get(self, request, org_id, folder_id):
        from apps.documents import folders as folders_svc

        org = self.get_org(request, org_id)
        folder = self.get_folder(org, folder_id)
        return Response(folders_svc.build_folder_contents(folder, filters=request.query_params))


class PortalDocumentTagsView(_PortalFolderBase):
    def get(self, request, org_id):
        from apps.documents import folders as folders_svc
        from apps.documents.models import DocumentTag

        org = self.get_org(request, org_id)
        tags = DocumentTag.objects.filter(organization=org)
        return Response({"tags": [folders_svc.build_tag_payload(t) for t in tags]})

    def post(self, request, org_id):
        from apps.documents import folders as folders_svc

        org = self.get_org(request, org_id, write=True)
        try:
            tag = folders_svc.create_tag(None, org, request.user, request.data)
        except folders_svc.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders_svc.build_tag_payload(tag), status=status.HTTP_201_CREATED)


class PortalDocumentCollectionsView(_PortalFolderBase):
    def get(self, request, org_id):
        from apps.documents import folders as folders_svc
        from apps.documents.models import DocumentCollection

        org = self.get_org(request, org_id)
        collections = DocumentCollection.objects.filter(organization=org)
        return Response({"collections": [
            folders_svc.build_collection_payload(c) for c in collections]})

    def post(self, request, org_id):
        from apps.documents import folders as folders_svc

        org = self.get_org(request, org_id, write=True)
        try:
            collection = folders_svc.create_collection(None, org, request.user, request.data)
        except folders_svc.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders_svc.build_collection_payload(collection),
                        status=status.HTTP_201_CREATED)


class PortalDocumentSavedViewsView(_PortalFolderBase):
    def get(self, request, org_id):
        from apps.documents import folders as folders_svc
        from apps.documents.models import DocumentCollection

        org = self.get_org(request, org_id)
        qs = DocumentCollection.objects.filter(
            organization=org,
            collection_type=DocumentCollection.CollectionType.SAVED_VIEW,
        )
        return Response({"saved_views": [folders_svc.build_collection_payload(c) for c in qs]})

    def post(self, request, org_id):
        from apps.documents import folders as folders_svc

        org = self.get_org(request, org_id, write=True)
        data = dict(request.data)
        data["collection_type"] = "saved_view"
        try:
            collection = folders_svc.create_collection(None, org, request.user, data)
        except folders_svc.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders_svc.build_collection_payload(collection),
                        status=status.HTTP_201_CREATED)


class _CustomBase(_PortalBase):
    def get_field(self, org, field_id):
        from .models import OrganizationCustomField

        return get_object_or_404(OrganizationCustomField, pk=field_id, organization=org)

    def get_status_def(self, org, status_id):
        from .models import OrganizationCaseStatusDefinition

        return get_object_or_404(OrganizationCaseStatusDefinition, pk=status_id, organization=org)


class PortalCustomFieldsView(_CustomBase):
    """GET → custom fields (member). POST → create a field (admin/owner)."""

    def get(self, request, org_id):
        from . import custom_fields
        from .models import OrganizationCustomField

        org = self.get_org(request, org_id)
        qs = OrganizationCustomField.objects.filter(organization=org)
        target = request.query_params.get("target")
        if target:
            qs = qs.filter(target=target)
        if request.query_params.get("include_archived") != "true":
            qs = qs.filter(is_active=True)
        return Response({"fields": [custom_fields.build_custom_field_payload(f) for f in qs],
                         "count": qs.count()})

    def post(self, request, org_id):
        from . import custom_fields

        org = self.get_org(request, org_id, write=True)
        try:
            field = custom_fields.create_custom_field(org, request.user, request.data)
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(custom_fields.build_custom_field_payload(field),
                        status=status.HTTP_201_CREATED)


class PortalCustomFieldDetailView(_CustomBase):
    def get(self, request, org_id, field_id):
        from . import custom_fields

        org = self.get_org(request, org_id)
        return Response(custom_fields.build_custom_field_payload(self.get_field(org, field_id)))

    def patch(self, request, org_id, field_id):
        from . import custom_fields

        org = self.get_org(request, org_id, write=True)
        try:
            field = custom_fields.update_custom_field(
                self.get_field(org, field_id), request.user, request.data)
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(custom_fields.build_custom_field_payload(field))


class PortalCustomFieldArchiveView(_CustomBase):
    def post(self, request, org_id, field_id):
        from . import custom_fields

        org = self.get_org(request, org_id, write=True)
        field = custom_fields.archive_custom_field(self.get_field(org, field_id), request.user)
        return Response(custom_fields.build_custom_field_payload(field))


class PortalCustomFieldSchemaView(_CustomBase):
    """GET ?target=person|case → the active field schema (member)."""

    def get(self, request, org_id):
        from . import custom_fields

        org = self.get_org(request, org_id)
        target = request.query_params.get("target") or "case"
        return Response({"target": target,
                         "fields": custom_fields.build_custom_field_schema(org, target)})


class PortalPersonCustomFieldsView(_CustomBase):
    def get(self, request, org_id, person_id):
        from . import custom_fields

        org = self.get_org(request, org_id)
        person = self.get_person(org, person_id)
        return Response({
            "schema": custom_fields.build_custom_field_schema(org, "person"),
            "values": custom_fields.build_custom_field_values_payload(person),
        })

    def patch(self, request, org_id, person_id):
        from . import custom_fields

        org = self.get_org(request, org_id, write=True)
        person = self.get_person(org, person_id)
        try:
            changed = custom_fields.set_custom_field_values(
                org, person, request.data.get("values") or {}, request.user)
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"changed": changed,
                         "values": custom_fields.build_custom_field_values_payload(person)})


class PortalCaseCustomFieldsView(_CustomBase):
    def get(self, request, org_id, case_id):
        from . import custom_fields

        org = self.get_org(request, org_id)
        case = self.get_case(org, case_id)
        return Response({
            "schema": custom_fields.build_custom_field_schema(org, "case"),
            "values": custom_fields.build_custom_field_values_payload(case),
        })

    def patch(self, request, org_id, case_id):
        from . import custom_fields

        org = self.get_org(request, org_id, write=True)
        case = self.get_case(org, case_id)
        try:
            changed = custom_fields.set_custom_field_values(
                org, case, request.data.get("values") or {}, request.user)
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"changed": changed,
                         "values": custom_fields.build_custom_field_values_payload(case)})


class PortalCaseStatusesView(_CustomBase):
    """GET → custom case statuses (member). POST → create (admin/owner)."""

    def get(self, request, org_id):
        from . import custom_fields
        from .models import OrganizationCaseStatusDefinition

        org = self.get_org(request, org_id)
        qs = OrganizationCaseStatusDefinition.objects.filter(organization=org)
        if request.query_params.get("include_archived") != "true":
            qs = qs.filter(is_active=True)
        return Response({"statuses": [custom_fields.build_case_status_payload(s) for s in qs]})

    def post(self, request, org_id):
        from . import custom_fields

        org = self.get_org(request, org_id, write=True)
        try:
            status_def = custom_fields.create_case_status_definition(org, request.user, request.data)
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(custom_fields.build_case_status_payload(status_def),
                        status=status.HTTP_201_CREATED)


class PortalCaseStatusDetailView(_CustomBase):
    def patch(self, request, org_id, status_id):
        from . import custom_fields

        org = self.get_org(request, org_id, write=True)
        try:
            status_def = custom_fields.update_case_status_definition(
                self.get_status_def(org, status_id), request.user, request.data)
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(custom_fields.build_case_status_payload(status_def))


class PortalCaseStatusArchiveView(_CustomBase):
    def post(self, request, org_id, status_id):
        from . import custom_fields

        org = self.get_org(request, org_id, write=True)
        status_def = custom_fields.archive_case_status_definition(
            self.get_status_def(org, status_id), request.user)
        return Response(custom_fields.build_case_status_payload(status_def))


class PortalCaseStatusSeedView(_CustomBase):
    def post(self, request, org_id):
        from . import custom_fields
        from .models import OrganizationCaseStatusDefinition

        org = self.get_org(request, org_id, write=True)
        custom_fields.seed_default_case_statuses(org, request.user)
        qs = OrganizationCaseStatusDefinition.objects.filter(organization=org, is_active=True)
        return Response({"statuses": [custom_fields.build_case_status_payload(s) for s in qs]})


class PortalCaseSetStatusView(_CustomBase):
    """POST {status_id} → set a case's custom status (keeps system status in sync)."""

    def post(self, request, org_id, case_id):
        from . import custom_fields

        org = self.get_org(request, org_id, write=True)
        case = self.get_case(org, case_id)
        status_def = None
        if request.data.get("status_id"):
            status_def = self.get_status_def(org, request.data["status_id"])
        try:
            custom_fields.set_case_custom_status(case, status_def, request.user)
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(portals.build_portal_case_payload(case))


class PortalTemplatesView(_PortalBase):
    """GET → org case templates (member). POST → create a template (admin/owner)."""

    def get(self, request, org_id):
        from . import portal_templates

        org = self.get_org(request, org_id)
        include_archived = request.query_params.get("include_archived") == "true"
        data = portal_templates.build_case_template_list_payload(
            org, include_archived=include_archived
        )
        return Response({"templates": data, "count": len(data)})

    def post(self, request, org_id):
        from . import portal_templates

        org = self.get_org(request, org_id, write=True)
        try:
            template = portal_templates.create_case_template(org, request.user, request.data)
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            portal_templates.build_case_template_payload(template),
            status=status.HTTP_201_CREATED,
        )


class PortalTemplateDetailView(_PortalBase):
    """GET → a template with its requirements (member). PATCH → edit (admin/owner)."""

    def _get_template(self, org, template_id):
        from .models import OrganizationCaseTemplate

        return get_object_or_404(OrganizationCaseTemplate, pk=template_id, organization=org)

    def get(self, request, org_id, template_id):
        from . import portal_templates

        org = self.get_org(request, org_id)
        template = self._get_template(org, template_id)
        return Response(portal_templates.build_case_template_payload(template))

    def patch(self, request, org_id, template_id):
        from . import portal_templates

        org = self.get_org(request, org_id, write=True)
        template = self._get_template(org, template_id)
        try:
            portal_templates.update_case_template(template, request.user, request.data)
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(portal_templates.build_case_template_payload(template))


class PortalTemplateArchiveView(_PortalBase):
    """POST → archive a template (admin/owner)."""

    def post(self, request, org_id, template_id):
        from . import portal_templates
        from .models import OrganizationCaseTemplate

        org = self.get_org(request, org_id, write=True)
        template = get_object_or_404(OrganizationCaseTemplate, pk=template_id, organization=org)
        portal_templates.archive_case_template(template, request.user)
        return Response(portal_templates.build_case_template_payload(template))


class PortalTemplateDuplicateView(_PortalBase):
    """POST → duplicate a template into a new editable copy (admin/owner)."""

    def post(self, request, org_id, template_id):
        from . import portal_templates
        from .models import OrganizationCaseTemplate

        org = self.get_org(request, org_id, write=True)
        template = get_object_or_404(OrganizationCaseTemplate, pk=template_id, organization=org)
        copy = portal_templates.duplicate_case_template(template, request.user)
        return Response(
            portal_templates.build_case_template_payload(copy),
            status=status.HTTP_201_CREATED,
        )


class PortalTemplateCreateCaseView(_PortalBase):
    """POST → create a portal case from a template (admin/owner — same policy as
    manual case creation). Optionally creates the pack / room / requests."""

    def post(self, request, org_id, template_id):
        from . import portal_templates
        from .models import OrganizationCaseTemplate

        org = self.get_org(request, org_id, write=True)
        template = get_object_or_404(OrganizationCaseTemplate, pk=template_id, organization=org)
        person = self.get_person(org, request.data.get("person_id"))
        try:
            result = portal_templates.create_case_from_template(
                org, request.user, template, person, request.data
            )
        except portals.PortalError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_201_CREATED)


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


# ---- Onboarding & Demo Workspaces V1 ---------------------------------------


class PortalOnboardingView(_PortalBase):
    """The org portal setup guide (derived checklist + next action). Members read."""

    def get(self, request, org_id):
        from .onboarding import build_org_onboarding_payload

        org = self.get_org(request, org_id)
        return Response(build_org_onboarding_payload(org))


class PortalOnboardingDismissView(_PortalBase):
    """Dismiss (or restore) the setup guide. Admin/owner only."""

    def post(self, request, org_id):
        from .onboarding import build_org_onboarding_payload, dismiss_org_onboarding

        org = self.get_org(request, org_id, write=True)
        dismissed = True
        if isinstance(request.data, dict) and "dismissed" in request.data:
            dismissed = bool(request.data.get("dismissed"))
        dismiss_org_onboarding(org, dismissed=dismissed)
        return Response(build_org_onboarding_payload(org))


class PortalDemoView(_PortalBase):
    """Create the safe sample demo workspace (idempotent). Admin/owner only.

    Sends no email, calls no AI, and creates no sensitive-looking files."""

    def post(self, request, org_id):
        from .demo import create_organization_demo_workspace
        from .onboarding import build_org_onboarding_payload

        org = self.get_org(request, org_id, write=True)
        result = create_organization_demo_workspace(org, request.user)
        return Response(
            {**result, "onboarding": build_org_onboarding_payload(org)}
        )


class PortalDemoCleanupView(_PortalBase):
    """Remove the demo workspace (by tracked ids). Admin/owner only."""

    def post(self, request, org_id):
        from .demo import cleanup_organization_demo_workspace
        from .onboarding import build_org_onboarding_payload

        org = self.get_org(request, org_id, write=True)
        result = cleanup_organization_demo_workspace(org)
        return Response(
            {**result, "onboarding": build_org_onboarding_payload(org)}
        )
