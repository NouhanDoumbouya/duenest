"""
Storage, document, bundle, and active-reminder plan limits
(backend/storage-plan-limits).

Storage is a PRODUCT limit enforced at upload from the stored
``DocumentFile.file_size`` (owner-scoped, never by calling R2). These tests cover
the limit values, the storage helpers/enforcement, the active-reminder count
semantics, and that Pro lifts Free's limits.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APITestCase

from apps.documents import plan_usage
from apps.documents.models import (
    Document,
    DocumentFile,
    DocumentReminderRule,
)
from apps.documents.plan_usage import PlanLimitExceeded
from apps.users import plans

User = get_user_model()

FREE_STORAGE = 100 * 1024 * 1024  # 100 MB
PRO_STORAGE = 10 * 1024 * 1024 * 1024  # 10 GB


def _add_file(user, size_bytes, *, document=None):
    """Create a DocumentFile occupying ``size_bytes`` (no real upload / R2)."""
    if document is None:
        document = Document.objects.create(owner=user, title="Doc")
    return DocumentFile.objects.create(
        document=document,
        uploaded_by=user,
        file="documents/test.bin",
        original_filename="test.bin",
        content_type="application/octet-stream",
        file_size=size_bytes,
    )


class PlanLimitValueTests(TestCase):
    def test_free_storage_limit_is_100mb(self):
        self.assertEqual(plans.get_limit(plans.PLAN_FREE, "storage_bytes"), FREE_STORAGE)

    def test_pro_storage_limit_is_10gb(self):
        self.assertEqual(
            plans.get_limit(plans.PLAN_PRO_PLACEHOLDER, "storage_bytes"), PRO_STORAGE
        )

    def test_free_document_limit_is_30(self):
        self.assertEqual(
            plans.get_limit(plans.PLAN_FREE, plans.RESOURCE_DOCUMENTS), 30
        )

    def test_pro_document_limit_is_1000(self):
        self.assertEqual(
            plans.get_limit(plans.PLAN_PRO_PLACEHOLDER, plans.RESOURCE_DOCUMENTS), 1000
        )

    def test_free_bundle_limit_is_1(self):
        self.assertEqual(plans.get_limit(plans.PLAN_FREE, plans.RESOURCE_BUNDLES), 1)

    def test_free_active_reminder_limit_is_10(self):
        self.assertEqual(plans.get_limit(plans.PLAN_FREE, plans.RESOURCE_REMINDERS), 10)


class StorageQuotaTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="s", email="s@x.com", password="StrongPass123!DN"
        )
        self.other = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN"
        )

    def test_storage_used_counts_only_owner_nontrashed_files(self):
        _add_file(self.user, 10 * 1024 * 1024)  # 10MB
        trashed = _add_file(self.user, 5 * 1024 * 1024)
        trashed.is_trashed = True
        trashed.save(update_fields=["is_trashed"])
        _add_file(self.other, 50 * 1024 * 1024)  # another user's file
        self.assertEqual(
            plan_usage.get_user_storage_used_bytes(self.user), 10 * 1024 * 1024
        )

    def test_upload_within_free_storage_passes(self):
        _add_file(self.user, 50 * 1024 * 1024)  # 50MB used
        self.assertTrue(plan_usage.can_upload_bytes(self.user, 40 * 1024 * 1024))
        # does not raise
        plan_usage.enforce_storage_limit(self.user, 40 * 1024 * 1024)

    def test_upload_exceeding_free_storage_is_blocked(self):
        _add_file(self.user, 90 * 1024 * 1024)  # 90MB used
        self.assertFalse(plan_usage.can_upload_bytes(self.user, 20 * 1024 * 1024))
        with self.assertRaises(PlanLimitExceeded) as ctx:
            plan_usage.enforce_storage_limit(self.user, 20 * 1024 * 1024)
        detail = ctx.exception.detail
        self.assertEqual(detail["code"], "plan_limit_exceeded")
        self.assertEqual(detail["resource"], "storage_bytes")
        self.assertIn("100MB", detail["detail"])
        self.assertIn("10GB", detail["detail"])  # upgrade copy

    def test_remaining_bytes_reported(self):
        _add_file(self.user, 30 * 1024 * 1024)
        self.assertEqual(
            plan_usage.get_user_storage_remaining_bytes(self.user),
            FREE_STORAGE - 30 * 1024 * 1024,
        )

    def test_pro_storage_allows_large_upload_but_caps_at_10gb(self):
        self.user.plan = plans.PLAN_PRO_PLACEHOLDER
        self.user.save(update_fields=["plan"])
        # 1GB upload fits comfortably under the 10GB Pro cap.
        plan_usage.enforce_storage_limit(self.user, 1024 * 1024 * 1024)
        # Simulate nearly-full Pro storage, then an over-cap upload is blocked.
        _add_file(self.user, PRO_STORAGE - 1024)
        with self.assertRaises(PlanLimitExceeded):
            plan_usage.enforce_storage_limit(self.user, 1024 * 1024)


class ActiveReminderCountTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="r", email="r@x.com", password="StrongPass123!DN"
        )

    def test_active_reminder_count_excludes_disabled_and_trashed(self):
        live = Document.objects.create(owner=self.user, title="Live")
        trashed = Document.objects.create(
            owner=self.user, title="Trashed", is_trashed=True
        )
        # 2 active rules on a live document.
        DocumentReminderRule.objects.create(owner=self.user, document=live, days_before=30)
        DocumentReminderRule.objects.create(owner=self.user, document=live, days_before=7)
        # Disabled rule — should NOT count.
        DocumentReminderRule.objects.create(
            owner=self.user, document=live, days_before=1, is_enabled=False
        )
        # Rule on a trashed document — should NOT count.
        DocumentReminderRule.objects.create(
            owner=self.user, document=trashed, days_before=14
        )
        self.assertEqual(
            plan_usage.count_resource(self.user, plans.RESOURCE_REMINDERS), 2
        )


class BundleLimitEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="b", email="b@x.com", password="StrongPass123!DN"
        )
        self.client.force_authenticate(self.user)

    def test_free_can_create_one_bundle_then_is_blocked(self):
        url = "/api/v1/document-bundles/"
        first = self.client.post(url, {"title": "Pack 1"})
        self.assertEqual(first.status_code, 201, first.data)
        second = self.client.post(url, {"title": "Pack 2"})
        self.assertEqual(second.status_code, 403)
        self.assertEqual(second.data["code"], "plan_limit_exceeded")
        self.assertEqual(second.data["resource"], plans.RESOURCE_BUNDLES)
