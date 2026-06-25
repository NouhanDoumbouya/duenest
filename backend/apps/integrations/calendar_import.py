"""
Google Calendar import service (manual, read-only, review-before-save).

What this does:
* lists a connected Google account's calendars and upcoming events as safe
  metadata,
* previews which selected events would import vs. skip (already imported),
* imports selected events into CertaNest as deadlines + reminders, one record
  at a time with per-event success/failure.

What this deliberately does NOT do:
* no automatic/background sync, no scheduled import, no webhooks,
* no write-back to Google Calendar (no create/update/delete of external events),
* no AI, no calendar management,
* no storage of OAuth tokens, raw Google API bodies, event descriptions,
  attendees, or conference links anywhere (logs, audit, or DB).

Destination model (V1): a CertaNest reminder is always anchored to a Document and
takes its date from that document's expiry/renewal date — there is no free-form
reminder. So each imported event becomes a NEW, fileless "deadline" Document
(``expiry_date`` = the event's date) plus a ``DocumentReminderRule``. This is the
only faithful way to preserve the event's date, it reuses the real reminder
services (so plan limits + Life Radar behave identically), and the original
calendar event is never modified. Organization/case/application destinations are
deferred in V1.
"""

from __future__ import annotations

from datetime import date

from django.db import IntegrityError, transaction

from . import services
from .models import ImportedCalendarEvent, Provider
from .providers.base import ProviderError, ProviderNotConfigured, get_provider

# ---- Event-type + operational source names (stable for audit/filtering) ------

EVT_PREVIEWED = "google_calendar_import_previewed"
EVT_STARTED = "google_calendar_import_started"
EVT_EVENT_IMPORTED = "google_calendar_event_imported"
EVT_EVENT_SKIPPED = "google_calendar_event_import_skipped"
EVT_EVENT_FAILED = "google_calendar_event_import_failed"
EVT_COMPLETED = "google_calendar_import_completed"

OP_LIST = "google_calendar_list"
OP_PREVIEW = "google_calendar_import_preview"
OP_IMPORT = "google_calendar_import"

# ---- Destinations ------------------------------------------------------------
# In V1 only a personal deadline+reminder is fully supported. The rest are listed
# so the UI can show them as "coming soon" without pretending they work.
DEST_DEADLINE = "deadline"
_SUPPORTED_DESTINATIONS = {DEST_DEADLINE, "reminder"}  # "reminder" is an alias
_MAX_EVENTS_PER_IMPORT = 50
_MAX_LEAD_DAYS = 365


class CalendarImportError(Exception):
    """A safe, user-facing error for the calendar listing/import endpoints."""

    def __init__(self, code: str, message: str = ""):
        self.code = code
        self.message = message or code
        super().__init__(self.message)


# ---- Provider access ---------------------------------------------------------


def _google():
    return get_provider(Provider.GOOGLE)


def _access_token_or_raise(account, request=None) -> str:
    """Return a fresh access token, refreshing once if expired.

    Raises CalendarImportError with a safe code (never leaks token material).
    """
    provider = _google()
    if provider is None or not provider.is_configured():
        raise CalendarImportError("not_configured", "Google is not configured on this server.")

    if account.is_token_expired:
        result = services.refresh_account(account=account, request=request)
        if result.get("status") != "connected":
            raise CalendarImportError("reconnect_required", "Reconnect your Google account.")

    token = account.get_access_token()
    if not token:
        result = services.refresh_account(account=account, request=request)
        if result.get("status") != "connected":
            raise CalendarImportError("reconnect_required", "Reconnect your Google account.")
        token = account.get_access_token()
    if not token:
        raise CalendarImportError("reconnect_required", "Reconnect your Google account.")
    return token


def _is_google_calendar_account(account) -> None:
    if account.provider != Provider.GOOGLE:
        raise CalendarImportError("unsupported_provider", "Calendar import supports Google only.")


# ---- Listing -----------------------------------------------------------------


def list_google_calendars(user, account, *, request=None) -> list[dict]:
    _is_google_calendar_account(account)
    token = _access_token_or_raise(account, request=request)
    provider = _google()
    try:
        calendars = provider.list_calendars(access_token=token)
    except ProviderNotConfigured as exc:
        raise CalendarImportError("not_configured") from exc
    except ProviderError as exc:
        _op(OP_LIST, "failed", user=user, account=account, error_code=exc.code, request=request)
        raise CalendarImportError(exc.code, "Could not load calendars.") from exc
    return calendars


