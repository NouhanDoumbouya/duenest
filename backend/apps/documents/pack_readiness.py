"""
Application Pack Readiness V1 — deterministic, structured pack readiness.

Turns a ``DocumentBundle`` + its ``DocumentBundleRequirement`` rows into a
structured readiness payload: a 0–100 score, per-requirement status (satisfied /
missing / expired / expiring_soon / needs_review), expiry warnings on attached
documents, share/export readiness, and deterministic next actions.

Design rules (V1):
  * **Deterministic & offline.** Built purely from owner-scoped DB rows + the
    existing deterministic helpers (``bundle_readiness``, ``get_document_health``,
    ``reminder_date_for_rule``). It makes **no AI/Anthropic call**, consumes **no
    AI credits**, and never touches R2 or exposes private file URLs.
  * **Never invents requirements.** Missing documents come only from real
    ``DocumentBundleRequirement`` rows — there is no fuzzy/AI matching here.
  * **Consistent with Life Radar.** The base counts/score come from the same
    ``bundle_readiness()`` used by Life Radar, so nothing drifts. The headline
    ``score`` adds explainable penalties on top; ``base_score`` is preserved.

AI-enhanced requirement extraction is the next branch
(``ai/requirement-link-to-checklist``); the AI share-readiness / pack-copilot
endpoints are a separate, plan-gated surface and are untouched here.
"""

from __future__ import annotations

from datetime import date

from django.utils import timezone

from .services import bundle_readiness, get_document_health

# Expiry windows (days) for attached-document warnings.
EXPIRING_SOON_DAYS = 30
EXPIRING_LATER_DAYS = 90

# Score penalties (per item, each capped) applied on top of the base ratio.
_PENALTY_EXPIRED = 20
_PENALTY_EXPIRING_SOON = 10
_PENALTY_MISSING_FILE = 15
_PENALTY_NEEDS_REVIEW = 5
_PENALTY_CAPS = {
    "expired": 60,
    "expiring_soon": 30,
    "missing_file": 45,
    "needs_review": 15,
}

# No-checklist neutral score (requirements not set up yet).
_NO_CHECKLIST_SCORE = 50

_LABELS = ((90, "Ready"), (70, "Mostly ready"), (40, "Needs attention"), (0, "At risk"))


def readiness_label(score: int) -> str:
    for threshold, label in _LABELS:
        if score >= threshold:
            return label
    return "At risk"


def _requirement_status(req, *, today: date) -> tuple[str, dict | None]:
    """
    Deterministic per-requirement status + optional health context.

    Returns ``(status, health_ctx)`` where status is one of
    ``satisfied | missing | expired | expiring_soon | needs_review`` and
    health_ctx carries days/expiry for an attached document (or None).
    """
    if req.status == req.Status.SKIPPED:
        return "skipped", None
    if not req.is_satisfied:
        return "missing", None

    # Satisfied: inspect the linked document's health when present.
    doc = req.linked_document
    if doc is None:
        # Satisfied via a specific file (or marked completed) with no document to
        # health-check — accept it as satisfied; a file-only link can't expire.
        if req.linked_file_id:
            return "satisfied", None
        # COMPLETED with neither doc nor file is ambiguous → review, don't pretend.
        return ("satisfied", None) if req.status == req.Status.COMPLETED else (
            "needs_review",
            None,
        )

    health = get_document_health(doc, today=today)
    ctx = {
        "document_id": doc.id,
        "document_title": doc.title,
        "expiry_date": doc.expiry_date.isoformat() if doc.expiry_date else None,
        "days_until_expiry": health.days_until_expiry,
    }
    if health.is_expired:
        return "expired", ctx
    if health.is_expiring_soon and (health.days_until_expiry or 0) <= EXPIRING_LATER_DAYS:
        return "expiring_soon", ctx
    if health.missing_file:
        return "needs_review", ctx
    return "satisfied", ctx


def match_required_documents(bundle, *, today: date | None = None) -> list[dict]:
    """Per-requirement status breakdown (deterministic; never fuzzy/AI)."""
    today = today or timezone.localdate()
    out: list[dict] = []
    for req in bundle.requirements.all():
        status, ctx = _requirement_status(req, today=today)
        if status == "skipped":
            continue
        entry = {
            "requirement_id": req.id,
            "title": req.title,
            "description": req.description or "",
            "requirement_type": req.requirement_type,
            "is_required": req.is_required,
            "expected_document_type": req.expected_document_type or None,
            "status": status,
            "document_id": ctx["document_id"] if ctx else None,
            "document_title": ctx["document_title"] if ctx else None,
            "expiry_date": ctx["expiry_date"] if ctx else None,
            "days_until_expiry": ctx["days_until_expiry"] if ctx else None,
        }
        out.append(entry)
    return out


