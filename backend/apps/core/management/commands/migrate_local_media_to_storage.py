"""
Copy existing local media files into the configured object storage backend.

Use this once after switching STORAGE_BACKEND to ``s3`` so files uploaded while
on local disk become available from the bucket. Files are app-encrypted at rest,
so this copies ciphertext as-is — it never decrypts or inspects contents.

Safety guarantees:
* Read-only on the local source — local files are NEVER deleted.
* Skips objects already present in the target with a matching size.
* ``--dry-run`` reports what would be copied without writing anything.
* Logs only storage keys and sizes, never file contents or secrets.
"""

from __future__ import annotations

from django.apps import apps as django_apps
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage, default_storage
from django.core.management.base import BaseCommand
from django.db import models

from config.storage import is_remote_default


def _file_fields(model):
    return [f for f in model._meta.get_fields() if isinstance(f, models.FileField)]


def _iter_instances(model, field_names):
    """Stream rows, loading only the pk and file-field columns."""
    return model._default_manager.all().only("pk", *field_names).iterator()


class Command(BaseCommand):
    help = "Copy existing local media files into the configured object storage."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would be copied without writing to storage.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        if not is_remote_default(settings.STORAGES):
            self.stdout.write(
                self.style.WARNING(
                    "Default storage is local — nothing to migrate. Set "
                    "STORAGE_BACKEND=s3 (and STORAGE_* vars) first."
                )
            )
            return

        source = FileSystemStorage(location=settings.MEDIA_ROOT)

        copied = skipped = missing = 0

        for model in django_apps.get_models():
            fields = _file_fields(model)
            if not fields:
                continue
            field_names = [f.name for f in fields]
            for instance in _iter_instances(model, field_names):
                for field_name in field_names:
                    field_file = getattr(instance, field_name)
                    name = getattr(field_file, "name", "") or ""
                    if not name:
                        continue

                    if not source.exists(name):
                        missing += 1
                        self.stdout.write(
                            self.style.WARNING(f"  missing on disk: {name}")
                        )
                        continue

                    src_size = source.size(name)
                    if default_storage.exists(name) and default_storage.size(name) == src_size:
                        skipped += 1
                        continue

                    if dry_run:
                        self.stdout.write(f"  would copy: {name} ({src_size} bytes)")
                        copied += 1
                        continue

                    with source.open(name, "rb") as fh:
                        data = fh.read()
                    # Write under the same key (skipped above if it already exists,
                    # so the backend will not rename it).
                    default_storage.save(name, ContentFile(data))

                    if not (
                        default_storage.exists(name)
                        and default_storage.size(name) == src_size
                    ):
                        self.stderr.write(
                            self.style.ERROR(f"  verify FAILED for {name}; left local copy intact")
                        )
                        continue

                    copied += 1
                    self.stdout.write(self.style.SUCCESS(f"  copied: {name} ({src_size} bytes)"))

        verb = "would copy" if dry_run else "copied"
        self.stdout.write(
            self.style.SUCCESS(
                f"Done. {verb}={copied} skipped(existing)={skipped} missing_on_disk={missing}. "
                "Local files were not deleted."
            )
        )
