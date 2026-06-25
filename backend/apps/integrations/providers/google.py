"""
Google OAuth provider (foundation).

Builds the authorization URL and (when configured) exchanges/refreshes/revokes
tokens and reads the connected account's profile via Google's standard OAuth2 +
OpenID Connect userinfo endpoints. It NEVER reads Drive/Gmail/Calendar data — that
is out of scope for this branch.

Configuration comes from settings (env-backed):
``GOOGLE_OAUTH_CLIENT_ID`` / ``GOOGLE_OAUTH_CLIENT_SECRET`` /
``GOOGLE_OAUTH_REDIRECT_URI``. With any of these missing the provider reports
``configuration_required`` and the UI shows "Not configured" instead of crashing.

Nothing here logs tokens, secrets, codes, or raw provider response bodies.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from urllib.parse import urlencode

from django.conf import settings
from django.utils import timezone

from .base import (
    BaseIntegrationProvider,
    ProviderError,
    ProviderNotConfigured,
    ProviderProfile,
    ProviderTokens,
    register_provider,
)

logger = logging.getLogger("duenest.integrations")

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"
USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"
DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files"
CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"
_HTTP_TIMEOUT = 10  # seconds
_MAX_EVENT_PAGE_SIZE = 50  # cap so one request can't pull an unbounded page
_TITLE_MAX = 200  # safe display length for a calendar/event title
_LOCATION_MAX = 200


def _clean_line(value, *, limit: int) -> str:
    """Collapse a provider string to a single trimmed line, capped in length.

    Used for titles/locations only. We never keep event descriptions, attendee
    data, conference links, or any free-form body — see ``build_event_payload``.
    """
    if not value:
        return ""
    text = " ".join(str(value).split())
    return text[:limit]

# Only safe metadata fields are ever requested from Drive (no external links,
# no permissions, no content). iconLink/webViewLink are deliberately omitted.
DRIVE_FILE_FIELDS = "id,name,mimeType,size,modifiedTime,trashed"
DRIVE_LIST_FIELDS = f"nextPageToken,files({DRIVE_FILE_FIELDS})"

# Google-native types we can EXPORT to a supported format (PDF). Read-only.
GOOGLE_WORKSPACE_EXPORTABLE = {
    "application/vnd.google-apps.document": "application/pdf",
    "application/vnd.google-apps.spreadsheet": "application/pdf",
    "application/vnd.google-apps.presentation": "application/pdf",
}
_DRIVE_TYPE_LABELS = {
    "application/pdf": "PDF",
    "image/jpeg": "Image",
    "image/png": "Image",
    "application/msword": "Word",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "application/vnd.google-apps.document": "Google Doc",
    "application/vnd.google-apps.spreadsheet": "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.folder": "Folder",
}


def build_drive_file_payload(meta: dict) -> dict:
    """Map raw Drive file metadata to the SAFE fields we surface.

    Never includes tokens, download URLs, external links, permissions, or content.
    """
    mime = meta.get("mimeType", "") or ""
    size = meta.get("size")
    export_mime = GOOGLE_WORKSPACE_EXPORTABLE.get(mime)
    return {
        "provider_file_id": meta.get("id", "") or "",
        "name": meta.get("name", "") or "",
        "mime_type": mime,
        "size": int(size) if str(size or "").isdigit() else None,
        "modified_time": meta.get("modifiedTime", "") or "",
        "type_label": _DRIVE_TYPE_LABELS.get(mime, "File"),
        "is_folder": mime == "application/vnd.google-apps.folder",
        "is_google_workspace_file": mime.startswith("application/vnd.google-apps"),
        "exportable": bool(export_mime),
        "export_mime_type": export_mime or "",
    }


class GoogleProvider(BaseIntegrationProvider):
    key = "google"
    name = "Google"

    # ---- Config ------------------------------------------------------------

    def _client_id(self) -> str:
        return getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "") or ""

    def _client_secret(self) -> str:
        return getattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "") or ""

    def _redirect_uri(self) -> str:
        return getattr(settings, "GOOGLE_OAUTH_REDIRECT_URI", "") or ""

    def is_configured(self) -> bool:
        return bool(self._client_id() and self._client_secret() and self._redirect_uri())

    def _require_configured(self) -> None:
        if not self.is_configured():
            raise ProviderNotConfigured()

    # ---- Authorization URL (deterministic; no network) ---------------------

    def get_authorization_url(
        self, *, raw_state: str, scopes: list[str], redirect_uri: str = ""
    ) -> str:
        self._require_configured()
        params = {
            "client_id": self._client_id(),
            "redirect_uri": redirect_uri or self._redirect_uri(),
            "response_type": "code",
            "scope": " ".join(scopes),
            "state": raw_state,
            "access_type": "offline",  # request a refresh token
            "include_granted_scopes": "true",
            "prompt": "consent",
        }
        return f"{AUTH_ENDPOINT}?{urlencode(params)}"

    # ---- Token + profile (network; isolated for mocking) -------------------

    def _post(self, url: str, data: dict) -> dict:
        import requests  # local import keeps the module importable without network

        try:
            resp = requests.post(url, data=data, timeout=_HTTP_TIMEOUT)
        except requests.RequestException as exc:
            raise ProviderError("Network error.", code="provider_unreachable") from exc
        if resp.status_code >= 400:
            # Do NOT include the response body — it can echo the code/secret.
            raise ProviderError("Token request failed.", code="token_request_failed")
        try:
            return resp.json()
        except ValueError as exc:
            raise ProviderError("Bad provider response.", code="bad_response") from exc

    def _tokens_from_payload(
        self, payload: dict, *, fallback_refresh: str | None = None
    ) -> ProviderTokens:
        access = payload.get("access_token")
        if not access:
            raise ProviderError("No access token returned.", code="no_access_token")
        expires_in = payload.get("expires_in")
        expires_at = (
            timezone.now() + timedelta(seconds=int(expires_in)) if expires_in else None
        )
        scope_str = payload.get("scope") or ""
        return ProviderTokens(
            access_token=access,
            refresh_token=payload.get("refresh_token") or fallback_refresh,
            expires_at=expires_at,
            scopes=scope_str.split() if scope_str else [],
        )

    def exchange_code_for_tokens(
        self, *, code: str, redirect_uri: str = ""
    ) -> ProviderTokens:
        self._require_configured()
        payload = self._post(
            TOKEN_ENDPOINT,
            {
                "code": code,
                "client_id": self._client_id(),
                "client_secret": self._client_secret(),
                "redirect_uri": redirect_uri or self._redirect_uri(),
                "grant_type": "authorization_code",
            },
        )
        return self._tokens_from_payload(payload)

    def refresh_tokens(self, *, refresh_token: str) -> ProviderTokens:
        self._require_configured()
        if not refresh_token:
            raise ProviderError("No refresh token.", code="no_refresh_token")
        payload = self._post(
            TOKEN_ENDPOINT,
            {
                "refresh_token": refresh_token,
                "client_id": self._client_id(),
                "client_secret": self._client_secret(),
                "grant_type": "refresh_token",
            },
        )
        return self._tokens_from_payload(payload, fallback_refresh=refresh_token)

    def revoke(self, *, token: str) -> None:
        # Best-effort: a revoke failure must not block local disconnect.
        if not token:
            return
        try:
            import requests

            requests.post(
                REVOKE_ENDPOINT, data={"token": token}, timeout=_HTTP_TIMEOUT
            )
        except Exception:  # noqa: BLE001 - never raise from best-effort revoke
            logger.info("google token revoke best-effort failed", exc_info=True)

    def get_profile(self, *, access_token: str) -> ProviderProfile:
        self._require_configured()
        import requests

        try:
            resp = requests.get(
                USERINFO_ENDPOINT,
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=_HTTP_TIMEOUT,
            )
        except requests.RequestException as exc:
            raise ProviderError("Network error.", code="provider_unreachable") from exc
        if resp.status_code >= 400:
            raise ProviderError("Profile request failed.", code="profile_request_failed")
        try:
            data = resp.json()
        except ValueError as exc:
            raise ProviderError("Bad provider response.", code="bad_response") from exc
        account_id = data.get("sub")
        if not account_id:
            raise ProviderError("No account id.", code="no_account_id")
        return ProviderProfile(
            account_id=str(account_id),
            email=data.get("email", "") or "",
            display_name=data.get("name", "") or "",
        )

    # ---- Google Drive (read-only; import only) -----------------------------
    #
    # Drive is accessed read-only. These methods NEVER modify, delete, share, or
    # write back to Drive. Token/secret/body are never logged. Only safe metadata
    # is surfaced; download streams are size-capped to the upload limit.

    def _drive_get(
        self, access_token: str, url: str, *, params=None,
        stream_bytes: bool = False, max_bytes: int | None = None,
    ):
        import requests

        try:
            resp = requests.get(
                url,
                headers={"Authorization": f"Bearer {access_token}"},
                params=params,
                timeout=_HTTP_TIMEOUT,
                stream=stream_bytes,
            )
        except requests.RequestException as exc:
            raise ProviderError("Network error.", code="provider_unreachable") from exc
        if resp.status_code == 401:
            raise ProviderError("Unauthorized.", code="unauthorized")
        if resp.status_code == 403:
            raise ProviderError("Forbidden.", code="forbidden")
        if resp.status_code == 404:
            raise ProviderError("Not found.", code="not_found")
        if resp.status_code >= 400:
            # Never include the body — it may echo identifiers or the token.
            raise ProviderError("Drive request failed.", code="drive_request_failed")
        if stream_bytes:
            buf = bytearray()
            for chunk in resp.iter_content(chunk_size=65536):
                if not chunk:
                    continue
                buf.extend(chunk)
                if max_bytes is not None and len(buf) > max_bytes:
                    resp.close()
                    raise ProviderError("File too large.", code="too_large")
            return bytes(buf)
        try:
            return resp.json()
        except ValueError as exc:
            raise ProviderError("Bad provider response.", code="bad_response") from exc

    # ---- Calendar (read-only; import-only) ---------------------------------
    #
    # These call the Google Calendar API with the ``calendar.readonly`` scope.
    # They NEVER create/update/delete events and NEVER write back. Every method
    # is network-isolated behind ``_authorized_get`` so tests mock it without
    # hitting Google. Raw response bodies are shaped into the narrow safe
    # payloads below and are never returned or logged verbatim.

    def _authorized_get(self, url: str, *, access_token: str, params: dict | None = None) -> dict:
        self._require_configured()
        import requests  # local import keeps the module importable without network

        try:
            resp = requests.get(
                url,
                headers={"Authorization": f"Bearer {access_token}"},
                params=params or {},
                timeout=_HTTP_TIMEOUT,
            )
        except requests.RequestException as exc:
            raise ProviderError("Network error.", code="provider_unreachable") from exc
        if resp.status_code in (401, 403):
            raise ProviderError("Calendar access denied.", code="calendar_forbidden")
        if resp.status_code >= 400:
            # Never surface the response body — it may echo event content.
            raise ProviderError("Calendar request failed.", code="calendar_request_failed")
        try:
            return resp.json()
        except ValueError as exc:
            raise ProviderError("Bad provider response.", code="bad_response") from exc

    def list_drive_files(
        self, *, access_token: str, query: str | None = None,
        page_token: str | None = None, page_size: int = 25,
        mime_types: list[str] | None = None,
    ) -> dict:
        self._require_configured()
        q_parts = ["trashed = false"]
        if query:
            # Strip characters that would break the Drive `q` string / inject.
            safe = query.replace("\\", "").replace("'", "")[:120]
            if safe:
                q_parts.append(f"name contains '{safe}'")
        if mime_types:
            ors = " or ".join(f"mimeType = '{m}'" for m in mime_types if "'" not in m)
            if ors:
                q_parts.append(f"({ors})")
        params = {
            "q": " and ".join(q_parts),
            "pageSize": max(1, min(int(page_size or 25), 100)),
            "fields": DRIVE_LIST_FIELDS,
            "spaces": "drive",
            "corpora": "user",
            "orderBy": "modifiedTime desc",
        }
        if page_token:
            params["pageToken"] = page_token
        payload = self._drive_get(access_token, DRIVE_FILES_ENDPOINT, params=params)
        return {
            "files": [build_drive_file_payload(f) for f in payload.get("files", [])],
            "next_page_token": payload.get("nextPageToken", "") or "",
        }

    def get_drive_file_metadata(self, *, access_token: str, file_id: str) -> dict:
        self._require_configured()
        return self._drive_get(
            access_token,
            f"{DRIVE_FILES_ENDPOINT}/{file_id}",
            params={"fields": DRIVE_FILE_FIELDS},
        )

    def download_drive_file(
        self, *, access_token: str, file_id: str,
        export_mime: str | None = None, max_bytes: int | None = None,
    ) -> bytes:
        self._require_configured()
        if export_mime:
            url = f"{DRIVE_FILES_ENDPOINT}/{file_id}/export"
            params = {"mimeType": export_mime}
        else:
            url = f"{DRIVE_FILES_ENDPOINT}/{file_id}"
            params = {"alt": "media"}
        return self._drive_get(
            access_token, url, params=params, stream_bytes=True, max_bytes=max_bytes
        )
    def list_calendars(self, *, access_token: str) -> list[dict]:
        """Return the account's calendars as safe metadata only."""
        data = self._authorized_get(
            f"{CALENDAR_API_BASE}/users/me/calendarList",
            access_token=access_token,
            params={"maxResults": 100, "minAccessRole": "reader"},
        )
        items = data.get("items") or []
        return [self.build_calendar_payload(item) for item in items if item.get("id")]

    def list_calendar_events(
        self,
        *,
        access_token: str,
        calendar_id: str,
        time_min: str | None = None,
        time_max: str | None = None,
        query: str | None = None,
        page_token: str | None = None,
        page_size: int = 25,
    ) -> dict:
        """Return upcoming events (single instances) as safe metadata + page token."""
        from urllib.parse import quote

        params: dict = {
            "singleEvents": "true",  # expand recurring series into instances
            "orderBy": "startTime",
            "maxResults": max(1, min(int(page_size or 25), _MAX_EVENT_PAGE_SIZE)),
        }
        if time_min:
            params["timeMin"] = time_min
        if time_max:
            params["timeMax"] = time_max
        if query:
            params["q"] = query
        if page_token:
            params["pageToken"] = page_token
        data = self._authorized_get(
            f"{CALENDAR_API_BASE}/calendars/{quote(calendar_id, safe='')}/events",
            access_token=access_token,
            params=params,
        )
        items = data.get("items") or []
        events = [
            self.build_event_payload(item, calendar_id=calendar_id)
            for item in items
            if item.get("id") and item.get("status") != "cancelled"
        ]
        return {"events": events, "next_page_token": data.get("nextPageToken") or ""}

    def get_calendar_event(self, *, access_token: str, calendar_id: str, event_id: str) -> dict:
        """Fetch one event and return its safe payload (used to validate import)."""
        from urllib.parse import quote

        data = self._authorized_get(
            f"{CALENDAR_API_BASE}/calendars/{quote(calendar_id, safe='')}"
            f"/events/{quote(event_id, safe='')}",
            access_token=access_token,
        )
        return self.build_event_payload(data, calendar_id=calendar_id)

    # ---- Safe payload builders (raw Google JSON -> narrow safe dicts) -------

    @staticmethod
    def build_calendar_payload(raw: dict) -> dict:
        access_role = raw.get("accessRole") or ""
        return {
            "provider_calendar_id": str(raw.get("id") or ""),
            "name": _clean_line(raw.get("summaryOverride") or raw.get("summary"), limit=_TITLE_MAX)
            or "(unnamed calendar)",
            "primary": bool(raw.get("primary")),
            "access_role": access_role if access_role in {
                "owner", "writer", "reader", "freeBusyReader"
            } else "",
            "time_zone": _clean_line(raw.get("timeZone"), limit=64),
        }

    @staticmethod
    def build_event_payload(raw: dict, *, calendar_id: str) -> dict:
        start = raw.get("start") or {}
        end = raw.get("end") or {}
        all_day = bool(start.get("date") and not start.get("dateTime"))
        start_value = start.get("dateTime") or start.get("date") or ""
        end_value = end.get("dateTime") or end.get("date") or ""
        # The plain calendar date used for the imported deadline (first 10 chars
        # of an ISO datetime, or the all-day date as-is). No timezone math.
        start_date = start_value[:10] if start_value else ""
        return {
            "provider_event_id": str(raw.get("id") or ""),
            "calendar_id": calendar_id,
            "title": _clean_line(raw.get("summary"), limit=_TITLE_MAX) or "(no title)",
            "start": start_value,
            "end": end_value,
            "start_date": start_date,
            "all_day": all_day,
            "location": _clean_line(raw.get("location"), limit=_LOCATION_MAX),
            "status": raw.get("status") or "confirmed",
            "updated": raw.get("updated") or "",
            "recurring": bool(raw.get("recurringEventId") or raw.get("recurrence")),
        }


register_provider(GoogleProvider())
