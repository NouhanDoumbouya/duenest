from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.features.flags import require_feature_enabled

from .models import ShareRequest, ShareRequestItem
from .serializers import (
    ShareRequestCreateSerializer,
    ShareRequestSerializer,
    build_public_request,
)
from .services import FulfilmentError, fulfil_request


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

        share_request = ShareRequest.objects.create(
            owner=request.user,
            title=data["title"].strip(),
            message=data.get("message", ""),
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
