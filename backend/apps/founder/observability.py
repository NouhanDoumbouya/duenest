"""
Founder/admin observability aggregation.

Answers the operational question: "if a beta user says something is broken, can
we see what failed, where, and whether it touched documents, email, uploads, AI,
scheduled jobs, or portal workflows?" — WITHOUT exposing any private user data.

This module only READS and aggregates the existing safe stores
(`OperationalEvent`, `AppErrorLog`, `EmailLog`, `AiUsage`,
`NotificationDeliveryRun`) plus config/health signals. It never stores anything,
never exposes secrets/bucket names/private URLs/tokens, and surfaces recipient
data only as masked/aggregate counts.
"""

from __future__ import annotations

import os

from django.conf import settings
from django.db import connection
from django.db.models import Count
from django.utils import timezone

from .models import AppErrorLog, OperationalEvent

# Categories whose freshest unresolved failures we surface as "recent issues".
_CRITICAL_SEVERITIES = (
    OperationalEvent.Severity.ERROR,
    OperationalEvent.Severity.CRITICAL,
)


def _database_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return True
    except Exception:  # noqa: BLE001 — a status probe must never raise
        return False


def _cache_ok() -> bool:
    try:
        from apps.core.cache import cache_healthy

        return bool(cache_healthy())
    except Exception:  # noqa: BLE001
        return False


def _storage_status() -> dict:
    """Which storage backend is wired — never the bucket name or credentials."""
    try:
        from django.core.files.storage import default_storage

        name = default_storage.__class__.__name__
        is_s3 = "s3" in name.lower()
        configured = True if not is_s3 else bool(os.getenv("STORAGE_ACCESS_KEY_ID"))
        return {"backend": "s3" if is_s3 else "local", "configured": configured}
    except Exception:  # noqa: BLE001
        return {"backend": "unknown", "configured": False}


def _email_status() -> dict:
    try:
        from apps.notifications.services import is_email_configured

        return {
            "provider": getattr(settings, "EMAIL_PROVIDER", "console"),
            "configured": bool(is_email_configured()),
        }
    except Exception:  # noqa: BLE001
        return {"provider": "unknown", "configured": False}


def _feature_flags_status() -> dict:
    try:
        from apps.features.models import FeatureFlag

        return {"loaded": True, "count": FeatureFlag.objects.count()}
    except Exception:  # noqa: BLE001
        return {"loaded": False, "count": 0}


def _serialize_event(event: OperationalEvent) -> dict:
    """A safe, compact view of an operational event for list/feed responses."""
    return {
        "id": event.id,
        "created_at": event.created_at.isoformat(),
        "severity": event.severity,
        "category": event.category,
        "source": event.source,
        "status": event.status,
        "message": event.message,
        "error_code": event.error_code,
        "correlation_id": event.correlation_id,
        "user_id": event.user_id,
        "organization_id": event.organization_id,
        "metadata": event.metadata,
        "resolved": event.resolved,
        "resolved_at": event.resolved_at.isoformat() if event.resolved_at else None,
    }


