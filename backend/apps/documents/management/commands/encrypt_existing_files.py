"""
Encrypt legacy plaintext DocumentFile content at rest.

Safe by design:
  * --dry-run reports what would change and modifies nothing.
  * Encrypted bytes are written to a NEW storage object; the original plaintext
    object is deleted ONLY after the new ciphertext is verified to decrypt back
    to the original bytes (when --verify is used) or at least re-read.
  * Per-file failures are isolated and do not corrupt other files.

Logs only safe identifiers (file id, status, key version, counts) — never keys,
file paths, file names, or plaintext.
"""

from __future__ import annotations

import logging

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.core.security import encryption
from apps.documents.file_encryption import read_plaintext
from apps.documents.models import DocumentFile

logger = logging.getLogger("duenest.encryption")


class Command(BaseCommand):
    help = "Encrypt existing plaintext_legacy DocumentFile content at rest."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--batch-size", type=int, default=50)
        parser.add_argument("--file-id", type=int, default=None)
        parser.add_argument(
            "--only-plaintext",
            action="store_true",
            help="Only process plaintext_legacy records (default behaviour).",
        )
        parser.add_argument(
            "--verify",
            action="store_true",
            help="After encrypting, decrypt and confirm the bytes round-trip "
            "before deleting the plaintext object.",
        )

    def handle(self, *args, **opts):
        dry_run = opts["dry_run"]
        verify = opts["verify"]
        batch_size = opts["batch_size"]

        qs = DocumentFile.objects.all().order_by("pk")
        if opts["file_id"]:
            qs = qs.filter(pk=opts["file_id"])
        # plaintext_legacy is the only state that needs migrating.
        qs = qs.filter(
            encryption_status=DocumentFile.EncryptionStatus.PLAINTEXT_LEGACY
        )

        total = qs.count()
        self.stdout.write(
            f"Found {total} plaintext_legacy file(s) to process"
            + (" (dry run)." if dry_run else ".")
        )

        encrypted = skipped_missing = failed = 0
        for instance in qs.iterator(chunk_size=batch_size):
            try:
                old_name = instance.file.name
                try:
                    with instance.file.open("rb") as fh:
                        plaintext = fh.read()
                except (FileNotFoundError, ValueError, OSError):
                    skipped_missing += 1
                    self.stdout.write(
                        f"  skip file_id={instance.pk} (storage object missing)"
                    )
                    continue

                if dry_run:
                    encrypted += 1
                    self.stdout.write(f"  would encrypt file_id={instance.pk}")
                    continue

                aad = encryption.build_file_aad(
                    instance.file_uuid, instance.uploaded_by_id
                )
                payload = encryption.encrypt_bytes(plaintext, aad)

                # Write ciphertext to a NEW object (keep the plaintext until
                # verified). Storage de-duplicates names automatically.
                base = old_name.rsplit("/", 1)[-1]
                instance.file.save(base, ContentFile(payload.ciphertext), save=False)
                instance.encryption_status = DocumentFile.EncryptionStatus.ENCRYPTED
                instance.encryption_algorithm = payload.algorithm
                instance.encryption_version = payload.version
                instance.kek_version = payload.kek_version
                instance.wrapped_dek = payload.wrapped_dek
                instance.nonce = payload.nonce
                instance.gcm_tag = b""
                instance.ciphertext_sha256 = payload.ciphertext_sha256
                instance.plaintext_size_bytes = len(plaintext)
                instance.ciphertext_size_bytes = len(payload.ciphertext)
                instance.encrypted_at = timezone.now()
                instance.encryption_error = ""
                instance.save()

                if verify:
                    opened = read_plaintext(instance)
                    if opened != plaintext:
                        raise encryption.DecryptionError("verification mismatch")

                # Safe to remove the old plaintext object now.
                if old_name and old_name != instance.file.name:
                    instance.file.storage.delete(old_name)

                encrypted += 1
                self.stdout.write(f"  encrypted file_id={instance.pk}")
            except Exception:  # noqa: BLE001 - isolate per-file failure
                failed += 1
                if not dry_run:
                    DocumentFile.objects.filter(pk=instance.pk).update(
                        encryption_status=(
                            DocumentFile.EncryptionStatus.ENCRYPTION_FAILED
                        ),
                        encryption_error="migration_failed",
                    )
                logger.warning(
                    "file_encryption_migration_failed file_id=%s error_category=migration_failed",
                    instance.pk,
                )
                self.stdout.write(self.style.ERROR(f"  failed file_id={instance.pk}"))

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. encrypted={encrypted} skipped_missing={skipped_missing} "
                f"failed={failed} dry_run={dry_run}"
            )
        )
