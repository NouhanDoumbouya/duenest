"""
AI privacy controls — consent gating + redaction-before-send.

Two user-controlled guarantees on top of the key/flag gates:

  * **Consent.** ``ai_consented(user)`` is False until the user explicitly opts
    in (``AiPreference.ai_enabled``). AI features return a clear
    ``consent_required`` state otherwise — nothing is sent to any model on a
    user's behalf without their say-so.
  * **Privacy Mode.** When ``redaction_enabled(user)`` is on, ``redact_pii``
    masks emails and long ID/card/policy numbers in document text before it is
    sent to the AI provider.

All helpers fail safe: any lookup error reads as "not consented" / "no
redaction" rather than silently sending data.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

# Public, honest disclosure shown in the UI. Update if the provider changes.
AI_DISCLOSURE = {
    "provider": "Anthropic (Claude)",
    "used_for_training": False,
    "summary": (
        "AI features are powered by Anthropic's Claude. Your documents are not "
        "used to train AI models. AI stays off until you turn it on, and you can "
        "turn it off any time."
    ),
}

_EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")
# 6+ digits, optionally separated by spaces/hyphens — passport/card/policy/SSN.
_LONG_NUMBER = re.compile(r"\b\d(?:[\d \-]{4,}\d)\b")


def get_ai_preference(user):
    """Return (creating if needed) the user's AiPreference row."""
    from .models import AiPreference

    pref, _ = AiPreference.objects.get_or_create(user=user)
    return pref


def ai_consented(user) -> bool:
    """True only when the user has explicitly enabled AI."""
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    try:
        from .models import AiPreference

        pref = AiPreference.objects.filter(user=user).only("ai_enabled").first()
        return bool(pref and pref.ai_enabled)
    except Exception:  # noqa: BLE001 — fail closed (treat as not consented)
        logger.warning("AI consent lookup failed", exc_info=True)
        return False


def redaction_enabled(user) -> bool:
    """True when the user has Privacy Mode (redaction-before-send) on."""
    if user is None or not getattr(user, "is_authenticated", False):
        return False
    try:
        from .models import AiPreference

        pref = (
            AiPreference.objects.filter(user=user).only("redact_sensitive").first()
        )
        return bool(pref and pref.redact_sensitive)
    except Exception:  # noqa: BLE001 — fail closed (no redaction claim)
        return False


def redact_pii(text: str) -> str:
    """Mask emails and long ID/card/policy numbers in ``text``."""
    if not text:
        return text
    text = _EMAIL.sub("[redacted-email]", text)
    text = _LONG_NUMBER.sub("[redacted-number]", text)
    return text


def maybe_redact(user, text: str) -> str:
    """Redact ``text`` when the user has Privacy Mode on; else return unchanged."""
    return redact_pii(text) if redaction_enabled(user) else text
