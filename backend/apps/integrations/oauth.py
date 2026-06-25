"""
OAuth ``state`` lifecycle + safe-redirect validation.

The raw state is high-entropy random and is handed to the browser only inside the
authorization URL. We persist **only a salted SHA-256 hash**, so a leaked database
row never reveals a usable state. States are single-use and time-boxed, which
blocks CSRF and replay on the callback.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import IntegrationOAuthState

# How long an authorization attempt may stay open before the state expires.
STATE_TTL_SECONDS = 600  # 10 minutes

DEFAULT_REDIRECT_PATH = "/dashboard/settings/integrations"


def _state_salt() -> str:
    return (
        getattr(settings, "INTEGRATIONS_OAUTH_STATE_SALT", "")
        or getattr(settings, "AUDIT_LOG_HASH_SALT", "")
        or settings.SECRET_KEY
    )


def hash_state(raw_state: str) -> str:
    """Salted SHA-256 of a raw state value (hex). Never store the raw state."""
    return hashlib.sha256(f"{_state_salt()}:{raw_state}".encode("utf-8")).hexdigest()


def is_safe_redirect_path(path: str | None) -> bool:
    """Allow only internal, relative paths — never an open redirect.

    Must start with a single ``/`` and contain no scheme, host, backslash, or
    control characters. ``//host`` (protocol-relative) is rejected.
    """
    if not path:
        return False
    if not path.startswith("/") or path.startswith("//"):
        return False
    if "\\" in path or "://" in path:
        return False
    if any(ord(ch) < 0x20 for ch in path):
        return False
    return True


def safe_redirect_path(path: str | None) -> str:
    return path if is_safe_redirect_path(path) else DEFAULT_REDIRECT_PATH


def create_oauth_state(
    *, user, provider: str, scopes: list[str], scope_groups: list[str],
    redirect_path: str | None = None, organization=None,
) -> tuple[str, IntegrationOAuthState]:
    """Create a pending OAuth state and return ``(raw_state, row)``.

    Only the hash is stored. The caller puts ``raw_state`` into the provider
    authorization URL.
    """
    raw_state = secrets.token_urlsafe(32)
    row = IntegrationOAuthState.objects.create(
        user=user,
        organization=organization,
        provider=provider,
        state_hash=hash_state(raw_state),
        redirect_path=safe_redirect_path(redirect_path),
        scopes=list(scopes),
        scope_groups=list(scope_groups),
        expires_at=timezone.now() + timedelta(seconds=STATE_TTL_SECONDS),
    )
    return raw_state, row


def consume_oauth_state(*, raw_state: str, provider: str) -> IntegrationOAuthState | None:
    """Validate and single-use-consume a state.

    Returns the row on success, or ``None`` when the state is unknown, for a
    different provider, expired, or already consumed (replay). Marking
    ``consumed_at`` is what makes replay fail.
    """
    if not raw_state:
        return None
    try:
        row = IntegrationOAuthState.objects.filter(
            state_hash=hash_state(raw_state), provider=provider
        ).first()
    except Exception:  # noqa: BLE001 - never let lookup raise into the callback
        return None
    if row is None or row.is_consumed or row.is_expired:
        return None
    row.consumed_at = timezone.now()
    row.save(update_fields=["consumed_at"])
    return row
