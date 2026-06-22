"""
Provider-neutral AI configuration for CertaNest.

CertaNest's AI features (Claude-powered document understanding, drafting, and
Q&A) are **key-gated**, mirroring the email configuration pattern
(``apps.notifications.email_config``):

  * No ``ANTHROPIC_API_KEY`` set  -> ``AI_CONFIGURED`` is False. AI-powered code
    degrades to a clear "not configured" result instead of crashing or
    pretending it produced something. The features stay built but dark.
  * Add the key later             -> ``AI_CONFIGURED`` becomes True and the same
    features activate with **no code change** (and the per-feature flags in
    ``apps.features`` still control who can see each one).

``resolve_ai_settings`` is a pure function (no Django imports) so it can be
unit-tested without touching live settings or contacting any provider.
"""

from __future__ import annotations

from typing import Callable

Getter = Callable[[str, str], str]

# Default to the latest, most capable Claude model. Operators can override per
# deployment with AI_MODEL without touching code.
DEFAULT_MODEL = "claude-opus-4-8"
DEFAULT_MAX_TOKENS = 4096


def _as_int(value: str, default: int) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def resolve_ai_settings(get: Getter) -> dict:
    """
    Return CertaNest AI settings derived from env vars.

    Keys returned: AI_PROVIDER, ANTHROPIC_API_KEY, AI_MODEL, AI_MAX_TOKENS,
    AI_CONFIGURED.

    ``AI_CONFIGURED`` is True only when the selected provider is supported and a
    usable API key is present — so the rest of the app can gate on a single
    boolean.
    """
    provider = (get("AI_PROVIDER", "anthropic") or "anthropic").strip().lower()
    api_key = (get("ANTHROPIC_API_KEY", "") or "").strip()
    model = (get("AI_MODEL", "") or "").strip() or DEFAULT_MODEL
    max_tokens = _as_int(get("AI_MAX_TOKENS", ""), DEFAULT_MAX_TOKENS)

    configured = provider == "anthropic" and bool(api_key)

    return {
        "AI_PROVIDER": provider,
        "ANTHROPIC_API_KEY": api_key,
        "AI_MODEL": model,
        "AI_MAX_TOKENS": max_tokens,
        "AI_CONFIGURED": configured,
    }