def list_google_calendar_events(
    user,
    account,
    *,
    calendar_id: str,
    time_min: str | None = None,
    time_max: str | None = None,
    query: str | None = None,
    page_token: str | None = None,
    page_size: int = 25,
    request=None,
) -> dict:
    _is_google_calendar_account(account)
    if not calendar_id:
        raise CalendarImportError("calendar_required", "Choose a calendar first.")
    token = _access_token_or_raise(account, request=request)
    provider = _google()
    try:
        result = provider.list_calendar_events(
            access_token=token,
            calendar_id=calendar_id,
            time_min=time_min,
            time_max=time_max,
            query=query,
            page_token=page_token,
            page_size=page_size,
        )
    except ProviderNotConfigured as exc:
        raise CalendarImportError("not_configured") from exc
    except ProviderError as exc:
        _op(OP_LIST, "failed", user=user, account=account, error_code=exc.code, request=request)
        raise CalendarImportError(exc.code, "Could not load events.") from exc

    events = result.get("events", [])
    _annotate_already_imported(user, calendar_id, events)
    return {"events": events, "next_page_token": result.get("next_page_token", "")}


def _annotate_already_imported(user, calendar_id: str, events: list[dict]) -> None:
    ids = [e.get("provider_event_id") for e in events if e.get("provider_event_id")]
    if not ids:
        return
    imported = set(
        ImportedCalendarEvent.objects.filter(
            owner=user,
            provider=Provider.GOOGLE,
            provider_calendar_id=calendar_id,
            provider_event_id__in=ids,
        ).values_list("provider_event_id", flat=True)
    )
    for event in events:
        event["already_imported"] = event.get("provider_event_id") in imported


# ---- Destinations ------------------------------------------------------------


def list_import_destinations(user) -> list[dict]:
    """Destination options for the picker. Only ``deadline`` is available in V1."""
    return [
        {
            "type": DEST_DEADLINE,
            "label": "Deadline & reminder",
            "available": True,
            "description": (
                "Creates a CertaNest deadline with a reminder on the event date. "
                "Your Google Calendar is never changed."
            ),
        },
        {
            "type": "document",
            "label": "Attach to an existing document",
            "available": False,
            "reason": "deferred_v1",
            "description": "Coming soon.",
        },
        {
            "type": "case",
            "label": "Organization case deadline",
            "available": False,
            "reason": "deferred_v1",
            "description": "Coming soon.",
        },
    ]


def _normalize_destination(destination: dict | None) -> dict:
    destination = destination or {}
    dtype = (destination.get("type") or DEST_DEADLINE).strip().lower()
    if dtype not in _SUPPORTED_DESTINATIONS:
        raise CalendarImportError(
            "destination_not_supported",
            "Only personal deadline import is supported in this version.",
        )
    try:
        lead = int(destination.get("reminder_lead_days") or 0)
    except (TypeError, ValueError):
        lead = 0
    lead = max(0, min(lead, _MAX_LEAD_DAYS))
    return {"type": DEST_DEADLINE, "reminder_lead_days": lead}


# ---- Validation --------------------------------------------------------------


def _event_calendar_id(event: dict) -> str:
    """Read the calendar id from either key the event payload may carry.

    The events listing returns ``calendar_id``; some callers echo back
    ``provider_calendar_id``. Accept both so a listed event imports as-is.
    """
    return (event.get("provider_calendar_id") or event.get("calendar_id") or "").strip()


def _parse_event_date(event: dict) -> date | None:
    raw = (event.get("start_date") or event.get("start") or "").strip()
    if not raw:
        return None
    try:
        return date.fromisoformat(raw[:10])
    except ValueError:
        return None


def validate_calendar_event_for_import(event: dict) -> tuple[date | None, str]:
    """Return (event_date, reason). reason is '' when the event is importable."""
    if not (event.get("provider_event_id") or "").strip():
        return None, "missing_event_id"
    event_date = _parse_event_date(event)
    if event_date is None:
        return None, "missing_date"
    return event_date, ""


# ---- Import ------------------------------------------------------------------


