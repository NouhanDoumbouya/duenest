"""
Conversational assistant — chat grounded in the user's vault (KEY-GATED).

A natural-language assistant that answers from the user's own documents and,
when the user wants to *do* something, proposes **confirm-gated actions**: typed
suggestions the UI renders as buttons that hand off into CertaNest's existing
(already confirmation-gated) flows — draft a letter, run the Pack Copilot, open a
document, or view the briefing.

Safety model (per product decision):
  * The chat endpoint performs **no writes and no shares**. It only replies and
    proposes actions; the user completes any action in the destination flow.
  * Grounded + owner-scoped: answers use only the user's documents (reuses the
    Ask retrieval seam). Action targets are mapped back to real owned documents.
  * Graceful: no key / flag off / refusal / bad output return a structured "not
    available" result — never an exception.
"""

from __future__ import annotations

import logging

from apps.ai.client import ai_available, generate
from apps.ai.privacy import maybe_redact

logger = logging.getLogger(__name__)

_MAX_MESSAGE_CHARS = 1000
_MAX_HISTORY = 6
_MAX_TOKENS = 1200
_ACTION_TYPES = {"draft", "pack", "open_document", "briefing"}

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "reply": {"type": "string"},
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["draft", "pack", "open_document", "briefing"],
                    },
                    "label": {"type": "string"},
                    "goal": {"type": "string"},
                    "document_index": {"type": "integer"},
                },
            },
        },
    },
}

_SYSTEM = (
    "You are CertaNest's friendly life-admin assistant. Answer the user using ONLY "
    "their own documents (provided below) — never invent facts, dates, or "
    "numbers; if you don't know, say so. You CANNOT take actions yourself. When "
    "the user wants to do something, propose it as a confirm-gated action for "
    "them to tap, choosing from: 'draft' (draft a letter/email — set 'goal' to "
    "what it's for), 'pack' (assemble documents for a goal — set 'goal'), "
    "'open_document' (set 'document_index' to the document's number), or "
    "'briefing' (show what needs attention now). Each action needs a short "
    "'label'. Only propose actions that genuinely help; it's fine to return "
    "none. Keep replies concise and calm."
)


def chat_enabled(user) -> bool:
    """True when chat is key-configured and flagged on for ``user``."""
    if not ai_available():
        return False
    try:
        from apps.features.flags import is_feature_enabled
    except Exception:  # noqa: BLE001 — flags optional; fail closed
        return False
    return is_feature_enabled("ai_features", user) and is_feature_enabled(
        "ai_chat", user
    )


def chat(user, *, message: str, history=None) -> dict:
    """
    Answer ``message`` grounded in the user's documents + propose actions.

    Always returns a dict; never raises::

        {available, reason, reply, actions:[...]}
    """
    message = (message or "").strip()[:_MAX_MESSAGE_CHARS]
    base = {"available": False, "reply": "", "actions": []}
    if not message:
        return {**base, "reason": "empty_message"}
    if not ai_available():
        return {**base, "reason": "not_configured"}

    from .ai_qa import gather_context

    context = gather_context(user, message)
    blocks = (
        "\n\n".join(f"[{c['index']}] {c['text']}" for c in context)
        if context
        else "(The user has no documents in their vault yet.)"
    )
    blocks = maybe_redact(user, blocks)
    convo = _format_history(history)
    prompt = (
        (f"Conversation so far:\n{convo}\n\n" if convo else "")
        + f"User: {message}\n\n--- THE USER'S DOCUMENTS ---\n{blocks}"
    )

    result = generate(
        prompt=prompt,
        system=_SYSTEM,
        output_schema=_SCHEMA,
        max_tokens=_MAX_TOKENS,
        user=user,
        feature="document_chat",
    )
    if not result.ok or not isinstance(result.data, dict):
        return {**base, "reason": "error"}

    by_index = {c["index"]: c for c in context}
    actions = _build_actions(result.data.get("actions") or [], by_index)

    return {
        "available": True,
        "reason": "ok",
        "reply": (result.data.get("reply") or "").strip(),
        "actions": actions,
    }


def _format_history(history) -> str:
    if not isinstance(history, list):
        return ""
    lines = []
    for turn in history[-_MAX_HISTORY:]:
        if not isinstance(turn, dict):
            continue
        role = turn.get("role")
        content = (turn.get("content") or "").strip()[:_MAX_MESSAGE_CHARS]
        if role in {"user", "assistant"} and content:
            lines.append(f"{'User' if role == 'user' else 'Assistant'}: {content}")
    return "\n".join(lines)


def _build_actions(raw_actions, by_index) -> list[dict]:
    out: list[dict] = []
    for raw in raw_actions:
        if not isinstance(raw, dict):
            continue
        atype = raw.get("type")
        if atype not in _ACTION_TYPES:
            continue
        label = (raw.get("label") or "").strip()[:80]
        if not label:
            continue
        action: dict = {"type": atype, "label": label}
        if atype in {"draft", "pack"}:
            action["goal"] = (raw.get("goal") or "").strip()[:200]
        elif atype == "open_document":
            doc = by_index.get(raw.get("document_index"))
            if not doc:
                continue  # never point at a document we can't resolve to the owner's
            action["document_id"] = doc["document_id"]
            action["document_title"] = doc["title"]
        out.append(action)
    return out
