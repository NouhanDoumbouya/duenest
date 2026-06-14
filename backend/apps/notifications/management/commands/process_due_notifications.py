from datetime import datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

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

        summary = process_due_notifications(
            now=now,
            dry_run=options["dry_run"],
            limit=options["limit"],
            user_id=options.get("user_id"),
            type_filter=options.get("type_filter") or "",
        )
        self.stdout.write(
            self.style.SUCCESS(
                "processed due notifications: "
                f"evaluated={summary['evaluated']} "
                f"created={summary['created']} "
                f"existing={summary['existing']} "
                f"delivered={summary['delivered']} "
                f"skipped_preferences={summary['skipped_preferences']} "
                f"dry_run={summary['dry_run']}"
            )
        )
