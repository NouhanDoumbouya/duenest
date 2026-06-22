import io

from django.conf import settings
from django.db.models import Sum
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.security import file_validation
from apps.documents.constants import (
    ALLOWED_CONTENT_TYPES,
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE,
)
from apps.documents.plan_usage import PlanLimitExceeded
from apps.features.flags import require_feature_enabled
from apps.users import plans

from .file_encryption import (
    encrypt_share_submission_file,
    read_share_submission_file,
)
from .models import ShareRequest, ShareRequestItem, ShareRequestSubmission
from .serializers import (
    ShareRequestCreateSerializer,
    ShareRequestSerializer,
    build_public_request,
)
from .services import FulfilmentError, fulfil_request

# External upload is a paid capability; free users may still use the
# DueNest-user-only responder flow.
_EXTERNAL_RESOURCE = "external_collection_requests"


def _enforce_external_upload_allowed(user) -> None:
    """Gate enabling external (non-DueNest) uploads behind a paid plan, reusing
    the shared PlanLimitExceeded so the frontend shows its upgrade prompt."""
    if user.plan == plans.PLAN_FREE:
        raise PlanLimitExceeded(resource=_EXTERNAL_RESOURCE, limit=0, plan=user.plan)


class ShareRequestListCreateView(APIView):
    """Owner: list their requests, or create a new one with its checklist."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_feature_enabled("share_requests", request.user)
        qs = ShareRequest.objects.filter(owner=request.user).prefetch_related("items")
        return Response(ShareRequestSerializer(qs, many=True).data)

    def post(self, request):
        require_feature_enabled("share_requests", request.user)
        serializer = ShareRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        allow_external = bool(data.get("allow_external_upload"))
        if allow_external:
            _enforce_external_upload_allowed(request.user)

        share_request = ShareRequest.objects.create(
            owner=request.user,
            title=data["title"].strip(),
            message=data.get("message", ""),
            allow_external_upload=allow_external,
            expires_at=data.get("expires_at"),
        )
        for index, item in enumerate(data["items"]):
            ShareRequestItem.objects.create(
                request=share_request,
                label=item["label"].strip(),
                description=item.get("description", ""),
                is_required=item.get("is_required", True),
                expected_document_type=item.get("expected_document_type", ""),
                sort_order=item.get("sort_order", index),
            )
        return Response(
            ShareRequestSerializer(share_request).data,
            status=status.HTTP_201_CREATED,
        )


class ShareRequestDetailView(APIView):
    """Owner: fetch, close, or delete a single request."""

    permission_classes = [IsAuthenticated]

    def _get(self, request, request_id):
        return get_object_or_404(
            ShareRequest, pk=request_id, owner=request.user
        )

    def get(self, request, request_id):
        require_feature_enabled("share_requests", request.user)
        return Response(ShareRequestSerializer(self._get(request, request_id)).data)

    def post(self, request, request_id):
        """Close a request (stops accepting responses)."""
        require_feature_enabled("share_requests", request.user)
        share_request = self._get(request, request_id)
        share_request.status = ShareRequest.Status.CLOSED
        share_request.save(update_fields=["status", "updated_at"])
        return Response(ShareRequestSerializer(share_request).data)

    def delete(self, request, request_id):
        require_feature_enabled("share_requests", request.user)
        self._get(request, request_id).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PublicShareRequestView(APIView):
    """
    Public checklist metadata for the responder (no vault data). Not feature-gated:
    the responder may not be a founder, but they still need to see the request.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_access_code"

    def get(self, request, token):
        share_request = ShareRequest.objects.filter(token=token).first()
        if share_request is None:
            return Response(
                {"detail": "This request link is invalid.", "status": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(build_public_request(share_request))


class PublicShareRequestUploadView(APIView):
    """Anonymous upload against a share request that allows external uploads.

    Mirrors the organization public-upload hardening: rate-limited, strict file
    validation (extension/type/magic bytes), malware scan (fail-closed), abuse
    caps, and encryption-at-rest. The original is never stored as plaintext.
    """

    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def get_throttles(self):
        if self.request.method == "POST":
            throttle = ScopedRateThrottle()
            throttle.scope = "public_document_upload"
            return [throttle]
        return []

    def post(self, request, token):
        share_request = ShareRequest.objects.filter(token=token).first()
        if (
            share_request is None
            or not share_request.allow_external_upload
            or not share_request.is_open
        ):
            return Response(
                {"detail": "This upload link is not available."},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Per-link abuse caps (shared settings with org public uploads).
        existing = share_request.submissions.all()
        max_submissions = int(
            getattr(settings, "PUBLIC_DOCUMENT_REQUEST_MAX_SUBMISSIONS", 20)
        )
        if existing.count() >= max_submissions:
            return Response(
                {"detail": "This upload link has reached its submission limit."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        uploaded = request.FILES.get("file")
        if uploaded is None:
            return Response(
                {"file": "Upload a file."}, status=status.HTTP_400_BAD_REQUEST
            )

        max_total_bytes = (
            int(getattr(settings, "PUBLIC_DOCUMENT_REQUEST_MAX_TOTAL_MB", 50))
            * 1024
            * 1024
        )
        used = existing.aggregate(total=Sum("file_size"))["total"] or 0
        if used + (getattr(uploaded, "size", 0) or 0) > max_total_bytes:
            return Response(
                {"detail": "This upload link has reached its total size limit."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Structural validation (extension/type/magic bytes). Scanning runs below
        # so an engine outage returns a clear error rather than a false pass.
        try:
            file_validation.validate_secure_upload(
                uploaded,
                allowed_content_types=ALLOWED_CONTENT_TYPES,
                allowed_extensions=ALLOWED_EXTENSIONS,
                max_bytes=MAX_FILE_SIZE,
                scan=False,
            )
        except file_validation.SecureUploadError as exc:
            raise DRFValidationError(exc.message)

        uploaded.seek(0)
        data = uploaded.read()
        uploaded.seek(0)
        try:
            file_validation.scan_file_for_malware(data)
        except file_validation.MalwareDetected as exc:
            raise DRFValidationError(exc.message)
        except file_validation.MalwareScanUnavailable as exc:
            return Response(
                {"detail": exc.message}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        submission = ShareRequestSubmission(
            request=share_request,
            submitted_by_email=(request.data.get("email") or "").strip(),
            original_filename=getattr(uploaded, "name", ""),
            content_type=getattr(uploaded, "content_type", ""),
            file_size=len(data),
            notes=(request.data.get("notes") or "").strip(),
        )
        encrypt_share_submission_file(
            submission, data, f"{submission.file_uuid.hex}.enc"
        )
        submission.save()
        return Response(
            {"ok": True, "detail": "Your file was uploaded."},
            status=status.HTTP_201_CREATED,
        )


class ShareRequestSubmissionDownloadView(APIView):
    """Owner-only: stream a decrypted external submission. The file is decrypted
    in memory and never exposed via a storage URL."""

    permission_classes = [IsAuthenticated]

    def get(self, request, request_id, submission_id):
        require_feature_enabled("share_requests", request.user)
        submission = get_object_or_404(
            ShareRequestSubmission,
            pk=submission_id,
            request_id=request_id,
            request__owner=request.user,
        )
        plaintext = read_share_submission_file(submission)
        response = FileResponse(
            io.BytesIO(plaintext),
            as_attachment=True,
            filename=submission.original_filename or "submission",
        )
        if submission.content_type:
            response["Content-Type"] = submission.content_type
        return response


class ShareRequestRespondView(APIView):
    """A logged-in responder fulfils the checklist from their own vault."""

    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        share_request = ShareRequest.objects.filter(token=token).first()
        if share_request is None:
            return Response(
                {"detail": "This request link is invalid.", "status": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not share_request.is_open:
            return Response(
                {
                    "detail": "This request is no longer accepting responses.",
                    "status": "closed",
                },
                status=status.HTTP_410_GONE,
            )
        if share_request.owner_id == request.user.id:
            return Response(
                {"detail": "You can't respond to your own request."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if share_request.responses.filter(responder=request.user).exists():
            return Response(
                {"detail": "You've already responded to this request."},
                status=status.HTTP_409_CONFLICT,
            )

        # Body: { items: [{ item_id, file_ids: [..] }] }
        item_files = {
            entry.get("item_id"): entry.get("file_ids") or []
            for entry in (request.data.get("items") or [])
            if entry.get("item_id") is not None
        }
        try:
            fulfil_request(share_request, request.user, item_files)
        except FulfilmentError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"ok": True, "detail": "Your response was sent."},
            status=status.HTTP_201_CREATED,
        )
