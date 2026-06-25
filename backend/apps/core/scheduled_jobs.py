"""
Central registry of CertaNest's scheduled (cron-style) background jobs.

CertaNest runs its time-based work as plain Django management commands invoked by
an external scheduler (e.g. Railway Cron) — there is no Celery/queue. This module
is the single, declarative source of truth describing each REAL job: its cadence,
safety properties, and whether a founder may trigger it from the console.

Only jobs that actually exist are registered here — we never invent jobs. The
registry holds NO secrets and NO runtime state; run history lives in
`founder.ScheduledJobRun`.
"""

from __future__ import annotations

from dataclasses import dataclass


# --- Vocabularies (kept as plain strings so they're easy to serialize) -------

CATEGORIES = (
    "notifications",
    "email",
    "cleanup",
    "security",
    "ai",
    "portal",
    "billing",
    "integrations",
    "maintenance",
)

FREQUENCIES = ("hourly", "daily", "weekly", "monthly", "manual")

_DAY = 60 * 24


@dataclass(frozen=True)
class ScheduledJob:
    """Declarative metadata for one scheduled job. No secrets, no runtime state."""

    job_name: str
    display_name: str
    description: str
    category: str
    command_name: str
    expected_frequency: str
    expected_max_age_minutes: int | None
    # Dotted path to a uniform `work(*, dry_run, limit=None) -> dict` callable.
    # `None` means the job can only be observed (run by the scheduler), never
    # triggered from the founder console — used for jobs that call the AI provider
    # or touch billing, which must never be fired from a dashboard click.
    work_path: str | None = None
    is_enabled: bool = True
    is_manual_run_allowed: bool = False
    supports_dry_run: bool = False
    is_destructive: bool = False
    is_idempotent: bool = True
    safe_to_retry: bool = True
    lock_timeout_seconds: int = 600
    default_timeout_seconds: int = 600
    notes: str = ""


# --- The registry — register EXISTING jobs only ------------------------------

_JOBS: tuple[ScheduledJob, ...] = (
    ScheduledJob(
        job_name="notification_delivery",
        display_name="Notification delivery",
        description=(
            "Create and deliver due reminders and notifications (in-app + email)."
        ),
        category="notifications",
        command_name="process_due_notifications",
        work_path="apps.founder.job_work.run_notification_delivery",
        expected_frequency="hourly",
        expected_max_age_minutes=180,
        is_manual_run_allowed=True,
        supports_dry_run=True,
        is_idempotent=True,
        safe_to_retry=True,
        notes=(
            "Idempotent: a unique dedupe_key prevents duplicate notifications and "
            "emails, and suppression/preferences are enforced — safe to re-run."
        ),
    ),
    ScheduledJob(
        job_name="weekly_radar_email",
        display_name="Weekly Radar email",
        description=(
            "Opt-in deterministic weekly summary email built from Life Radar."
        ),
        category="email",
        command_name="send_weekly_radar_emails",
        work_path="apps.founder.job_work.run_weekly_radar",
        expected_frequency="weekly",
        expected_max_age_minutes=8 * _DAY,
        is_manual_run_allowed=True,
        supports_dry_run=True,
        is_idempotent=True,
        notes=(
            "Deterministic (no AI). Dedupes via EmailLog (6-day window) and respects "
            "opt-in + suppression, so a manual run cannot double-send."
        ),
    ),
    ScheduledJob(
        job_name="ai_briefing_digest",
        display_name="AI briefing digest",
        description="Opt-in AI weekly briefing email (calls the AI provider).",
        category="ai",
        command_name="send_ai_digests",
        # Visibility only — this job calls the AI provider, so it is NEVER
        # triggered from the dashboard (would consume AI credits).
        work_path=None,
        expected_frequency="weekly",
        expected_max_age_minutes=8 * _DAY,
        is_manual_run_allowed=False,
        supports_dry_run=False,
        notes=(
            "Calls the AI provider. Run by the scheduler only; the console never "
            "triggers it to avoid AI cost. Dedupes via EmailLog."
        ),
    ),
    ScheduledJob(
        job_name="emergency_checkin",
        display_name="Emergency check-ins",
        description="Evaluate emergency-access check-ins and send due nudges/alerts.",
        category="security",
        command_name="process_emergency_checkins",
        work_path="apps.founder.job_work.run_emergency_checkins",
        expected_frequency="daily",
        expected_max_age_minutes=int(1.5 * _DAY),
        is_manual_run_allowed=True,
        supports_dry_run=True,
        is_idempotent=True,
        notes=(
            "Feature-gated and state-guarded: re-running won't double-alert. "
            "Dry-run evaluates without sending."
        ),
    ),
    ScheduledJob(
        job_name="purge_expired_trash",
        display_name="Purge expired trash",
        description=(
            "Permanently delete trashed documents/files past the retention window."
        ),
        category="cleanup",
        command_name="purge_expired_trash",
        # Dry-run from the console is allowed (read-only count); the real,
        # destructive run only ever comes from the scheduler.
        work_path="apps.founder.job_work.run_purge_expired_trash",
        expected_frequency="daily",
        expected_max_age_minutes=int(1.5 * _DAY),
        is_manual_run_allowed=False,
        supports_dry_run=True,
        is_destructive=True,
        notes=(
            "DESTRUCTIVE permanent delete. The console offers dry-run only; the real "
            "run comes from the scheduler. Disable with TRASH_RETENTION_DAYS=0."
        ),
    ),
    ScheduledJob(
        job_name="billing_access_sync",
        display_name="Billing access sync",
        description="Local entitlement lifecycle sync (grants, grace, trials).",
        category="billing",
        command_name="sync_billing_access",
        # Visibility only — never trigger billing lifecycle emails from a click.
        work_path=None,
        expected_frequency="daily",
        expected_max_age_minutes=int(1.5 * _DAY),
        is_manual_run_allowed=False,
        supports_dry_run=False,
        notes=(
            "Local DB entitlement sync — no live Stripe calls here. Run by the "
            "scheduler only."
        ),
    ),
)

JOB_REGISTRY: dict[str, ScheduledJob] = {job.job_name: job for job in _JOBS}


def all_jobs() -> list[ScheduledJob]:
    """Every registered job, in declaration order."""
    return list(_JOBS)


def get_job(job_name: str) -> ScheduledJob | None:
    return JOB_REGISTRY.get(job_name)