def get_pack_missing_requirements(requirements: list[dict]) -> list[dict]:
    """Required requirements that are not yet satisfied (missing)."""
    return [
        r for r in requirements if r["is_required"] and r["status"] == "missing"
    ]


def get_pack_expiry_warnings(requirements: list[dict]) -> list[dict]:
    """Structured warnings for attached documents (expired / expiring / review)."""
    warnings: list[dict] = []
    for r in requirements:
        days = r.get("days_until_expiry")
        if r["status"] == "expired":
            warnings.append(
                {
                    "type": "expired",
                    "severity": "critical",
                    "message": f"“{r['document_title']}” has expired.",
                    "document_id": r["document_id"],
                    "requirement_id": r["requirement_id"],
                    "action": {
                        "type": "replace_expired_document",
                        "label": "Replace expired document",
                    },
                }
            )
        elif r["status"] == "expiring_soon":
            human = _humanize_days(days)
            warnings.append(
                {
                    "type": "expiring_soon",
                    "severity": "warning",
                    "message": f"“{r['document_title']}” expires {human}.",
                    "document_id": r["document_id"],
                    "requirement_id": r["requirement_id"],
                    "action": {
                        "type": "create_reminder",
                        "label": "Create renewal reminder",
                    },
                }
            )
        elif r["status"] == "needs_review":
            warnings.append(
                {
                    "type": "needs_review",
                    "severity": "warning",
                    "message": (
                        f"“{r['title']}” is attached but needs review "
                        "(no file or unclear match)."
                    ),
                    "document_id": r.get("document_id"),
                    "requirement_id": r["requirement_id"],
                    "action": {"type": "review_requirement", "label": "Review requirement"},
                }
            )
    return warnings


def _humanize_days(days) -> str:
    if days is None:
        return "soon"
    if days <= 0:
        return "today"
    if days == 1:
        return "tomorrow"
    if days < 30:
        return f"in {days} days"
    months = round(days / 30)
    return f"in {months} month{'' if months == 1 else 's'}"


def _compute_score(core, requirements: list[dict]) -> tuple[int, int]:
    """Return ``(adjusted_score, base_score)``. Adjusted adds capped penalties."""
    base = core.score
    if core.required_total == 0 and core.optional_total == 0:
        return _NO_CHECKLIST_SCORE, base
    if core.required_total == 0:
        # Optional-only pack: use the base optional ratio, no penalties.
        return base, base

    required = [r for r in requirements if r["is_required"]]
    counts = {"expired": 0, "expiring_soon": 0, "missing_file": 0, "needs_review": 0}
    for r in required:
        if r["status"] == "expired":
            counts["expired"] += 1
        elif r["status"] == "expiring_soon":
            counts["expiring_soon"] += 1
        elif r["status"] == "needs_review":
            counts["needs_review"] += 1
    penalty = (
        min(counts["expired"] * _PENALTY_EXPIRED, _PENALTY_CAPS["expired"])
        + min(counts["expiring_soon"] * _PENALTY_EXPIRING_SOON, _PENALTY_CAPS["expiring_soon"])
        + min(counts["needs_review"] * _PENALTY_NEEDS_REVIEW, _PENALTY_CAPS["needs_review"])
    )
    return max(0, min(100, base - penalty)), base


def get_pack_next_actions(
    bundle, *, requirements, missing, warnings, score, is_ready_to_share, has_checklist
) -> list[dict]:
    """Deterministic, prioritized next steps for the pack."""
    actions: list[dict] = []

    if not has_checklist:
        actions.append(
            {
                "type": "review_requirement",
                "label": "Add required documents",
                "description": "Turn this pack into a readiness checklist to measure progress.",
                "priority": "high",
                "bundle_id": bundle.id,
            }
        )
        return actions

    if missing:
        first = missing[0]
        actions.append(
            {
                "type": "upload_missing_document",
                "label": f"Add “{first['title']}”",
                "description": "A required item for this pack is still missing.",
                "priority": "high",
                "bundle_id": bundle.id,
                "requirement_id": first["requirement_id"],
            }
        )

    expired = [w for w in warnings if w["type"] == "expired"]
    if expired:
        actions.append(
            {
                "type": "replace_expired_document",
                "label": "Replace expired document",
                "description": expired[0]["message"],
                "priority": "high",
                "bundle_id": bundle.id,
                "document_id": expired[0]["document_id"],
            }
        )

    expiring = [w for w in warnings if w["type"] == "expiring_soon"]
    if expiring:
        actions.append(
            {
                "type": "create_reminder",
                "label": "Create renewal reminder",
                "description": expiring[0]["message"],
                "priority": "medium",
                "bundle_id": bundle.id,
                "document_id": expiring[0]["document_id"],
            }
        )

    if is_ready_to_share:
        actions.append(
            {
                "type": "share_pack",
                "label": "Review and share pack",
                "description": "All required documents are ready.",
                "priority": "medium",
                "bundle_id": bundle.id,
            }
        )

    return actions


