"""
Celery application for CertaNest background jobs.

Lean mode (default): ``ENABLE_BACKGROUND_JOBS`` is False, so Django sets
``CELERY_TASK_ALWAYS_EAGER = True`` and every task runs inline, in-process, with
no broker or worker required. The app behaves exactly as it does today.

Scale-ready mode: set ``REDIS_URL`` and ``ENABLE_BACKGROUND_JOBS=true``; tasks
are then dispatched to the broker and consumed by ``celery worker`` processes.
Named queues let a deployment scale workloads independently (e.g. a dedicated
OCR/scanner worker) — see ``task_routes`` below and the Procfile.

Idempotency: tasks that create user-visible side effects (emails, notifications)
must be safe to retry. Reuse the existing notification ``dedupe_key`` mechanism
and guard on DB state rather than assuming exactly-once delivery.
"""

from __future__ import annotations

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.development")

app = Celery("duenest")

# All CELERY_* settings come from Django settings (see config/settings/base.py).
app.config_from_object("django.conf:settings", namespace="CELERY")

# Route tasks to dedicated queues by name prefix. A task named
# "apps.documents.tasks.run_scanner_ocr" lands on the "scanner" queue, etc.
# Unmatched tasks fall through to CELERY_TASK_DEFAULT_QUEUE ("default").
app.conf.task_routes = {
    "apps.notifications.tasks.send_email": {"queue": "email"},
    "apps.notifications.tasks.send_push": {"queue": "push"},
    "apps.notifications.tasks.deliver_notification": {"queue": "notifications"},
    "apps.notifications.tasks.process_due_notifications": {"queue": "notifications"},
    "apps.documents.tasks.run_scanner_ocr": {"queue": "scanner"},
    "apps.documents.tasks.*": {"queue": "files"},
    "apps.billing.tasks.*": {"queue": "billing"},
    "apps.founder.tasks.*": {"queue": "analytics"},
}

# Discover tasks.py in every installed app.
app.autodiscover_tasks()

# ---------------------------------------------------------------------------
# Scheduled jobs (Celery Beat). These only fire when a `beat` process is run
# (Procfile `beat:` / ENABLE_CELERY_BEAT). Every scheduled task is a thin,
# idempotent wrapper around an existing management command/service, so the same
# work can also be triggered by a platform cron if you prefer not to run beat.
# Times are UTC (CELERY_ENABLE_UTC).
# ---------------------------------------------------------------------------
from celery.schedules import crontab  # noqa: E402

app.conf.beat_schedule = {
    "process-due-notifications": {
        "task": "apps.notifications.tasks.process_due_notifications",
        # Every 15 minutes — picks up due reminders/notifications.
        "schedule": crontab(minute="*/15"),
        "options": {"queue": "notifications"},
    },
    "purge-expired-trash": {
        "task": "apps.documents.tasks.purge_expired_trash",
        # Daily at 03:10 UTC.
        "schedule": crontab(hour=3, minute=10),
        "options": {"queue": "files"},
    },
    "sync-billing-access": {
        "task": "apps.billing.tasks.sync_billing_access",
        # Hourly — expires grants/grace periods.
        "schedule": crontab(minute=5),
        "options": {"queue": "billing"},
    },
    "rollup-founder-analytics": {
        "task": "apps.founder.tasks.rollup_daily_analytics",
        # Every 10 minutes — refreshes the daily rollup for "today".
        "schedule": crontab(minute="*/10"),
        "options": {"queue": "analytics"},
    },
    "send-ai-briefing-digests": {
        "task": "apps.documents.tasks.send_ai_digests",
        # Weekly — Monday 08:00 UTC. No-ops unless AI + email are configured and
        # users have opted in (the command guards all of this).
        "schedule": crontab(day_of_week=1, hour=8, minute=0),
        "options": {"queue": "files"},
    },
}


@app.task(bind=True, name="config.celery.debug_ping")
def debug_ping(self):
    """Trivial task for verifying that a worker is consuming a queue."""
    return {"ok": True, "task_id": self.request.id}
