"""
Application Pack Copilot — goal -> personalized document gap analysis (KEY-GATED).

The flagship "agent that does your life admin" capability. Given a goal ("UK
Skilled Worker visa", "Chevening scholarship", "mortgage application") and an
optional deadline, Claude:

  1. Produces the list of documents/requirements typically needed for that goal.
  2. Matches each requirement against the user's OWN vault — have / missing /
     unclear — citing the documents that satisfy it.
  3. (In Python, not the model) flags matched documents whose real
     ``expiry_date`` falls on/before the deadline, so the user sees what will
     lapse before they can submit.

Honesty rules (this is the brand):
  * **Never official.** Requirements vary by country/institution/case; the
    response always tells the user to verify with the official source, and the
    model is instructed to say "unclear" rather than invent.
  * **Grounded.** "have" is only ever based on the user's supplied documents.
  * **Date math is real.** Expiry-vs-deadline is computed from the stored
    ``Document.expiry_date`` — never from the model.
  * **Graceful + owner-scoped.** Any failure returns a structured "not
    available" result; only the asking user's documents are ever considered.

Privacy: sends the goal + the user's document fields to Anthropic when enabled.
Off by default, opt-in per user. See ``docs/architecture.md``.
"""

from __future__ import annotations

import logging
from datetime import date

from apps.ai.client import ai_available, generate
from apps.ai.privacy import maybe_redact

logger = logging.getLogger(__name__)

_MAX_DOCS = 60
_MAX_GOAL_CHARS = 300
_MAX_TOKENS = 2000
_VALID_STATUS = {"have", "missing", "unclear"}

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "summary": {"type": "string"},
        "requirements": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "status": {"type": "string", "enum": ["have", "missing", "unclear"]},
                    "matched_document_indexes": {
                        "type": "array",
                        "items": {"type": "integer"},
                    },
                },
            },
        },
    },
}

_SYSTEM = (
    "You help a user assemble the documents needed for a specific goal (e.g. a "
    "visa, scholarship, university or job application, mortgage, or benefit "
    "claim). Given the goal and the user's existing documents (numbered), list "
    "the documents/requirements typically needed for that goal. For EACH "
    "requirement decide, based ONLY on the supplied documents: 'have' (and cite "
    "the matching document numbers in matched_document_indexes), 'missing', or "
    "'unclear'. Never assume the user has something that isn't in the list. Be "
    "realistic and specific to the goal; keep each description to one sentence. "
    "Requirements vary by country, institution, and individual case — never "
    "imply your list is official or complete; the user must verify with the "
    "official source. Provide a short, encouraging summary of where they stand."
)


def pack_copilot_enabled(user) -> bool:
    """True when the copilot is key-configured and flagged on for ``user``."""
    if not ai_available():
        return False
    try:
        from apps.features.flags import is_feature_enabled
    except Exception:  # noqa: BLE001 — flags optional; fail closed
        return False
    return is_feature_enabled("ai_features", user) and is_feature_enabled(
        "ai_pack_copilot", user
    )


def _parse_deadline(value) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value).strip())
    except (ValueError, TypeError):
        return None


def analyze(user, *, goal: str, deadline=None) -> dict:
    """
    Build a personalized requirement checklist + vault gap analysis for ``goal``.

    Always returns a dict; never raises::

        {available, reason, goal, deadline, summary, requirements:[...],
         document_count, have_count, missing_count}
    """
    goal = (goal or "").strip()[:_MAX_GOAL_CHARS]
    deadline_date = _parse_deadline(deadline)
    base = {
        "available": False,
        "goal": goal,
        "deadline": deadline_date.isoformat() if deadline_date else None,
        "summary": "",
        "requirements": [],
        "document_count": 0,
        "have_count": 0,
        "missing_count": 0,
    }
    if not goal:
        return {**base, "reason": "empty_goal"}
    if not ai_available():
        return {**base, "reason": "not_configured"}

    context = _gather_documents(user)
    blocks = (
        "\n\n".join(f"[{i}] {text}" for i, text, _ in context)
        if context
        else "(The user has no documents in their vault yet.)"
    )
    blocks = maybe_redact(user, blocks)
    deadline_line = (
        f"Target deadline: {deadline_date.isoformat()}.\n" if deadline_date else ""
    )
    prompt = (
        f"Goal: {goal}\n{deadline_line}\n"
        f"--- THE USER'S DOCUMENTS ---\n{blocks}"
    )

    result = generate(
        prompt=prompt,
        system=_SYSTEM,
        output_schema=_SCHEMA,
        max_tokens=_MAX_TOKENS,
    )
    if not result.ok or not isinstance(result.data, dict):
        return {**base, "reason": "error", "document_count": len(context)}

    by_index = {i: (doc, title) for i, _text, (doc, title) in _with_docs(context)}
    requirements = _build_requirements(
        result.data.get("requirements") or [], by_index, deadline_date
    )
    have = sum(1 for r in requirements if r["status"] == "have")
    missing = sum(1 for r in requirements if r["status"] == "missing")

    return {
        "available": True,
        "reason": "ok",
        "goal": goal,
        "deadline": deadline_date.isoformat() if deadline_date else None,
        "summary": (result.data.get("summary") or "").strip(),
        "requirements": requirements,
        "document_count": len(context),
        "have_count": have,
        "missing_count": missing,
    }


