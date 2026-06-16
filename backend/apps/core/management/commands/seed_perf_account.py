"""
Seed a TEST account with a large amount of data for performance/load testing.

All generated rows are clearly marked as test data (titles/names are prefixed
with ``[PERFTEST]``) so they are easy to spot and easy to delete. This command
refuses to run in production unless ``--i-understand-production`` is passed, and
never touches real user data.

Examples:
    python manage.py seed_perf_account --user-email tester@example.com --documents 1000
    python manage.py seed_perf_account --user-email tester@example.com --documents 10000 \
        --with-files --with-notifications --with-subscriptions
    python manage.py seed_perf_account --user-email tester@example.com --documents 1000 --dry-run
"""

from __future__ import annotations

import random
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

TEST_PREFIX = "[PERFTEST]"
BATCH = 500


class Command(BaseCommand):
    help = "Seed a test account with many documents (and optionally files/notifications/subscriptions)."

    def add_arguments(self, parser):
        parser.add_argument("--user-email", required=True, help="Target test user's email.")
        parser.add_argument("--documents", type=int, default=1000, help="How many documents to create.")
        parser.add_argument("--with-files", action="store_true", help="Attach a tiny encrypted file to each document.")
        parser.add_argument("--with-notifications", action="store_true", help="Create in-app notifications.")
        parser.add_argument("--with-subscriptions", action="store_true", help="Create subscriptions.")
        parser.add_argument("--dry-run", action="store_true", help="Report what would be created; write nothing.")
        parser.add_argument(
            "--i-understand-production",
            action="store_true",
            help="Required to run when APP_ENV/DEBUG indicate a production-like environment.",
        )

    def handle(self, *args, **opts):
        self._guard_production(opts["i_understand_production"])

        User = get_user_model()
        try:
            user = User.objects.get(email__iexact=opts["user_email"])
        except User.DoesNotExist as exc:
            raise CommandError(
                f"No user with email {opts['user_email']!r}. Create the test user first."
            ) from exc

        count = max(0, int(opts["documents"]))
        dry = opts["dry_run"]

        plan = [
            f"{count} documents",
            "with a tiny encrypted file each" if opts["with_files"] else "no files",
            "with notifications" if opts["with_notifications"] else "no notifications",
            "with subscriptions" if opts["with_subscriptions"] else "no subscriptions",
        ]
        self.stdout.write(f"Seeding for {user.email}: " + ", ".join(plan))
        if dry:
            self.stdout.write(self.style.WARNING("DRY RUN — nothing was written."))
            return

        created_docs = self._seed_documents(user, count, opts["with_files"])
        created_notifs = (
            self._seed_notifications(user, min(count, 200))
            if opts["with_notifications"]
            else 0
        )
        created_subs = (
            self._seed_subscriptions(user, min(count, 100))
            if opts["with_subscriptions"]
            else 0
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. documents={created_docs} notifications={created_notifs} "
                f"subscriptions={created_subs}. All rows are tagged '{TEST_PREFIX}'."
            )
        )

    # -- guards ---------------------------------------------------------------

    def _guard_production(self, override: bool) -> None:
        app_env = getattr(settings, "APP_ENV", "local")
        looks_prod = app_env == "production" or not settings.DEBUG
        if looks_prod and not override:
            raise CommandError(
                "Refusing to seed test data in a production-like environment "
                f"(APP_ENV={app_env!r}, DEBUG={settings.DEBUG}). Re-run with "
                "--i-understand-production only on a disposable test/staging DB."
            )

    # -- seeders --------------------------------------------------------------

    def _seed_documents(self, user, count: int, with_files: bool) -> int:
        from apps.documents.models import Document

        today = timezone.localdate()
        statuses = [c[0] for c in Document.Status.choices]
        created = 0
        batch: list[Document] = []
        for i in range(count):
            # Spread expiry dates across past/future so health states vary.
            offset = random.randint(-120, 365)
            doc = Document(
                owner=user,
                title=f"{TEST_PREFIX} Document {i + 1}",
                document_type=random.choice(["passport", "licence", "insurance", "lease", ""]),
                issuer=random.choice(["Gov", "Acme Insurance", "City Hall", ""]),
                country=random.choice(["GB", "US", "MY", ""]),
                expiry_date=today + timedelta(days=offset),
                status=random.choice(statuses),
                is_pinned=(i % 50 == 0),
            )
            batch.append(doc)
            if len(batch) >= BATCH:
                Document.objects.bulk_create(batch)
                created += len(batch)
                batch = []
                self.stdout.write(f"  ...{created} documents")
        if batch:
            Document.objects.bulk_create(batch)
            created += len(batch)

        if with_files:
            self._attach_files(user)
        return created

    def _attach_files(self, user) -> None:
        """Attach one tiny encrypted file per test document lacking one."""
        import uuid

        from apps.documents.file_encryption import encrypt_bytes_into_record
        from apps.documents.models import Document, DocumentFile

        docs = Document.objects.filter(owner=user, title__startswith=TEST_PREFIX)
        n = 0
        for doc in docs.iterator(chunk_size=BATCH):
            if doc.files.exists():
                continue
            instance = DocumentFile(
                document=doc,
                uploaded_by=user,
                file_uuid=uuid.uuid4(),
                original_filename=f"{TEST_PREFIX}-sample.txt",
                content_type="text/plain",
                file_size=len(b"perftest sample file content"),
            )
            try:
                encrypt_bytes_into_record(
                    instance, b"perftest sample file content", instance.original_filename
                )
                instance.save()
                n += 1
            except Exception:  # noqa: BLE001 - seeding is best-effort
                self.stderr.write(self.style.WARNING(f"  file seed skipped for doc {doc.pk}"))
            if n and n % BATCH == 0:
                self.stdout.write(f"  ...{n} files")

    def _seed_notifications(self, user, count: int) -> int:
        from apps.notifications.models import Notification

        now = timezone.now()
        batch = []
        for i in range(count):
            batch.append(
                Notification(
                    user=user,
                    type=Notification.Type.DOCUMENT_MISSING_FILE,
                    title=f"{TEST_PREFIX} Notification {i + 1}",
                    message="Perf test notification.",
                    severity=Notification.Severity.INFO,
                    status=Notification.Status.DELIVERED,
                    scheduled_for=now,
                    delivered_in_app_at=now,
                    dedupe_key=f"perftest:{user.id}:{i}:{now.timestamp()}",
                )
            )
        Notification.objects.bulk_create(batch)
        return len(batch)

    def _seed_subscriptions(self, user, count: int) -> int:
        from apps.subscriptions.models import Subscription

        today = timezone.localdate()
        batch = []
        for i in range(count):
            batch.append(
                Subscription(
                    owner=user,
                    name=f"{TEST_PREFIX} Subscription {i + 1}",
                    amount="9.99",
                    currency="USD",
                    next_billing_date=today + timedelta(days=random.randint(1, 90)),
                )
            )
        Subscription.objects.bulk_create(batch)
        return len(batch)
