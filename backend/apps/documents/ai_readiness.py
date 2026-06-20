"""
AI share-readiness — Claude reviews an application pack against its purpose and
flags likely-rejection issues before the user shares it.

Mirrors ``ai_extract.py``: key-gated + flag-gated, structured JSON output through
the single ``apps.ai`` wrapper, and a ``None`` return on any failure so the caller
falls back to deterministic facts. AI is **assistive** — the report is labelled as
such and the deterministic facts (missing required items, expired documents) are
shown regardless of whether AI ran.
"""

from __future__ import annotations

import logging
from datetime import date

from apps.ai.client import ai_available, generate

from .services import bundle_readiness

logger = logging.getLogger(__name__)

_MAX_TOKENS = 1536
_MAX_DOCS = 40
_SEVERITIES = {"blocker", "warning", "suggestion"}
_OVERALL = {"ready", "issues", "blocked"}

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "overall": {"type": "string", "enum": ["ready", "issues", "blocked"]},
        "summary": {"type": "string"},
        "findings": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "severity": {
                        "type": "string",
                        "enum": ["blocker", "warning", "suggestion"],
                    },
                    "title": {"type": "string"},
                    "detail": {"type": "string"},
                    "fix": {"type": "string"},
                },
                "required": ["severity", "title"],
            },
        },
    },
    "required": ["overall", "summary", "findings"],
}

_SYSTEM = (
    "You are a meticulous reviewer of personal/admin document packs (visa, rental, "
    "job, benefits). Given a pack's purpose and the documents the user has "
    "assembled, identify what the receiving institution would most likely reject or "
    "query: missing required items, documents that are expired or expire too soon, a "
    "document that looks like the wrong type for what's needed, or a commonly "
    "required item that's absent (e.g. several recent payslips, proof of address "
    "dated within 3 months). Be specific and practical, and only raise issues you "
    "can justify from the provided data — never invent document contents. If the "
    "pack looks complete and current, say so. Severity: 'blocker' (would be "
    "rejected), 'warning' (risky), 'suggestion' (nice to improve)."
)


def share_readiness_enabled(user) -> bool:
    """True when AI readiness is key-configured AND flagged on for ``user``."""
    if not ai_available():
        return False
    try:
        from apps.features.flags import is_feature_enabled
    except Exception:  # noqa: BLE001 — flags optional; fail closed
        return False
    return is_feature_enabled("ai_features", user) and is_feature_enabled(
        "ai_share_readiness", user
    )


def _expiry_note(expiry) -> str:
    if not expiry:
        return ""
    today = date.today()
    if expiry < today:
        return f"EXPIRED ({expiry.isoformat()})"
    days = (expiry - today).days
    if days <= 180:
        return f"expires {expiry.isoformat()} (in {days} days)"
    return f"expires {expiry.isoformat()}"


def _attached_documents(bundle):
    seen = set()
    docs = []
    for req in bundle.requirements.select_related("linked_document").all():
        doc = req.linked_document
        if doc is None or doc.id in seen:
            continue
        seen.add(doc.id)
        docs.append(doc)
        if len(docs) >= _MAX_DOCS:
            break
    return docs


def _build_context(bundle, readiness) -> str:
    lines = [f"PACK PURPOSE: {bundle.title}"]
    if bundle.description:
        lines.append(f"DESCRIPTION: {bundle.description}")
    if bundle.authority_or_provider:
        lines.append(f"FOR: {bundle.authority_or_provider}")
    if bundle.country:
        lines.append(f"COUNTRY: {bundle.country}")
    if bundle.target_date:
        lines.append(f"NEEDED BY: {bundle.target_date.isoformat()}")

    lines.append("\nREQUESTED ITEMS:")
    for req in bundle.requirements.all():
        flag = "required" if req.is_required else "optional"
        state = "ATTACHED" if req.is_satisfied else "MISSING"
        expect = (
            f" [expects: {req.expected_document_type}]"
            if req.expected_document_type
            else ""
        )
        lines.append(f"- {req.title} ({flag}) — {state}{expect}")

    lines.append("\nATTACHED DOCUMENTS:")
    docs = _attached_documents(bundle)
    if not docs:
        lines.append("(none attached)")
    for doc in docs:
        note = _expiry_note(doc.expiry_date)
        note = f" — {note}" if note else ""
        lines.append(f"- {doc.title} (type: {doc.document_type or 'unknown'}){note}")

    missing = ", ".join(readiness.missing_required_titles) or "none"
    lines.append(
        f"\nFACTS: {readiness.required_satisfied}/{readiness.required_total} required "
        f"items attached. Missing required: {missing}."
    )
    return "\n".join(lines)


def assess_share_readiness(bundle, *, user) -> dict | None:
    """Claude's purpose-aware readiness report, or ``None`` to fall back."""
    if not share_readiness_enabled(user):
        return None
    readiness = bundle_readiness(bundle)
    prompt = (
        "Review this application pack and report whether it is ready to send.\n\n"
        + _build_context(bundle, readiness)
    )
    result = generate(
        prompt=prompt, system=_SYSTEM, output_schema=_SCHEMA, max_tokens=_MAX_TOKENS
    )
    if not result.ok or not isinstance(result.data, dict):
        return None
    return _clean(result.data)


def _clean(data: dict) -> dict:
    overall = data.get("overall")
    if overall not in _OVERALL:
        overall = "issues"
    findings = []
    for item in data.get("findings") or []:
        if not isinstance(item, dict):
            continue
        title = (item.get("title") or "").strip()[:200]
        if not title:
            continue
        sev = item.get("severity")
        findings.append(
            {
                "severity": sev if sev in _SEVERITIES else "suggestion",
                "title": title,
                "detail": (item.get("detail") or "").strip()[:600],
                "fix": (item.get("fix") or "").strip()[:300],
            }
        )
    return {
        "overall": overall,
        "summary": (data.get("summary") or "").strip()[:600],
        "findings": findings,
    }


def deterministic_report(bundle) -> dict:
    """Reliable, no-AI readiness: missing required items + expired documents."""
    readiness = bundle_readiness(bundle)
    findings = []
    for title in readiness.missing_required_titles:
        findings.append(
            {
                "severity": "blocker",
                "title": f"Missing required item: {title}",
                "detail": "This required item isn't attached yet.",
                "fix": "Attach a document for this item.",
            }
        )
    today = date.today()
    for doc in _attached_documents(bundle):
        if doc.expiry_date and doc.expiry_date < today:
            findings.append(
                {
                    "severity": "warning",
                    "title": f"Expired: {doc.title}",
                    "detail": f"This document expired on {doc.expiry_date.isoformat()}.",
                    "fix": "Replace it with a current version before sharing.",
                }
            )
    has_blocker = any(f["severity"] == "blocker" for f in findings)
    if readiness.is_ready and not findings:
        overall, summary = "ready", "All required items are attached."
    else:
        overall = "blocked" if has_blocker else "issues"
        summary = (
            f"{readiness.required_satisfied} of {readiness.required_total} required "
            "items attached."
        )
    return {"overall": overall, "summary": summary, "findings": findings}


def build_readiness_report(bundle, *, user) -> dict:
    """AI report when available (grounded in the facts), else the deterministic one."""
    report = assess_share_readiness(bundle, user=user)
    if report is not None:
        # Never let the model claim "ready" while a required item is missing.
        if bundle_readiness(bundle).required_missing > 0 and report["overall"] == "ready":
            report["overall"] = "issues"
        return {"ai": True, **report}
    return {"ai": False, **deterministic_report(bundle)}