_MAX_BUNDLE_REQUIREMENTS = 40


def create_bundle_from_copilot(user, *, goal: str, deadline=None, requirements) -> "object":
    """
    Turn a copilot analysis into a real DueNest bundle (insight -> action).

    Creates a draft application bundle titled after the goal, one requirement per
    item, with matched OWNED documents linked (status ATTACHED) and the rest left
    MISSING. Document links are re-validated against the user's vault — the
    caller's ``document_ids`` are never trusted blindly. Pure CRUD (no model
    call). Returns the created ``DocumentBundle``.
    """
    from django.db import transaction

    from .models import Document, DocumentBundle, DocumentBundleRequirement

    title = (goal or "").strip()[:255] or "Application pack"
    deadline_date = _parse_deadline(deadline)
    owned_ids = set(
        Document.objects.filter(owner=user, is_trashed=False).values_list(
            "id", flat=True
        )
    )

    with transaction.atomic():
        bundle = DocumentBundle.objects.create(
            owner=user,
            title=title,
            bundle_type=DocumentBundle.BundleType.APPLICATION,
            target_date=deadline_date,
            status=DocumentBundle.Status.DRAFT,
            description=(
                "Created with the Application Pack Copilot. Requirements are "
                "AI-suggested guidance — verify against the official source."
            ),
        )
        for i, req in enumerate((requirements or [])[:_MAX_BUNDLE_REQUIREMENTS]):
            if not isinstance(req, dict):
                continue
            name = (req.get("name") or "").strip()[:255]
            if not name:
                continue
            matched = [
                int(d)
                for d in (req.get("document_ids") or [])
                if isinstance(d, (int, str)) and str(d).isdigit() and int(d) in owned_ids
            ]
            linked = matched[0] if matched else None
            DocumentBundleRequirement.objects.create(
                owner=user,
                bundle=bundle,
                title=name,
                description=(req.get("description") or "").strip()[:2000],
                requirement_type=DocumentBundleRequirement.RequirementType.DOCUMENT,
                is_required=True,
                linked_document_id=linked,
                status=(
                    DocumentBundleRequirement.Status.ATTACHED
                    if linked
                    else DocumentBundleRequirement.Status.MISSING
                ),
                sort_order=i,
            )
        bundle.recalculate_readiness()
    return bundle


def _gather_documents(user) -> list[tuple]:
    """Owner-scoped (index, snippet, (doc, title)) tuples for grounding."""
    from .ai_qa import _document_snippet
    from .models import Document

    docs = list(
        Document.objects.filter(owner=user, is_trashed=False).order_by("-updated_at")[
            :_MAX_DOCS
        ]
    )
    return [
        (i + 1, _document_snippet(doc), (doc, doc.title)) for i, doc in enumerate(docs)
    ]


def _with_docs(context):
    """Yield (index, text, (doc, title)) — small helper for clarity."""
    for index, text, pair in context:
        yield index, text, pair


def _build_requirements(raw_reqs, by_index, deadline_date) -> list[dict]:
    out: list[dict] = []
    for raw in raw_reqs:
        if not isinstance(raw, dict):
            continue
        status = raw.get("status")
        if status not in _VALID_STATUS:
            status = "unclear"
        documents = []
        seen: set[int] = set()
        for idx in raw.get("matched_document_indexes") or []:
            entry = by_index.get(idx)
            if not entry:
                continue
            doc, title = entry
            if doc.id in seen:
                continue
            seen.add(doc.id)
            expires_before = bool(
                deadline_date
                and doc.expiry_date
                and doc.expiry_date <= deadline_date
            )
            documents.append(
                {
                    "document_id": doc.id,
                    "title": title,
                    "expiry_date": (
                        doc.expiry_date.isoformat() if doc.expiry_date else None
                    ),
                    "expires_before_deadline": expires_before,
                }
            )
        # A requirement the model marked 'have' but cited no (owned) document for
        # is downgraded to 'unclear' — we never claim a match we can't point to.
        if status == "have" and not documents:
            status = "unclear"
        out.append(
            {
                "name": (raw.get("name") or "").strip()[:200] or "Requirement",
                "description": (raw.get("description") or "").strip()[:300],
                "status": status,
                "documents": documents,
            }
        )
    return out
