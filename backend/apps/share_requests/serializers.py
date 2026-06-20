from rest_framework import serializers

from .models import ShareRequest, ShareRequestItem


def _display_name(user) -> str:
    full = (user.get_full_name() or "").strip()
    return full or user.get_username()


class ShareRequestItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShareRequestItem
        fields = [
            "id",
            "label",
            "description",
            "is_required",
            "expected_document_type",
            "sort_order",
        ]
        read_only_fields = ["id"]


class ShareRequestCreateSerializer(serializers.Serializer):
    """Owner create payload: the request plus its checklist items."""

    title = serializers.CharField(max_length=255)
    message = serializers.CharField(required=False, allow_blank=True, default="")
    expires_at = serializers.DateTimeField(required=False, allow_null=True)
    items = ShareRequestItemSerializer(many=True)

    def validate_items(self, value):
        if not value:
            raise serializers.ValidationError("Add at least one requested item.")
        return value

    def validate_expires_at(self, value):
        from django.utils import timezone

        if value is not None and value <= timezone.now():
            raise serializers.ValidationError("Expiry must be in the future.")
        return value


class ShareRequestSerializer(serializers.ModelSerializer):
    """Owner-facing detail (includes the token to build the respond link)."""

    items = ShareRequestItemSerializer(many=True, read_only=True)
    respond_path = serializers.SerializerMethodField()
    response_count = serializers.SerializerMethodField()
    is_open = serializers.BooleanField(read_only=True)

    class Meta:
        model = ShareRequest
        fields = [
            "id",
            "title",
            "message",
            "token",
            "respond_path",
            "status",
            "is_open",
            "expires_at",
            "items",
            "response_count",
            "created_at",
            "updated_at",
        ]

    def get_respond_path(self, obj):
        return f"/request/{obj.token}"

    def get_response_count(self, obj):
        return obj.responses.count()


class PublicShareRequestItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShareRequestItem
        fields = ["id", "label", "description", "is_required", "expected_document_type"]


def build_public_request(request_obj) -> dict:
    """Safe metadata for the responder — checklist + requester name only."""
    return {
        "title": request_obj.title,
        "message": request_obj.message,
        "requester_name": _display_name(request_obj.owner),
        "status": request_obj.status,
        "is_open": request_obj.is_open,
        "expires_at": request_obj.expires_at,
        "items": PublicShareRequestItemSerializer(
            request_obj.items.all(), many=True
        ).data,
    }
