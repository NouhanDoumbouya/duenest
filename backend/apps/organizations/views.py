import io

from django.conf import settings
from django.db.models import Count, Q, Sum
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import (
    APIException,
    ValidationError as DRFValidationError,
)
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.security import file_validation
from apps.core.security.encryption import DecryptionError
from apps.users.avatars import AvatarProcessingError, build_avatar_data_url
from .file_encryption import (
    encrypt_org_document_file,
    encrypt_submission_file,
    read_org_document_file,
    read_submission_file,
)

from .models import (
    CampaignTargetMember,
    DocumentCollectionCampaign,
    DocumentRequest,
    DocumentRequestSubmission,
    Organization,
    OrganizationBundle,
    OrganizationDocument,
    OrganizationDocumentFile,
    OrganizationInvite,
    OrganizationMembership,
    OrganizationRequestTemplate,
    OrganizationSecureRoom,
    generate_org_token,
)
from .plan_usage import (
    enforce_organization_campaign_limit,
    enforce_organization_document_limit,
    enforce_organization_limit,
    enforce_organization_member_limit,
    enforce_organization_request_limit,
    enforce_organization_room_limit,
)
from .serializers import (
    BulkInviteSerializer,
    DocumentCollectionCampaignSerializer,
    DocumentRequestSerializer,
    DocumentRequestSubmissionSerializer,
    InviteAcceptSerializer,
    OrganizationActivitySerializer,
    OrganizationBundleSerializer,
    OrganizationDocumentFileSerializer,
    OrganizationDocumentSerializer,
    OrganizationFileUploadSerializer,
    OrganizationInviteSerializer,
    OrganizationMembershipSerializer,
    OrganizationSerializer,
    OrganizationRequestTemplateSerializer,
    OrganizationSecureRoomSerializer,
    PublicDocumentRequestSerializer,
    PublicOrganizationSecureRoomSerializer,
)
from .services import (
    ADMIN_ROLES,
    EDITOR_ROLES,
    accept_invite,
    build_summary,
    create_invite,
    create_owner_membership,
    ensure_not_last_owner,
    ensure_public_upload_token,
    is_admin,
    log_activity,
    organization_deadline_events,
    parse_bulk_emails,
    require_membership,
    require_role,
    send_document_request_email,
)


def _limit_owner(organization: Organization, fallback):
    return organization.created_by or fallback


def _track_product_event(request, event_type: str, *, object_type="", object_id="", metadata=None):
    try:
        from apps.founder.services import track_product_event

        track_product_event(
            event_type=event_type,
            user=getattr(request, "user", None),
            request=request,
            object_type=object_type,
            object_id=object_id,
            metadata=metadata or {},
        )
    except Exception:
        return


