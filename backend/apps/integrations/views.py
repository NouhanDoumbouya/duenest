"""
Integrations API (foundation).

Endpoints return only safe account metadata — never tokens, secrets, or raw OAuth
state. The OAuth callback identifies the user from the validated state (not from a
session cookie), exchanges the code server-side, stores encrypted tokens, and
redirects to the frontend with a status only.
"""

from __future__ import annotations

from urllib.parse import urlencode

from django.conf import settings
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.features.flags import require_feature_enabled

from . import services
from .models import ConnectedIntegrationAccount
from .oauth import DEFAULT_REDIRECT_PATH
from .providers.base import ProviderNotConfigured
from .serializers import ConnectedIntegrationAccountSerializer, OAuthStartSerializer

FLAG = services.INTEGRATIONS_FLAG


class IntegrationProvidersView(APIView):
    """GET safe provider cards (availability, configured, status, scope groups)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_feature_enabled(FLAG, request.user)
        return Response({"providers": services.list_provider_cards(request.user)})


class IntegrationAccountsView(APIView):
    """GET the signed-in user's connected accounts (no tokens)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_feature_enabled(FLAG, request.user)
        accounts = ConnectedIntegrationAccount.objects.filter(user=request.user)
        return Response(
            {"accounts": ConnectedIntegrationAccountSerializer(accounts, many=True).data}
        )


class GoogleOAuthStartView(APIView):
    """POST to begin a Google connect; returns an authorization URL (no token)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "integration_oauth"

    def post(self, request):
        require_feature_enabled(FLAG, request.user)
        require_feature_enabled(services.GOOGLE_FLAG, request.user)
        serializer = OAuthStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            payload = services.start_google_oauth(
                user=request.user,
                scope_groups=serializer.validated_data["scope_groups"],
                redirect_path=serializer.validated_data.get("redirect_path", ""),
                request=request,
            )
        except ProviderNotConfigured:
            return Response(
                {
                    "detail": "Google integration is not configured on this server yet.",
                    "status": "not_configured",
                },
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return Response(payload)


class GoogleOAuthCallbackView(APIView):
    """GET Google's redirect. Validates state, exchanges the code, stores encrypted
    tokens, and redirects to the frontend with a status only (never a token/code).
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "integration_oauth_callback"

    def get(self, request):
        code = request.query_params.get("code", "")
        raw_state = request.query_params.get("state", "")
        provider_error = request.query_params.get("error", "")

        if provider_error:
            # User denied consent or Google returned an error. Don't store anything.
            return self._redirect(DEFAULT_REDIRECT_PATH, "error")

        account, redirect_path, error_code = services.handle_google_callback(
            code=code, raw_state=raw_state, request=request
        )
        result = "connected" if account is not None and not error_code else "error"
        return self._redirect(redirect_path, result)

    def _redirect(self, redirect_path: str, result: str) -> HttpResponseRedirect:
        base = (getattr(settings, "FRONTEND_APP_URL", "") or "").rstrip("/")
        sep = "&" if "?" in redirect_path else "?"
        query = urlencode({"integration": "google", "status": result})
        return HttpResponseRedirect(f"{base}{redirect_path}{sep}{query}")


class _OwnedAccountView(APIView):
    permission_classes = [IsAuthenticated]

    def get_account(self, request, pk) -> ConnectedIntegrationAccount:
        require_feature_enabled(FLAG, request.user)
        return get_object_or_404(
            ConnectedIntegrationAccount, pk=pk, user=request.user
        )


class IntegrationAccountDisconnectView(_OwnedAccountView):
    def post(self, request, pk):
        account = self.get_account(request, pk)
        account = services.disconnect_account(account=account, request=request)
        return Response(ConnectedIntegrationAccountSerializer(account).data)


class IntegrationAccountRefreshView(_OwnedAccountView):
    def post(self, request, pk):
        account = self.get_account(request, pk)
        result = services.refresh_account(account=account, request=request)
        account.refresh_from_db()
        return Response(
            {
                "result": result,
                "account": ConnectedIntegrationAccountSerializer(account).data,
            }
        )


class IntegrationAccountHealthView(_OwnedAccountView):
    def get(self, request, pk):
        account = self.get_account(request, pk)
        account = services.account_health(account=account)
        return Response(ConnectedIntegrationAccountSerializer(account).data)
