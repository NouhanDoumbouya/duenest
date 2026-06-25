"""
Integration orchestration: build provider cards, start OAuth, handle the
callback, disconnect, refresh, and health-check — all without ever exposing or
logging tokens.

V1 is a foundation: connecting stores an encrypted token and account metadata.
NOTHING is imported from Drive/Calendar/Gmail, there is no background sync, and
nothing is ever written back to the provider.
"""

from __future__ import annotations

import logging

from django.utils import timezone

from apps.features.flags import is_feature_enabled

from . import events
from .models import ConnectedIntegrationAccount, Provider
from .providers.base import ProviderError, ProviderNotConfigured, get_provider
from .scopes import (
    GOOGLE_SCOPE_GROUPS,
    google_scope_group_cards,
    resolve_google_scopes,
)
from .serializers import ConnectedIntegrationAccountSerializer

logger = logging.getLogger("duenest.integrations")

INTEGRATIONS_FLAG = "integrations"
GOOGLE_FLAG = "google_integrations"

# Default scope groups when the user doesn't pick any — the non-sensitive ones.
# Gmail is NEVER a default (privacy_sensitive); it must be chosen explicitly.
DEFAULT_SCOPE_GROUPS = [
    key for key, meta in GOOGLE_SCOPE_GROUPS.items() if meta.get("default")
]


# ---- Provider cards --------------------------------------------------------


def list_provider_cards(user) -> list[dict]:
    """Safe provider cards for the settings page (no tokens, no secrets)."""
    google = get_provider("google")
    configured = bool(google and google.is_configured())
    available = is_feature_enabled(GOOGLE_FLAG, user)
    accounts = ConnectedIntegrationAccount.objects.filter(
        user=user, provider=Provider.GOOGLE
    ).exclude(status=ConnectedIntegrationAccount.Status.DISCONNECTED)

    if not available:
        provider_status = "unavailable"
    elif not configured:
        provider_status = "not_configured"
    elif accounts.exists():
        provider_status = "connected"
    else:
        provider_status = "not_connected"

    return [
        {
            "key": "google",
            "name": "Google",
            "description": "Connect a Google account to import documents, deadlines, "
            "or attachments later. Import is review-before-save; CertaNest never "
            "edits or deletes anything in your Google account.",
            "available": available,
            "configured": configured,
            "status": provider_status,
            "scope_groups": google_scope_group_cards(),
            "accounts": ConnectedIntegrationAccountSerializer(accounts, many=True).data,
        }
    ]


# ---- Connect ---------------------------------------------------------------


def _clean_scope_groups(scope_groups) -> list[str]:
    known = set(GOOGLE_SCOPE_GROUPS)
    cleaned = [g for g in (scope_groups or []) if g in known]
    return cleaned or list(DEFAULT_SCOPE_GROUPS)


def start_google_oauth(*, user, scope_groups, redirect_path, request=None) -> dict:
    """Create OAuth state and return the Google authorization URL.

    Raises ``ProviderNotConfigured`` when Google OAuth env is missing.
    """
    from .oauth import create_oauth_state

    google = get_provider("google")
    if google is None or not google.is_configured():
        raise ProviderNotConfigured()

    groups = _clean_scope_groups(scope_groups)
    scopes = resolve_google_scopes(groups)
    raw_state, _ = create_oauth_state(
        user=user,
        provider=Provider.GOOGLE,
        scopes=scopes,
        scope_groups=groups,
        redirect_path=redirect_path,
    )
    url = google.get_authorization_url(raw_state=raw_state, scopes=scopes)
    events.record_integration_audit(
        user=user, event_type=events.OAUTH_STARTED, provider="google",
        scope_group=",".join(groups), request=request,
    )
    events.record_integration_operational(
        source="integration_oauth_start", status="started", user=user,
        provider="google", scope_group=",".join(groups), request=request,
    )
    return {"authorization_url": url, "provider": "google", "scope_groups": groups}


def handle_google_callback(*, code, raw_state, request=None):
    """Validate state, exchange the code, upsert the account with encrypted
    tokens, and return ``(account, redirect_path)``.

    Returns ``(None, redirect_path, error_code)`` on any failure (invalid/expired/
    replayed state, provider error). Never raises into the view.
    """
    from .oauth import DEFAULT_REDIRECT_PATH, consume_oauth_state

    state = consume_oauth_state(raw_state=raw_state, provider=Provider.GOOGLE)
    if state is None:
        events.record_integration_operational(
            source="integration_oauth_callback", status="failed",
            provider="google", error_code="invalid_state", request=request,
        )
        return None, DEFAULT_REDIRECT_PATH, "invalid_state"

    redirect_path = state.redirect_path or DEFAULT_REDIRECT_PATH
    user = state.user
    google = get_provider("google")
    try:
        if google is None or not google.is_configured():
            raise ProviderNotConfigured()
        if not code:
            raise ProviderError("Missing authorization code.", code="missing_code")
        tokens = google.exchange_code_for_tokens(code=code)
        profile = google.get_profile(access_token=tokens.access_token)
    except ProviderError as exc:
        events.record_integration_audit(
            user=user, event_type=events.CONNECTION_FAILED, provider="google",
            scope_group=",".join(state.scope_groups), status="error",
            error_code=exc.code, request=request, severity=_warning(),
        )
        events.record_integration_operational(
            source="integration_oauth_callback", status="failed", user=user,
            provider="google", error_code=exc.code, request=request,
        )
        return None, redirect_path, exc.code

    account, _created = ConnectedIntegrationAccount.objects.update_or_create(
        user=user,
        provider=Provider.GOOGLE,
        provider_account_id=profile.account_id,
        defaults={
            "provider_email": profile.email,
            "display_name": profile.display_name,
            "scopes": tokens.scopes or state.scopes,
            "scope_groups": state.scope_groups,
            "status": ConnectedIntegrationAccount.Status.CONNECTED,
            "token_expires_at": tokens.expires_at,
            "last_error_code": "",
            "last_error_at": None,
            "disconnected_at": None,
        },
    )
    account.set_tokens(
        access_token=tokens.access_token, refresh_token=tokens.refresh_token
    )
    account.save(update_fields=["access_token_ciphertext", "refresh_token_ciphertext"])

    events.record_integration_audit(
        user=user, event_type=events.CONNECTED, provider="google", account=account,
        scope_group=",".join(state.scope_groups), status="connected", request=request,
    )
    events.record_integration_operational(
        source="integration_oauth_callback", status="succeeded", user=user,
        provider="google", scope_group=",".join(state.scope_groups), request=request,
    )
    return account, redirect_path, ""


