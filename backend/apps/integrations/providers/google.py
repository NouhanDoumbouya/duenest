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
_HTTP_TIMEOUT = 10  # seconds


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


register_provider(GoogleProvider())
