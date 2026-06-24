"""
Magic Inbox V1 — capture, analyze, review, apply.

One smart place to drop files, paste emails/requirement text, or paste a link.
CertaNest captures the item, builds **deterministic** suggestions (no AI), and —
when the user opts in and their plan/consent/credits allow — enhances them with
Claude *smart triage*. Nothing is ever applied automatically: the user reviews
the suggestion list and selects what to apply. Applying suggestions reuses the
existing services (Application Tracker, packs, requirements, reminders) and never
calls AI or charges credits.

Owner-scoped throughout. A file intake references an encrypted ``DocumentFile``
and is only ever served via the private file route — no raw storage URLs.

V1 does NOT integrate Gmail/Outlook; intake is in-app upload / paste only.
"""

from __future__ import annotations

import re
from datetime import date

from django.utils import timezone

from apps.ai import client as ai_client
from apps.users import plans as user_plans

from .models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentFile,
    DocumentReminderRule,
    MagicInboxItem,
    TrackedApplication,
)
from .plan_usage import enforce_plan_limit

# Feature/metering key (Pro-only AI triage; 3 credits per success).
AI_FEATURE = "magic_inbox_triage"

MAX_TEXT = 20_000
_MAX_SUGGESTIONS = 12

# Allowed suggestion types (mirrors the AI schema). Unknown types are dropped.
SUGGESTION_TYPES = {
    "save_to_vault",
    "categorize_document",
    "attach_to_pack",
    "link_to_application",
    "create_application",
    "create_pack",
    "add_requirements_to_pack",
    "create_reminder",
    "import_requirement_link",
    "generate_application_document",
    "ignore_or_archive",
}

_SOURCE_LABELS = {
    MagicInboxItem.ItemType.FILE: "uploaded file",
    MagicInboxItem.ItemType.TEXT: "pasted text",
    MagicInboxItem.ItemType.LINK: "pasted link",
}


# ---- Capture ----------------------------------------------------------------


def create_magic_inbox_item(user, payload: dict, *, linked_file=None) -> MagicInboxItem:
    """
    Create a Magic Inbox item from validated request data.

    ``payload`` carries ``item_type`` plus the type-specific field (``pasted_text``
    for text, ``source_url`` for link). A file intake passes ``linked_file`` (an
    already-stored, owner-scoped encrypted ``DocumentFile``). Raises ``ValueError``
    on an invalid/empty intake. Never calls AI.
    """
    item_type = (payload.get("item_type") or "").strip()
    if item_type not in MagicInboxItem.ItemType.values:
        raise ValueError("item_type must be one of: file, text, link.")

    title = (payload.get("title") or "").strip()[:255]
    source_url = (payload.get("source_url") or "").strip()[:2048]
    pasted_text = (payload.get("pasted_text") or "").strip()[:MAX_TEXT]

    if item_type == MagicInboxItem.ItemType.FILE:
        if linked_file is None:
            raise ValueError("A file is required for a file intake item.")
        if not title:
            title = linked_file.original_filename[:255]
    elif item_type == MagicInboxItem.ItemType.TEXT:
        if not pasted_text:
            raise ValueError("Paste some text to capture a text item.")
        if not title:
            title = _first_line(pasted_text) or "Pasted text"
    elif item_type == MagicInboxItem.ItemType.LINK:
        if not source_url:
            raise ValueError("A link (source_url) is required for a link item.")
        if not title:
            title = source_url[:120]

    return MagicInboxItem.objects.create(
        owner=user,
        item_type=item_type,
        status=MagicInboxItem.Status.NEW,
        title=title,
        source_label=_SOURCE_LABELS.get(item_type, ""),
        source_url=source_url,
        pasted_text=pasted_text,
        linked_file=linked_file,
    )


# ---- Deterministic analysis (no AI) ----------------------------------------