def preview_google_calendar_import(user, account, *, events: list[dict], destination: dict | None) -> dict:
    _is_google_calendar_account(account)
    dest = _normalize_destination(destination)
    events = list(events or [])[:_MAX_EVENTS_PER_IMPORT]

    seen_ids = _existing_import_ids(user, events)
    results, importable, skipped, invalid = [], 0, 0, 0
    for event in events:
        event_id = (event.get("provider_event_id") or "").strip()
        cal_id = _event_calendar_id(event)
        title = (event.get("title") or "(no title)")[:255]
        event_date, reason = validate_calendar_event_for_import(event)
        if reason:
            invalid += 1
            results.append(_result(event_id, title, "invalid", reason))
            continue
        if (cal_id, event_id) in seen_ids:
            skipped += 1
            results.append(_result(event_id, title, "skipped", "already_imported"))
            continue
        importable += 1
        results.append(_result(event_id, title, "importable", "", event_date=event_date))

    _audit(user, EVT_PREVIEWED, metadata={"action": "preview", "count": len(events)})
    _op(
        OP_PREVIEW,
        "succeeded",
        user=user,
        account=account,
        metadata={
            "event_count": len(events),
            "importable_count": importable,
            "skipped_count": skipped,
            "invalid_count": invalid,
            "destination_type": dest["type"],
        },
    )
    return {
        "destination": dest,
        "importable_count": importable,
        "skipped_count": skipped,
        "invalid_count": invalid,
        "results": results,
    }


def import_google_calendar_events(
    user, account, *, events: list[dict], destination: dict | None, request=None
) -> dict:
    _is_google_calendar_account(account)
    dest = _normalize_destination(destination)
    events = list(events or [])[:_MAX_EVENTS_PER_IMPORT]

    _audit(user, EVT_STARTED, metadata={"action": "import", "count": len(events)})
    _op(OP_IMPORT, "started", user=user, account=account, metadata={"event_count": len(events)})

    results, imported, skipped, failed = [], 0, 0, 0
    warnings: list[str] = []
    saw_recurring = False
    for event in events:
        result = import_single_calendar_event(
            user, account, event=event, destination=dest, request=request
        )
        results.append(result)
        if result["status"] == "imported":
            imported += 1
            if event.get("recurring"):
                saw_recurring = True
        elif result["status"] == "skipped":
            skipped += 1
        else:
            failed += 1

    if saw_recurring:
        warnings.append("Recurring events were imported as single one-off deadlines.")

    status = "completed"
    if imported and (failed or skipped):
        status = "partial"
    elif not imported and failed:
        status = "failed"

    _audit(
        user,
        EVT_COMPLETED,
        metadata={
            "action": "import",
            "count": len(events),
            "skipped_count": skipped,
            "failed_count": failed,
            "status": status,
        },
    )
    _op(
        OP_IMPORT,
        "succeeded" if status != "failed" else "failed",
        user=user,
        account=account,
        request=request,
        metadata={
            "event_count": len(events),
            "imported_count": imported,
            "skipped_count": skipped,
            "failed_count": failed,
            "destination_type": dest["type"],
        },
    )
    return {
        "status": status,
        "imported_count": imported,
        "skipped_count": skipped,
        "failed_count": failed,
        "results": results,
        "warnings": warnings,
    }


def import_single_calendar_event(user, account, *, event: dict, destination: dict, request=None) -> dict:
    """Import one event. Never raises for per-event problems — returns a result."""
    from apps.documents.plan_usage import PlanLimitExceeded

    event_id = (event.get("provider_event_id") or "").strip()
    cal_id = _event_calendar_id(event)
    title = (event.get("title") or "(no title)")[:255]

    event_date, reason = validate_calendar_event_for_import(event)
    if reason:
        _audit(user, EVT_EVENT_FAILED, metadata={"action": "import", "status": "failed"})
        return _result(event_id, title, "failed", reason)

    # Idempotency: never silently create a duplicate deadline for the same event.
    if ImportedCalendarEvent.objects.filter(
        owner=user,
        provider=Provider.GOOGLE,
        provider_calendar_id=cal_id,
        provider_event_id=event_id,
    ).exists():
        _audit(user, EVT_EVENT_SKIPPED, metadata={"action": "import", "status": "skipped"})
        return _result(event_id, title, "skipped", "already_imported")

    try:
        with transaction.atomic():
            document, reminder = _create_deadline_from_event(
                user, title=title, event_date=event_date, destination=destination
            )
            ImportedCalendarEvent.objects.create(
                owner=user,
                account=account,
                provider=Provider.GOOGLE,
                provider_calendar_id=cal_id,
                provider_event_id=event_id,
                imported_document=document,
                imported_reminder=reminder,
                sanitized_title=title,
                event_start_date=event_date,
            )
    except PlanLimitExceeded:
        _audit(user, EVT_EVENT_FAILED, metadata={"action": "import", "status": "failed"})
        return _result(event_id, title, "failed", "plan_limit_reached")
    except IntegrityError:
        # Lost a race against a concurrent import of the same event.
        _audit(user, EVT_EVENT_SKIPPED, metadata={"action": "import", "status": "skipped"})
        return _result(event_id, title, "skipped", "already_imported")

    _audit(
        user,
        EVT_EVENT_IMPORTED,
        obj=document,
        object_label=title,
        metadata={"action": "import", "status": "imported"},
    )
    result = _result(event_id, title, "imported", "")
    result["reminder_id"] = reminder.id
    result["document_id"] = document.id
    return result


