"""
Rewrap encrypted-file DEKs from one KEK version to another.

Rotation only re-wraps the per-file Data Encryption Key under the new KEK; it
does NOT decrypt or rewrite file content. Both the old and new KEK versions must
be configured while rotation runs. Do not retire an old KEK until no records
reference it (and backups are handled).

Logs only safe identifiers and counts — never key material.
"""

from __future__ import annotations

import logging

from django.core.management.base import BaseCommand, CommandError

from apps.core.security import encryption, key_provider
from apps.documents.models import DocumentFile

logger = logging.getLogger("duenest.encryption")


class Command(BaseCommand):
    help = "Rewrap encrypted file DEKs from --from-version to --to-version."

    def add_arguments(self, parser):
        parser.add_argument("--from-version", required=True)
        parser.add_argument("--to-version", required=True)
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--batch-size", type=int, default=100)

    def handle(self, *args, **opts):
        from_v = opts["from_version"]
        to_v = opts["to_version"]
        dry_run = opts["dry_run"]

        if from_v == to_v:
            raise CommandError("--from-version and --to-version must differ.")
        # Fail fast if either key is missing/malformed.
        try:
            key_provider.get_kek(from_v)
            key_provider.get_kek(to_v)
        except key_provider.KeyConfigurationError as exc:
            raise CommandError(str(exc))

        qs = DocumentFile.objects.filter(
            encryption_status=DocumentFile.EncryptionStatus.ENCRYPTED,
            kek_version=from_v,
        ).order_by("pk")
        total = qs.count()
        self.stdout.write(
            f"Found {total} file(s) wrapped under '{from_v}'"
            + (" (dry run)." if dry_run else f"; rewrapping to '{to_v}'.")
        )

        rotated = failed = 0
        for instance in qs.iterator(chunk_size=opts["batch_size"]):
            try:
                if dry_run:
                    rotated += 1
                    continue
                dek = encryption.unwrap_dek(bytes(instance.wrapped_dek), from_v)
                new_wrapped = encryption.wrap_dek(dek, to_v)
                DocumentFile.objects.filter(pk=instance.pk).update(
                    wrapped_dek=new_wrapped, kek_version=to_v
                )
                rotated += 1
            except Exception:  # noqa: BLE001 - isolate per-file failure
                failed += 1
                logger.warning(
                    "file_key_rotation_failed file_id=%s error_category=rewrap_failed",
                    instance.pk,
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. rotated={rotated} failed={failed} dry_run={dry_run}"
            )
        )
