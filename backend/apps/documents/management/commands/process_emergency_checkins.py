from datetime import datetime

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.documents.services import process_emergency_checkins


class Command(BaseCommand):
    help = (
        "Process armed emergency safety check-ins: nudge owners whose deadline is "
        "near and fire the escalation (alert trusted contacts) for overdue ones."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Evaluate without sending emails, notifications, or disarming.",
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

        # Kill switch: when the feature is disabled, evaluate without acting so a
        # paused feature never sends alerts.
        from apps.features.flags import is_feature_enabled

        dry_run = options["dry_run"]
        if not is_feature_enabled("emergency_checkin"):
            dry_run = True
            self.stdout.write(
                self.style.WARNING(
                    "emergency_checkin feature is disabled — running in no-send mode."
                )
            )

        summary = process_emergency_checkins(now=now, dry_run=dry_run)
        self.stdout.write(
            self.style.SUCCESS(
                "processed emergency check-ins: "
                f"evaluated={summary['evaluated']} "
                f"fired={summary['fired']} "
                f"nudged={summary['nudged']} "
                f"errors={summary['errors']} "
                f"dry_run={summary['dry_run']}"
            )
        )
        if not summary.get("dry_run"):
            from apps.founder.job_runner import bridge_run
            from apps.founder.models import ScheduledJobRun

            bridge_run(
                "emergency_checkin",
                status=ScheduledJobRun.Status.SUCCEEDED,
                attempted=summary.get("evaluated", 0),
                succeeded=summary.get("fired", 0) + summary.get("nudged", 0),
                failed=summary.get("errors", 0),
                error_code="run_errors" if summary.get("errors") else "",
                message=f"Emergency check-ins: fired {summary.get('fired', 0)}",
                metadata={
                    "evaluated": summary.get("evaluated", 0),
                    "fired": summary.get("fired", 0),
                    "nudged": summary.get("nudged", 0),
                    "errors": summary.get("errors", 0),
                },
            )
