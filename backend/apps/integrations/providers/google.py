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

import base64
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
GMAIL_MESSAGES_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
_HTTP_TIMEOUT = 10  # seconds

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


# ---- Gmail safe payload builders (module-level; no body, no snippet) -------


def _parse_from(value: str) -> tuple[str, str]:
    """Split a raw ``From`` header into (display name, email). Never raises."""
    try:
        from email.utils import parseaddr

        name, addr = parseaddr(value or "")
        return (name or "")[:255], (addr or "")[:255]
    except Exception:  # noqa: BLE001
        return "", ""


def _collect_gmail_attachments(payload: dict, message_id: str) -> list[dict]:
    """Walk a Gmail message payload tree and return SAFE attachment metadata only
    (filename / mime / size / attachmentId) — never body data or content."""
    out: list[dict] = []

    def walk(part):
        if not isinstance(part, dict):
            return
        body = part.get("body", {}) or {}
        filename = part.get("filename") or ""
        attachment_id = body.get("attachmentId")
        # A real attachment has a filename and a fetchable attachmentId.
        if filename and attachment_id:
            out.append(
                {
                    "provider_message_id": message_id,
                    "provider_attachment_id": attachment_id,
                    "filename": filename[:255],
                    "mime_type": part.get("mimeType", "") or "",
                    "size": int(body["size"]) if str(body.get("size") or "").isdigit() else None,
                    "attachment_index": len(out),
                    "downloadable": True,
                }
            )
        for sub in part.get("parts", []) or []:
            walk(sub)

    walk(payload or {})
    return out


def build_gmail_message_payload(raw: dict) -> dict:
    """Map a raw Gmail message to SAFE metadata. NEVER includes the body, the
    snippet, tokens, raw headers, or attachment content."""
    message_id = raw.get("id", "") or ""
    headers = {
        (h.get("name", "") or "").lower(): h.get("value", "") or ""
        for h in (raw.get("payload", {}) or {}).get("headers", [])
    }
    from_display, from_email = _parse_from(headers.get("from", ""))
    attachments = _collect_gmail_attachments(raw.get("payload", {}) or {}, message_id)
    return {
        "provider_message_id": message_id,
        "thread_id": raw.get("threadId", "") or "",
        "from_display": from_display,
        "from_email": from_email,
        "subject": (headers.get("subject", "") or "")[:255],
        "date": (headers.get("date", "") or "")[:120],
        "attachment_count": len(attachments),
        "attachments": attachments,
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

    # ---- Gmail (read-only; import only) ------------------------------------
    #
    # Read-only. NEVER modifies, deletes, archives, labels, or sends messages.
    # Only safe metadata + explicitly-selected attachment bytes are fetched;
    # never the email body/snippet, tokens, or raw API responses are logged.

    def search_gmail_messages(
        self, *, access_token: str, query: str | None = None,
        page_token: str | None = None, page_size: int = 20,
    ) -> dict:
        self._require_configured()
        params = {
            "q": query or "has:attachment newer_than:1y",
            "maxResults": max(1, min(int(page_size or 20), 50)),
        }
        if page_token:
            params["pageToken"] = page_token
        payload = self._drive_get(access_token, GMAIL_MESSAGES_ENDPOINT, params=params)
        return {
            "message_ids": [m.get("id", "") for m in payload.get("messages", []) if m.get("id")],
            "next_page_token": payload.get("nextPageToken", "") or "",
        }

    def get_gmail_message(self, *, access_token: str, message_id: str) -> dict:
        self._require_configured()
        # format=metadata returns headers + the part tree (filenames / attachment
        # ids / sizes) but NO body data — exactly what we need, nothing more.
        return self._drive_get(
            access_token,
            f"{GMAIL_MESSAGES_ENDPOINT}/{message_id}",
            params={
                "format": "metadata",
                "metadataHeaders": ["From", "Subject", "Date"],
            },
        )

    def download_gmail_attachment(
        self, *, access_token: str, message_id: str, attachment_id: str,
        max_bytes: int | None = None,
    ) -> bytes:
        self._require_configured()
        payload = self._drive_get(
            access_token,
            f"{GMAIL_MESSAGES_ENDPOINT}/{message_id}/attachments/{attachment_id}",
        )
        data = payload.get("data", "") or ""
        if not data:
            return b""
        try:
            raw = base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))
        except Exception as exc:  # noqa: BLE001
            raise ProviderError("Bad attachment data.", code="bad_response") from exc
        if max_bytes is not None and len(raw) > max_bytes:
            raise ProviderError("File too large.", code="too_large")
        return raw


register_provider(GoogleProvider())