def build_pack_readiness(bundle, user=None, *, today: date | None = None) -> dict:
    """
    Full deterministic readiness payload for one bundle (never raises).

    Includes the base ``bundle_readiness`` fields (so the existing readiness
    endpoint contract is preserved) plus the rich V1 fields: label, summary,
    per-requirement breakdown, warnings, next actions, and share readiness.
    """
    today = today or timezone.localdate()
    core = bundle_readiness(bundle)

    requirements = match_required_documents(bundle, today=today)
    required_documents = [r for r in requirements if r["is_required"]]
    satisfied_requirements = [
        r for r in requirements if r["status"] in {"satisfied", "expiring_soon", "expired"}
        and r["is_required"]
    ]
    missing_requirements = get_pack_missing_requirements(requirements)
    attached_documents = [
        r for r in requirements if r["document_id"] is not None
    ]
    warnings = get_pack_expiry_warnings(requirements)

    expired_count = sum(1 for r in required_documents if r["status"] == "expired")
    expiring_soon_count = sum(
        1 for r in required_documents if r["status"] == "expiring_soon"
    )
    has_checklist = core.total_requirements > 0

    score, base_score = _compute_score(core, requirements)
    label = "No checklist" if not has_checklist else readiness_label(score)

    critical_warnings = [w for w in warnings if w["severity"] == "critical"]
    is_ready_to_share = bool(
        has_checklist
        and score >= 90
        and core.required_missing == 0
        and expired_count == 0
        and not critical_warnings
    )

    next_actions = get_pack_next_actions(
        bundle,
        requirements=requirements,
        missing=missing_requirements,
        warnings=warnings,
        score=score,
        is_ready_to_share=is_ready_to_share,
        has_checklist=has_checklist,
    )

    return {
        # --- Rich V1 headline ---
        "pack_id": bundle.id,
        "name": bundle.title,
        "score": score,
        "base_score": base_score,
        "label": label,
        "has_checklist": has_checklist,
        "is_ready_to_share": is_ready_to_share,
        "target_date": bundle.target_date.isoformat() if bundle.target_date else None,
        "status": bundle.status,
        "summary": {
            "required_count": core.required_total,
            "satisfied_count": core.required_satisfied,
            "missing_count": core.required_missing,
            "warning_count": len(warnings),
            "expired_count": expired_count,
            "expiring_soon_count": expiring_soon_count,
        },
        "required_documents": required_documents,
        "satisfied_requirements": satisfied_requirements,
        "missing_requirements": missing_requirements,
        "attached_documents": attached_documents,
        "warnings": warnings,
        "next_actions": next_actions,
        # --- Preserved base fields (existing readiness endpoint contract) ---
        "is_ready": core.is_ready,
        "total_requirements": core.total_requirements,
        "required_total": core.required_total,
        "required_satisfied": core.required_satisfied,
        "required_missing": core.required_missing,
        "optional_total": core.optional_total,
        "optional_satisfied": core.optional_satisfied,
        "missing_required_titles": core.missing_required_titles,
    }


def build_pack_readiness_summary(user, *, today: date | None = None) -> dict:
    """
    Compact readiness snapshot across the user's active packs (owner-scoped).

    Excludes completed/archived bundles. Returns per-pack headline rows plus
    overall counts for the packs list / dashboard. Deterministic; no AI.
    """
    from .models import DocumentBundle

    today = today or timezone.localdate()
    bundles = (
        DocumentBundle.objects.filter(owner=user)
        .exclude(
            status__in=[DocumentBundle.Status.COMPLETED, DocumentBundle.Status.ARCHIVED]
        )
        .prefetch_related("requirements__linked_document")
        .order_by("target_date", "id")
    )

    packs: list[dict] = []
    ready = 0
    needs_attention = 0
    total_missing = 0
    for bundle in bundles:
        r = build_pack_readiness(bundle, user, today=today)
        if r["is_ready_to_share"]:
            ready += 1
        else:
            needs_attention += 1
        total_missing += r["summary"]["missing_count"]
        packs.append(
            {
                "pack_id": r["pack_id"],
                "name": r["name"],
                "score": r["score"],
                "label": r["label"],
                "is_ready_to_share": r["is_ready_to_share"],
                "summary": r["summary"],
                "target_date": r["target_date"],
                "status": r["status"],
            }
        )

    return {
        "total_packs": len(packs),
        "ready_packs": ready,
        "needs_attention_packs": needs_attention,
        "total_missing_required": total_missing,
        "packs": packs,
    }
