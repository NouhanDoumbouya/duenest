"""
Requirement Link → Checklist extraction (AI, KEY-GATED + plan-gated + credit-metered).

Given a user-pasted URL, safely fetch the page (``apps.ai.requirement_links``)
and have Claude extract a structured requirements checklist — required/optional
documents, deadlines, eligibility notes, submission instructions, and warnings,
each with a short source snippet for citation. Returns a structured dict; never
raises.

Guarantees:
  * **Extract → review → apply.** This only produces a draft payload. It never
    mutates the pack — applying selected items is a separate, explicit step.
  * **No hallucination.** The model is instructed to extract only what the page
    states, cite snippets, and lower confidence / add warnings when unclear.
  * **Credit-safe.** A failed fetch, a not-configured/budget-blocked model, or a
    refusal returns ``model_called: False`` (or a non-``ok`` reason), so the view
    never charges AI credits for it. Credits are charged only on a real success.

Plan gating, AI consent, AI credits, and the infrastructure budget guard are all
enforced by the calling view + ``apps.ai.client.generate`` — never bypassed here.
"""

from __future__ import annotations

import logging
from datetime import date

from apps.ai.client import ai_available, generate
from apps.ai.privacy import maybe_redact
from apps.ai.requirement_links import SafeFetchError, fetch_requirement_page

logger = logging.getLogger(__name__)

FEATURE = "requirement_link_checklist"
_MAX_TOKENS = 2048
_MAX_PROMPT_TEXT = 16_000
_MAX_ITEMS = 30
_MAX_NOTES = 12
_MAX_TITLE = 160
_MAX_DESC = 400
_CONFIDENCE = {"high", "medium", "low"}

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string"},
        "summary": {"type": "string"},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "required_documents": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "source_snippet": {"type": "string"},
                },
            },
        },
        "optional_documents": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "description": {"type": "string"},
                    "source_snippet": {"type": "string"},
                },
            },
        },
        "deadlines": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "title": {"type": "string"},
                    "date": {"type": "string"},
                    "description": {"type": "string"},
                    "source_snippet": {"type": "string"},
                },
            },
        },
        "eligibility_notes": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "text": {"type": "string"},
                    "source_snippet": {"type": "string"},
                },
            },
        },
        "submission_instructions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "text": {"type": "string"},
                    "source_snippet": {"type": "string"},
                },
            },
        },
        "warnings": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "type": {"type": "string"},
                    "message": {"type": "string"},
                },
            },
        },
    },
}

_SYSTEM = (
    "You extract an application's document requirements from the text of ONE web "
    "page (a scholarship, visa, university, job, internship, grant, school, HR, "
    "or permit page). Extract ONLY what the page actually states — never invent, "
    "infer, or guess a requirement, deadline, or fee. Normalize document names "
    "(e.g. 'a copy of your passport' -> 'Passport copy') but do not add documents "
    "that aren't mentioned. Put clearly-required documents in 'required_documents' "
    "and clearly-optional ones in 'optional_documents'. For each item include a "
    "short verbatim 'source_snippet' from the page. Return dates as ISO "
    "YYYY-MM-DD only when the page is unambiguous; if a date is vague, omit it and "
    "add a 'warnings' entry. Set 'confidence' to 'low' when the page is unclear or "
    "thin, and return fewer items rather than fabricating. Never claim certainty "
    "the page does not support."
)


