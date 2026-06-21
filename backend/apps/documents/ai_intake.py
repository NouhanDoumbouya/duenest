"""
Smart Intake — understand a freshly-uploaded file + suggest next actions (KEY-GATED).

When a user uploads or scans a file, this turns it from a passive blob into
something the product understands: a one-line "what this is", the structured
fields worth saving, and **confirm-gated** next-action suggestions (create a
document with these fields, set a renewal reminder, add it to an application
pack, draft a related letter).

Division of labour:
  * **Field extraction is reused** from ``extract_file_details`` (text layer /
    OCR / AI), so we never double-extract; dates there are already validated.
  * **Claude adds the intake layer** — a summary and action suggestions grounded
    in those fields and the user's existing documents. It performs no writes; the
    user confirms any action in its destination flow.

Graceful + owner-scoped. No key / flag off / refusal / bad output return a
structured "not available" result — never an exception.
"""

from __future__ import annotations

import logging

from apps.ai.client import ai_available, generate

logger = logging.getLogger(__name__)

_MAX_EXISTING = 40
_MAX_TOKENS = 1000
_SUGGESTION_TYPES = {"create_document", "set_reminder", "add_to_pack", "draft"}
_FIELD_KEYS = ("title", "document_type", "expiry_date", "reference_number")

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": [
                            "create_document",
                            "set_reminder",
                            "add_to_pack",
                            "draft",
                        ],
                    },
                    "label": {"type": "string"},
                    "goal": {"type": "string"},
                },
            },
        },
    },
}

_SYSTEM = (
    "You help a user process a document they just added to their vault. You are "
    "given the structured fields already extracted from it and a list of their "
    "existing documents. Write a one-sentence 'summary' of what the document "
    "appears to be (based only on the extracted fields — never invent), then "
    "propose helpful, confirm-gated next actions from: 'create_document' (save "
    "it as a tracked document), 'set_reminder' (only if it has an expiry date), "
    "'add_to_pack' (if it likely belongs to an application — set 'goal'), "
    "'draft' (draft a related letter — set 'goal'). Each needs a short 'label'. "
    "Only suggest what genuinely helps; returning one or two is fine."
)


def intake_enabled(user) -> bool:
    """True when smart intake is key-configured and flagged on for ``user``."""
    if not ai_available():
        return False
    try:
        from apps.features.flags import is_feature_enabled
    except Exception:  # noqa: BLE001 — flags optional; fail closed
        return False
    return is_feature_enabled("ai_features", user) and is_feature_enabled(
        "ai_intake", user
    )


def suggest_intake(user, file) -> dict:
    """
    Understand ``file`` and propose next actions. Always returns a dict.

        {available, reason, summary, suggested_fields, suggestions:[...]}
    """
    base = {
        "available": False,
        "summary": "",
        "suggested_fields": {},
        "suggestions": [],
    }
    if not ai_available():
        return {**base, "reason": "not_configured"}

    from .services import extract_file_details

    try:
        extracted = extract_file_details(file)
        fields = {
            k: v for k, v in (extracted.extracted_fields or {}).items() if k in _FIELD_KEYS
        }
    except Exception:  # noqa: BLE001 — extraction must never break intake
        logger.warning("smart_intake_extraction_failed", exc_info=True)
        fields = {}

    field_lines = (
        "\n".join(f"- {k}: {v}" for k, v in fields.items())
        if fields
        else "(no fields could be read)"
    )
    prompt = (
        "Extracted fields from the new document:\n"
        + field_lines
        + "\n\nThe user's existing documents:\n"
        + _existing_documents(user)
    )

    from apps.ai.privacy import maybe_redact

    result = generate(
        prompt=maybe_redact(user, prompt),
        system=_SYSTEM,
        output_schema=_SCHEMA,
        max_tokens=_MAX_TOKENS,
    )
    if not result.ok or not isinstance(result.data, dict):
        return {**base, "reason": "error", "suggested_fields": fields}

    return {
        "available": True,
        "reason": "ok",
        "summary": (result.data.get("summary") or "").strip(),
        "suggested_fields": fields,
        "suggestions": _build_suggestions(result.data.get("suggestions") or []),
    }


def _existing_documents(user) -> str:
    from .models import Document

    docs = (
        Document.objects.filter(owner=user, is_trashed=False)
        .order_by("-updated_at")
        .values_list("title", "document_type")[:_MAX_EXISTING]
    )
    if not docs:
        return "(none yet)"
    return "\n".join(
        f"- {title}" + (f" ({dtype})" if dtype else "") for title, dtype in docs
    )


def _build_suggestions(raw) -> list[dict]:
    out: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        stype = item.get("type")
        if stype not in _SUGGESTION_TYPES:
            continue
        label = (item.get("label") or "").strip()[:80]
        if not label:
            continue
        suggestion = {"type": stype, "label": label}
        if stype in {"add_to_pack", "draft"}:
            suggestion["goal"] = (item.get("goal") or "").strip()[:200]
        out.append(suggestion)
    return out