def _create_deadline_from_event(user, *, title: str, event_date: date, destination: dict):
    """Create a fileless deadline Document + a reminder, respecting plan limits."""
    from apps.documents.models import Document, DocumentReminderRule
    from apps.documents.plan_usage import enforce_plan_limit
    from apps.users import plans

    enforce_plan_limit(user, plans.RESOURCE_DOCUMENTS)
    enforce_plan_limit(user, plans.RESOURCE_REMINDERS)

    document = Document(
        owner=user,
        title=title,
        expiry_date=event_date,
        status=Document.Status.ACTIVE,
        notes="Imported from Google Calendar.",
    )
    document.full_clean()
    document.save()

    lead = destination.get("reminder_lead_days", 0)
    if lead > 0:
        trigger = DocumentReminderRule.TriggerType.BEFORE_EXPIRY
    else:
        trigger = DocumentReminderRule.TriggerType.ON_EXPIRY
    reminder = DocumentReminderRule.objects.create(
        owner=user,
        document=document,
        trigger_type=trigger,
        days_before=lead,
        is_enabled=True,
    )
    return document, reminder


# ---- Small helpers -----------------------------------------------------------


def _existing_import_ids(user, events: list[dict]) -> set[tuple[str, str]]:
    pairs = {
        (_event_calendar_id(e), (e.get("provider_event_id") or "").strip())
        for e in events
        if (e.get("provider_event_id") or "").strip()
    }
    if not pairs:
        return set()
    event_ids = [pid for _, pid in pairs]
    rows = ImportedCalendarEvent.objects.filter(
        owner=user, provider=Provider.GOOGLE, provider_event_id__in=event_ids
    ).values_list("provider_calendar_id", "provider_event_id")
    return {(c, p) for c, p in rows}


def _result(event_id: str, title: str, status: str, reason: str, *, event_date: date | None = None) -> dict:
    out = {
        "provider_event_id": event_id,
        "title": title,
        "status": status,
        "reason": reason,
        "reminder_id": None,
        "document_id": None,
    }
    if event_date is not None:
        out["event_date"] = event_date.isoformat()
    return out


def _audit(user, event_type: str, *, obj=None, object_label: str = "", metadata: dict | None = None) -> None:
    """Owner-scoped audit entry using only allow-listed metadata keys."""
    try:
        from apps.documents.audit import record_audit_event
        from apps.documents.models import AuditLogEntry

        record_audit_event(
            user,
            event_type,
            AuditLogEntry.Category.DOCUMENT,
            actor_user=user,
            obj=obj,
            object_label=object_label or None,
            metadata=metadata or {},
        )
    except Exception:  # noqa: BLE001 - logging must never break the import
        pass


def _op(source: str, status: str, *, user=None, account=None, error_code: str = "", request=None, metadata: dict | None = None) -> None:
    """Founder-facing operational event with safe, sanitized metadata."""
    try:
        from apps.founder.models import OperationalEvent
        from apps.founder.services import record_operational_event

        meta = {"provider": Provider.GOOGLE}
        if metadata:
            meta.update(metadata)
        record_operational_event(
            category=OperationalEvent.Category.SECURITY,
            source=source,
            status=status,
            error_code=error_code,
            user=user,
            request=request,
            metadata=meta,
        )
    except Exception:  # noqa: BLE001 - observability must never break the import
        pass
