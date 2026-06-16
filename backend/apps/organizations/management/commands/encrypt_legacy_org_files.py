"""
Detect and migrate legacy *plaintext* organization files to encryption-at-rest
(SEC-002).

Organization document files and public document-request submissions created
before the encryption rollout are stored as plaintext (``is_encrypted=False``).
This command reports them (``--dry-run``) and encrypts them in place
(``--confirm``).

Safety:
  * Dry-run by default — nothing is changed without ``--confirm``.
  * Each file is sealed, the sealed envelope written to a NEW storage object, and
    decryption verified to match the original bytes BEFORE the record is flipped
    to the encrypted object. The old plaintext object is only deleted after a
    successful, verified switch — never before.
  * Never prints file contents; only ids, counts and sizes.

Usage:
    python manage.py encrypt_legacy_org_files --dry-run
    python manage.py encrypt_legacy_org_files --confirm
"""

from __future__ import annotations

from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand

from apps.core.security import encryption
from apps.organizations import file_encryption as orgfe
from apps.organizations.models import DocumentRequestSubmission, OrganizationDocumentFile


def _plaintext_doc_files():
    return OrganizationDocumentFile.objects.filter(is_encrypted=False).exclude(file="")


def _plaintext_submissions():
    return DocumentRequestSubmission.objects.filter(is_encrypted=False).exclude(file="")


class Command(BaseCommand):
    help = "Detect/migrate legacy plaintext organization files to encryption at rest."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", default=True)
        parser.add_argument(
            "--confirm",
            action="store_true",
            help="Actually encrypt the legacy plaintext files.",
        )

    def handle(self, *args, **options):
        confirm = options.get("confirm")
        dry_run = not confirm

        doc_files = list(_plaintext_doc_files())
        submissions = list(_plaintext_submissions())
        self.stdout.write(
            f"Legacy plaintext organization files: "
            f"{len(doc_files)} document file(s), {len(submissions)} submission(s)."
        )
        if dry_run:
            for df in doc_files:
                self.stdout.write(
                    f"  [dry-run] would encrypt OrganizationDocumentFile id={df.id} "
                    f"org={df.organization_id} size={df.file_size}"
                )
            for s in submissions:
                self.stdout.write(
                    f"  [dry-run] would encrypt DocumentRequestSubmission id={s.id} "
                    f"org={s.organization_id} size={s.file_size}"
                )
            self.stdout.write(
                "Dry run only. Re-run with --confirm to perform the migration."
            )
            return

        encrypted = 0
        failed = 0
        for df in doc_files:
            encrypted += self._encrypt_one(
                df, orgfe._doc_file_aad, "OrganizationDocumentFile"
            )
            failed += 0 if df.is_encrypted else 1
        for s in submissions:
            encrypted += self._encrypt_one(
                s, orgfe._submission_aad, "DocumentRequestSubmission"
            )
        self.stdout.write(
            self.style.SUCCESS(f"Done. encrypted={encrypted} failed={failed}")
        )

    def _encrypt_one(self, instance, aad_fn, label) -> int:
        try:
            with instance.file.open("rb") as fh:
                plaintext = fh.read()
        except (FileNotFoundError, ValueError):
            self.stdout.write(
                self.style.WARNING(f"  skip {label} id={instance.id}: file missing")
            )
            return 0

        old_name = instance.file.name
        aad = aad_fn(instance)
        token = encryption.seal_blob(plaintext, aad=aad)
        new_name = f"{instance.file_uuid.hex}.enc"

        # Write the encrypted object to a NEW path, then verify before switching.
        instance.file.save(new_name, ContentFile(token), save=False)
        try:
            verify = orgfe._doc_file_aad if label == "OrganizationDocumentFile" else orgfe._submission_aad
            with instance.file.open("rb") as fh:
                stored = fh.read()
            if encryption.open_blob(stored, aad=verify(instance)) != plaintext:
                raise ValueError("verification mismatch")
        except Exception:  # noqa: BLE001
            self.stdout.write(
                self.style.ERROR(f"  FAILED {label} id={instance.id}: verify failed")
            )
            return 0

        instance.is_encrypted = True
        instance.save(update_fields=["file", "is_encrypted"])

        # Only now delete the old plaintext object (best effort).
        if old_name and old_name != instance.file.name:
            try:
                instance.file.storage.delete(old_name)
            except Exception:  # noqa: BLE001
                pass
        self.stdout.write(f"  encrypted {label} id={instance.id}")
        return 1
