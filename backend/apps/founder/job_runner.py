"""
The reusable scheduled-job runner.

`run_scheduled_job` is the single safe entry point for executing a registered
job, whether triggered by the scheduler (via a management command) or by a
founder from the console. It provides, in one place:

* registry lookup + enabled check,
* a cache-based lock so two instances of the same job never run at once,
* a `ScheduledJobRun` row (started → succeeded/failed/skipped) with safe counts,
* a correlated `OperationalEvent` for the unified observability feed,
* idempotency by delegating to the job's existing (idempotent) service, and
* a dry-run path that previews without side effects, a lock, or a run row.

It NEVER stores sensitive data: only counts, a safe message, and an `error_code`
(exception class) — never stack traces, contents, tokens, URLs, or secrets.
"""

from __future__ import annotations

import logging
import time

from django.core.cache import cache
from django.utils import timezone
from django.utils.module_loading import import_string

from apps.core.correlation import get_correlation_id
from apps.core.scheduled_jobs import get_job
from .models import OperationalEvent, ScheduledJobRun
from .services import record_operational_event, sanitize_metadata

logger = logging.getLogger(__name__)


class UnknownScheduledJob(Exception):
    """Raised when a job name isn't in the registry."""


class JobNotRunnable(Exception):
    """Raised when a job cannot be invoked (no work callable / dry-run unsupported)."""


def lock_key_for(job_name: str) -> str:
    return f"scheduled_job_lock:{job_name}"


def _normalize(result: dict | None) -> dict:
    result = result or {}
    return {
        "attempted": int(result.get("attempted", 0) or 0),
        "succeeded": int(result.get("succeeded", 0) or 0),
        "skipped": int(result.get("skipped", 0) or 0),
        "failed": int(result.get("failed", 0) or 0),
        "message": str(result.get("message", "") or "")[:255],
        "metadata": result.get("metadata") or {},
    }


def _resolve_work(job, work):
    if work is not None:
        return work
    if job.work_path:
        return import_string(job.work_path)
    return None


def _record_skip(job, reason: str, triggered_by: str, user) -> dict:
    """Persist a SKIPPED run + safe op event (e.g. disabled / already_running)."""
    event = record_operational_event(
        category="scheduled_job",
        source=job.job_name,
        status="skipped",
        message=f"{job.display_name} skipped ({reason})",
        error_code=reason,
        user=user,
    )
    run = ScheduledJobRun.objects.create(
        job_name=job.job_name,
        display_name=job.display_name,
        category=job.category,
        status=ScheduledJobRun.Status.SKIPPED,
        started_at=timezone.now(),
        finished_at=timezone.now(),
        duration_ms=0,
        triggered_by=triggered_by,
        triggered_by_user=user if _is_user(user) else None,
        correlation_id=get_correlation_id()[:64],
        error_code=reason,
        safe_message=f"skipped ({reason})",
        operational_event=event,
    )
    return {"run_id": run.id, "status": run.status, "reason": reason}


def _is_user(user) -> bool:
    return bool(user is not None and getattr(user, "is_authenticated", False))


