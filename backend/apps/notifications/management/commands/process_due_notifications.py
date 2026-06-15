import sys
from datetime import datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.notifications.models import NotificationDeliveryRun
from apps.notifications.services import process_due_notifications


class Command(BaseCommand):
    help = "Create and deliver due in-app/email notifications."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Evaluate due reminders without creating notifications or sending email.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=100,
            help="Maximum due notification candidates to evaluate.",
        )
        parser.add_argument(
            "--user-id",
            type=int,
            help="Restrict processing to one user id.",
        )
        parser.add_argument(
            "--type",
            dest="type_filter",
            default="",
            help="Restrict processing to one notification type value.",
        )
        parser.add_argument(
            "--now",
            default="",
            help="ISO datetime used as the processing time for tests/smoke runs.",
        )
        parser.add_argument(
            "--manual",
            action="store_true",
            help="Tag this run as manual (default is scheduled) in delivery history.",
        )

    def handle(self, *args, **options):
        now = None
        raw_now = (options.get("now") or "").strip()
        if raw_now:
            try:
                now = datetime.fromisoformat(raw_now)
            except ValueError as exc:
                raise CommandError("--now must be an ISO datetime.") from exc
            if timezone.is_naive(now):
                now = timezone.make_aware(now, timezone.get_current_timezone())

        # Kill switch: when email reminders are disabled, evaluate without
        # creating or sending anything (forced dry-run), so a paused feature
        # never delivers email.
        from apps.features.flags import is_feature_enabled

        dry_run = options["dry_run"]
        if not is_feature_enabled("email_reminders"):
            dry_run = True
            self.stdout.write(
                self.style.WARNING(
                    "email_reminders feature is disabled — running in no-send mode."
                )
            )

        trigger = (
            NotificationDeliveryRun.Trigger.MANUAL
            if options.get("manual")
            else NotificationDeliveryRun.Trigger.SCHEDULED
        )

        summary = process_due_notifications(
            now=now,
            dry_run=dry_run,
            limit=options["limit"],
            user_id=options.get("user_id"),
            type_filter=options.get("type_filter") or "",
            trigger=trigger,
        )

        line = (
            "processed due notifications: "
            f"status={summary['status']} "
            f"evaluated={summary['evaluated']} "
            f"created={summary['created']} "
            f"existing={summary['existing']} "
            f"in_app_delivered={summary['in_app_delivered']} "
            f"emails_sent={summary['emails_sent']} "
            f"emails_skipped={summary['emails_skipped']} "
            f"emails_failed={summary['emails_failed']} "
            f"skipped_preferences={summary['skipped_preferences']} "
            f"errors={summary['errors']} "
            f"email_configured={summary['email_configured']} "
            f"duration_ms={summary['duration_ms']} "
            f"dry_run={summary['dry_run']} "
            f"at={summary['finished_at']}"
        )
        style = (
            self.style.ERROR
            if summary["status"] == NotificationDeliveryRun.Status.FAILED
            else self.style.WARNING
            if summary["status"] == NotificationDeliveryRun.Status.PARTIAL
            else self.style.SUCCESS
        )
        self.stdout.write(style(line))

        if not summary["email_configured"] and not dry_run:
            self.stdout.write(
                self.style.WARNING(
                    "email provider not configured — emails recorded as skipped "
                    "(not sent). Set EMAIL_PROVIDER + credentials for real delivery."
                )
            )

        # Non-zero exit only on catastrophic failure, so transient per-email
        # failures don't spam a scheduler's alerting.
        if summary["status"] == NotificationDeliveryRun.Status.FAILED:
            sys.exit(1)
