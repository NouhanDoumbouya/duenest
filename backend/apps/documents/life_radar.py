"""
Life Radar V1 — the signature readiness dashboard (DETERMINISTIC, NO AI).

``build_life_radar(user)`` aggregates the user's own documents, reminders,
application packs, and emergency-access status into a single readiness payload:
a 0–100 score, a compact summary, and the radar sections (urgent, expiring
documents, upcoming deadlines, incomplete packs, missing documents, emergency
access, suggested actions).

Design rules (V1):
  * **Deterministic & offline.** Computed purely from owner-scoped DB rows using
    the existing helpers (``get_document_health``, ``reminder_date_for_rule``,
    ``bundle_readiness``, ``compute_plan_usage``). It makes **no AI/Anthropic
    call**, consumes **no AI credits**, and never touches R2 — so it is fast,
    free, and always available. AI-enhanced suggestions are future work
    (``product/life-radar-ai-insights``).
  * **Owner-scoped.** Every query filters by ``owner=user``; no cross-user data
    and no private file URLs are ever returned.
  * **Stable shape.** The payload keys are identical whether or not the user has
    data, so the frontend can render without defensive checks. A brand-new
    (empty) vault returns a neutral onboarding-focused payload.
"""

from __future__ import annotations

from datetime import date, timedelta

from django.db.models import Count, Q
from django.utils import timezone

from .models import Document, DocumentBundle, DocumentReminderRule, EmergencyAccessPack
from .services import bundle_readiness, get_document_health, reminder_date_for_rule

# Windows / thresholds (days). Deterministic and explainable.
URGENT_DEADLINE_DAYS = 7
SOON_EXPIRY_DAYS = 30
# How many items to include per section list (counts in `summary` are full).
_MAX_ITEMS = 25
# Storage headroom under which we nudge an upgrade (Free only).
_STORAGE_NUDGE_RATIO = 0.85

# Readiness label bands.
_LABELS = (
    (90, "Ready"),
    (70, "Mostly ready"),
    (40, "Needs attention"),
    (0, "At risk"),
)

# Neutral score for a brand-new (no-documents) vault — low enough to invite
# onboarding without implying everything is handled.
_EMPTY_SCORE = 30


def readiness_label(score: int) -> str:
    for threshold, label in _LABELS:
        if score >= threshold:
            return label
    return "At risk"


def _expiry_severity(health) -> str:
    """expired / urgent (<=7d or renewal due) / soon (<=30d) / later (<=90d)."""
    if health.is_expired:
        return "expired"
    if health.is_renewal_due:
        return "urgent"
    days = health.days_until_expiry
    if days is None:
        return "later"
    if days <= URGENT_DEADLINE_DAYS:
        return "urgent"
    if days <= SOON_EXPIRY_DAYS:
        return "soon"
    return "later"


def _deadline_severity(days_remaining: int) -> str:
    if days_remaining < 0:
        return "overdue"
    if days_remaining <= URGENT_DEADLINE_DAYS:
        return "urgent"
    if days_remaining <= SOON_EXPIRY_DAYS:
        return "soon"
    return "later"


