"""
Scheduled-job health: stale detection + the founder dashboard payloads.

Reads the registry (`core.scheduled_jobs`) and `ScheduledJobRun` history to tell a
founder which jobs exist, when each last ran, and whether it is healthy / stale /
failing / never-run / disabled. Read-only and safe: counts/status/timestamps
only — never document contents, tokens, or secrets. It never auto-runs anything.
"""

from __future__ import annotations

from django.utils import timezone

from apps.core.scheduled_jobs import ScheduledJob, all_jobs, get_job
from .models import ScheduledJobRun

# A run that actually executed (not a lock-skip) — used for "last run" + staleness.
_COMPLETED = (ScheduledJobRun.Status.SUCCEEDED, ScheduledJobRun.Status.FAILED)

HEALTH_HEALTHY = "healthy"
HEALTH_NEVER_RUN = "never_run"
HEALTH_STALE = "stale"
HEALTH_FAILING = "failing"
HEALTH_DISABLED = "disabled"


def _last_completed_run(job_name: str) -> ScheduledJobRun | None:
    return (
        ScheduledJobRun.objects.filter(job_name=job_name, status__in=_COMPLETED)
        .order_by("-created_at")
        .first()
    )


def compute_health(job: ScheduledJob, last_run: ScheduledJobRun | None) -> str:
    if not job.is_enabled:
        return HEALTH_DISABLED
    if last_run is None:
        return HEALTH_NEVER_RUN
    if last_run.status == ScheduledJobRun.Status.FAILED:
        return HEALTH_FAILING
    if job.expected_max_age_minutes and last_run.finished_at:
        age_min = (timezone.now() - last_run.finished_at).total_seconds() / 60.0
        if age_min > job.expected_max_age_minutes:
            return HEALTH_STALE
    return HEALTH_HEALTHY


def serialize_job_meta(job: ScheduledJob) -> dict:
    """Safe, static metadata for a registered job (no secrets)."""
    return {
        "job_name": job.job_name,
        "display_name": job.display_name,
        "description": job.description,
        "category": job.category,
        "command_name": job.command_name,
        "expected_frequency": job.expected_frequency,
        "expected_max_age_minutes": job.expected_max_age_minutes,
        "is_enabled": job.is_enabled,
        "is_manual_run_allowed": job.is_manual_run_allowed,
        "supports_dry_run": job.supports_dry_run,
        "is_destructive": job.is_destructive,
        "is_idempotent": job.is_idempotent,
        "safe_to_retry": job.safe_to_retry,
        "notes": job.notes,
    }


def serialize_run(run: ScheduledJobRun) -> dict:
    return {
        "id": run.id,
        "job_name": run.job_name,
        "status": run.status,
        "triggered_by": run.triggered_by,
        "triggered_by_user": run.triggered_by_user_id,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "duration_ms": run.duration_ms,
        "attempted_count": run.attempted_count,
        "success_count": run.success_count,
        "skipped_count": run.skipped_count,
        "failed_count": run.failed_count,
        "error_code": run.error_code,
        "safe_message": run.safe_message,
        "correlation_id": run.correlation_id,
        "metadata": run.metadata,
        "created_at": run.created_at.isoformat(),
    }


def build_job_overview_item(job: ScheduledJob) -> dict:
    last_run = _last_completed_run(job.job_name)
    return {
        **serialize_job_meta(job),
        "health": compute_health(job, last_run),
        "last_run": serialize_run(last_run) if last_run else None,
    }


def build_jobs_overview() -> list[dict]:
    return [build_job_overview_item(job) for job in all_jobs()]


def build_job_detail(job_name: str, *, run_limit: int = 20) -> dict | None:
    job = get_job(job_name)
    if job is None:
        return None
    last_run = _last_completed_run(job_name)
    recent = ScheduledJobRun.objects.filter(job_name=job_name).order_by("-created_at")[
        :run_limit
    ]
    return {
        **serialize_job_meta(job),
        "health": compute_health(job, last_run),
        "last_run": serialize_run(last_run) if last_run else None,
        "recent_runs": [serialize_run(r) for r in recent],
    }


def build_jobs_summary() -> dict:
    """Aggregate counts for system status + the dashboard header."""
    total = healthy = failing = stale = never_run = disabled = 0
    last_failed_job: str | None = None
    last_failed_at = None
    for job in all_jobs():
        total += 1
        last_run = _last_completed_run(job.job_name)
        health = compute_health(job, last_run)
        if health == HEALTH_HEALTHY:
            healthy += 1
        elif health == HEALTH_FAILING:
            failing += 1
            if last_run and (last_failed_at is None or last_run.created_at > last_failed_at):
                last_failed_at = last_run.created_at
                last_failed_job = job.job_name
        elif health == HEALTH_STALE:
            stale += 1
        elif health == HEALTH_NEVER_RUN:
            never_run += 1
        elif health == HEALTH_DISABLED:
            disabled += 1
    return {
        "scheduled_jobs_total": total,
        "scheduled_jobs_healthy": healthy,
        "scheduled_jobs_failing": failing,
        "scheduled_jobs_stale": stale,
        "scheduled_jobs_never_run": never_run,
        "scheduled_jobs_disabled": disabled,
        "last_failed_job": last_failed_job,
    }
