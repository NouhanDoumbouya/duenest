"""
AI-assisted document field extraction — KEY-GATED and review-gated.

When ``settings.AI_CONFIGURED`` is true AND the ``ai_features`` master gate plus
the ``ai_document_extraction`` flag are on for the user, Claude reads
already-extracted document text (a PDF text layer or local OCR output) and
returns the same suggested-field shape the regex parser produces — only more
accurately, especially ``expiry_date`` and ``document_type``.

Guarantees (so this is safe to call from the request path):
  * **Suggestions only.** Output is staged for owner review exactly like the
    regex result; nothing is auto-written onto a document.
  * **Graceful.** Any failure (no key, flag off, refusal, malformed output)
    returns ``None`` so the caller simply keeps its regex-derived fields.
  * **Bounded.** Only the first ``_MAX_TEXT_CHARS`` of text are sent, and only
    keys in :data:`APPLICABLE_FIELDS` are kept; dates are validated to real ISO
    dates and anything else is dropped.

Privacy: unlike the local OCR/text path, this sends the document text to
Anthropic's API. It is therefore off by default and opt-in per user (key + two
flags). See ``docs/architecture.md`` (AI foundation).
"""

from __future__ import annotations

import logging
from datetime import date

from apps.ai.client import ai_available, generate

logger = logging.getLogger(__name__)

# Keys we accept back from the model — a subset of
# services.APPLICABLE_EXTRACTION_FIELDS, so every suggestion is directly
# reviewable/appliable. Kept local to avoid a circular import with services.
APPLICABLE_FIELDS = (
    "title",
    "document_type",
    "issuer",
    "country",
    "reference_number",
    "issue_date",
    "expiry_date",
    "renewal_date",
)

_DATE_FIELDS = {"issue_date", "expiry_date", "renewal_date"}
_MAX_TEXT_CHARS = 12_000
_MAX_FIELD_CHARS = 120
_MAX_TOKENS = 1024

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string"},
        "document_type": {"type": "string"},
        "issuer": {"type": "string"},
        "country": {"type": "string"},
        "reference_number": {"type": "string"},
        "issue_date": {"type": "string"},
        "expiry_date": {"type": "string"},
        "renewal_date": {"type": "string"},
    },
}

_SYSTEM = (
    "You extract structured fields from the raw text of ONE personal/admin "
    "document (e.g. passport, visa, residence permit, driving licence, ID card, "
    "insurance policy, certificate). Only return a value when it is clearly "
    "present in the text — never guess, infer, or invent. Return all dates as "
    "ISO YYYY-MM-DD. Use 'document_type' for a short lowercase type such as "
    "passport, visa, residence_permit, driving_licence, id_card, insurance, or "
    "certificate. Omit any field you cannot read."
)


def ai_extraction_enabled(user) -> bool:
    """True when AI extraction is both key-configured and flagged on for ``user``.

    Requires the ``ai_features`` master gate AND the ``ai_document_extraction``
    flag (both default founder-only), on top of ``settings.AI_CONFIGURED``.
    """
    if not ai_available():
        return False
    try:
        from apps.features.flags import is_feature_enabled
    except Exception:  # noqa: BLE001 — flags optional; fail closed
        return False
    return is_feature_enabled("ai_features", user) and is_feature_enabled(
        "ai_document_extraction", user
    )


def suggest_fields(raw_text: str, *, user) -> dict | None:
    """
    Return Claude-suggested document fields, or ``None`` to fall back to regex.

    Never raises. The returned dict (when not ``None``) contains only keys in
    :data:`APPLICABLE_FIELDS`, with validated ISO dates and trimmed strings.
    """
    if not raw_text or not raw_text.strip():
        return None
    if not ai_extraction_enabled(user):
        return None

    prompt = (
        "Extract the document's fields from this text. Return only fields that "
        "appear verbatim.\n\n--- DOCUMENT TEXT ---\n"
        + raw_text[:_MAX_TEXT_CHARS]
    )
    result = generate(
        prompt=prompt,
        system=_SYSTEM,
        output_schema=_SCHEMA,
        max_tokens=_MAX_TOKENS,
    )
    if not result.ok or not isinstance(result.data, dict):
        return None

    return _clean(result.data) or None


def _clean(data: dict) -> dict:
    """Keep only known keys; validate dates; trim/cap strings; drop blanks."""
    cleaned: dict = {}
    for key in APPLICABLE_FIELDS:
        value = data.get(key)
        if not isinstance(value, str):
            continue
        value = value.strip()
        if not value:
            continue
        if key in _DATE_FIELDS:
            iso = _valid_iso_date(value)
            if iso:
                cleaned[key] = iso
            continue
        cleaned[key] = value[:_MAX_FIELD_CHARS]
    return cleaned


def _valid_iso_date(value: str) -> str | None:
    try:
        return date.fromisoformat(value.strip()).isoformat()
    except ValueError:
        return None
