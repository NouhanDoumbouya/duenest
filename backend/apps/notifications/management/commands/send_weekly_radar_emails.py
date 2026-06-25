"""
Send the opt-in Weekly Radar email to eligible users.

Deterministic — builds each user's summary from Life Radar; NO AI call and NO AI
credits. Eligibility: email configured (global); user opted in
(``NotificationPreference.weekly_radar_email_enabled``) with email delivery on,
active, and a valid address; and no Weekly Radar already sent in the last
``--dedupe-days`` (default 6, checked via EmailLog) so a weekly beat plus an
accidental rerun won't double-send. Suppression/unsubscribe are enforced inside
``send_branded_email`` (category ``lifecycle``).

  python manage.py send_weekly_radar_emails --dry-run
  python manage.py send_weekly_radar_emails --limit 50
  python manage.py send_weekly_radar_emails --user-id 42
"""

from __future__ import annotations

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Send the opt-in deterministic Weekly Radar email to eligible users."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--limit", type=int, default=None)
        parser.add_argument(
            "--user-id", type=int, default=None,
            help="Send to a single user (still respects eligibility unless --force).",
        )
        parser.add_argument(
            "--force", action="store_true",
            help="With --user-id, bypass opt-in/dedupe eligibility (preview/test).",
        )
        parser.add_argument("--dedupe-days", type=int, default=6)

    def handle(self, *args, **options):
        if not getattr(settings, "EMAIL_CONFIGURED", False) and not options["dry_run"]:
            self.stdout.write("Email not configured — nothing to do (use --dry-run to preview).")
            return

        from apps.notifications.weekly_radar import (
            send_weekly_radar_batch,
            send_weekly_radar_email,
            should_send_weekly_radar,
        )

        dry_run = options["dry_run"]
        user_id = options["user_id"]

        if user_id is not None:
            from django.contrib.auth import get_user_model

            user = get_user_model().objects.filter(pk=user_id).first()
            if user is None:
                self.stdout.write(f"User {user_id} not found.")
                return
            force = options["force"]
            if not force and not should_send_weekly_radar(
                user, dedupe_days=options["dedupe_days"]
            ):
                self.stdout.write(f"User {user_id} not eligible (opt-in/dedupe).")
                return
            result = send_weekly_radar_email(user, dry_run=dry_run, force=force)
            self.stdout.write(f"Weekly Radar [{user.email}]: {result}")
            return

        from apps.founder.services import record_scheduled_job_run

        try:
            summary = send_weekly_radar_batch(dry_run=dry_run, limit=options["limit"])
        except Exception as exc:  # record the fatal run, then re-raise unchanged
            if not dry_run:
                record_scheduled_job_run(
                    "weekly_radar_job",
                    status="failed",
                    message="Weekly Radar batch failed",
                    error_code=type(exc).__name__,
                )
            raise
        self.stdout.write(
            f"Weekly Radar: sent={summary['sent']} skipped={summary['skipped']} "
            f"failed={summary['failed']} dry_run={summary['dry_run']}"
        )
        if not dry_run:
            record_scheduled_job_run(
                "weekly_radar_job",
                status="degraded" if summary.get("failed") else "succeeded",
                message=f"Weekly Radar sent {summary.get('sent', 0)}",
                counts={
                    "emails_sent": summary.get("sent", 0),
                    "emails_failed": summary.get("failed", 0),
                    "skipped": summary.get("skipped", 0),
                },
            )
