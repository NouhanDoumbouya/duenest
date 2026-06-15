"""Tests for trash retention: purge command + days-until-purge countdown."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.documents.models import Document
from apps.documents.serializers import days_until_trash_purge

User = get_user_model()


@override_settings(TRASH_RETENTION_DAYS=30)
class TrashRetentionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="alice", email="alice@example.com", password="StrongPass123!Trash"
        )

    def _trashed(self, title, days_ago):
        return Document.objects.create(
            owner=self.user,
            title=title,
            is_trashed=True,
            trashed_at=timezone.now() - timedelta(days=days_ago),
        )

    def test_purge_deletes_expired_keeps_recent_and_active(self):
        old = self._trashed("Old", 40)
        recent = self._trashed("Recent", 5)
        active = Document.objects.create(owner=self.user, title="Active")
        call_command("purge_expired_trash")
        self.assertFalse(Document.objects.filter(id=old.id).exists())
        self.assertTrue(Document.objects.filter(id=recent.id).exists())
        self.assertTrue(Document.objects.filter(id=active.id).exists())

    def test_dry_run_deletes_nothing(self):
        old = self._trashed("Old", 40)
        call_command("purge_expired_trash", "--dry-run")
        self.assertTrue(Document.objects.filter(id=old.id).exists())

    @override_settings(TRASH_RETENTION_DAYS=0)
    def test_disabled_retention_purges_nothing(self):
        old = self._trashed("Old", 40)
        call_command("purge_expired_trash")
        self.assertTrue(Document.objects.filter(id=old.id).exists())

    def test_days_until_purge_helper(self):
        self.assertEqual(
            days_until_trash_purge(timezone.now() - timedelta(days=10)), 20
        )
        self.assertEqual(days_until_trash_purge(timezone.now() - timedelta(days=40)), 0)
        self.assertIsNone(days_until_trash_purge(None))

    @override_settings(TRASH_RETENTION_DAYS=0)
    def test_helper_none_when_disabled(self):
        self.assertIsNone(days_until_trash_purge(timezone.now()))