def build_life_radar(user, *, today: date | None = None) -> dict:
    """Build the deterministic Life Radar payload for ``user`` (never raises)."""
    today = today or timezone.localdate()
    now = timezone.now()

    # ---- Documents (owner-scoped, live, not snoozed) -----------------------
    documents = list(
        Document.objects.filter(owner=user, is_trashed=False)
        .exclude(status=Document.Status.ARCHIVED)
        .annotate(file_count=Count("files", filter=Q(files__is_trashed=False)))
        .order_by("expiry_date")
    )
    total_documents = len(documents)

    expiring_documents: list[dict] = []
    expired_count = 0
    expiring_soon_count = 0  # within 30 days (the summary's "expiring_soon")
    for doc in documents:
        if doc.attention_snoozed_until and doc.attention_snoozed_until > now:
            continue  # respect the user's "remind me later"
        health = get_document_health(doc, today=today)
        if not (health.is_expired or health.is_expiring_soon or health.is_renewal_due):
            continue
        severity = _expiry_severity(health)
        if health.is_expired:
            expired_count += 1
        if severity in {"expired", "urgent", "soon"}:
            expiring_soon_count += 1
        expiring_documents.append(
            {
                "document_id": doc.id,
                "title": doc.title,
                "document_type": doc.document_type or None,
                "category": doc.category.name if doc.category_id else None,
                "expiry_date": doc.expiry_date.isoformat() if doc.expiry_date else None,
                "renewal_date": (
                    doc.renewal_date.isoformat() if doc.renewal_date else None
                ),
                "days_remaining": health.days_until_expiry,
                "severity": severity,
                "computed_status": health.computed_status,
                "status_label": health.status_label,
            }
        )

    # ---- Reminders (active rules → concrete dates) -------------------------
    rules = list(
        DocumentReminderRule.objects.filter(
            owner=user, is_enabled=True, document__is_trashed=False
        ).select_related("document")
    )
    upcoming_deadlines: list[dict] = []
    overdue_reminders: list[dict] = []
    for rule in rules:
        due = reminder_date_for_rule(rule)
        if due is None:
            continue
        days_remaining = (due - today).days
        entry = {
            "reminder_id": rule.id,
            "title": f"{rule.get_trigger_type_display()} — {rule.document.title}",
            "document_id": rule.document_id,
            "document_title": rule.document.title,
            "due_date": due.isoformat(),
            "days_remaining": days_remaining,
            "severity": _deadline_severity(days_remaining),
            "trigger_type": rule.trigger_type,
        }
        if days_remaining < 0:
            overdue_reminders.append(entry)
        else:
            upcoming_deadlines.append(entry)
    upcoming_deadlines.sort(key=lambda e: e["due_date"])
    overdue_reminders.sort(key=lambda e: e["due_date"])

    # ---- Application packs (incomplete) + missing required documents -------
    bundles = list(
        DocumentBundle.objects.filter(owner=user)
        .exclude(
            status__in=[
                DocumentBundle.Status.COMPLETED,
                DocumentBundle.Status.ARCHIVED,
            ]
        )
        .prefetch_related("requirements")
        .order_by("target_date", "id")
    )
    incomplete_packs: list[dict] = []
    missing_documents: list[dict] = []
    for bundle in bundles:
        readiness = bundle_readiness(bundle)
        if readiness.is_ready:
            continue
        incomplete_packs.append(
            {
                "bundle_id": bundle.id,
                "title": bundle.title,
                "readiness_score": readiness.score,
                "required_total": readiness.required_total,
                "required_satisfied": readiness.required_satisfied,
                "missing_count": readiness.required_missing,
                "target_date": (
                    bundle.target_date.isoformat() if bundle.target_date else None
                ),
                "status": bundle.status,
            }
        )
        # Missing required documents come from REAL requirement rows (not invented).
        for req in bundle.requirements.all():
            if req.is_required and not req.is_satisfied and req.status != req.Status.SKIPPED:
                missing_documents.append(
                    {
                        "bundle_id": bundle.id,
                        "bundle_title": bundle.title,
                        "requirement_id": req.id,
                        "title": req.title,
                        "requirement_type": req.requirement_type,
                    }
                )

    # ---- Emergency access --------------------------------------------------
    emergency_access = _emergency_access(user)

    # ---- Urgent (cross-section, immediate attention) -----------------------
    urgent: list[dict] = []
    for r in overdue_reminders:
        urgent.append({"type": "overdue_reminder", **r})
    for d in expiring_documents:
        if d["severity"] in {"expired", "urgent"}:
            urgent.append({"type": "document", **d})
    for dl in upcoming_deadlines:
        if dl["severity"] == "urgent":
            urgent.append({"type": "deadline", **dl})

    # ---- Plan usage (storage nudge) ----------------------------------------
    storage = _storage_snapshot(user)

    # ---- Application Tracker (additive; deterministic, owner-scoped) --------
    applications = _application_counts(user, today=today)

    # ---- Magic Inbox (additive; deterministic, owner-scoped) ----------------
    inbox = _magic_inbox_counts(user)

    # ---- Empty-vault onboarding short-circuit ------------------------------
    is_empty = (
        total_documents == 0
        and not rules
        and not bundles
        and emergency_access["status"] == "none"
    )

    summary = {
        "expiring_soon": expiring_soon_count,
        "upcoming_deadlines": len(upcoming_deadlines),
        "overdue_reminders": len(overdue_reminders),
        "missing_documents": len(missing_documents),
        "incomplete_packs": len(incomplete_packs),
        "emergency_ready": emergency_access["configured"],
        # Application Tracker (additive keys — never removed).
        "active_applications": applications["active_applications"],
        "urgent_applications": applications["urgent_applications"],
        "ready_to_submit_applications": applications["ready_to_submit_applications"],
        "overdue_applications": applications["overdue_applications"],
        # Magic Inbox (additive keys — never removed).
        "inbox_new_count": inbox["inbox_new_count"],
        "inbox_needs_review_count": inbox["inbox_needs_review_count"],
        "inbox_failed_count": inbox["inbox_failed_count"],
    }

    if is_empty:
        score = _EMPTY_SCORE
    else:
        score = _compute_score(
            expired=expired_count,
            expiring_soon=expiring_soon_count,
            overdue_reminders=len(overdue_reminders),
            urgent_deadlines=sum(
                1 for d in upcoming_deadlines if d["severity"] == "urgent"
            ),
            incomplete_packs=len(incomplete_packs),
            missing_required=len(missing_documents),
            emergency_configured=emergency_access["configured"],
            storage=storage,
        )

    suggested_actions = _suggested_actions(
        is_empty=is_empty,
        expiring_documents=expiring_documents,
        incomplete_packs=incomplete_packs,
        missing_documents=missing_documents,
        has_packs=bool(bundles),
        emergency_access=emergency_access,
        storage=storage,
        applications=applications,
    )

    return {
        "score": score,
        "label": readiness_label(score),
        "is_empty": is_empty,
        "generated_at": now.isoformat(),
        "summary": summary,
        "sections": {
            "urgent": urgent[:_MAX_ITEMS],
            "expiring_documents": expiring_documents[:_MAX_ITEMS],
            "upcoming_deadlines": upcoming_deadlines[:_MAX_ITEMS],
            "incomplete_packs": incomplete_packs[:_MAX_ITEMS],
            "missing_documents": missing_documents[:_MAX_ITEMS],
            "emergency_access": emergency_access,
            "suggested_actions": suggested_actions[:_MAX_ITEMS],
        },
    }


