"""
Permanently delete trashed documents and files older than TRASH_RETENTION_DAYS.

This is what makes the "days until permanent deletion" countdown real. Run it on
a schedule (cron / platform scheduled job), e.g. daily:

    python manage.py purge_expired_trash

File blobs are removed best-effort before the rows are deleted (mirroring the
manual permanent-delete path). Set TRASH_RETENTION_DAYS=0 to disable.
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.documents.models import Document, DocumentFile


def _delete_blob(file: DocumentFile) -> None:
    try:
        file.file.delete(save=False)
    except Exception:  # noqa: BLE001 — best-effort blob cleanup
        pass


class Command(BaseCommand):
    help = "Permanently delete trashed documents/files past the retention window."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be purged without deleting anything.",
        )

    def handle(self, *args, **options):
        retention = getattr(settings, "TRASH_RETENTION_DAYS", 30)
        if retention <= 0:
            self.stdout.write(
                self.style.WARNING(
                    "TRASH_RETENTION_DAYS is 0 — auto-purge disabled. Nothing to do."
                )
            )
            return

        dry_run = options["dry_run"]
        cutoff = timezone.now() - timedelta(days=retention)

        documents = Document.objects.filter(is_trashed=True, trashed_at__lt=cutoff)
        # Standalone inbox files and trashed files whose document is not itself
        # being purged below (those are removed via cascade).
        loose_files = DocumentFile.objects.filter(
            is_trashed=True, trashed_at__lt=cutoff
        ).exclude(document__in=documents)

        doc_count = documents.count()
        file_count = loose_files.count()

        if dry_run:
            self.stdout.write(
                f"Would purge {doc_count} document(s) and {file_count} loose file(s) "
                f"trashed before {cutoff.date()}."
            )
            return

        for document in documents.iterator():
            for file in document.files.all():
                _delete_blob(file)
            document.delete()  # cascades files, share links, versions, activity

        for file in loose_files.iterator():
            _delete_blob(file)
            file.delete()

        self.stdout.write(
            self.style.SUCCESS(
                f"Purged {doc_count} document(s) and {file_count} loose file(s) "
                f"trashed before {cutoff.date()}."
            )
        )
        from apps.founder.services import record_scheduled_job_run

        record_scheduled_job_run(
            "purge_expired_trash_job",
            status="succeeded",
            message=f"Purged {doc_count} document(s)",
            counts={"documents": doc_count, "files": file_count},
        )