def _clean(value, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def _valid_iso(value) -> str | None:
    try:
        return date.fromisoformat(str(value).strip()).isoformat()
    except (ValueError, TypeError):
        return None


def _clean_docs(items, *, required: bool, source_url: str) -> list[dict]:
    out: list[dict] = []
    for item in (items or [])[:_MAX_ITEMS]:
        if not isinstance(item, dict):
            continue
        title = _clean(item.get("title"), _MAX_TITLE)
        if not title:
            continue
        out.append(
            {
                "title": title,
                "description": _clean(item.get("description"), _MAX_DESC),
                "required": required,
                "source_snippet": _clean(item.get("source_snippet"), _MAX_DESC),
                "source_url": source_url,
            }
        )
    return out


def _clean_deadlines(items) -> list[dict]:
    out: list[dict] = []
    for item in (items or [])[:_MAX_NOTES]:
        if not isinstance(item, dict):
            continue
        title = _clean(item.get("title"), _MAX_TITLE) or "Deadline"
        out.append(
            {
                "title": title,
                "date": _valid_iso(item.get("date")),
                "description": _clean(item.get("description"), _MAX_DESC),
                "source_snippet": _clean(item.get("source_snippet"), _MAX_DESC),
            }
        )
    return out


def _clean_notes(items, key: str) -> list[dict]:
    out: list[dict] = []
    for item in (items or [])[:_MAX_NOTES]:
        if not isinstance(item, dict):
            continue
        text = _clean(item.get(key), _MAX_DESC)
        if not text:
            continue
        out.append({key: text, "source_snippet": _clean(item.get("source_snippet"), _MAX_DESC)})
    return out


def _clean_warnings(items) -> list[dict]:
    out: list[dict] = []
    for item in (items or [])[:_MAX_NOTES]:
        if not isinstance(item, dict):
            continue
        message = _clean(item.get("message"), _MAX_DESC)
        if not message:
            continue
        out.append({"type": _clean(item.get("type"), 40) or "note", "message": message})
    return out


def extract_requirements(user, url: str) -> dict:
    """
    Fetch ``url`` and extract a structured requirements checklist (never raises).

    Returns ``{available, reason, model_called, ...}``. ``reason == "ok"`` with
    ``model_called == True`` only on a genuine model success — the single signal
    the view uses to charge credits.
    """
    base = {
        "available": False,
        "model_called": False,
        "title": "",
        "summary": "",
        "confidence": "low",
        "source_url": url,
        "page_title": "",
        "required_documents": [],
        "optional_documents": [],
        "deadlines": [],
        "eligibility_notes": [],
        "submission_instructions": [],
        "warnings": [],
    }

    if not ai_available():
        return {**base, "reason": "not_configured"}

    # 1) Safe fetch (no crawl, SSRF-guarded). Fetch/validation failures never
    #    reach the model and so never cost a credit.
    try:
        page = fetch_requirement_page(url)
    except SafeFetchError as exc:
        return {**base, "reason": exc.code, "message": exc.message}

    # 2) AI extraction over the readable text (+ snippets), redacted if the user
    #    has Privacy Mode on.
    snippet_block = "\n".join(f"[{s['id']}] {s['text']}" for s in page["snippets"])
    body = maybe_redact(user, page["text"][:_MAX_PROMPT_TEXT])
    prompt = (
        f"PAGE URL: {page['url']}\nPAGE TITLE: {page['title']}\n\n"
        "--- READABLE PAGE TEXT ---\n"
        f"{body}\n\n--- CANDIDATE SOURCE SNIPPETS ---\n{snippet_block}"
    )

    result = generate(
        prompt=prompt,
        system=_SYSTEM,
        output_schema=_SCHEMA,
        max_tokens=_MAX_TOKENS,
        user=user,
        feature=FEATURE,
    )
    if not result.ok or not isinstance(result.data, dict):
        reason = "budget" if result.reason == "budget" else "error"
        return {**base, "reason": reason, "page_title": page["title"]}

    data = _finalize(result.data, page)
    return data


def _finalize(data: dict, page: dict) -> dict:
    confidence = data.get("confidence")
    source_url = page["url"]
    cleaned = {
        "available": True,
        "reason": "ok",
        "model_called": True,
        "source_url": source_url,
        "page_title": page["title"],
        "title": _clean(data.get("title"), _MAX_TITLE) or (page["title"] or "Requirements"),
        "summary": _clean(data.get("summary"), _MAX_DESC),
        "confidence": confidence if confidence in _CONFIDENCE else "low",
        "required_documents": _clean_docs(
            data.get("required_documents"), required=True, source_url=source_url
        ),
        "optional_documents": _clean_docs(
            data.get("optional_documents"), required=False, source_url=source_url
        ),
        "deadlines": _clean_deadlines(data.get("deadlines")),
        "eligibility_notes": _clean_notes(data.get("eligibility_notes"), "text"),
        "submission_instructions": _clean_notes(
            data.get("submission_instructions"), "text"
        ),
        "warnings": _clean_warnings(data.get("warnings")),
    }
    return cleaned


# ---- Apply (Extract → Review → APPLY) --------------------------------------


def normalize_title(value) -> str:
    """Case-insensitive, whitespace-collapsed key for duplicate detection."""
    return " ".join(str(value or "").split()).lower()


def apply_extraction(
    user,
    bundle,
    payload: dict,
    *,
    selected_required=None,
    selected_optional=None,
    selected_deadlines=None,
    create_reminders: bool = False,
) -> dict:
    """
    Apply a reviewed selection of a draft's payload to ``bundle`` (no AI call).

    Creates ``DocumentBundleRequirement`` rows for the selected documents,
    skipping any whose normalized title already exists in the pack (never deletes
    or overwrites existing requirements). For a selected, unambiguous (valid-date)
    deadline it sets the pack's ``target_date`` — per-document reminder rules
    require a linked document and are deferred. Returns
    ``{created_requirements, created_reminders, target_date_set}``.
    """
    from django.utils import timezone

    from .models import DocumentBundleRequirement as Req

    selected_required = {normalize_title(t) for t in (selected_required or [])}
    selected_optional = {normalize_title(t) for t in (selected_optional or [])}
    selected_deadlines = set(selected_deadlines or [])

    existing = {normalize_title(r.title) for r in bundle.requirements.all()}
    sort_base = bundle.requirements.count()
    created = 0

    def _add(items, *, required: bool, selection: set):
        nonlocal created, sort_base
        for item in items or []:
            if not isinstance(item, dict):
                continue
            title = " ".join(str(item.get("title") or "").split())[:255]
            norm = title.lower()
            if not norm or norm not in selection or norm in existing:
                continue
            Req.objects.create(
                owner=user,
                bundle=bundle,
                title=title,
                description=str(item.get("description") or "")[:2000],
                is_required=required,
                requirement_type=Req.RequirementType.DOCUMENT,
                status=Req.Status.MISSING,
                sort_order=sort_base,
            )
            existing.add(norm)
            created += 1
            sort_base += 1

    _add(payload.get("required_documents"), required=True, selection=selected_required)
    _add(payload.get("optional_documents"), required=False, selection=selected_optional)

    created_reminders = 0
    target_date_set = None
    if create_reminders:
        chosen_dates = [
            d["date"]
            for i, d in enumerate(payload.get("deadlines") or [])
            if i in selected_deadlines and d.get("date")  # valid ISO only (no ambiguous)
        ]
        if chosen_dates:
            earliest = min(chosen_dates)
            parsed = _valid_iso(earliest)
            if parsed:
                bundle.target_date = date.fromisoformat(parsed)
                bundle.save(update_fields=["target_date", "updated_at"])
                bundle.updated_at = timezone.now()
                created_reminders = 1  # pack deadline set from a clear deadline
                target_date_set = parsed

    # Keep the cached readiness score fresh after adding requirements.
    bundle.recalculate_readiness()

    return {
        "created_requirements": created,
        "created_reminders": created_reminders,
        "target_date_set": target_date_set,
    }