def run_scheduled_job(
    job_name: str,
    *,
    triggered_by: str = ScheduledJobRun.Trigger.SCHEDULER,
    user=None,
    dry_run: bool = False,
    limit: int | None = None,
    force: bool = False,
    work=None,
) -> dict:
    """Run (or dry-run) a registered scheduled job safely. See module docstring.

    `work` lets a command pass its own callable; otherwise the registry's
    `work_path` is resolved. Returns a structured result dict; re-raises on a
    fatal job exception (after recording a FAILED run) so the scheduler sees it.
    """
    job = get_job(job_name)
    if job is None:
        raise UnknownScheduledJob(job_name)

    callable_work = _resolve_work(job, work)

    # --- Dry run: preview only. No lock, no run row, no side effects. ---------
    if dry_run:
        if work is None and not job.supports_dry_run:
            raise JobNotRunnable(f"{job_name} does not support dry-run")
        if callable_work is None:
            raise JobNotRunnable(f"{job_name} has no runnable work")
        result = _normalize(callable_work(dry_run=True, limit=limit))
        return {"job_name": job_name, "dry_run": True, "status": "preview", **result}

    # --- Disabled ------------------------------------------------------------
    if not job.is_enabled and not force:
        return _record_skip(job, "disabled", triggered_by, user)

    if callable_work is None:
        raise JobNotRunnable(f"{job_name} has no runnable work")

    # --- Lock: one instance of a job at a time (atomic on Redis) -------------
    lock_key = lock_key_for(job_name)
    if not cache.add(lock_key, "1", job.lock_timeout_seconds):
        return _record_skip(job, "already_running", triggered_by, user)

    run = ScheduledJobRun.objects.create(
        job_name=job.job_name,
        display_name=job.display_name,
        category=job.category,
        status=ScheduledJobRun.Status.STARTED,
        started_at=timezone.now(),
        triggered_by=triggered_by,
        triggered_by_user=user if _is_user(user) else None,
        correlation_id=get_correlation_id()[:64],
        lock_key=lock_key,
    )
    start = time.monotonic()
    try:
        result = _normalize(callable_work(dry_run=False, limit=limit))
        duration_ms = int((time.monotonic() - start) * 1000)
        # A run that completed is SUCCEEDED; per-item failures are captured in
        # failed_count and surfaced as a "degraded" operational event.
        op_status = "degraded" if result["failed"] else "succeeded"
        event = record_operational_event(
            category="scheduled_job",
            source=job.job_name,
            status=op_status,
            message=result["message"],
            user=user,
            correlation_id=run.correlation_id,
            metadata=result["metadata"],
        )
        run.status = ScheduledJobRun.Status.SUCCEEDED
        run.finished_at = timezone.now()
        run.duration_ms = duration_ms
        run.attempted_count = result["attempted"]
        run.success_count = result["succeeded"]
        run.skipped_count = result["skipped"]
        run.failed_count = result["failed"]
        run.safe_message = result["message"]
        run.metadata = sanitize_metadata(result["metadata"])
        run.operational_event = event
        run.save()
        return {"run_id": run.id, "status": run.status, **result}
    except Exception as exc:  # record a FAILED run, then re-raise unchanged
        duration_ms = int((time.monotonic() - start) * 1000)
        error_code = type(exc).__name__[:80]
        event = record_operational_event(
            category="scheduled_job",
            source=job.job_name,
            status="failed",
            message=f"{job.display_name} failed",
            error_code=error_code,
            user=user,
            correlation_id=run.correlation_id,
        )
        run.status = ScheduledJobRun.Status.FAILED
        run.finished_at = timezone.now()
        run.duration_ms = duration_ms
        run.error_code = error_code
        run.safe_message = f"failed ({error_code})"
        run.operational_event = event
        run.save()
        raise
    finally:
        cache.delete(lock_key)


def bridge_run(
    job_name: str,
    *,
    status: str,
    triggered_by: str = ScheduledJobRun.Trigger.SCHEDULER,
    user=None,
    attempted: int = 0,
    succeeded: int = 0,
    skipped: int = 0,
    failed: int = 0,
    duration_ms: int | None = None,
    message: str = "",
    error_code: str = "",
    metadata: dict | None = None,
):
    """Best-effort `ScheduledJobRun` for a command that runs its OWN execution.

    Used by commands (e.g. notification delivery) that already manage their work
    and detailed run record but should still appear in the unified jobs
    dashboard. NEVER raises — must not break the command. Returns the run or None.
    """
    try:
        job = get_job(job_name)
        if status == ScheduledJobRun.Status.SKIPPED:
            op_status = "skipped"
        elif status == ScheduledJobRun.Status.FAILED:
            op_status = "failed"
        elif failed:
            op_status = "degraded"
        else:
            op_status = "succeeded"
        event = record_operational_event(
            category="scheduled_job",
            source=job_name,
            status=op_status,
            message=message,
            error_code=error_code,
            user=user,
            metadata=metadata or {},
        )
        now = timezone.now()
        return ScheduledJobRun.objects.create(
            job_name=job_name,
            display_name=(job.display_name if job else job_name),
            category=(job.category if job else ""),
            status=status,
            started_at=now,
            finished_at=now,
            duration_ms=duration_ms,
            attempted_count=int(attempted or 0),
            success_count=int(succeeded or 0),
            skipped_count=int(skipped or 0),
            failed_count=int(failed or 0),
            triggered_by=triggered_by,
            triggered_by_user=user if _is_user(user) else None,
            correlation_id=get_correlation_id()[:64],
            error_code=str(error_code or "")[:80],
            safe_message=str(message or "")[:255],
            metadata=sanitize_metadata(metadata or {}),
            operational_event=event,
        )
    except Exception:  # noqa: BLE001 — observability must never break a command
        logger.warning("bridge_run failed for %s", job_name, exc_info=False)
        return None


# OperationalEvent re-export kept for callers that want the enum without a second
# import (the runner already depends on it).
__all__ = [
    "run_scheduled_job",
    "bridge_run",
    "lock_key_for",
    "UnknownScheduledJob",
    "JobNotRunnable",
    "OperationalEvent",
]