def build_deterministic_suggestions(item: MagicInboxItem, user) -> dict:
    """
    Build basic suggestions WITHOUT AI from filename/MIME/category/linked context
    and simple date/keyword detection in pasted text. Returns
    ``{extracted_payload, suggestions, warnings}``. This is what Free users (and
    anyone who declines AI) get; it always works.
    """
    extracted: dict = {}
    suggestions: list[dict] = []
    warnings: list[dict] = []

    if item.item_type == MagicInboxItem.ItemType.FILE and item.linked_file:
        extracted["filename"] = item.linked_file.original_filename
        extracted["content_type"] = item.linked_file.content_type
        suggestions.append(_sug(
            "save_to_vault", "Save to vault",
            "Keep this file in your private vault as a tracked document.",
            "high",
        ))
        suggestions.append(_sug(
            "attach_to_pack", "Attach to a pack",
            "Attach this file to an application pack requirement.",
            "medium",
        ))

    text = item.pasted_text or ""
    if text:
        dates = _detect_iso_dates(text)
        if dates:
            extracted["detected_dates"] = dates
            earliest = min(dates)
            suggestions.append(_sug(
                "create_reminder", "Create deadline reminder",
                "A date was detected. Save a related document to set a reminder.",
                "high", data={"date": earliest},
                source_snippet=_snippet_around(text, earliest),
            ))
        else:
            # Mention of a deadline word but no parseable date.
            if re.search(r"\b(deadline|due|closes?|expires?)\b", text, re.IGNORECASE):
                warnings.append(_warn(
                    "ambiguous_deadline",
                    "This mentions a deadline but no clear date was found.",
                ))
        required = _detect_required_documents(text)
        if required:
            extracted["required_documents"] = required
            suggestions.append(_sug(
                "create_pack", "Create application pack",
                "Create a pack to collect the required documents.",
                "high",
            ))
            suggestions.append(_sug(
                "add_requirements_to_pack", "Add required documents to a pack",
                "Add the detected required documents as pack requirements.",
                "medium",
                data={"requirements": [{"title": t, "required": True} for t in required]},
            ))
        suggestions.append(_sug(
            "create_application", "Create application",
            "Track this as an application with its own deadline and status.",
            "medium",
        ))

    if item.item_type == MagicInboxItem.ItemType.LINK:
        suggestions.append(_sug(
            "import_requirement_link", "Import this link into a pack",
            "Use the requirement-link importer to extract a checklist into a pack.",
            "high", data={"source_url": item.source_url},
        ))

    if not suggestions:
        suggestions.append(_sug(
            "ignore_or_archive", "Archive",
            "Nothing actionable was detected. You can archive this item.",
            "low",
        ))

    return {
        "extracted_payload": extracted,
        "suggestions": suggestions[:_MAX_SUGGESTIONS],
        "warnings": warnings,
    }


# ---- AI smart triage --------------------------------------------------------

