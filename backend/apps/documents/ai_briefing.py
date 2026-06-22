"""
Proactive Autopilot — an AI "what to do now" briefing (KEY-GATED).

CertaNest already computes real per-document health (expiry, renewal, missing
file/expiry) in :func:`apps.documents.services.get_document_health`. This turns
those raw signals into a calm, prioritized briefing: "here are the few things
worth doing now, why, and the next action" — the anxiety-reducing payoff of the
product.

Division of labour (so nothing is fabricated):
  * **Python owns the facts.** The candidate list, statuses, and day counts come
    from ``get_document_health`` over the user's real, owner-scoped documents.
  * **Claude owns the synthesis.** It prioritizes, writes the plain-language
    detail, and suggests an action label — it never invents a document, date, or
    status. Items are mapped back to real documents by index.

Graceful + owner-scoped like the rest of the AI surface. When nothing needs
attention it returns an empty, positive briefing without calling the model.
"""

from __future__ import annotations

import logging

from apps.ai.client import ai_available, generate
from apps.ai.privacy import maybe_redact

logger = logging.getLogger(__name__)

_MAX_CANDIDATES = 50
_MAX_TOKENS = 1500
_VALID_URGENCY = {"high", "medium", "low"}

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "index": {"type": "integer"},
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                    "urgency": {"type": "string", "enum": ["high", "medium", "low"]},
                    "action_label": {"type": "string"},
                },
            },
        },
    },
}

_SYSTEM = (
    "You are a calm, trustworthy life-admin assistant. You are given the user's "
    "documents that need attention, each numbered with its real status and day "
    "counts (already computed — treat them as ground truth; never change a date "
    "or status). Produce a short, prioritized briefing of the few things most "
    "worth doing now. For each item set 'index' to the document's number, a "
    "clear 'title', a one-sentence 'detail' explaining why it matters, an "
    "'urgency' (high/medium/low), and a short 'action_label' (e.g. 'Renew now', "
    "'Add expiry date', 'Upload the file'). Lead with the most urgent. Be "
    "reassuring and concrete, never alarmist. Add a one-line encouraging "
    "'summary' of where the user stands."
)


def briefing_enabled(user) -> bool:
    """True when the briefing is key-configured and flagged on for ``user``."""
    if not ai_available():
        return False
    try:
        from apps.features.flags import is_feature_enabled
    except Exception:  # noqa: BLE001 — flags optional; fail closed
        return False
    return is_feature_enabled("ai_features", user) and is_feature_enabled(
        "ai_briefing", user
    )


def build_briefing(user) -> dict:
    """
    Return a prioritized AI action briefing grounded in real document health.

    Always returns a dict; never raises::

        {available, reason, summary, items:[...], attention_count}
    """
    base = {
        "available": False,
        "summary": "",
        "items": [],
        "attention_count": 0,
    }
    if not ai_available():
        return {**base, "reason": "not_configured"}

    candidates = _attention_candidates(user)
    if not candidates:
        # Nothing needs attention — a positive briefing, no model call needed.
        return {
            "available": True,
            "reason": "ok",
            "summary": "You're all caught up — nothing needs your attention right now.",
            "items": [],
            "attention_count": 0,
        }

    blocks = "\n".join(
        f"[{i}] {line}" for i, line, _doc in candidates
    )
    blocks = maybe_redact(user, blocks)
    prompt = (
        "These documents need attention (status and day counts are already "
        "computed and correct):\n\n" + blocks
    )
    result = generate(
        prompt=prompt,
        system=_SYSTEM,
        output_schema=_SCHEMA,
        max_tokens=_MAX_TOKENS,
    )
    if not result.ok or not isinstance(result.data, dict):
        return {**base, "reason": "error", "attention_count": len(candidates)}

    by_index = {i: doc for i, _line, doc in candidates}
    items = _build_items(result.data.get("items") or [], by_index)

    return {
        "available": True,
        "reason": "ok",
        "summary": (result.data.get("summary") or "").strip(),
        "items": items,
        "attention_count": len(candidates),
    }


def _attention_candidates(user) -> list[tuple]:
    """Owner-scoped (index, signal_line, doc) for documents needing attention."""
    from django.db.models import Count, Q

    from .models import Document
    from .services import get_document_health

    docs = (
        Document.objects.filter(owner=user, is_trashed=False)
        .exclude(status=Document.Status.ARCHIVED)
        .annotate(file_count=Count("files", filter=Q(files__is_trashed=False)))
        .order_by("expiry_date")
    )
    out: list[tuple] = []
    index = 1
    for doc in docs:
        health = get_document_health(doc)
        if not health.needs_attention:
            continue
        bits = [f'"{doc.title}"']
        if doc.document_type:
            bits.append(f"type={doc.document_type}")
        bits.append(f"status={health.computed_status}")
        if health.days_until_expiry is not None:
            bits.append(f"days_until_expiry={health.days_until_expiry}")
        if health.missing_expiry_date:
            bits.append("missing_expiry_date")
        if health.missing_file:
            bits.append("missing_file")
        out.append((index, ", ".join(bits), doc))
        index += 1
        if len(out) >= _MAX_CANDIDATES:
            break
    return out


def _build_items(raw_items, by_index) -> list[dict]:
    out: list[dict] = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        doc = by_index.get(raw.get("index"))
        urgency = raw.get("urgency")
        if urgency not in _VALID_URGENCY:
            urgency = "medium"
        title = (raw.get("title") or "").strip()[:200]
        if not title:
            continue
        out.append(
            {
                "title": title,
                "detail": (raw.get("detail") or "").strip()[:400],
                "urgency": urgency,
                "action_label": (raw.get("action_label") or "").strip()[:60],
                "document_id": doc.id if doc else None,
                "document_title": doc.title if doc else None,
            }
        )
    return out
