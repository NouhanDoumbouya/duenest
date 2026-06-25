"""
Safe audit + operational events for integration actions.

Hard rule: NEVER pass an access token, refresh token, authorization code, raw
OAuth state, provider API response body, or any secret into these. Only the
allow-listed fields below (provider, scope group, account id, provider email,
status, error code, result) are recorded. Both sinks additionally sanitize
metadata, so this is defense-in-depth on top of an already-narrow surface.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("duenest.integrations")


# Canonical event-type names (kept stable for filtering/audit history).
OAUTH_STARTED = "integration_oauth_started"
CONNECTED = "integration_connected"
CONNECTION_FAILED = "integration_connection_failed"
TOKEN_REFRESHED = "integration_token_refreshed"
REFRESH_FAILED = "integration_refresh_failed"
DISCONNECTED = "integration_disconnected"
REVOKE_FAILED = "integration_revoke_failed"


def _safe_meta(*, provider, scope_group="", status="", error_code="", result="") -> dict:
    meta = {"provider": provider}
    if scope_group:
        meta["scope_group"] = scope_group
    if status:
        meta["status"] = status
    if error_code:
        meta["error_code"] = error_code
    if result:
        meta["result"] = result
    return meta


def record_integration_audit(
    *, user, event_type, provider, account=None, scope_group="", status="",
    error_code="", request=None, severity=None,
):
    """Owner-scoped audit entry (the user sees their own integration history)."""
    try:
        from apps.documents.audit import record_audit_event
        from apps.documents.models import AuditLogEntry

        record_audit_event(
            user,
            event_type,
            AuditLogEntry.Category.SECURITY,
            actor_user=user,
            obj=account,
            object_type="ConnectedIntegrationAccount",
            object_id=getattr(account, "id", None),
            object_label=(getattr(account, "provider_email", "") or provider),
            metadata=_safe_meta(
                provider=provider, scope_group=scope_group,
                status=status, error_code=error_code,
            ),
            request=request,
            severity=severity or AuditLogEntry.Severity.INFO,
        )
    except Exception:  # noqa: BLE001 - logging must never break the action
        logger.warning("integration audit failed event=%s", event_type, exc_info=True)


# --- Google Drive Import V1 event types ------------------------------------
GD_IMPORT_PREVIEWED = "google_drive_import_previewed"
GD_IMPORT_STARTED = "google_drive_import_started"
GD_FILE_IMPORTED = "google_drive_file_imported"
GD_FILE_IMPORT_FAILED = "google_drive_file_import_failed"
GD_IMPORT_COMPLETED = "google_drive_import_completed"


def record_drive_import_audit(
    *, user, event_type, account=None, status="", reason="", destination_type="",
    object_label="", request=None, severity=None,
):
    """Owner-scoped audit for a Drive import action. Safe metadata only — never a
    token, download URL, raw Google response, file content, or raw file id."""
    try:
        from apps.documents.audit import record_audit_event
        from apps.documents.models import AuditLogEntry

        meta = {"provider": "google"}
        if status:
            meta["status"] = status
        if reason:
            meta["reason_category"] = reason
        if destination_type:
            meta["destination_type"] = destination_type
        record_audit_event(
            user,
            event_type,
            AuditLogEntry.Category.SECURITY,
            actor_user=user,
            obj=account,
            object_type="ConnectedIntegrationAccount",
            object_label=object_label[:255] if object_label else "google_drive",
            metadata=meta,
            request=request,
            severity=severity or AuditLogEntry.Severity.INFO,
        )
    except Exception:  # noqa: BLE001 - logging must never break the import
        logger.warning("drive import audit failed event=%s", event_type, exc_info=True)


def record_drive_import_operational(
    *, user, status, imported_count=0, failed_count=0, destination_type="",
    file_count=0, total_size=0, request=None,
):
    """Founder-facing operational event for a Drive import batch (safe counts)."""
    try:
        from apps.founder.services import record_operational_event
        from apps.founder.models import OperationalEvent

        record_operational_event(
            category=OperationalEvent.Category.SECURITY,
            source="google_drive_import",
            status=status,
            user=user,
            request=request,
            metadata={
                "provider": "google",
                "imported_count": int(imported_count),
                "failed_count": int(failed_count),
                "file_count": int(file_count),
                "destination_type": destination_type,
                "total_size": int(total_size),
            },
        )
    except Exception:  # noqa: BLE001 - logging must never break the import
        logger.warning("drive import op-event failed", exc_info=True)


# --- Gmail Import V1 event types -------------------------------------------
GM_SEARCH_PERFORMED = "gmail_import_search_performed"
GM_IMPORT_PREVIEWED = "gmail_import_previewed"
GM_IMPORT_STARTED = "gmail_import_started"
GM_ATTACHMENT_IMPORTED = "gmail_attachment_imported"
GM_ATTACHMENT_SKIPPED = "gmail_attachment_import_skipped"
GM_ATTACHMENT_FAILED = "gmail_attachment_import_failed"
GM_IMPORT_COMPLETED = "gmail_import_completed"


def record_gmail_import_audit(
    *, user, event_type, account=None, status="", reason="", destination_type="",
    object_label="", request=None, severity=None,
):
    """Owner-scoped audit for a Gmail import action. Safe metadata only — NEVER a
    token, raw Gmail response, email body/snippet/subject, attachment content,
    download URL, or raw message/attachment id."""
    try:
        from apps.documents.audit import record_audit_event
        from apps.documents.models import AuditLogEntry

        meta = {"provider": "google"}
        if status:
            meta["status"] = status
        if reason:
            meta["reason_category"] = reason
        if destination_type:
            meta["destination_type"] = destination_type
        record_audit_event(
            user,
            event_type,
            AuditLogEntry.Category.SECURITY,
            actor_user=user,
            obj=account,
            object_type="ConnectedIntegrationAccount",
            object_label=object_label[:255] if object_label else "gmail",
            metadata=meta,
            request=request,
            severity=severity or AuditLogEntry.Severity.INFO,
        )
    except Exception:  # noqa: BLE001 - logging must never break the import
        logger.warning("gmail import audit failed event=%s", event_type, exc_info=True)


def record_gmail_import_operational(
    *, user, status, imported_count=0, skipped_count=0, failed_count=0,
    destination_type="", attachment_count=0, total_size=0, request=None,
):
    """Founder-facing operational event for a Gmail import batch (safe counts)."""
    try:
        from apps.founder.services import record_operational_event
        from apps.founder.models import OperationalEvent

        record_operational_event(
            category=OperationalEvent.Category.SECURITY,
            source="gmail_import",
            status=status,
            user=user,
            request=request,
            metadata={
                "provider": "google",
                "imported_count": int(imported_count),
                "skipped_count": int(skipped_count),
                "failed_count": int(failed_count),
                "attachment_count": int(attachment_count),
                "destination_type": destination_type,
                "total_size": int(total_size),
            },
        )
    except Exception:  # noqa: BLE001 - logging must never break the import
        logger.warning("gmail import op-event failed", exc_info=True)


def record_integration_operational(
    *, source, status, user=None, organization=None, provider, scope_group="",
    error_code="", message="", request=None, severity=None,
):
    """Founder-facing operational event (connection/refresh health)."""
    try:
        from apps.founder.services import record_operational_event
        from apps.founder.models import OperationalEvent

        record_operational_event(
            category=OperationalEvent.Category.SECURITY,
            source=source,
            status=status,
            severity=severity,
            message=message[:255],
            error_code=error_code,
            user=user,
            organization=organization,
            request=request,
            metadata=_safe_meta(
                provider=provider, scope_group=scope_group, status=status
            ),
        )
    except Exception:  # noqa: BLE001 - logging must never break the action
        logger.warning("integration op-event failed source=%s", source, exc_info=True)