_AI_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string"},
        "detected_type": {"type": "string"},
        "summary": {"type": "string"},
        "confidence": {"type": "string", "enum": ["low", "medium", "high"]},
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "type": {"type": "string"},
                    "label": {"type": "string"},
                    "description": {"type": "string"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high"]},
                    "data": {"type": "object", "additionalProperties": True},
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

_AI_SYSTEM = (
    "You triage a single item a user dropped into their CertaNest inbox: an "
    "uploaded file's extracted text, a pasted email/message, a pasted requirement, "
    "or a link. Decide WHAT it is, whether it contains a deadline, and which "
    "review-before-apply actions to suggest.\n"
    "NEVER invent documents, deadlines, organizations, or facts. Use ONLY the "
    "supplied text. If a deadline is implied but no clear date is present, add a "
    "warning instead of guessing a date. Dates must be ISO (YYYY-MM-DD) and only "
    "when unambiguous.\n"
    "Choose suggestion types ONLY from: save_to_vault, categorize_document, "
    "attach_to_pack, link_to_application, create_application, create_pack, "
    "add_requirements_to_pack, create_reminder, import_requirement_link, "
    "generate_application_document, ignore_or_archive. Include a short "
    "source_snippet quoting the supporting text when possible. Do not create "
    "anything — the user reviews and applies. Return the requested JSON only."
)


def run_magic_inbox_ai_triage(item: MagicInboxItem, user, *, context: dict | None = None) -> dict:
    """
    Run Claude smart triage over the item's text/extracted context.

    Returns a ``{available, reason, model_called, ...}`` dict (the shared AI
    contract). ``reason == "ok"`` with ``model_called == True`` ONLY on a genuine
    model success — the signal the caller uses to charge a credit. Never raises;
    the budget guard runs inside ``ai_client.generate``.
    """
    source_text = _ai_source_text(item)
    if not source_text:
        return {"available": False, "reason": "error", "model_called": False,
                "message": "There is nothing to analyze for this item."}

    prompt = _ai_prompt(item, source_text, context or {})
    result = ai_client.generate(
        prompt=prompt,
        system=_AI_SYSTEM,
        output_schema=_AI_SCHEMA,
        user=user,
        feature=AI_FEATURE,
    )
    if not result.ok:
        # not_configured / budget / refusal / error — never charged.
        return {"available": False, "reason": result.reason or "error",
                "model_called": False, "message": _AI_REASON_MESSAGES.get(
                    result.reason, "Smart analysis could not run.")}

    data = result.data if isinstance(result.data, dict) else {}
    return {
        "available": True,
        "reason": "ok",
        "model_called": True,
        "model": result.model,
        "title": str(data.get("title") or item.title)[:255],
        "detected_type": str(data.get("detected_type") or "")[:80],
        "summary": str(data.get("summary") or "")[:1000],
        "confidence": data.get("confidence") or "medium",
        "suggestions": _clean_suggestions(data.get("suggestions")),
        "warnings": _clean_warnings(data.get("warnings")),
    }


_AI_REASON_MESSAGES = {
    "not_configured": "AI isn't configured yet.",
    "budget": "AI is paused for now to protect usage limits. Please try again later.",
    "refusal": "Smart analysis could not complete for this item.",
    "error": "Smart analysis could not run. Please try again.",
}


# ---- Analyze orchestration --------------------------------------------------


def analyze_magic_inbox_item(item: MagicInboxItem, user, *, ai_result: dict | None = None) -> MagicInboxItem:
    """
    Persist analysis onto the item. Always merges deterministic suggestions;
    when ``ai_result`` (a successful triage dict) is supplied, its suggestions/
    warnings/summary are merged on top. The caller (view) owns AI gating + credit
    charging; this function performs no AI call itself.
    """
    deterministic = build_deterministic_suggestions(item, user)
    extracted = dict(deterministic["extracted_payload"])
    suggestions = list(deterministic["suggestions"])
    warnings = list(deterministic["warnings"])

    if ai_result and ai_result.get("reason") == "ok":
        if ai_result.get("summary"):
            extracted["summary"] = ai_result["summary"]
        if ai_result.get("detected_type"):
            extracted["detected_type"] = ai_result["detected_type"]
        if ai_result.get("confidence"):
            extracted["confidence"] = ai_result["confidence"]
        # AI suggestions first (richer), then any deterministic ones not duplicated.
        merged = list(ai_result.get("suggestions") or [])
        seen = {(s.get("type")) for s in merged}
        for s in suggestions:
            if s.get("type") not in seen:
                merged.append(s)
        suggestions = merged[:_MAX_SUGGESTIONS]
        warnings = (ai_result.get("warnings") or []) + warnings
        item.ai_model = ai_result.get("model", "")[:120]
        if ai_result.get("title"):
            item.title = ai_result["title"][:255]

    # Assign stable ids so the frontend can select suggestions to apply.
    for i, s in enumerate(suggestions, start=1):
        s.setdefault("id", f"suggestion_{i}")

    item.extracted_payload = extracted
    item.suggestions = suggestions
    item.warnings = warnings[:20]
    item.status = MagicInboxItem.Status.ANALYZED
    item.save(update_fields=[
        "extracted_payload", "suggestions", "warnings", "status",
        "ai_model", "title", "updated_at",
    ])
    return item


# ---- Apply (review-before-apply; NO AI, NO credits) -------------------------


def apply_magic_inbox_suggestions(item: MagicInboxItem, user, selected: list[dict]) -> dict:
    """
    Apply the user-selected suggestions. Reuses existing services; creates only
    owner-scoped records; enforces plan limits. NEVER calls AI or charges credits.

    Returns ``{applied: [...], skipped: [...], routes: [...]}``. ``routes`` carries
    UI hints for suggestions that must continue in another flow (e.g. requirement
    link import, document generation) rather than create a record here.
    """
    applied: list[dict] = []
    skipped: list[dict] = []
    routes: list[dict] = []

    for sel in selected or []:
        stype = (sel.get("type") or "").strip()
        data = sel.get("data") if isinstance(sel.get("data"), dict) else {}
        if stype not in SUGGESTION_TYPES:
            skipped.append({"type": stype, "reason": "unknown_type"})
            continue
        try:
            outcome = _apply_one(item, user, stype, data)
        except _SkipApply as exc:
            skipped.append({"type": stype, "reason": str(exc)})
            continue
        if outcome.get("route"):
            routes.append(outcome)
        else:
            applied.append(outcome)

    if applied or routes:
        item.status = MagicInboxItem.Status.APPLIED
        item.save(update_fields=["status", "updated_at"])

    return {"applied": applied, "skipped": skipped, "routes": routes}


class _SkipApply(Exception):
    """Internal: a single suggestion could not be applied (reported as skipped)."""


def _apply_one(item: MagicInboxItem, user, stype: str, data: dict) -> dict:
    if stype == "create_application":
        enforce_plan_limit(user, user_plans.RESOURCE_APPLICATIONS)
        app = TrackedApplication.objects.create(
            owner=user,
            title=(data.get("title") or item.title or "Application")[:255],
            application_type=_app_type(data.get("application_type")),
            deadline_date=_iso(data.get("deadline_date") or data.get("date")),
            source_url=item.source_url or "",
        )
        item.linked_application = app
        item.save(update_fields=["linked_application", "updated_at"])
        return {"type": stype, "application_id": app.id, "title": app.title}

    if stype == "create_pack":
        enforce_plan_limit(user, user_plans.RESOURCE_BUNDLES)
        bundle = DocumentBundle.objects.create(
            owner=user,
            title=(data.get("pack_name") or data.get("title") or item.title or "Pack")[:255],
            bundle_type=DocumentBundle.BundleType.APPLICATION,
        )
        item.linked_bundle = bundle
        item.save(update_fields=["linked_bundle", "updated_at"])
        return {"type": stype, "bundle_id": bundle.id, "title": bundle.title}

    if stype == "add_requirements_to_pack":
        bundle = _resolve_bundle(item, user, data)
        reqs = data.get("requirements") or []
        created = _add_requirements(user, bundle, reqs)
        bundle.recalculate_readiness()
        return {"type": stype, "bundle_id": bundle.id, "created_requirements": created}

    if stype == "create_reminder":
        return _apply_create_reminder(item, user, data)

    if stype == "save_to_vault":
        return _apply_save_to_vault(item, user, data)

    if stype == "attach_to_pack":
        return _apply_attach_to_pack(item, user, data)

    if stype == "link_to_application":
        app = _resolve_application(item, user, data)
        if item.linked_bundle and not app.linked_bundle:
            app.linked_bundle = item.linked_bundle
            app.save(update_fields=["linked_bundle", "updated_at"])
        item.linked_application = app
        item.save(update_fields=["linked_application", "updated_at"])
        return {"type": stype, "application_id": app.id}

    if stype == "categorize_document":
        return _apply_categorize(item, user, data)

    if stype == "import_requirement_link":
        # Route to the existing Requirement Link -> Checklist importer (which is
        # gated + credited separately). We never call it here, so no AI/credits.
        return {"type": stype, "route": "requirement_link_import",
                "source_url": item.source_url,
                "bundle_id": item.linked_bundle_id}

    if stype == "generate_application_document":
        return {"type": stype, "route": "application_document_generator",
                "application_id": item.linked_application_id,
                "bundle_id": item.linked_bundle_id}

    if stype == "ignore_or_archive":
        archive_magic_inbox_item(item, user)
        return {"type": stype, "archived": True}

    raise _SkipApply("unsupported")  # pragma: no cover


def _apply_create_reminder(item: MagicInboxItem, user, data: dict) -> dict:
    """
    Reminders attach to a Document (the only reminder target the system supports —
    ``DocumentReminderRule`` is anchored to a document's renewal/expiry date). So a
    reminder needs a linked document AND a clear ISO date; otherwise it is skipped.
    """
    iso = _iso(data.get("date") or data.get("deadline_date"))
    if iso is None:
        raise _SkipApply("no_clear_date")
    document = item.linked_document
    if document is None or document.owner_id != user.id:
        raise _SkipApply("no_document_target")
    enforce_plan_limit(user, user_plans.RESOURCE_REMINDERS)
    if not document.renewal_date:
        document.renewal_date = date.fromisoformat(iso)
        document.save(update_fields=["renewal_date", "updated_at"])
    rule = DocumentReminderRule.objects.create(
        owner=user,
        document=document,
        trigger_type=DocumentReminderRule.TriggerType.BEFORE_RENEWAL_DATE,
        days_before=int(data.get("days_before") or 14),
    )
    return {"type": "create_reminder", "reminder_id": rule.id,
            "document_id": document.id, "date": iso}


def _apply_save_to_vault(item: MagicInboxItem, user, data: dict) -> dict:
    """Promote a file intake to a tracked vault Document (reuses the inbox→document
    pattern). Enforces the documents plan limit."""
    file = item.linked_file
    if file is None or file.uploaded_by_id != user.id:
        raise _SkipApply("no_file")
    if item.linked_document_id:
        return {"type": "save_to_vault", "document_id": item.linked_document_id}
    enforce_plan_limit(user, user_plans.RESOURCE_DOCUMENTS)
    title = (data.get("title") or item.title
             or file.original_filename.rsplit(".", 1)[0])[:255]
    document = Document.objects.create(owner=user, title=title)
    file.document = document
    file.save(update_fields=["document", "updated_at"])
    item.linked_document = document
    item.save(update_fields=["linked_document", "updated_at"])
    return {"type": "save_to_vault", "document_id": document.id}


def _apply_attach_to_pack(item: MagicInboxItem, user, data: dict) -> dict:
    """Attach the item's file (or saved document) to a pack as a satisfied
    requirement. Ownership is enforced via ``_resolve_bundle``."""
    bundle = _resolve_bundle(item, user, data)
    title = (data.get("title") or item.title or "Attached document")[:255]
    req = DocumentBundleRequirement.objects.create(
        owner=user,
        bundle=bundle,
        title=title,
        requirement_type=DocumentBundleRequirement.RequirementType.FILE,
        status=DocumentBundleRequirement.Status.ATTACHED,
        linked_file=item.linked_file if (item.linked_file and item.linked_file.uploaded_by_id == user.id) else None,
        linked_document=item.linked_document if (item.linked_document and item.linked_document.owner_id == user.id) else None,
        sort_order=bundle.requirements.count(),
    )
    bundle.recalculate_readiness()
    return {"type": "attach_to_pack", "bundle_id": bundle.id, "requirement_id": req.id}


def _apply_categorize(item: MagicInboxItem, user, data: dict) -> dict:
    from .models import DocumentCategory

    document = item.linked_document
    if document is None or document.owner_id != user.id:
        raise _SkipApply("no_document_target")
    cat = None
    raw = data.get("category_id") or data.get("category")
    if raw:
        from django.db.models import Q
        try:
            cat = DocumentCategory.objects.filter(
                Q(owner__isnull=True) | Q(owner=user), pk=int(raw)
            ).first()
        except (TypeError, ValueError):
            cat = None
    if cat is None:
        raise _SkipApply("no_category")
    document.category = cat
    document.save(update_fields=["category", "updated_at"])
    return {"type": "categorize_document", "document_id": document.id, "category_id": cat.id}


def archive_magic_inbox_item(item: MagicInboxItem, user) -> MagicInboxItem:
    """Archive an item (owner-scoped). No AI, no credits."""
    if item.status != MagicInboxItem.Status.ARCHIVED:
        item.status = MagicInboxItem.Status.ARCHIVED
        item.save(update_fields=["status", "updated_at"])
    return item


# ---- Resolve helpers (ownership-enforcing) ---------------------------------


def _resolve_bundle(item: MagicInboxItem, user, data: dict) -> DocumentBundle:
    bundle_id = data.get("bundle_id") or item.linked_bundle_id
    if not bundle_id:
        raise _SkipApply("no_pack")
    bundle = DocumentBundle.objects.filter(owner=user, pk=bundle_id).first()
    if bundle is None:
        raise _SkipApply("pack_not_found")
    return bundle


def _resolve_application(item: MagicInboxItem, user, data: dict) -> TrackedApplication:
    app_id = data.get("application_id") or item.linked_application_id
    if not app_id:
        raise _SkipApply("no_application")
    app = TrackedApplication.objects.filter(owner=user, pk=app_id).first()
    if app is None:
        raise _SkipApply("application_not_found")
    return app


def _add_requirements(user, bundle: DocumentBundle, reqs: list) -> int:
    existing = {r.title.strip().lower() for r in bundle.requirements.all()}
    sort_base = bundle.requirements.count()
    created = 0
    for r in reqs or []:
        if not isinstance(r, dict):
            continue
        title = " ".join(str(r.get("title") or "").split())[:255]
        if not title or title.lower() in existing:
            continue
        DocumentBundleRequirement.objects.create(
            owner=user,
            bundle=bundle,
            title=title,
            is_required=bool(r.get("required", True)),
            requirement_type=DocumentBundleRequirement.RequirementType.DOCUMENT,
            status=DocumentBundleRequirement.Status.MISSING,
            sort_order=sort_base,
        )
        existing.add(title.lower())
        sort_base += 1
        created += 1
    return created


# ---- Small utilities --------------------------------------------------------


def _sug(type_, label, description, priority, *, data=None, source_snippet="") -> dict:
    s = {"type": type_, "label": label, "description": description, "priority": priority}
    if data:
        s["data"] = data
    if source_snippet:
        s["source_snippet"] = source_snippet
    return s


def _warn(type_, message) -> dict:
    return {"type": type_, "message": message}


def _clean_suggestions(value) -> list[dict]:
    out: list[dict] = []
    for s in (value or [])[:_MAX_SUGGESTIONS]:
        if not isinstance(s, dict):
            continue
        stype = (s.get("type") or "").strip()
        if stype not in SUGGESTION_TYPES:
            continue
        cleaned = {
            "type": stype,
            "label": str(s.get("label") or "")[:120],
            "description": str(s.get("description") or "")[:400],
            "priority": s.get("priority") if s.get("priority") in ("low", "medium", "high") else "medium",
        }
        if isinstance(s.get("data"), dict):
            cleaned["data"] = s["data"]
        if s.get("source_snippet"):
            cleaned["source_snippet"] = str(s["source_snippet"])[:280]
        out.append(cleaned)
    return out


def _clean_warnings(value) -> list[dict]:
    out: list[dict] = []
    for w in (value or [])[:20]:
        if not isinstance(w, dict):
            continue
        out.append({
            "type": str(w.get("type") or "warning")[:60],
            "message": str(w.get("message") or "")[:280],
        })
    return out


def _detect_iso_dates(text: str) -> list[str]:
    """Find and normalize date-like substrings to ISO. Reuses the document
    extractor's date pattern/normalizer (deterministic, no AI)."""
    from .services import _DATE_PATTERN, _normalize_date

    found: list[str] = []
    for match in re.findall(_DATE_PATTERN, text):
        iso = _normalize_date(match)
        if iso and iso not in found:
            found.append(iso)
    return found


_REQUIRED_HINT = re.compile(
    r"(?:required documents?|please (?:submit|provide)|you (?:must|will need to) "
    r"(?:submit|provide)|requirements?)\s*[:\-]", re.IGNORECASE
)
_DOC_KEYWORDS = [
    "passport", "transcript", "cv", "resume", "resumé", "recommendation letter",
    "reference letter", "motivation letter", "cover letter", "statement of purpose",
    "bank statement", "id card", "national id", "birth certificate", "diploma",
    "certificate", "photo", "visa", "proof of funds", "proof of address",
]


def _detect_required_documents(text: str) -> list[str]:
    """Lightweight detection of likely required documents named in the text. Only
    flags known document keywords — never invents items."""
    lower = text.lower()
    if not _REQUIRED_HINT.search(text) and "document" not in lower:
        return []
    found: list[str] = []
    for kw in _DOC_KEYWORDS:
        if kw in lower:
            label = kw.title() if kw.islower() else kw
            if label not in found:
                found.append(label)
    return found[:12]


def _snippet_around(text: str, needle: str, width: int = 120) -> str:
    # ISO date won't appear verbatim; just return a leading snippet as evidence.
    return " ".join(text.split())[:width]


def _ai_source_text(item: MagicInboxItem) -> str:
    if item.pasted_text:
        return item.pasted_text[:MAX_TEXT]
    if item.item_type == MagicInboxItem.ItemType.LINK and item.source_url:
        return f"User pasted a link: {item.source_url}"
    if item.item_type == MagicInboxItem.ItemType.FILE and item.linked_file:
        # Reuse any extracted OCR/text for this file if present.
        from .models import DocumentExtraction

        extraction = (
            DocumentExtraction.objects.filter(owner=item.owner, file=item.linked_file)
            .order_by("-id").first()
        )
        if extraction and extraction.raw_text:
            return extraction.raw_text[:MAX_TEXT]
        return f"Uploaded file named: {item.linked_file.original_filename}"
    return ""


def _ai_prompt(item: MagicInboxItem, source_text: str, context: dict) -> str:
    lines = [
        f"ITEM TYPE: {item.get_item_type_display()}",
        f"TODAY: {timezone.now().date().isoformat()}",
    ]
    if context.get("bundle_title"):
        lines.append(f"RELATED PACK: {context['bundle_title']}")
    if context.get("application_title"):
        lines.append(f"RELATED APPLICATION: {context['application_title']}")
    lines.append("\n--- ITEM CONTENT (analyze ONLY this; do not invent) ---")
    lines.append(source_text)
    return "\n".join(lines)


def _app_type(value) -> str:
    value = (value or "").strip().lower()
    return value if value in TrackedApplication.Type.values else TrackedApplication.Type.OTHER


def _iso(value) -> str | None:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10]).isoformat()
    except (ValueError, TypeError):
        return None


def _first_line(text: str) -> str:
    for line in text.splitlines():
        line = line.strip()
        if line:
            return line[:120]
    return ""
