"""
Thin, honest wrapper around the Anthropic (Claude) API.

This is the single entry point every AI-powered feature in CertaNest calls. It
exists so that:

  * AI is **key-gated** in one place — callers never have to check
    ``settings.AI_CONFIGURED`` or import ``anthropic`` themselves.
  * A missing key, a missing SDK, a safety refusal, or a transport error all
    degrade to a structured :class:`AIResult` with ``ok=False`` and a machine
    readable ``reason`` — an AI call must never crash the action that triggered
    it (same philosophy as ``common.email.send_branded_email``).
  * The ``anthropic`` SDK is imported lazily, so lean installs that omit it (and
    every code path when no key is set) still import and run fine.

Add ``ANTHROPIC_API_KEY`` and the same calls start returning real model output —
no code change required. See ``apps.ai.config`` for the gating rules.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings

logger = logging.getLogger(__name__)

# Shown to users (and as AIResult.text) when a budget cap pauses AI. Generic on
# purpose — it never reveals the internal token/cost limits.
BUDGET_PAUSED_MESSAGE = (
    "AI is paused for today to protect usage limits. Please try again later."
)


@dataclass
class AIResult:
    """Outcome of an AI call. Always returned — never raises by default."""

    ok: bool
    text: str = ""
    data: Any = None  # parsed JSON when an output_schema was requested
    # "ok" | "not_configured" | "sdk_missing" | "refusal" | "error" | "budget"
    reason: str = ""
    model: str = ""
    usage: dict = field(default_factory=dict)


def ai_available() -> bool:
    """True when a usable API key is configured (``settings.AI_CONFIGURED``)."""
    return bool(getattr(settings, "AI_CONFIGURED", False))


def _load_anthropic():
    """Import the SDK lazily. Isolated so tests can patch it without the SDK."""
    import anthropic  # noqa: PLC0415 - intentional lazy import (optional dependency)

    return anthropic


def generate(
    *,
    prompt: str,
    system: str | None = None,
    max_tokens: int | None = None,
    model: str | None = None,
    output_schema: dict | None = None,
    user=None,
    feature: str = "unknown",
) -> AIResult:
    """
    Run one Claude completion and return an :class:`AIResult`.

    Args:
        prompt: The user-turn content.
        system: Optional system prompt.
        max_tokens: Output cap; defaults to ``settings.AI_MAX_TOKENS``.
        model: Override the model; defaults to ``settings.AI_MODEL``.
        output_schema: When given, constrains the response to this JSON Schema
            (structured outputs) and populates ``AIResult.data`` with the parsed
            object.
        user: The user the call is made on behalf of (for budget + metering).
            ``None`` for system calls (e.g. scheduled digests).
        feature: Short internal feature name for metering (e.g. ``document_qa``).

    Cost control runs here at the single chokepoint: the budget guard can pause
    the call before any spend, and every attempt is metered via
    ``apps.ai.metering``. The call never raises for an expected failure (no key,
    no SDK, budget cap, refusal, transport error) — inspect ``result.ok`` /
    ``result.reason`` instead.
    """
    # Plan-aware model routing at the single chokepoint: Free → Haiku, Pro →
    # Haiku (Sonnet only for heavier features when enabled), Opus only for
    # founder/admin or operator-configured system calls. Never raises.
    from .routing import resolve_allowed_ai_model

    model = resolve_allowed_ai_model(user, feature=feature, requested_model=model)
    max_tokens = max_tokens or getattr(settings, "AI_MAX_TOKENS", 4096)

    if not ai_available():
        return AIResult(ok=False, reason="not_configured", model=model)

    # Budget guard — before any paid call. Fails closed (see metering).
    from .metering import check_budget, record_usage

    cap = check_budget(user)
    if cap:
        record_usage(
            user=user,
            feature=feature,
            model=model,
            status="blocked",
            reason="budget",
            metadata={"cap": cap},
        )
        return AIResult(
            ok=False, reason="budget", model=model, text=BUDGET_PAUSED_MESSAGE
        )

    try:
        anthropic = _load_anthropic()
    except ImportError:
        logger.warning("AI is configured but the 'anthropic' SDK is not installed")
        return AIResult(ok=False, reason="sdk_missing", model=model)

    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        kwargs: dict = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system
        if output_schema is not None:
            kwargs["output_config"] = {
                "format": {"type": "json_schema", "schema": output_schema}
            }

        response = client.messages.create(**kwargs)
    except Exception:  # noqa: BLE001 - an AI call must never break its caller
        # Log without the exception detail to avoid any chance of leaking the key.
        logger.warning("AI call failed for feature=%s", feature)
        record_usage(
            user=user, feature=feature, model=model, status="error",
            reason="provider_error",
        )
        return AIResult(ok=False, reason="error", model=model)

    usage = _usage_dict(getattr(response, "usage", None))
    in_tok = int(usage.get("input_tokens") or 0)
    out_tok = int(usage.get("output_tokens") or 0)
    resp_model = getattr(response, "model", model) or model
    request_id = str(getattr(response, "id", "") or "")

    def _meter(status: str, reason: str) -> None:
        # Tokens were consumed once the provider responded — always record them
        # so refusals and bad-output still count against the budget.
        record_usage(
            user=user,
            feature=feature,
            model=resp_model,
            input_tokens=in_tok,
            output_tokens=out_tok,
            status=status,
            reason=reason,
            provider_request_id=request_id,
        )

    if getattr(response, "stop_reason", None) == "refusal":
        _meter("success", "refusal")
        return AIResult(ok=False, reason="refusal", model=resp_model, usage=usage)

    text = _extract_text(response)

    data = None
    if output_schema is not None and text:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("AI returned non-JSON output despite an output schema")
            _meter("success", "bad_output")
            return AIResult(
                ok=False, text=text, reason="error", model=resp_model, usage=usage
            )

    _meter("success", "ok")
    return AIResult(
        ok=True, text=text, data=data, reason="ok", model=resp_model, usage=usage
    )


def _extract_text(response: Any) -> str:
    """Concatenate the text blocks of a Messages API response."""
    parts: list[str] = []
    for block in getattr(response, "content", []) or []:
        if getattr(block, "type", None) == "text":
            parts.append(getattr(block, "text", "") or "")
    return "".join(parts)


def _usage_dict(usage: Any) -> dict:
    if usage is None:
        return {}
    return {
        "input_tokens": getattr(usage, "input_tokens", None),
        "output_tokens": getattr(usage, "output_tokens", None),
    }
