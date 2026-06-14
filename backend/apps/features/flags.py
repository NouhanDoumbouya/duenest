"""
Feature flag resolution + enforcement.

`is_feature_enabled(key, user)` returns a boolean; `require_feature_enabled`
raises a controlled 503 when a feature is paused. Resolution order:

    DB FeatureFlag row  →  env DUENEST_FEATURE_<KEY>  →  registry default

Unknown/missing keys resolve to ENABLED so the switch layer can never silently
break an already-shipped feature. Founders may dial features down at runtime.
"""

from __future__ import annotations

import logging
import os

from rest_framework import status
from rest_framework.exceptions import APIException

from .models import FEATURE_DEFAULTS, FeatureFlag, Visibility

logger = logging.getLogger(__name__)

_TRUE = {"1", "true", "yes", "on"}
_FALSE = {"0", "false", "no", "off"}


class FeatureDisabled(APIException):
    """Raised when a gated feature is not available to the requester."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_code = "feature_disabled"

    def __init__(self, key: str, message: str = ""):
        self.feature = key
        super().__init__(
            {
                "detail": message or "This feature is temporarily unavailable.",
                "feature": key,
                "status": "disabled",
            }
        )


def is_founder(user) -> bool:
    return bool(
        user
        and getattr(user, "is_authenticated", False)
        and (getattr(user, "is_staff", False) or getattr(user, "is_superuser", False))
    )


def is_beta_user(user) -> bool:
    # No dedicated beta-cohort field exists yet, so during private beta any
    # authenticated user is treated as a beta user. Founders always qualify.
    return bool(user and getattr(user, "is_authenticated", False))


def _env_override(key: str):
    raw = os.environ.get(f"DUENEST_FEATURE_{key.upper()}")
    if raw is None:
        return None
    lowered = raw.strip().lower()
    if lowered in _TRUE:
        return Visibility.ENABLED
    if lowered in _FALSE:
        return Visibility.DISABLED
    return None


def resolve_flag(key: str) -> tuple[str, str]:
    """Return (visibility, maintenance_message) for a key."""
    try:
        flag = FeatureFlag.objects.filter(key=key).only(
            "visibility", "maintenance_message"
        ).first()
    except Exception:  # noqa: BLE001 - never let flag lookup break a request
        logger.warning("Feature flag lookup failed for %s", key, exc_info=True)
        flag = None
    if flag is not None:
        return flag.visibility, flag.maintenance_message
    env = _env_override(key)
    if env is not None:
        return env, ""
    return FEATURE_DEFAULTS.get(key, Visibility.ENABLED), ""


def is_feature_enabled(key: str, user=None) -> bool:
    visibility, _ = resolve_flag(key)
    if visibility == Visibility.DISABLED:
        return False
    if visibility == Visibility.ENABLED:
        return True
    if visibility == Visibility.FOUNDER_ONLY:
        return is_founder(user)
    if visibility == Visibility.BETA_ONLY:
        return is_founder(user) or is_beta_user(user)
    return True  # unknown visibility → safe default


def require_feature_enabled(key: str, user=None) -> None:
    """Raise FeatureDisabled (503) when the feature is unavailable to the user."""
    visibility, message = resolve_flag(key)
    if not is_feature_enabled(key, user):
        raise FeatureDisabled(key, message)
