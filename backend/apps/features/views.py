"""
Feature flag API.

- `GET /features/` — the resolved enabled-map for the current viewer (used by the
  frontend to hide/disable paused features). Safe for anyone; never leaks config.
- `GET/PATCH /founder/feature-flags/` — founder-only management (list + change
  visibility / maintenance message), with safe audit logging.
"""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.founder.permissions import IsFounderUser
from apps.founder.services import log_founder_action

from .flags import is_feature_enabled, resolve_flag
from .models import FEATURE_DEFINITIONS, FeatureFlag, Visibility
from .serializers import FeatureFlagSerializer, FeatureFlagUpdateSerializer


class FeatureMapView(APIView):
    """Resolved feature availability for the current viewer (no secrets)."""

    permission_classes = [AllowAny]

    def get(self, request):
        user = request.user if request.user.is_authenticated else None
        features = {}
        for definition in FEATURE_DEFINITIONS:
            key = definition["key"]
            visibility, message = resolve_flag(key)
            enabled = is_feature_enabled(key, user)
            features[key] = {
                "enabled": enabled,
                # Only surface a maintenance message for features the viewer
                # cannot use, so we never hint at hidden/internal state.
                "maintenance_message": "" if enabled else message,
            }
        return Response({"features": features})


def _seed_missing_flags():
    """Ensure a row exists for every registry key (idempotent)."""
    existing = set(FeatureFlag.objects.values_list("key", flat=True))
    to_create = [
        FeatureFlag(
            key=d["key"],
            name=d["name"],
            description=d.get("description", ""),
            visibility=d["default"],
        )
        for d in FEATURE_DEFINITIONS
        if d["key"] not in existing
    ]
    if to_create:
        FeatureFlag.objects.bulk_create(to_create)


class FounderFeatureFlagListView(APIView):
    """Founder list of all flags (rows are created on first view if missing)."""

    permission_classes = [IsFounderUser]

    def get(self, request):
        _seed_missing_flags()
        flags = FeatureFlag.objects.all()
        return Response(FeatureFlagSerializer(flags, many=True).data)


class FounderFeatureFlagDetailView(APIView):
    """Founder update of a single flag's visibility / maintenance message."""

    permission_classes = [IsFounderUser]

    def patch(self, request, key):
        _seed_missing_flags()
        flag = get_object_or_404(FeatureFlag, key=key)
        serializer = FeatureFlagUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        prev_visibility = flag.visibility
        prev_message = flag.maintenance_message
        changed_fields = ["updated_by", "updated_at"]

        if "visibility" in data and data["visibility"] != prev_visibility:
            flag.visibility = data["visibility"]
            changed_fields.append("visibility")
            action = (
                "feature_disabled"
                if flag.visibility == Visibility.DISABLED
                else "feature_enabled"
                if flag.visibility == Visibility.ENABLED
                else "feature_visibility_changed"
            )
            log_founder_action(
                request=request,
                action=action,
                object_type="feature_flag",
                object_id=flag.key,
                metadata={"from": prev_visibility, "to": flag.visibility},
            )

        if "maintenance_message" in data and data["maintenance_message"] != prev_message:
            flag.maintenance_message = data["maintenance_message"]
            changed_fields.append("maintenance_message")
            log_founder_action(
                request=request,
                action="feature_maintenance_message_changed",
                object_type="feature_flag",
                object_id=flag.key,
                metadata={"changed": True},
            )

        flag.updated_by = request.user
        flag.save(update_fields=list(set(changed_fields)))
        return Response(FeatureFlagSerializer(flag).data, status=status.HTTP_200_OK)
