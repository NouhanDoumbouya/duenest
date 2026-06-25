"""
Provider abstraction for import-only integrations.

A provider knows how to: build an authorization URL, exchange an authorization
code for tokens, refresh tokens, revoke access, and fetch the connected account's
profile. This branch ships the foundation + a Google provider; no provider data
(Drive/Calendar/Gmail) is imported anywhere.

Network calls live ONLY inside concrete providers and are isolated in small
methods so tests can mock them — tests never hit a real provider API.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


class ProviderError(Exception):
    """A provider operation failed. Carries a short, safe ``code`` (never a token,
    secret, or raw provider body)."""

    def __init__(self, message: str = "", *, code: str = "provider_error"):
        self.code = code
        super().__init__(message or code)


class ProviderNotConfigured(ProviderError):
    def __init__(self, message: str = "Provider is not configured."):
        super().__init__(message, code="configuration_required")


@dataclass(frozen=True)
class ProviderTokens:
    access_token: str
    refresh_token: str | None = None
    expires_at: datetime | None = None
    scopes: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ProviderProfile:
    account_id: str
    email: str = ""
    display_name: str = ""


class BaseIntegrationProvider:
    key: str = ""
    name: str = ""

    def is_configured(self) -> bool:  # pragma: no cover - overridden
        return False

    def get_authorization_url(
        self, *, raw_state: str, scopes: list[str], redirect_uri: str = ""
    ) -> str:
        raise NotImplementedError

    def exchange_code_for_tokens(
        self, *, code: str, redirect_uri: str = ""
    ) -> ProviderTokens:
        raise NotImplementedError

    def refresh_tokens(self, *, refresh_token: str) -> ProviderTokens:
        raise NotImplementedError

    def revoke(self, *, token: str) -> None:
        raise NotImplementedError

    def get_profile(self, *, access_token: str) -> ProviderProfile:
        raise NotImplementedError


_REGISTRY: dict[str, BaseIntegrationProvider] = {}


def register_provider(provider: BaseIntegrationProvider) -> None:
    _REGISTRY[provider.key] = provider


def get_provider(key: str) -> BaseIntegrationProvider | None:
    return _REGISTRY.get(key)


def all_providers() -> list[BaseIntegrationProvider]:
    return list(_REGISTRY.values())
