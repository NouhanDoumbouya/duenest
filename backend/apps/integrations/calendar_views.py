"""
Google Calendar import API (manual, read-only, review-before-save).

Every endpoint requires the signed-in user and the integrations + Google +
calendar-import feature flags. A user can only act on their OWN connected Google
account (ownership enforced by the queryset filter). Responses contain only safe
metadata — never tokens, raw Google API bodies, or event descriptions.
"""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status as http_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.features.flags import require_feature_enabled

from . import services
from .calendar_import import (
    CalendarImportError,
    import_google_calendar_events,
    list_google_calendar_events,
    list_google_calendars,
    list_import_destinations,
    preview_google_calendar_import,
)
from .models import ConnectedIntegrationAccount

CALENDAR_FLAG = "google_calendar_import"

# Map safe error codes to HTTP responses (no token/secret material ever leaks).
# Client/validation problems -> 400; upstream provider failures -> 502.
_CLIENT_CODES = {
    "not_configured",
    "reconnect_required",
    "unsupported_provider",
    "destination_not_supported",
    "calendar_required",
}


class _CalendarBase(APIView):
    permission_classes = [IsAuthenticated]

    def _require_flags(self, request) -> None:
        require_feature_enabled(services.INTEGRATIONS_FLAG, request.user)
        require_feature_enabled(services.GOOGLE_FLAG, request.user)
        require_feature_enabled(CALENDAR_FLAG, request.user)

    def _account(self, request, account_id) -> ConnectedIntegrationAccount:
        return get_object_or_404(
            ConnectedIntegrationAccount, pk=account_id, user=request.user
        )

    def _error_response(self, exc: CalendarImportError) -> Response:
        if exc.code in _CLIENT_CODES:
            return Response(
                {"status": exc.code, "detail": exc.message},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        return Response(
            {"status": "error", "error_code": exc.code, "detail": exc.message},
            status=http_status.HTTP_502_BAD_GATEWAY,
        )


class GoogleCalendarDestinationsView(_CalendarBase):
    """GET the destination options for the import picker."""

    def get(self, request):
        self._require_flags(request)
        return Response({"destinations": list_import_destinations(request.user)})


class GoogleCalendarListView(_CalendarBase):
    """GET the connected account's calendars (safe metadata only)."""

    def get(self, request):
        self._require_flags(request)
        account = self._account(request, request.query_params.get("account_id"))
        try:
            calendars = list_google_calendars(request.user, account, request=request)
        except CalendarImportError as exc:
            return self._error_response(exc)
        return Response({"calendars": calendars})


class GoogleCalendarEventsView(_CalendarBase):
    """GET upcoming events for a calendar (safe metadata + page token)."""

    def get(self, request):
        self._require_flags(request)
        account = self._account(request, request.query_params.get("account_id"))
        params = request.query_params
        try:
            page_size = int(params.get("page_size") or 25)
        except (TypeError, ValueError):
            page_size = 25
        try:
            data = list_google_calendar_events(
                request.user,
                account,
                calendar_id=(params.get("calendar_id") or "").strip(),
                time_min=params.get("time_min") or None,
                time_max=params.get("time_max") or None,
                query=params.get("query") or None,
                page_token=params.get("page_token") or None,
                page_size=page_size,
                request=request,
            )
        except CalendarImportError as exc:
            return self._error_response(exc)
        return Response(data)


class GoogleCalendarImportPreviewView(_CalendarBase):
    """POST selected events to see which would import vs. skip (no writes)."""

    def post(self, request):
        self._require_flags(request)
        account = self._account(request, request.data.get("account_id"))
        events = request.data.get("events")
        if not isinstance(events, list):
            return Response(
                {"detail": "events must be a list."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        try:
            data = preview_google_calendar_import(
                request.user,
                account,
                events=events,
                destination=request.data.get("destination"),
            )
        except CalendarImportError as exc:
            return self._error_response(exc)
        return Response(data)


class GoogleCalendarImportView(_CalendarBase):
    """POST selected events to import them as CertaNest deadlines + reminders."""

    def post(self, request):
        self._require_flags(request)
        account = self._account(request, request.data.get("account_id"))
        events = request.data.get("events")
        if not isinstance(events, list):
            return Response(
                {"detail": "events must be a list."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        if not events:
            return Response(
                {"detail": "Select at least one event to import."},
                status=http_status.HTTP_400_BAD_REQUEST,
            )
        try:
            data = import_google_calendar_events(
                request.user,
                account,
                events=events,
                destination=request.data.get("destination"),
                request=request,
            )
        except CalendarImportError as exc:
            return self._error_response(exc)
        return Response(data)
