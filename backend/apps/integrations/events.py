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