def _emergency_access(user) -> dict:
    """Deterministic emergency-access readiness (configured = active pack w/ items)."""
    packs = list(
        EmergencyAccessPack.objects.filter(owner=user)
        .annotate(
            n_items=Count("items", distinct=True),
            n_contacts=Count("trusted_contacts", distinct=True),
        )
    )
    if not packs:
        return {
            "configured": False,
            "status": "none",
            "pack_count": 0,
            "active_pack_count": 0,
            "item_count": 0,
            "trusted_contact_count": 0,
        }
    active = [p for p in packs if p.status == EmergencyAccessPack.Status.ACTIVE]
    item_count = sum(p.n_items for p in active)
    contact_count = sum(p.n_contacts for p in packs)
    if active and item_count > 0:
        status = "ready"
        configured = True
    elif active:
        status = "incomplete"  # active pack but nothing selected yet
        configured = False
    else:
        status = "disabled"  # packs exist but none active
        configured = False
    return {
        "configured": configured,
        "status": status,
        "pack_count": len(packs),
        "active_pack_count": len(active),
        "item_count": item_count,
        "trusted_contact_count": contact_count,
    }


def _storage_snapshot(user) -> dict:
    """Compact storage snapshot for the nudge (reuses plan_usage; no R2 calls)."""
    from .plan_usage import compute_plan_usage

    usage = compute_plan_usage(user)
    storage = usage.get("storage", {})
    used = storage.get("used_bytes") or 0
    limit = storage.get("limit_bytes")
    ratio = (used / limit) if limit else 0.0
    return {
        "is_free": usage.get("is_free", False),
        "used_bytes": used,
        "limit_bytes": limit,
        "ratio": ratio,
        "near_limit": bool(limit) and ratio >= _STORAGE_NUDGE_RATIO,
    }


def _compute_score(
    *,
    expired: int,
    expiring_soon: int,
    overdue_reminders: int,
    urgent_deadlines: int,
    incomplete_packs: int,
    missing_required: int,
    emergency_configured: bool,
    storage: dict,
) -> int:
    """Deterministic 0–100 readiness score. Explainable, per-category capped."""
    score = 100
    score -= min(expired * 15, 45)
    score -= min(expiring_soon * 5, 25)
    score -= min(overdue_reminders * 10, 30)
    score -= min(urgent_deadlines * 3, 15)
    score -= min(incomplete_packs * 10, 30)
    score -= min(missing_required * 3, 15)
    if not emergency_configured:
        score -= 10
    if storage.get("near_limit"):
        score -= 5
    return max(0, min(100, score))


def _application_counts(user, *, today) -> dict:
    """Compact application-tracker counts for Life Radar (additive; never raises)."""
    try:
        from .application_tracker import application_counts_for_life_radar

        return application_counts_for_life_radar(user, today=today)
    except Exception:  # noqa: BLE001 — Life Radar must never break on this
        return {
            "active_applications": 0,
            "urgent_applications": 0,
            "ready_to_submit_applications": 0,
            "overdue_applications": 0,
        }