def build_ai_health() -> dict:
    """Aggregate AiUsage (metering only — never prompts/content) for founders."""
    try:
        from apps.ai.models import AiUsage

        since = timezone.now() - timezone.timedelta(days=1)
        rows = AiUsage.objects.filter(created_at__gte=since)
        by_status = {
            r["status"]: r["n"] for r in rows.values("status").annotate(n=Count("id"))
        }
        recent_failures = [
            {
                "feature": r.feature,
                "provider": r.provider,
                "model": r.model,
                "status": r.status,
                "reason": r.reason,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows.exclude(status="success").order_by("-created_at")[:10]
        ]
        return {
            "configured": bool(getattr(settings, "AI_CONFIGURED", False)),
            "embeddings_configured": bool(
                getattr(settings, "EMBEDDINGS_CONFIGURED", False)
            ),
            "succeeded_24h": by_status.get("success", 0),
            "errored_24h": by_status.get("error", 0),
            "blocked_24h": by_status.get("blocked", 0),
            "recent_failures": recent_failures,
        }
    except Exception:  # noqa: BLE001
        return {
            "configured": bool(getattr(settings, "AI_CONFIGURED", False)),
            "embeddings_configured": bool(
                getattr(settings, "EMBEDDINGS_CONFIGURED", False)
            ),
            "succeeded_24h": 0,
            "errored_24h": 0,
            "blocked_24h": 0,
            "recent_failures": [],
        }


def _last_notification_run() -> dict | None:
    try:
        from apps.notifications.models import NotificationDeliveryRun

        run = NotificationDeliveryRun.objects.order_by("-created_at").first()
        if run is None:
            return None
        return {
            "job_name": "process_due_notifications",
            "status": run.status,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "finished_at": run.finished_at.isoformat() if run.finished_at else None,
            "emails_sent": run.emails_sent,
            "emails_failed": run.emails_failed,
            "error": run.error,
        }
    except Exception:  # noqa: BLE001
        return None


def _scheduled_job_runs(limit: int = 10) -> list[dict]:
    """Latest scheduled-job runs: the notification run + OperationalEvent jobs."""
    runs: list[dict] = []
    notif = _last_notification_run()
    if notif is not None:
        runs.append(notif)
    job_events = OperationalEvent.objects.filter(
        category=OperationalEvent.Category.SCHEDULED_JOB
    ).order_by("-created_at")[:limit]
    for event in job_events:
        runs.append(
            {
                "job_name": event.source,
                "status": event.status,
                "started_at": None,
                "finished_at": event.created_at.isoformat(),
                "emails_sent": event.metadata.get("emails_sent")
                if isinstance(event.metadata, dict)
                else None,
                "emails_failed": event.metadata.get("emails_failed")
                if isinstance(event.metadata, dict)
                else None,
                "error": event.error_code,
            }
        )
    return runs[:limit]


def build_system_status() -> dict:
    """A compact, safe snapshot of platform health for the founder console."""
    now = timezone.now()
    last_24h = now - timezone.timedelta(hours=24)

    unresolved_critical = OperationalEvent.objects.filter(
        resolved=False, severity__in=_CRITICAL_SEVERITIES
    ).count()
    critical_24h = OperationalEvent.objects.filter(
        created_at__gte=last_24h, severity__in=_CRITICAL_SEVERITIES
    ).count()
    unresolved_app_errors = AppErrorLog.objects.filter(
        resolved=False, severity__in=("error", "critical")
    ).count()

    database_ok = _database_ok()
    cache_ok = _cache_ok()
    components = {
        "database": {"ok": database_ok},
        "cache": {"ok": cache_ok},
        "storage": _storage_status(),
        "email": _email_status(),
        "ai": {
            "configured": bool(getattr(settings, "AI_CONFIGURED", False)),
            "embeddings_configured": bool(
                getattr(settings, "EMBEDDINGS_CONFIGURED", False)
            ),
        },
        "feature_flags": _feature_flags_status(),
    }

    # Overall: degraded if the DB is down or there are unresolved critical issues.
    if not database_ok:
        overall = "down"
    elif unresolved_critical > 0 or not cache_ok:
        overall = "degraded"
    else:
        overall = "ok"

    from .job_status import build_jobs_summary

    jobs_summary = build_jobs_summary()

    # Degrade if scheduled jobs are failing or stale, too.
    if overall == "ok" and (
        jobs_summary["scheduled_jobs_failing"] or jobs_summary["scheduled_jobs_stale"]
    ):
        overall = "degraded"

    return {
        "generated_at": now.isoformat(),
        "overall": overall,
        "components": components,
        "scheduled_jobs": _scheduled_job_runs(),
        "jobs_summary": jobs_summary,
        "counts": {
            "unresolved_critical_events": unresolved_critical,
            "critical_events_24h": critical_24h,
            "unresolved_app_errors": unresolved_app_errors,
        },
    }


def build_observability_overview() -> dict:
    """The one payload the founder observability page renders."""
    recent_critical = [
        _serialize_event(e)
        for e in OperationalEvent.objects.filter(
            severity__in=_CRITICAL_SEVERITIES
        ).order_by("-created_at")[:15]
    ]
    public_link_issues = [
        _serialize_event(e)
        for e in OperationalEvent.objects.filter(
            category=OperationalEvent.Category.PUBLIC_LINK
        ).order_by("-created_at")[:15]
    ]
    upload_storage_issues = [
        _serialize_event(e)
        for e in OperationalEvent.objects.filter(
            category__in=(
                OperationalEvent.Category.UPLOAD,
                OperationalEvent.Category.STORAGE,
                OperationalEvent.Category.SCANNER,
            )
        )
        .exclude(status=OperationalEvent.Status.SUCCEEDED)
        .order_by("-created_at")[:15]
    ]

    overview: dict = {
        "system_status": build_system_status(),
        "recent_critical_events": recent_critical,
        "upload_storage_issues": upload_storage_issues,
        "public_link_issues": public_link_issues,
        "ai_health": build_ai_health(),
    }

    # Email health reuses the cross-cutting delivery-health builder.
    try:
        from apps.notifications.services import build_delivery_health

        overview["email_health"] = build_delivery_health()
    except Exception:  # noqa: BLE001
        overview["email_health"] = None

    return overview
