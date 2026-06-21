"""User-facing AI preference (consent + privacy) endpoint."""

from __future__ import annotations

from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .privacy import AI_DISCLOSURE, get_ai_preference
from .serializers import AiPreferenceSerializer


class AiPreferenceView(APIView):
    """
    GET / PUT the current user's AI consent + privacy settings.

    GET also returns ``ai_available`` (a key is configured) and the honest
    ``disclosure`` (provider + "not used for training") so the UI can explain
    exactly what enabling AI does. PUT toggles ``ai_enabled`` (consent) and
    ``redact_sensitive`` (Privacy Mode); enabling stamps ``consented_at``.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.conf import settings

        pref = get_ai_preference(request.user)
        data = AiPreferenceSerializer(pref).data
        data["ai_available"] = bool(getattr(settings, "AI_CONFIGURED", False))
        data["disclosure"] = AI_DISCLOSURE
        return Response(data)

    def put(self, request):
        pref = get_ai_preference(request.user)
        serializer = AiPreferenceSerializer(pref, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        was_enabled = pref.ai_enabled
        instance = serializer.save()
        if instance.ai_enabled and not was_enabled:
            instance.consented_at = timezone.now()
            instance.save(update_fields=["consented_at", "updated_at"])
        data = AiPreferenceSerializer(instance).data
        data["disclosure"] = AI_DISCLOSURE
        return Response(data, status=status.HTTP_200_OK)
