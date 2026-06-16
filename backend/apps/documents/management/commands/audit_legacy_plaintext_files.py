"""
Detect legacy *plaintext* files still stored unencrypted (SEC-012).

Read-only audit across both the personal vault and organization storage. Prints a
summary (counts, affected models, oldest/newest dates) and the exact migration
commands to run. Never modifies data and never prints file names or contents.

Usage:
    python manage.py audit_legacy_plaintext_files
    python manage.py audit_legacy_plaintext_files --dry-run   # same (read-only)

Exit code is 1 when legacy plaintext remains, so CI / a pre-launch gate can fail
on it; 0 when everything is encrypted.
"""

from __future__ import annotations

import sys

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Report any legacy plaintext files (vault + organizations) — SEC-012."

    def add_arguments(self, parser):
        # Accepted for symmetry with the migration commands; this command is
        # always read-only.
        parser.add_argument("--dry-run", action="store_true", default=True)

    def handle(self, *args, **options):
        from apps.documents.models import DocumentFile
        from apps.organizations.models import (
            DocumentRequestSubmission,
            OrganizationDocumentFile,
        )

        remaining = 0

        vault = DocumentFile.objects.filter(
            encryption_status=DocumentFile.EncryptionStatus.PLAINTEXT_LEGACY
        )
        remaining += self._report(
            "Vault DocumentFile",
            vault,
            "created_at",
            "python manage.py encrypt_existing_files --verify",
        )

        org_files = OrganizationDocumentFile.objects.filter(is_encrypted=False).exclude(
            file=""
        )
        remaining += self._report(
            "OrganizationDocumentFile",
            org_files,
            "created_at",
            "python manage.py encrypt_legacy_org_files --confirm",
        )

        subs = DocumentRequestSubmission.objects.filter(is_encrypted=False).exclude(
            file=""
        )
        remaining += self._report(
            "DocumentRequestSubmission",
            subs,
            "created_at",
            "python manage.py encrypt_legacy_org_files --confirm",
        )

        if remaining:
            self.stdout.write(
                self.style.WARNING(
                    f"\n{remaining} legacy plaintext file(s) remain. Encrypt them "
                    "before public launch using the commands above."
                )
            )
            sys.exit(1)
        self.stdout.write(self.style.SUCCESS("No legacy plaintext files found."))

    def _report(self, label, qs, date_field, fix_cmd) -> int:
        count = qs.count()
        if count == 0:
            self.stdout.write(f"{label}: 0 plaintext record(s). OK.")
            return 0
        oldest = qs.order_by(date_field).values_list(date_field, flat=True).first()
        newest = qs.order_by(f"-{date_field}").values_list(date_field, flat=True).first()
        self.stdout.write(
            self.style.WARNING(
                f"{label}: {count} plaintext record(s) "
                f"(oldest={oldest}, newest={newest}). Fix: {fix_cmd}"
            )
        )
        return count
