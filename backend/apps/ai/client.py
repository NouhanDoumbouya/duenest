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


@dataclass
class AIResult:
    """Outcome of an AI call. Always returned — never raises by default."""

    ok: bool
    text: str = ""
    data: Any = None  # parsed JSON when an output_schema was requested
    reason: str = ""  # "ok" | "not_configured" | "sdk_missing" | "refusal" | "error"
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

    The call never raises for an expected failure (no key, no SDK, refusal,
    transport error) — inspect ``result.ok`` / ``result.reason`` instead.
    """
    model = model or getattr(settings, "AI_MODEL", "claude-opus-4-8")
    max_tokens = max_tokens or getattr(settings, "AI_MAX_TOKENS", 4096)

    if not ai_available():
        return AIResult(ok=False, reason="not_configured", model=model)

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
        logger.warning("AI call failed", exc_info=True)
        return AIResult(ok=False, reason="error", model=model)

    usage = _usage_dict(getattr(response, "usage", None))
    resp_model = getattr(response, "model", model) or model

    if getattr(response, "stop_reason", None) == "refusal":
        return AIResult(ok=False, reason="refusal", model=resp_model, usage=usage)

    text = _extract_text(response)

    data = None
    if output_schema is not None and text:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("AI returned non-JSON output despite an output schema")
            return AIResult(
                ok=False, text=text, reason="error", model=resp_model, usage=usage
            )

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