# ---- Disconnect / refresh / health ----------------------------------------


def disconnect_account(*, account, request=None):
    """Best-effort provider revoke, then clear tokens and mark disconnected."""
    provider = get_provider(account.provider)
    revoke_error = ""
    if provider is not None and provider.is_configured():
        token = account.get_refresh_token() or account.get_access_token()
        try:
            if token:
                provider.revoke(token=token)
        except ProviderError as exc:  # pragma: no cover - revoke is best-effort
            revoke_error = exc.code

    account.clear_tokens()
    account.status = ConnectedIntegrationAccount.Status.DISCONNECTED
    account.disconnected_at = timezone.now()
    account.save(
        update_fields=[
            "access_token_ciphertext",
            "refresh_token_ciphertext",
            "status",
            "disconnected_at",
            "updated_at",
        ]
    )
    events.record_integration_audit(
        user=account.user, event_type=events.DISCONNECTED, provider=account.provider,
        account=account, status="disconnected", request=request,
    )
    if revoke_error:
        events.record_integration_operational(
            source="integration_disconnect", status="degraded", user=account.user,
            provider=account.provider, error_code=revoke_error, request=request,
        )
    return account


def refresh_account(*, account, request=None) -> dict:
    """Refresh tokens. Handles missing provider config safely (no crash)."""
    provider = get_provider(account.provider)
    if provider is None or not provider.is_configured():
        account.last_error_code = "configuration_required"
        account.last_error_at = timezone.now()
        account.status = ConnectedIntegrationAccount.Status.ERROR
        account.save(update_fields=["last_error_code", "last_error_at", "status", "updated_at"])
        events.record_integration_operational(
            source="integration_refresh", status="failed", user=account.user,
            provider=account.provider, error_code="configuration_required", request=request,
        )
        return {"status": "configuration_required"}

    refresh_token = account.get_refresh_token()
    try:
        if not refresh_token:
            raise ProviderError("No refresh token.", code="no_refresh_token")
        tokens = provider.refresh_tokens(refresh_token=refresh_token)
    except ProviderError as exc:
        account.last_error_code = exc.code
        account.last_error_at = timezone.now()
        account.status = ConnectedIntegrationAccount.Status.ERROR
        account.save(update_fields=["last_error_code", "last_error_at", "status", "updated_at"])
        events.record_integration_audit(
            user=account.user, event_type=events.REFRESH_FAILED, provider=account.provider,
            account=account, status="error", error_code=exc.code, request=request,
            severity=_warning(),
        )
        events.record_integration_operational(
            source="integration_refresh", status="failed", user=account.user,
            provider=account.provider, error_code=exc.code, request=request,
        )
        return {"status": "error", "error_code": exc.code}

    account.set_tokens(access_token=tokens.access_token, refresh_token=tokens.refresh_token)
    account.token_expires_at = tokens.expires_at
    account.last_refresh_at = timezone.now()
    account.last_error_code = ""
    account.last_error_at = None
    account.status = ConnectedIntegrationAccount.Status.CONNECTED
    account.save()
    events.record_integration_audit(
        user=account.user, event_type=events.TOKEN_REFRESHED, provider=account.provider,
        account=account, status="connected", request=request,
    )
    return {"status": "connected"}


def account_health(*, account) -> ConnectedIntegrationAccount:
    """Recompute derived status from token expiry and stamp last_checked_at."""
    if account.status not in {
        ConnectedIntegrationAccount.Status.DISCONNECTED,
        ConnectedIntegrationAccount.Status.REVOKED,
    }:
        if account.is_token_expired:
            account.status = ConnectedIntegrationAccount.Status.EXPIRED
        elif account.status == ConnectedIntegrationAccount.Status.EXPIRED:
            account.status = ConnectedIntegrationAccount.Status.CONNECTED
    account.last_checked_at = timezone.now()
    account.save(update_fields=["status", "last_checked_at", "updated_at"])
    return account


def _warning():
    from apps.documents.models import AuditLogEntry

    return AuditLogEntry.Severity.WARNING
