"""
Key Encryption Key (KEK) provider.

KEKs are master keys used to wrap per-file/per-field Data Encryption Keys (DEKs).
They are loaded ONLY from configuration (environment variables today, a secret
manager in the future) and are NEVER stored in the database, returned by the
API, logged, or committed to source control.

Configuration (see .env.example):

    DUENEST_ACTIVE_KEK_VERSION=v1
    DUENEST_KEK_V1_B64=<base64 of 32 random bytes>
    DUENEST_KEK_V2_B64=...   # additional versions for rotation

The active version is used to wrap new DEKs. Any historical version that still
has data referencing it must remain configured so those records can be
unwrapped. Losing a KEK makes everything wrapped under it unrecoverable.
"""

from __future__ import annotations

import base64
import binascii

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

KEK_LENGTH_BYTES = 32


class KeyConfigurationError(ImproperlyConfigured):
    """Raised when KEK configuration is missing or malformed."""


def _decode_kek(version: str, raw_b64: str) -> bytes:
    try:
        key = base64.b64decode(raw_b64, validate=True)
    except (binascii.Error, ValueError) as exc:  # malformed base64
        raise KeyConfigurationError(
            f"KEK for version '{version}' is not valid base64."
        ) from exc
    if len(key) != KEK_LENGTH_BYTES:
        raise KeyConfigurationError(
            f"KEK for version '{version}' must decode to exactly "
            f"{KEK_LENGTH_BYTES} bytes (got {len(key)})."
        )
    return key


def get_active_kek_version() -> str:
    """The KEK version new DEKs are wrapped with."""
    version = getattr(settings, "DUENEST_ACTIVE_KEK_VERSION", "") or ""
    if not version:
        raise KeyConfigurationError(
            "DUENEST_ACTIVE_KEK_VERSION is not configured."
        )
    return version


def get_kek(version: str) -> bytes:
    """
    Return the 32-byte KEK for ``version``.

    Raises KeyConfigurationError (fail closed) if the version is unknown or the
    configured value is malformed. The returned bytes must never be logged.
    """
    if not version:
        raise KeyConfigurationError("A KEK version is required.")
    keys = getattr(settings, "DUENEST_KEKS", {}) or {}
    raw = keys.get(version)
    if not raw:
        raise KeyConfigurationError(f"No KEK configured for version '{version}'.")
    return _decode_kek(version, raw)


def get_active_kek() -> tuple[str, bytes]:
    version = get_active_kek_version()
    return version, get_kek(version)


def configured_versions() -> list[str]:
    """Versions that currently have a KEK configured (no key material exposed)."""
    keys = getattr(settings, "DUENEST_KEKS", {}) or {}
    return sorted(keys.keys())


def validate_configuration() -> None:
    """
    Validate that the active KEK is present and well-formed. Intended to be
    called at startup in production so the app fails closed on misconfiguration.
    """
    version = get_active_kek_version()
    get_kek(version)  # raises if missing/malformed
