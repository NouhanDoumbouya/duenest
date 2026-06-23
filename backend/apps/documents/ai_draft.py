"""
AI drafting assistant — write letters/emails from the owner's records (KEY-GATED).

When ``settings.AI_CONFIGURED`` is true AND the per-user ``ai_features`` +
``ai_document_drafting`` flags are on, the owner can ask Claude to draft a piece
of correspondence ("write a letter to request a replacement for my expired
passport") optionally grounded in specific documents from their vault so real
dates / reference numbers can be referenced.

Guarantees (so this is safe and honest):
  * **Suggestion only.** Returns a subject + body for the owner to review and
    edit. Nothing is saved to the vault and nothing is ever sent.
  * **Grounded, never invented.** Claude is told to use only the user's
    instructions and the supplied documents, and to insert clearly-marked
    placeholders (``[your address]``) for any detail it doesn't have — never to
    fabricate names, dates, numbers, or addresses.
  * **Owner-scoped.** Only the asking user's own documents can be referenced.
  * **Graceful.** No key / flag off / refusal / malformed output return a
    structured "not available" result — never an exception.

Privacy: when enabled this sends the instructions + selected document fields to
Anthropic. Off by default, opt-in per user. See ``docs/architecture.md``.
"""

from __future__ import annotations

import logging

from apps.ai.client import ai_available, generate

logger = logging.getLogger(__name__)

_MAX_INSTRUCTIONS_CHARS = 2_000
_MAX_DOCS = 10
_MAX_TOKENS = 1500
_ALLOWED_TONES = {"formal", "friendly", "concise"}
_DEFAULT_TONE = "formal"

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "subject": {"type": "string"},
        "body": {"type": "string"},
    },
}

_SYSTEM = (
    "You are a careful drafting assistant for a personal admin app. You write "
    "clear, professional correspondence (letters and emails) on the user's "
    "behalf. Use ONLY the facts in the user's instructions and the provided "
    "documents — never invent names, dates, reference numbers, addresses, or "
    "claims. When a detail is needed but not available, insert a clearly-marked "
    "placeholder in square brackets (e.g. [your address], [date]). Return a "
    "concise subject line and a complete body. The draft is a suggestion the "
    "user will review and edit before sending; do not add commentary outside the "
    "subject and body."
)


def drafting_enabled(user) -> bool:
    """True when drafting is key-configured and flagged on for ``user``."""
    if not ai_available():
        return False
    try:
        from apps.features.flags import is_feature_enabled
    except Exception:  # noqa: BLE001 — flags optional; fail closed
        return False
    return is_feature_enabled("ai_features", user) and is_feature_enabled(
        "ai_document_drafting", user
    )


def _grounding(user, document_ids: list[int]) -> tuple[str, list[int]]:
    """Owner-scoped context for the selected documents; returns (text, used_ids)."""
    if not document_ids:
        return "", []
    from .ai_qa import _document_snippet
    from .models import Document

    docs = list(
        Document.objects.filter(
            owner=user, id__in=document_ids, is_trashed=False
        ).order_by("-updated_at")[:_MAX_DOCS]
    )
    if not docs:
        return "", []
    blocks = "\n\n".join(_document_snippet(d) for d in docs)
    return blocks, [d.id for d in docs]


def draft(
    user,
    *,
    instructions: str,
    document_ids: list[int] | None = None,
    tone: str = _DEFAULT_TONE,
) -> dict:
    """
    Draft correspondence from ``instructions``, optionally grounded in documents.

    Always returns a dict; never raises::

        {available, reason, subject, body, used_document_ids}
    """
    instructions = (instructions or "").strip()[:_MAX_INSTRUCTIONS_CHARS]
    tone = tone if tone in _ALLOWED_TONES else _DEFAULT_TONE
    base = {
        "available": False,
        "subject": "",
        "body": "",
        "used_document_ids": [],
    }
    if not instructions:
        return {**base, "reason": "empty_instructions"}
    if not ai_available():
        return {**base, "reason": "not_configured"}

    grounding, used_ids = _grounding(user, document_ids or [])

    prompt_parts = [
        f"Tone: {tone}.",
        f"What to write:\n{instructions}",
    ]
    if grounding:
        prompt_parts.append(
            "Relevant documents (use real values from these where appropriate):\n"
            + grounding
        )
    result = generate(
        prompt="\n\n".join(prompt_parts),
        system=_SYSTEM,
        output_schema=_SCHEMA,
        max_tokens=_MAX_TOKENS,
        user=user,
        feature="document_draft",
    )
    if not result.ok or not isinstance(result.data, dict):
        return {**base, "reason": "error", "used_document_ids": used_ids}

    return {
        "available": True,
        "reason": "ok",
        "subject": (result.data.get("subject") or "").strip(),
        "body": (result.data.get("body") or "").strip(),
        "used_document_ids": used_ids,
    }
