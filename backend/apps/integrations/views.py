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


# ---- Google Drive Import V1 ------------------------------------------------

from . import drive_import  # noqa: E402
from .providers.base import ProviderError  # noqa: E402
from .providers.google import GOOGLE_WORKSPACE_EXPORTABLE  # noqa: E402
from .serializers import DriveImportRequestSerializer  # noqa: E402

GOOGLE_DRIVE_FLAG = "google_drive_import"

# Friendly file-type filter -> Drive MIME types (read-only listing).
_DRIVE_TYPE_FILTERS = {
    "pdf": ["application/pdf"],
    "image": ["image/jpeg", "image/png"],
    "doc": [
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    "google": list(GOOGLE_WORKSPACE_EXPORTABLE.keys()),
}


def _require_drive_flags(user) -> None:
    require_feature_enabled(FLAG, user)
    require_feature_enabled(services.GOOGLE_FLAG, user)
    require_feature_enabled(GOOGLE_DRIVE_FLAG, user)


def _get_google_account(request):
    """The signed-in user's own, still-connected Google account, or 404."""
    return get_object_or_404(
        ConnectedIntegrationAccount.objects.exclude(
            status=ConnectedIntegrationAccount.Status.DISCONNECTED
        ),
        pk=request.query_params.get("account_id"),
        user=request.user,
        provider="google",
    )


def _not_configured_response():
    return Response(
        {"detail": "Google integration is not configured on this server yet.",
         "status": "not_configured"},
        status=http_status.HTTP_400_BAD_REQUEST,
    )


class GoogleDriveFilesView(APIView):
    """GET the user's Drive files (safe metadata only; no tokens/URLs)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "google_drive_list"

    def get(self, request):
        _require_drive_flags(request.user)
        account = _get_google_account(request)
        file_type = request.query_params.get("file_type", "")
        try:
            payload = drive_import.list_google_drive_files(
                request.user,
                account,
                query=request.query_params.get("q") or None,
                page_token=request.query_params.get("page_token") or None,
                page_size=int(request.query_params.get("page_size") or 25),
                mime_types=_DRIVE_TYPE_FILTERS.get(file_type),
            )
        except ProviderNotConfigured:
            return _not_configured_response()
        except ProviderError:
            return Response(
                {"detail": "Couldn't reach Google Drive. Reconnect and try again.",
                 "status": "provider_error"},
                status=http_status.HTTP_502_BAD_GATEWAY,
            )
        return Response(payload)


class GoogleDriveDestinationsView(APIView):
    """GET safe import destination options (owner-scoped)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        _require_drive_flags(request.user)
        return Response(drive_import.build_destination_options(request.user))


class _DriveImportBase(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]

    def _payload(self, request):
        _require_drive_flags(request.user)
        serializer = DriveImportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        account = get_object_or_404(
            ConnectedIntegrationAccount.objects.exclude(
                status=ConnectedIntegrationAccount.Status.DISCONNECTED
            ),
            pk=data["account_id"], user=request.user, provider="google",
        )
        return data, account


class GoogleDriveImportPreviewView(_DriveImportBase):
    throttle_scope = "google_drive_list"

    def post(self, request):
        data, account = self._payload(request)
        try:
            result = drive_import.preview_google_drive_import(
                request.user, account, data["files"], data["destination"], request=request,
            )
        except drive_import.DriveImportError as exc:
            return Response(
                {"detail": str(exc), "status": exc.code},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return Response(result)


class GoogleDriveImportView(_DriveImportBase):
    throttle_scope = "google_drive_import"

    def post(self, request):
        data, account = self._payload(request)
        try:
            result = drive_import.import_google_drive_files(
                request.user, account, data["files"], data["destination"], request=request,
            )
        except drive_import.DriveImportError as exc:
            return Response(
                {"detail": str(exc), "status": exc.code},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return Response(result)


# ---- Gmail Import V1 -------------------------------------------------------

from . import gmail_import  # noqa: E402
from .serializers import GmailImportRequestSerializer  # noqa: E402

GMAIL_FLAG = "gmail_import"


def _require_gmail_flags(user) -> None:
    require_feature_enabled(FLAG, user)
    require_feature_enabled(services.GOOGLE_FLAG, user)
    require_feature_enabled(GMAIL_FLAG, user)


class GmailMessagesView(APIView):
    """GET the user's Gmail messages with attachments (safe metadata only; no
    body/snippet/tokens)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "gmail_list"

    def get(self, request):
        _require_gmail_flags(request.user)
        account = _get_google_account(request)
        filters = {
            "query": request.query_params.get("query") or request.query_params.get("q"),
            "from_email": request.query_params.get("from"),
            "date_min": request.query_params.get("date_min"),
            "date_max": request.query_params.get("date_max"),
            "file_type": request.query_params.get("file_type"),
            "page_token": request.query_params.get("page_token"),
            "page_size": request.query_params.get("page_size") or 20,
        }
        try:
            return Response(
                gmail_import.search_gmail_import_messages(
                    request.user, account, filters, request=request
                )
            )
        except ProviderNotConfigured:
            return _not_configured_response()
        except ProviderError:
            return Response(
                {"detail": "Couldn't reach Gmail. Reconnect and try again.",
                 "status": "provider_error"},
                status=http_status.HTTP_502_BAD_GATEWAY,
            )


class GmailMessageAttachmentsView(APIView):
    """GET one message's attachments (safe metadata only)."""

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "gmail_list"

    def get(self, request, message_id):
        _require_gmail_flags(request.user)
        account = _get_google_account(request)
        try:
            return Response(
                gmail_import.list_gmail_message_attachments(
                    request.user, account, message_id
                )
            )
        except ProviderNotConfigured:
            return _not_configured_response()
        except ProviderError:
            return Response(
                {"detail": "Couldn't reach Gmail.", "status": "provider_error"},
                status=http_status.HTTP_502_BAD_GATEWAY,
            )


class GmailDestinationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        _require_gmail_flags(request.user)
        return Response(gmail_import.build_destination_options(request.user))


class _GmailImportBase(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]

    def _payload(self, request):
        _require_gmail_flags(request.user)
        serializer = GmailImportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        account = get_object_or_404(
            ConnectedIntegrationAccount.objects.exclude(
                status=ConnectedIntegrationAccount.Status.DISCONNECTED
            ),
            pk=data["account_id"], user=request.user, provider="google",
        )
        return data, account


class GmailImportPreviewView(_GmailImportBase):
    throttle_scope = "gmail_list"

    def post(self, request):
        data, account = self._payload(request)
        try:
            result = gmail_import.preview_gmail_attachment_import(
                request.user, account, data["attachments"], data["destination"],
                request=request,
            )
        except gmail_import.GmailImportError as exc:
            return Response(
                {"detail": str(exc), "status": exc.code},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return Response(result)


class GmailImportView(_GmailImportBase):
    throttle_scope = "gmail_import"

    def post(self, request):
        data, account = self._payload(request)
        try:
            result = gmail_import.import_gmail_attachments(
                request.user, account, data["attachments"], data["destination"],
                force=data.get("force", False), request=request,
            )
        except gmail_import.GmailImportError as exc:
            return Response(
                {"detail": str(exc), "status": exc.code},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return Response(result)