class OrganizationViewSet(viewsets.ModelViewSet):
    serializer_class = OrganizationSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in {"list", "create", "retrieve", "partial_update", "update"}:
            from .serializers import OrganizationSerializer

            return OrganizationSerializer
        return super().get_serializer_class()

    def get_queryset(self):
        # Use a direct membership id list. The
        # organizations table is expected to stay small per user in V1.
        org_ids = OrganizationMembership.objects.filter(
            user=self.request.user,
            status=OrganizationMembership.Status.ACTIVE,
        ).values_list("organization_id", flat=True)
        return (
            Organization.objects.filter(id__in=org_ids, archived_at__isnull=True)
            .annotate(
                member_count=Count(
                    "memberships",
                    filter=Q(memberships__status=OrganizationMembership.Status.ACTIVE),
                )
            )
            .order_by("name")
        )

    def get_organization(self, pk=None):
        organization = get_object_or_404(Organization, pk=pk or self.kwargs.get("pk"))
        require_membership(self.request.user, organization)
        return organization

    def perform_create(self, serializer):
        enforce_organization_limit(self.request.user)
        organization = serializer.save(created_by=self.request.user)
        create_owner_membership(organization, self.request.user)
        _track_product_event(
            self.request,
            "organization_created",
            object_type="organization",
            object_id=organization.id,
        )

    def update(self, request, *args, **kwargs):
        organization = self.get_object()
        require_role(request.user, organization, ADMIN_ROLES)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        organization = self.get_object()
        require_role(request.user, organization, {OrganizationMembership.Role.OWNER})
        organization.archived_at = timezone.now()
        organization.save(update_fields=["archived_at", "updated_at"])
        log_activity(
            organization,
            "organization_archived",
            "Organization archived",
            actor=request.user,
            target_type="organization",
            target_id=organization.id,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ---- Members ---------------------------------------------------------

    @action(detail=True, methods=["get"], url_path="members")
    def members(self, request, pk=None):
        organization = self.get_organization(pk)
        memberships = organization.memberships.select_related("user").all()
        return Response(OrganizationMembershipSerializer(memberships, many=True).data)

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"members/(?P<membership_id>[0-9]+)",
    )
    def member_detail(self, request, pk=None, membership_id=None):
        organization = self.get_organization(pk)
        actor = require_role(request.user, organization, ADMIN_ROLES)
        membership = get_object_or_404(
            OrganizationMembership.objects.select_related("user"),
            pk=membership_id,
            organization=organization,
        )
        if actor.role != OrganizationMembership.Role.OWNER and membership.role == OrganizationMembership.Role.OWNER:
            return Response(
                {"detail": "Admins cannot change or remove organization owners."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.method == "DELETE":
            ensure_not_last_owner(membership)
            membership.status = OrganizationMembership.Status.LEFT
            membership.save(update_fields=["status", "updated_at"])
            log_activity(
                organization,
                "member_removed",
                f"Removed {membership.user.email}",
                actor=request.user,
                target_type="membership",
                target_id=membership.id,
            )
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = OrganizationMembershipSerializer(
            membership, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        next_role = serializer.validated_data.get("role", membership.role)
        next_status = serializer.validated_data.get("status", membership.status)
        if actor.role != OrganizationMembership.Role.OWNER and next_role == OrganizationMembership.Role.OWNER:
            return Response(
                {"detail": "Admins cannot promote members to owner."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if membership.role == OrganizationMembership.Role.OWNER and (
            next_role != membership.role or next_status != OrganizationMembership.Status.ACTIVE
        ):
            ensure_not_last_owner(membership)
        serializer.save()
        log_activity(
            organization,
            "member_updated",
            f"Updated {membership.user.email}",
            actor=request.user,
            target_type="membership",
            target_id=membership.id,
        )
        return Response(serializer.data)

    # ---- Invites ---------------------------------------------------------

    @action(detail=True, methods=["get", "post"], url_path="invites")
    def invites(self, request, pk=None):
        organization = self.get_organization(pk)
        if request.method == "GET":
            require_role(request.user, organization, ADMIN_ROLES)
            invites = organization.invites.select_related("invited_by", "accepted_by")
            return Response(OrganizationInviteSerializer(invites, many=True).data)
        require_role(request.user, organization, ADMIN_ROLES)
        # Teams orgs are bounded by their org seat limit; others by the creator's
        # personal member limit (existing behavior).
        from .portal_limits import enforce_organization_seat_limit

        enforce_organization_seat_limit(organization)
        enforce_organization_member_limit(_limit_owner(organization, request.user))
        serializer = OrganizationInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        invite = create_invite(
            organization,
            email=serializer.validated_data["email"],
            role=serializer.validated_data.get("role", OrganizationMembership.Role.MEMBER),
            invited_by=request.user,
        )
        return Response(
            OrganizationInviteSerializer(invite).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"], url_path="invites/bulk")
    def bulk_invites(self, request, pk=None):
        organization = self.get_organization(pk)
        require_role(request.user, organization, ADMIN_ROLES)
        serializer = BulkInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        emails = parse_bulk_emails(serializer.validated_data["emails"])
        from .portal_limits import enforce_organization_seat_limit

        invites = []
        for email in emails:
            enforce_organization_seat_limit(organization)
            enforce_organization_member_limit(_limit_owner(organization, request.user))
            invites.append(
                create_invite(
                    organization,
                    email=email,
                    role=serializer.validated_data["role"],
                    invited_by=request.user,
                )
            )
        return Response(
            {"count": len(invites), "items": OrganizationInviteSerializer(invites, many=True).data},
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path=r"invites/(?P<invite_id>[0-9]+)/revoke",
    )
    def revoke_invite(self, request, pk=None, invite_id=None):
        organization = self.get_organization(pk)
        require_role(request.user, organization, ADMIN_ROLES)
        invite = get_object_or_404(OrganizationInvite, pk=invite_id, organization=organization)
        invite.status = OrganizationInvite.Status.REVOKED
        invite.save(update_fields=["status", "updated_at"])
        log_activity(
            organization,
            "invite_revoked",
            f"Revoked invite for {invite.email}",
            actor=request.user,
            target_type="invite",
            target_id=invite.id,
        )
        return Response(OrganizationInviteSerializer(invite).data)

    # ---- Documents -------------------------------------------------------

    @action(detail=True, methods=["get", "post"], url_path="documents")
    def documents(self, request, pk=None):
        organization = self.get_organization(pk)
        membership = require_membership(request.user, organization)
        if request.method == "GET":
            docs = organization.documents.filter(is_archived=False).annotate(
                file_count=Count("files")
            )
            search = request.query_params.get("search", "").strip()
            if search:
                docs = docs.filter(
                    Q(title__icontains=search)
                    | Q(document_type__icontains=search)
                    | Q(issuer__icontains=search)
                    | Q(notes__icontains=search)
                )
            return Response(OrganizationDocumentSerializer(docs, many=True).data)
        if membership.role not in EDITOR_ROLES:
            return Response(
                {"detail": "Viewers cannot create organization documents."},
                status=status.HTTP_403_FORBIDDEN,
            )
        enforce_organization_document_limit(_limit_owner(organization, request.user))
        serializer = OrganizationDocumentSerializer(
            data=request.data, context={"organization": organization}
        )
        serializer.is_valid(raise_exception=True)
        document = serializer.save(organization=organization, created_by=request.user)
        log_activity(
            organization,
            "document_created",
            f"Created document {document.title}",
            actor=request.user,
            target_type="organization_document",
            target_id=document.id,
        )
        return Response(
            OrganizationDocumentSerializer(document).data, status=status.HTTP_201_CREATED
        )

    @action(
        detail=True,
        methods=["get", "patch", "delete"],
        url_path=r"documents/(?P<document_id>[0-9]+)",
    )
    def document_detail(self, request, pk=None, document_id=None):
        organization = self.get_organization(pk)
        membership = require_membership(request.user, organization)
        document = get_object_or_404(
            OrganizationDocument, pk=document_id, organization=organization
        )
        if request.method == "GET":
            return Response(OrganizationDocumentSerializer(document).data)
        if membership.role not in EDITOR_ROLES:
            return Response(
                {"detail": "Your role cannot edit organization documents."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.method == "DELETE":
            require_role(request.user, organization, ADMIN_ROLES)
            document.is_archived = True
            document.archived_at = timezone.now()
            document.save(update_fields=["is_archived", "archived_at", "updated_at"])
            log_activity(
                organization,
                "document_archived",
                f"Archived document {document.title}",
                actor=request.user,
                target_type="organization_document",
                target_id=document.id,
            )
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = OrganizationDocumentSerializer(
            document,
            data=request.data,
            partial=True,
            context={"organization": organization},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_activity(
            organization,
            "document_updated",
            f"Updated document {document.title}",
            actor=request.user,
            target_type="organization_document",
            target_id=document.id,
        )
        return Response(serializer.data)

    @action(
        detail=True,
        methods=["get", "post"],
        url_path=r"documents/(?P<document_id>[0-9]+)/files",
        parser_classes=[MultiPartParser, FormParser],
    )
    def document_files(self, request, pk=None, document_id=None):
        organization = self.get_organization(pk)
        membership = require_membership(request.user, organization)
        document = get_object_or_404(
            OrganizationDocument, pk=document_id, organization=organization
        )
        if request.method == "GET":
            files = document.files.select_related("uploaded_by").all()
            return Response(OrganizationDocumentFileSerializer(files, many=True).data)
        if membership.role not in EDITOR_ROLES:
            return Response(
                {"detail": "Your role cannot upload organization document files."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = OrganizationFileUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded = serializer.validated_data["file"]
        # Malware-scan, then encrypt-at-rest before storage (SEC-002/SEC-003).
        uploaded.seek(0)
        plaintext = uploaded.read()
        uploaded.seek(0)
        try:
            file_validation.scan_file_for_malware(plaintext)
        except file_validation.MalwareDetected as exc:
            raise DRFValidationError(exc.message)
        except file_validation.MalwareScanUnavailable as exc:
            raise _PublicUploadScanUnavailable(exc.message)
        document_file = OrganizationDocumentFile(
            organization=organization,
            document=document,
            uploaded_by=request.user,
            original_filename=uploaded.name,
            content_type=uploaded.content_type or "",
            file_size=len(plaintext),
        )
        encrypt_org_document_file(
            document_file, plaintext, f"{document_file.file_uuid.hex}.enc"
        )
        document_file.save()
        log_activity(
            organization,
            "file_uploaded",
            f"Uploaded file for {document.title}",
            actor=request.user,
            target_type="organization_document_file",
            target_id=document_file.id,
            metadata={"content_type": document_file.content_type},
        )
        return Response(
            OrganizationDocumentFileSerializer(document_file).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path=r"documents/(?P<document_id>[0-9]+)/files/(?P<file_id>[0-9]+)/download",
    )
    def download_document_file(self, request, pk=None, document_id=None, file_id=None):
        """Stream a decrypted organization document file to an authorized member.

        Membership is required and the file must belong to this organization and
        document, so a member of one org can never reach another org's files
        (SEC-002). Decryption happens only after the authorization check.
        """
        organization = self.get_organization(pk)
        require_membership(request.user, organization)
        document_file = get_object_or_404(
            OrganizationDocumentFile,
            pk=file_id,
            organization=organization,
            document_id=document_id,
        )
        try:
            plaintext = read_org_document_file(document_file)
        except (FileNotFoundError, ValueError):
            return Response(
                {"detail": "This file is no longer available."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except DecryptionError:
            return Response(
                {"detail": "We could not open this file securely."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return _decrypted_file_response(
            plaintext,
            filename=document_file.original_filename,
            content_type=document_file.content_type,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path=r"document-requests/(?P<request_id>[0-9]+)/submissions/(?P<submission_id>[0-9]+)/download",
    )
    def download_submission_file(self, request, pk=None, request_id=None, submission_id=None):
        """Stream a decrypted public-request submission to an org reviewer.

        Restricted to admin/editor roles; the submission must belong to this
        organization (SEC-002). Public submitters cannot retrieve files here.
        """
        organization = self.get_organization(pk)
        require_role(request.user, organization, EDITOR_ROLES)
        submission = get_object_or_404(
            DocumentRequestSubmission,
            pk=submission_id,
            organization=organization,
            request_id=request_id,
        )
        if not submission.file:
            return Response(
                {"detail": "This submission has no file."},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            plaintext = read_submission_file(submission)
        except (FileNotFoundError, ValueError):
            return Response(
                {"detail": "This file is no longer available."},
                status=status.HTTP_404_NOT_FOUND,
            )
        except DecryptionError:
            return Response(
                {"detail": "We could not open this file securely."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return _decrypted_file_response(
            plaintext,
            filename=submission.original_filename,
            content_type=submission.content_type,
        )

    # ---- Document requests ----------------------------------------------

    @action(detail=True, methods=["get", "post"], url_path="document-requests")
    def document_requests(self, request, pk=None):
        organization = self.get_organization(pk)
        membership = require_membership(request.user, organization)
        if request.method == "GET":
            requests = organization.document_requests.select_related(
                "assigned_to_member__user", "requested_by", "campaign"
            ).prefetch_related("submissions")
            mine = request.query_params.get("mine")
            if mine in {"1", "true", "yes"}:
                requests = requests.filter(assigned_to_member=membership)
            overdue = request.query_params.get("overdue")
            if overdue in {"1", "true", "yes"}:
                requests = [req for req in requests if req.is_overdue]
            return Response(DocumentRequestSerializer(requests, many=True).data)
        if not is_admin(membership):
            return Response(
                {"detail": "Only owners and admins can create document requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        enforce_organization_request_limit(_limit_owner(organization, request.user))
        serializer = DocumentRequestSerializer(
            data=request.data, context={"organization": organization}
        )
        serializer.is_valid(raise_exception=True)
        request_obj = serializer.save(organization=organization, requested_by=request.user)
        ensure_public_upload_token(request_obj)
        # Email the recipient their secure upload link (best-effort; non-blocking).
        if request_obj.recipient_email:
            send_document_request_email(request_obj)
        log_activity(
            organization,
            "document_request_created",
            f"Created request {request_obj.title}",
            actor=request.user,
            target_type="document_request",
            target_id=request_obj.id,
        )
        return Response(
            DocumentRequestSerializer(request_obj).data, status=status.HTTP_201_CREATED
        )

    @action(
        detail=True,
        methods=["get", "patch", "delete"],
        url_path=r"document-requests/(?P<request_id>[0-9]+)",
    )
    def document_request_detail(self, request, pk=None, request_id=None):
        organization = self.get_organization(pk)
        membership = require_membership(request.user, organization)
        request_obj = get_object_or_404(
            DocumentRequest.objects.prefetch_related("submissions"),
            pk=request_id,
            organization=organization,
        )
        if request.method == "GET":
            return Response(DocumentRequestSerializer(request_obj).data)
        if not is_admin(membership):
            return Response(
                {"detail": "Only owners and admins can update document requests."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.method == "DELETE":
            request_obj.status = DocumentRequest.Status.CANCELLED
            request_obj.save(update_fields=["status", "updated_at"])
            log_activity(
                organization,
                "request_cancelled",
                f"Cancelled request {request_obj.title}",
                actor=request.user,
                target_type="document_request",
                target_id=request_obj.id,
            )
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = DocumentRequestSerializer(
            request_obj,
            data=request.data,
            partial=True,
            context={"organization": organization},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        log_activity(
            organization,
            "request_updated",
            f"Updated request {request_obj.title}",
            actor=request.user,
            target_type="document_request",
            target_id=request_obj.id,
        )
        return Response(serializer.data)

    def _request_action(self, request, organization, request_id, status_value, action):
        require_role(request.user, organization, ADMIN_ROLES)
        request_obj = get_object_or_404(DocumentRequest, pk=request_id, organization=organization)
        request_obj.status = status_value
        if "rejection_reason" in request.data:
            request_obj.rejection_reason = request.data.get("rejection_reason", "")
        if "internal_note" in request.data:
            request_obj.internal_note = request.data.get("internal_note", "")
        request_obj.save(
            update_fields=["status", "rejection_reason", "internal_note", "updated_at"]
        )
        latest = request_obj.submissions.order_by("-created_at").first()
        if latest:
            latest.status = {
                "request_approved": DocumentRequestSubmission.Status.APPROVED,
                "request_rejected": DocumentRequestSubmission.Status.REJECTED,
                "request_changes_requested": DocumentRequestSubmission.Status.NEEDS_CHANGES,
            }.get(action, latest.status)
            latest.reviewed_by = request.user
            latest.reviewed_at = timezone.now()
            latest.rejection_reason = request_obj.rejection_reason
            latest.save(
                update_fields=[
                    "status",
                    "reviewed_by",
                    "reviewed_at",
                    "rejection_reason",
                    "updated_at",
                ]
            )
        log_activity(
            organization,
            action,
            f"{request_obj.title}: {status_value}",
            actor=request.user,
            target_type="document_request",
            target_id=request_obj.id,
        )
        return Response(DocumentRequestSerializer(request_obj).data)

    @action(
        detail=True,
        methods=["post"],
        url_path=r"document-requests/(?P<request_id>[0-9]+)/submit",
        parser_classes=[MultiPartParser, FormParser],
    )
    def submit_request(self, request, pk=None, request_id=None):
        organization = self.get_organization(pk)
        membership = require_membership(request.user, organization)
        request_obj = get_object_or_404(DocumentRequest, pk=request_id, organization=organization)
        if (
            request_obj.assigned_to_member
            and request_obj.assigned_to_member_id != membership.id
            and not is_admin(membership)
        ):
            return Response(
                {"detail": "This request is assigned to another member."},
                status=status.HTTP_403_FORBIDDEN,
            )
        upload_serializer = OrganizationFileUploadSerializer(data=request.data)
        upload_serializer.is_valid(raise_exception=True)
        uploaded = upload_serializer.validated_data["file"]
        submission = DocumentRequestSubmission.objects.create(
            organization=organization,
            request=request_obj,
            submitted_by_user=request.user,
            submitted_by_email=getattr(request.user, "email", ""),
            file=uploaded,
            original_filename=getattr(uploaded, "name", ""),
            content_type=getattr(uploaded, "content_type", ""),
            file_size=getattr(uploaded, "size", 0) or 0,
            notes=request.data.get("notes", ""),
        )
        request_obj.status = DocumentRequest.Status.SUBMITTED
        request_obj.save(update_fields=["status", "updated_at"])
        if request_obj.campaign_id and request_obj.assigned_to_member_id:
            CampaignTargetMember.objects.filter(
                campaign=request_obj.campaign,
                member=request_obj.assigned_to_member,
            ).update(status=CampaignTargetMember.Status.SUBMITTED)
        log_activity(
            organization,
            "request_submitted",
            f"Submitted request {request_obj.title}",
            actor=request.user,
            target_type="document_request",
            target_id=request_obj.id,
        )
        return Response(
            DocumentRequestSubmissionSerializer(submission).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path=r"document-requests/(?P<request_id>[0-9]+)/approve")
    def approve_request(self, request, pk=None, request_id=None):
        organization = self.get_organization(pk)
        return self._request_action(
            request,
            organization,
            request_id,
            DocumentRequest.Status.APPROVED,
            "request_approved",
        )

    @action(detail=True, methods=["post"], url_path=r"document-requests/(?P<request_id>[0-9]+)/reject")
    def reject_request(self, request, pk=None, request_id=None):
        organization = self.get_organization(pk)
        return self._request_action(
            request,
            organization,
            request_id,
            DocumentRequest.Status.REJECTED,
            "request_rejected",
        )

    @action(detail=True, methods=["post"], url_path=r"document-requests/(?P<request_id>[0-9]+)/request-changes")
    def request_changes(self, request, pk=None, request_id=None):
        organization = self.get_organization(pk)
        return self._request_action(
            request,
            organization,
            request_id,
            DocumentRequest.Status.NEEDS_CHANGES,
            "request_changes_requested",
        )

    @action(detail=True, methods=["post"], url_path=r"document-requests/(?P<request_id>[0-9]+)/remind")
    def remind_request(self, request, pk=None, request_id=None):
        organization = self.get_organization(pk)
        require_role(request.user, organization, ADMIN_ROLES)
        request_obj = get_object_or_404(DocumentRequest, pk=request_id, organization=organization)
        # Ensure a live link exists, then email the reminder (best-effort).
        ensure_public_upload_token(request_obj)
        sent = send_document_request_email(request_obj, reminder=True)
        request_obj.last_reminded_at = timezone.now()
        request_obj.save(update_fields=["last_reminded_at", "updated_at"])
        log_activity(
            organization,
            "request_reminded",
            f"Reminder sent for {request_obj.title}"
            if sent
            else f"Reminder recorded for {request_obj.title} (no recipient email)",
            actor=request.user,
            target_type="document_request",
            target_id=request_obj.id,
            metadata={"email_delivery": "sent" if sent else "no_recipient"},
        )
        return Response(DocumentRequestSerializer(request_obj).data)

    # ---- Campaigns -------------------------------------------------------

    @action(detail=True, methods=["get", "post"], url_path="campaigns")
    def campaigns(self, request, pk=None):
        organization = self.get_organization(pk)
        membership = require_membership(request.user, organization)
        if request.method == "GET":
            campaigns = organization.campaigns.prefetch_related(
                "requirements", "targets__member__user"
            )
            return Response(DocumentCollectionCampaignSerializer(campaigns, many=True).data)
        if not is_admin(membership):
            return Response(
                {"detail": "Only owners and admins can create campaigns."},
                status=status.HTTP_403_FORBIDDEN,
            )
        enforce_organization_campaign_limit(_limit_owner(organization, request.user))
        serializer = DocumentCollectionCampaignSerializer(
            data=request.data, context={"organization": organization}
        )
        serializer.is_valid(raise_exception=True)
        campaign = serializer.save(organization=organization, created_by=request.user)
        log_activity(
            organization,
            "campaign_created",
            f"Created campaign {campaign.title}",
            actor=request.user,
            target_type="campaign",
            target_id=campaign.id,
        )
        return Response(
            DocumentCollectionCampaignSerializer(campaign).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get", "patch", "delete"], url_path=r"campaigns/(?P<campaign_id>[0-9]+)")
    def campaign_detail(self, request, pk=None, campaign_id=None):
        organization = self.get_organization(pk)
        membership = require_membership(request.user, organization)
        campaign = get_object_or_404(
            DocumentCollectionCampaign.objects.prefetch_related(
                "requirements", "targets__member__user"
            ),
            pk=campaign_id,
            organization=organization,
        )
        if request.method == "GET":
            return Response(DocumentCollectionCampaignSerializer(campaign).data)
        if not is_admin(membership):
            return Response(
                {"detail": "Only owners and admins can update campaigns."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.method == "DELETE":
            campaign.status = DocumentCollectionCampaign.Status.ARCHIVED
            campaign.save(update_fields=["status", "updated_at"])
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = DocumentCollectionCampaignSerializer(
            campaign,
            data=request.data,
            partial=True,
            context={"organization": organization},
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path=r"campaigns/(?P<campaign_id>[0-9]+)/activate")
    def activate_campaign(self, request, pk=None, campaign_id=None):
        organization = self.get_organization(pk)
        require_role(request.user, organization, ADMIN_ROLES)
        campaign = get_object_or_404(DocumentCollectionCampaign, pk=campaign_id, organization=organization)
        campaign.status = DocumentCollectionCampaign.Status.ACTIVE
        campaign.save(update_fields=["status", "updated_at"])
        log_activity(
            organization,
            "campaign_activated",
            f"Activated campaign {campaign.title}",
            actor=request.user,
            target_type="campaign",
            target_id=campaign.id,
        )
        return Response(DocumentCollectionCampaignSerializer(campaign).data)

    @action(detail=True, methods=["post"], url_path=r"campaigns/(?P<campaign_id>[0-9]+)/cancel")
    def cancel_campaign(self, request, pk=None, campaign_id=None):
        organization = self.get_organization(pk)
        require_role(request.user, organization, ADMIN_ROLES)
        campaign = get_object_or_404(DocumentCollectionCampaign, pk=campaign_id, organization=organization)
        campaign.status = DocumentCollectionCampaign.Status.CANCELLED
        campaign.save(update_fields=["status", "updated_at"])
        log_activity(
            organization,
            "campaign_cancelled",
            f"Cancelled campaign {campaign.title}",
            actor=request.user,
            target_type="campaign",
            target_id=campaign.id,
        )
        return Response(DocumentCollectionCampaignSerializer(campaign).data)

    # ---- Bundles / rooms / templates -------------------------------------

    @action(detail=True, methods=["get", "post"], url_path="bundles")
    def bundles(self, request, pk=None):
        organization = self.get_organization(pk)
        membership = require_membership(request.user, organization)
        if request.method == "GET":
            return Response(
                OrganizationBundleSerializer(organization.bundles.all(), many=True).data
            )
        if not is_admin(membership):
            return Response(
                {"detail": "Only owners/admins can create organization bundles."},
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = OrganizationBundleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bundle = serializer.save(organization=organization, created_by=request.user)
        log_activity(
            organization,
            "bundle_created",
            f"Created bundle {bundle.title}",
            actor=request.user,
            target_type="bundle",
            target_id=bundle.id,
        )
        return Response(
            OrganizationBundleSerializer(bundle).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get", "post"], url_path="secure-rooms")
    def secure_rooms(self, request, pk=None):
        organization = self.get_organization(pk)
        membership = require_membership(request.user, organization)
        if request.method == "GET":
            return Response(
                OrganizationSecureRoomSerializer(organization.secure_rooms.prefetch_related("items"), many=True).data
            )
        if not is_admin(membership):
            return Response(
                {"detail": "Only owners/admins can create secure rooms."},
                status=status.HTTP_403_FORBIDDEN,
            )
        enforce_organization_room_limit(_limit_owner(organization, request.user))
        serializer = OrganizationSecureRoomSerializer(
            data=request.data, context={"organization": organization}
        )
        serializer.is_valid(raise_exception=True)
        room = serializer.save(
            organization=organization,
            created_by=request.user,
            token=generate_org_token(),
        )
        log_activity(
            organization,
            "secure_room_created",
            f"Created secure room {room.title}",
            actor=request.user,
            target_type="secure_room",
            target_id=room.id,
        )
        return Response(
            OrganizationSecureRoomSerializer(room).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path=r"secure-rooms/(?P<room_id>[0-9]+)/revoke")
    def revoke_room(self, request, pk=None, room_id=None):
        organization = self.get_organization(pk)
        require_role(request.user, organization, ADMIN_ROLES)
        room = get_object_or_404(OrganizationSecureRoom, pk=room_id, organization=organization)
        room.status = OrganizationSecureRoom.Status.REVOKED
        room.revoked_at = timezone.now()
        room.save(update_fields=["status", "revoked_at", "updated_at"])
        log_activity(organization, "secure_room_revoked", f"Revoked secure room {room.title}", actor=request.user, target_type="secure_room", target_id=room.id)
        return Response(OrganizationSecureRoomSerializer(room).data)

    @action(detail=True, methods=["get", "post"], url_path="request-templates")
    def request_templates(self, request, pk=None):
        organization = self.get_organization(pk)
        if request.method == "GET":
            templates = OrganizationRequestTemplate.objects.filter(
                Q(is_system=True, organization__isnull=True) | Q(organization=organization)
            )
            return Response(OrganizationRequestTemplateSerializer(templates, many=True).data)
        require_role(request.user, organization, ADMIN_ROLES)
        serializer = OrganizationRequestTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template = serializer.save(organization=organization, created_by=request.user)
        return Response(
            OrganizationRequestTemplateSerializer(template).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post", "delete"], url_path="logo")
    def logo(self, request, pk=None):
        """Upload (POST, multipart 'logo') or remove (DELETE) the org logo shown
        on recipient-facing request pages. Re-encoded server-side and stored
        inline as a data URL (same approach as user avatars). Admins only."""
        organization = self.get_organization(pk)
        require_role(request.user, organization, ADMIN_ROLES)
        if request.method == "DELETE":
            if organization.logo_image:
                organization.logo_image = ""
                organization.save(update_fields=["logo_image", "updated_at"])
            return Response(OrganizationSerializer(organization, context={"request": request}).data)

        upload = request.FILES.get("logo")
        if upload is None:
            return Response(
                {"detail": "No image was uploaded (field 'logo')."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            organization.logo_image = build_avatar_data_url(upload.read())
        except AvatarProcessingError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        organization.save(update_fields=["logo_image", "updated_at"])
        return Response(
            OrganizationSerializer(organization, context={"request": request}).data
        )

    # ---- Summary / activity / reports ------------------------------------

    @action(detail=True, methods=["get"], url_path="summary")
    def summary(self, request, pk=None):
        organization = self.get_organization(pk)
        return Response(build_summary(organization))

    @action(detail=True, methods=["get"], url_path="activity")
    def activity(self, request, pk=None):
        organization = self.get_organization(pk)
        activities = organization.activities.select_related("actor").all()[:50]
        return Response(OrganizationActivitySerializer(activities, many=True).data)

    @action(detail=True, methods=["get"], url_path="calendar")
    def calendar(self, request, pk=None):
        organization = self.get_organization(pk)
        return Response({"events": organization_deadline_events(organization)})

    @action(detail=True, methods=["get"], url_path="timeline")
    def timeline(self, request, pk=None):
        organization = self.get_organization(pk)
        activities = OrganizationActivitySerializer(
            organization.activities.select_related("actor").all()[:50], many=True
        ).data
        return Response({"items": activities})

    @action(detail=True, methods=["get"], url_path="my-tasks")
    def my_tasks(self, request, pk=None):
        organization = self.get_organization(pk)
        membership = require_membership(request.user, organization)
        requests = organization.document_requests.filter(
            assigned_to_member=membership
        ).prefetch_related("submissions")
        return Response({"items": DocumentRequestSerializer(requests, many=True).data})

    @action(detail=True, methods=["get"], url_path="readiness-report")
    def readiness_report(self, request, pk=None):
        organization = self.get_organization(pk)
        summary = build_summary(organization)
        log_activity(
            organization,
            "report_generated",
            "Readiness report generated",
            actor=request.user,
            target_type="readiness_report",
        )
        return Response(
            {
                "organization": organization.name,
                "generated_at": timezone.now().isoformat(),
                "summary": summary,
                "export": {"available": False, "reason": "PDF/CSV export is deferred in V1."},
            }
        )


class OrganizationInviteTokenView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, token):
        invite = get_object_or_404(
            OrganizationInvite.objects.select_related("organization"), token=token
        )
        return Response(InviteAcceptSerializer(invite).data)

    def post(self, request, token):
        invite = get_object_or_404(
            OrganizationInvite.objects.select_related("organization"), token=token
        )
        membership = accept_invite(invite, request.user)
        return Response(OrganizationMembershipSerializer(membership).data)


class _PublicUploadScanUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "Malware scanning is temporarily unavailable. Please try again."


def _decrypted_file_response(plaintext: bytes, *, filename: str, content_type: str):
    """Stream already-authorized, decrypted org file bytes. Never exposes a raw
    storage path or object-storage URL."""
    response = FileResponse(
        io.BytesIO(plaintext), as_attachment=True, filename=filename or "document"
    )
    if content_type:
        response["Content-Type"] = content_type
    return response


class PublicDocumentRequestView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def get_throttles(self):
        # Only the unauthenticated upload (POST) is rate-limited (SEC-003);
        # viewing the request page (GET) is not, so legitimate recipients are
        # not blocked from loading the page.
        if self.request.method == "POST":
            throttle = ScopedRateThrottle()
            throttle.scope = "public_document_upload"
            return [throttle]
        return []

    def get(self, request, token):
        request_obj = get_object_or_404(
            DocumentRequest.objects.select_related("organization"),
            public_upload_token=token,
        )
        if not request_obj.public_upload_active:
            return Response({"detail": "This upload link is no longer active."}, status=404)
        return Response(PublicDocumentRequestSerializer(request_obj).data)

    def post(self, request, token):
        request_obj = get_object_or_404(
            DocumentRequest.objects.select_related("organization"),
            public_upload_token=token,
        )
        if not request_obj.public_upload_active:
            return Response({"detail": "This upload link is no longer active."}, status=404)

        # Per-request abuse caps (SEC-003): bound how many submissions and how
        # much total data a single public link can accumulate.
        max_submissions = int(
            getattr(settings, "PUBLIC_DOCUMENT_REQUEST_MAX_SUBMISSIONS", 20)
        )
        existing = request_obj.submissions.all()
        if existing.count() >= max_submissions:
            return Response(
                {"detail": "This upload link has reached its submission limit."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        uploaded = request.FILES.get("file")
        if uploaded is None:
            return Response({"file": "Upload a file."}, status=status.HTTP_400_BAD_REQUEST)

        max_total_bytes = int(
            getattr(settings, "PUBLIC_DOCUMENT_REQUEST_MAX_TOTAL_MB", 50)
        ) * 1024 * 1024
        used = existing.aggregate(total=Sum("file_size"))["total"] or 0
        if used + (getattr(uploaded, "size", 0) or 0) > max_total_bytes:
            return Response(
                {"detail": "This upload link has reached its total size limit."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        upload_serializer = OrganizationFileUploadSerializer(data=request.data)
        upload_serializer.is_valid(raise_exception=True)
        uploaded = upload_serializer.validated_data["file"]

        # Malware-scan before storage; fail closed (503) when required but the
        # engine is unavailable (SEC-003).
        uploaded.seek(0)
        _data = uploaded.read()
        uploaded.seek(0)
        try:
            file_validation.scan_file_for_malware(_data)
        except file_validation.MalwareDetected as exc:
            raise DRFValidationError(exc.message)
        except file_validation.MalwareScanUnavailable as exc:
            raise _PublicUploadScanUnavailable(exc.message)

        # Encrypt-at-rest before storage (SEC-002): the submitter's document
        # (often an ID/passport) is never written as plaintext.
        submission = DocumentRequestSubmission(
            organization=request_obj.organization,
            request=request_obj,
            submitted_by_email=request.data.get("email", request_obj.recipient_email),
            original_filename=getattr(uploaded, "name", ""),
            content_type=getattr(uploaded, "content_type", ""),
            file_size=len(_data),
            notes=request.data.get("notes", ""),
        )
        encrypt_submission_file(submission, _data, f"{submission.file_uuid.hex}.enc")
        submission.save()
        request_obj.status = DocumentRequest.Status.SUBMITTED
        request_obj.save(update_fields=["status", "updated_at"])
        log_activity(
            request_obj.organization,
            "public_request_submitted",
            f"Public upload submitted for {request_obj.title}",
            target_type="document_request",
            target_id=request_obj.id,
        )
        return Response(
            DocumentRequestSubmissionSerializer(submission).data,
            status=status.HTTP_201_CREATED,
        )


class PublicOrganizationSecureRoomView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        room = get_object_or_404(
            OrganizationSecureRoom.objects.select_related("organization").prefetch_related(
                "items__document",
                "items__file",
            ),
            token=token,
        )
        if not room.is_active_public:
            return Response(
                {"detail": "This secure room is no longer active."},
                status=status.HTTP_404_NOT_FOUND,
            )
        log_activity(
            room.organization,
            "secure_room_opened",
            f"Secure room opened: {room.title}",
            target_type="secure_room",
            target_id=room.id,
        )
        return Response(PublicOrganizationSecureRoomSerializer(room).data)