def _magic_inbox_counts(user) -> dict:
    """Compact Magic Inbox counts for Life Radar (additive; never raises).

    ``new`` = freshly captured, not analyzed; ``needs_review`` = analyzed but not
    yet applied/archived; ``failed`` = capture/analysis failure.
    """
    try:
        from django.db.models import Count

        from .models import MagicInboxItem

        rows = (
            MagicInboxItem.objects.filter(owner=user)
            .values("status")
            .annotate(n=Count("id"))
        )
        by_status = {r["status"]: r["n"] for r in rows}
        return {
            "inbox_new_count": by_status.get(MagicInboxItem.Status.NEW, 0),
            "inbox_needs_review_count": by_status.get(MagicInboxItem.Status.ANALYZED, 0),
            "inbox_failed_count": by_status.get(MagicInboxItem.Status.FAILED, 0),
        }
    except Exception:  # noqa: BLE001 — Life Radar must never break on this
        return {"inbox_new_count": 0, "inbox_needs_review_count": 0, "inbox_failed_count": 0}


def _suggested_actions(
    *,
    is_empty: bool,
    expiring_documents: list,
    incomplete_packs: list,
    missing_documents: list,
    has_packs: bool,
    emergency_access: dict,
    storage: dict,
    applications: dict | None = None,
) -> list[dict]:
    """Deterministic, prioritized next-steps. No AI."""
    if is_empty:
        return [
            {
                "key": "upload_first_document",
                "label": "Upload your first document",
                "description": "Add a passport, ID, or certificate and CertaNest starts building your Life Radar.",
                "action": "upload_document",
            },
            {
                "key": "create_first_reminder",
                "label": "Create your first reminder",
                "description": "Track an expiry or renewal so nothing slips past a deadline.",
                "action": "create_reminder",
            },
            {
                "key": "create_first_pack",
                "label": "Create an application pack",
                "description": "Group the documents you need for a visa, job, or rental application.",
                "action": "create_pack",
            },
            {
                "key": "setup_emergency_access",
                "label": "Set up emergency access",
                "description": "Prepare a private pack your trusted contacts can reach when it matters.",
                "action": "setup_emergency",
            },
        ]

    actions: list[dict] = []

    # Most urgent: expired / expiring documents -> reminder or replacement.
    top_expiring = next(
        (d for d in expiring_documents if d["severity"] in {"expired", "urgent"}),
        None,
    )
    if top_expiring:
        verb = "Replace" if top_expiring["severity"] == "expired" else "Set a reminder for"
        actions.append(
            {
                "key": f"document_{top_expiring['document_id']}",
                "label": f"{verb} “{top_expiring['title']}”",
                "description": top_expiring["status_label"],
                "action": "view_document",
                "document_id": top_expiring["document_id"],
            }
        )

    if incomplete_packs:
        pack = incomplete_packs[0]
        actions.append(
            {
                "key": f"finish_pack_{pack['bundle_id']}",
                "label": f"Finish “{pack['title']}”",
                "description": (
                    f"{pack['required_satisfied']}/{pack['required_total']} required "
                    "items ready."
                ),
                "action": "continue_pack",
                "bundle_id": pack["bundle_id"],
            }
        )

    if missing_documents:
        miss = missing_documents[0]
        actions.append(
            {
                "key": f"missing_{miss['requirement_id']}",
                "label": f"Add “{miss['title']}” to {miss['bundle_title']}",
                "description": "A required item for this pack is still missing.",
                "action": "continue_pack",
                "bundle_id": miss["bundle_id"],
            }
        )

    if not emergency_access["configured"]:
        actions.append(
            {
                "key": "setup_emergency_access",
                "label": "Set up emergency access",
                "description": "Improve your readiness — prepare access for a trusted contact.",
                "action": "setup_emergency",
            }
        )

    if not has_packs:
        actions.append(
            {
                "key": "create_pack",
                "label": "Create an application pack",
                "description": "Track required documents for an application or renewal.",
                "action": "create_pack",
            }
        )

    # Application Tracker nudges (additive).
    apps_counts = applications or {}
    ready_apps = apps_counts.get("ready_to_submit_applications", 0)
    urgent_apps = apps_counts.get("urgent_applications", 0)
    if ready_apps:
        actions.append(
            {
                "key": "submit_ready_application",
                "label": f"Submit {ready_apps} ready application{'s' if ready_apps > 1 else ''}",
                "description": "All required documents are ready — time to submit.",
                "action": "view_applications",
            }
        )
    if urgent_apps:
        actions.append(
            {
                "key": "urgent_application_deadline",
                "label": f"{urgent_apps} application deadline{'s' if urgent_apps > 1 else ''} approaching",
                "description": "Finish and submit before the deadline passes.",
                "action": "view_applications",
            }
        )

    # Plan-aware nudge (Free only, near storage limit) — never blocks Life Radar.
    if storage.get("is_free") and storage.get("near_limit"):
        actions.append(
            {
                "key": "storage_upgrade",
                "label": "You're close to your Free storage limit",
                "description": "Upgrade to Pro for 10GB of secure storage.",
                "action": "upgrade_plan",
            }
        )

    return actions
