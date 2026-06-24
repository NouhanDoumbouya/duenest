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

from decimal import Decimal, InvalidOperation
from typing import Callable

Getter = Callable[[str, str], str]

# Default to a fast, low-cost Haiku-class model — NOT Opus. Opus is never the
# default for normal Free/Pro usage (see apps.ai.routing); it is reserved for
# founder/admin or deliberate operator override via AI_MODEL. Operators can set
# AI_MODEL / AI_MODEL_HAIKU / AI_MODEL_SONNET per deployment without code changes.
DEFAULT_MODEL = "claude-haiku-4-5-20251001"
DEFAULT_MODEL_HAIKU = "claude-haiku-4-5-20251001"
DEFAULT_MODEL_SONNET = "claude-sonnet-4-6"
DEFAULT_MAX_TOKENS = 4096

# --- Cost-control defaults (conservative; meant for a small credit balance) ---
# Caps are deliberately low so a misconfiguration or a runaway loop can never
# drain the Anthropic balance. Raise them per deployment once spend is trusted.
DEFAULT_DAILY_TOKEN_CAP_USER = 5000
DEFAULT_DAILY_TOKEN_CAP_GLOBAL = 25000
DEFAULT_MONTHLY_COST_LIMIT_USD = Decimal("5")

# Approximate USD price per 1,000,000 tokens, (input, output). ESTIMATES ONLY —
# update from https://www.anthropic.com/pricing when prices change. Matching is
# by substring (longest key first) so version suffixes still resolve. An unknown
# model estimates $0 but its token usage is still recorded.
MODEL_PRICING: dict[str, tuple[Decimal, Decimal]] = {
    "claude-opus-4": (Decimal("15"), Decimal("75")),
    "claude-sonnet-4": (Decimal("3"), Decimal("15")),
    "claude-haiku-4": (Decimal("1"), Decimal("5")),
    "claude-3-5-haiku": (Decimal("0.80"), Decimal("4")),
    "claude-3-haiku": (Decimal("0.25"), Decimal("1.25")),
}

_TRUE = {"1", "true", "yes", "on"}


def _as_int(value: str, default: int) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _as_bool(value: str, default: bool) -> bool:
    text = str(value).strip().lower()
    if not text:
        return default
    return text in _TRUE


def _as_decimal(value: str, default: Decimal) -> Decimal:
    try:
        text = str(value).strip()
        return Decimal(text) if text else default
    except (InvalidOperation, TypeError, ValueError):
        return default


def estimate_cost_usd(model: str, input_tokens: int, output_tokens: int) -> Decimal:
    """
    Estimate USD cost for a call from token usage and :data:`MODEL_PRICING`.

    Pure and offline (no web calls). Unknown models return ``Decimal("0")`` so a
    new/typo'd model never raises — tokens are still recorded by the caller.
    """
    rates = None
    for key in sorted(MODEL_PRICING, key=len, reverse=True):
        if key in (model or ""):
            rates = MODEL_PRICING[key]
            break
    if rates is None:
        return Decimal("0")
    in_rate, out_rate = rates
    million = Decimal("1000000")
    cost = (Decimal(int(input_tokens or 0)) / million) * in_rate + (
        Decimal(int(output_tokens or 0)) / million
    ) * out_rate
    return cost.quantize(Decimal("0.000001"))


def resolve_ai_settings(get: Getter) -> dict:
    """
    Return CertaNest AI settings derived from env vars.

    Keys returned: AI_PROVIDER, ANTHROPIC_API_KEY, AI_MODEL, AI_MAX_TOKENS,
    AI_CONFIGURED, plus the cost-control keys AI_DAILY_TOKEN_CAP_USER,
    AI_DAILY_TOKEN_CAP_GLOBAL, AI_MONTHLY_COST_LIMIT_USD,
    AI_USAGE_METERING_ENABLED, AI_BUDGET_GUARD_ENABLED.

    ``AI_CONFIGURED`` is True only when the selected provider is supported and a
    usable API key is present — so the rest of the app can gate on a single
    boolean.
    """
    provider = (get("AI_PROVIDER", "anthropic") or "anthropic").strip().lower()
    api_key = (get("ANTHROPIC_API_KEY", "") or "").strip()
    model = (get("AI_MODEL", "") or "").strip() or DEFAULT_MODEL
    model_haiku = (get("AI_MODEL_HAIKU", "") or "").strip() or DEFAULT_MODEL_HAIKU
    model_sonnet = (get("AI_MODEL_SONNET", "") or "").strip() or DEFAULT_MODEL_SONNET
    max_tokens = _as_int(get("AI_MAX_TOKENS", ""), DEFAULT_MAX_TOKENS)

    configured = provider == "anthropic" and bool(api_key)

    return {
        "AI_PROVIDER": provider,
        "ANTHROPIC_API_KEY": api_key,
        "AI_MODEL": model,
        # Plan-tier models used by apps.ai.routing.resolve_allowed_ai_model.
        # Free → Haiku only; Pro → Haiku, Sonnet only for heavier features when
        # AI_PRO_SONNET_ENABLED. Opus stays founder/operator-override only.
        "AI_MODEL_HAIKU": model_haiku,
        "AI_MODEL_SONNET": model_sonnet,
        "AI_PRO_SONNET_ENABLED": _as_bool(get("AI_PRO_SONNET_ENABLED", ""), False),
        "AI_MAX_TOKENS": max_tokens,
        "AI_CONFIGURED": configured,
        # Cost controls (see apps/ai/metering.py). Conservative by default.
        "AI_DAILY_TOKEN_CAP_USER": _as_int(
            get("AI_DAILY_TOKEN_CAP_USER", ""), DEFAULT_DAILY_TOKEN_CAP_USER
        ),
        "AI_DAILY_TOKEN_CAP_GLOBAL": _as_int(
            get("AI_DAILY_TOKEN_CAP_GLOBAL", ""), DEFAULT_DAILY_TOKEN_CAP_GLOBAL
        ),
        "AI_MONTHLY_COST_LIMIT_USD": _as_decimal(
            get("AI_MONTHLY_COST_LIMIT_USD", ""), DEFAULT_MONTHLY_COST_LIMIT_USD
        ),
        "AI_USAGE_METERING_ENABLED": _as_bool(
            get("AI_USAGE_METERING_ENABLED", ""), True
        ),
        "AI_BUDGET_GUARD_ENABLED": _as_bool(get("AI_BUDGET_GUARD_ENABLED", ""), True),
    }
