"""
Permanently delete trashed documents and files older than TRASH_RETENTION_DAYS.

This is what makes the "days until permanent deletion" countdown real. Run it on
a schedule (cron / platform scheduled job), e.g. daily:

    python manage.py purge_expired_trash

File blobs are removed best-effort before the rows are deleted (mirroring the
manual permanent-delete path). Set TRASH_RETENTION_DAYS=0 to disable.
"""

from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.documents.services import purge_expired_trash


class Command(BaseCommand):
    help = "Permanently delete trashed documents/files past the retention window."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be purged without deleting anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        result = purge_expired_trash(dry_run=dry_run)

        if result.get("disabled"):
            self.stdout.write(
                self.style.WARNING(
                    "TRASH_RETENTION_DAYS is 0 — auto-purge disabled. Nothing to do."
                )
            )
            return

        doc_count = result.get("documents", 0)
        file_count = result.get("files", 0)
        verb = "Would purge" if dry_run else "Purged"
        line = (
            f"{verb} {doc_count} document(s) and {file_count} loose file(s) "
            f"trashed before {result.get('cutoff')}."
        )
        self.stdout.write(line if dry_run else self.style.SUCCESS(line))

        if not dry_run:
            from apps.founder.job_runner import bridge_run
            from apps.founder.models import ScheduledJobRun

            bridge_run(
                "purge_expired_trash",
                status=ScheduledJobRun.Status.SUCCEEDED,
                attempted=doc_count + file_count,
                succeeded=doc_count + file_count,
                message=f"Purged {doc_count} document(s)",
                metadata={"documents": doc_count, "files": file_count},
            )
