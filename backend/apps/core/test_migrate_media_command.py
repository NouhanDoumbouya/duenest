"""Tests for the `migrate_local_media_to_storage` management command.

No real object storage is contacted: the remote default is simulated with an
in-memory fake recorder and the remote-default check is patched, while the local
source stays a real (temp) filesystem. Verifies the safety guarantees: no-op on
local, dry-run never writes, missing files are skipped, reruns are idempotent,
and local files are never deleted.
"""

from __future__ import annotations

import shutil
import tempfile
from io import StringIO
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings

from apps.documents.models import DocumentFile

User = get_user_model()

CMD = "apps.core.management.commands.migrate_local_media_to_storage"


class FakeRemoteStorage:
    """Minimal in-memory stand-in for the S3 default storage."""

    def __init__(self):
        self.saved: dict[str, bytes] = {}
        self.save_calls = 0

    def exists(self, name):
        return name in self.saved

    def size(self, name):
        return len(self.saved[name])

    def save(self, name, content):
        self.save_calls += 1
        self.saved[name] = content.read()
        return name


def _run(**kwargs):
    out = StringIO()
    call_command("migrate_local_media_to_storage", stdout=out, stderr=out, **kwargs)
    return out.getvalue()


class MigrateLocalMediaCommandTests(TestCase):
    def setUp(self):
        self._media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self._media, ignore_errors=True)
        self._media_override = override_settings(MEDIA_ROOT=self._media)
        self._media_override.enable()
        self.addCleanup(self._media_override.disable)

        self.user = User.objects.create_user(
            username="u", email="u@x.com", password="StrongPassword123!DN"
        )

    def _make_file_row(self, content=b"%PDF-1.4 ciphertext"):
        f = DocumentFile.objects.create(
            uploaded_by=self.user,
            file=SimpleUploadedFile("doc.pdf", content),
            original_filename="doc.pdf",
        )
        return f

    def test_noop_when_storage_is_local(self):
        # Default storage in tests is local — the command must refuse to migrate.
        self._make_file_row()
        out = _run()
        self.assertIn("nothing to migrate", out.lower())

    def test_dry_run_does_not_upload(self):
        self._make_file_row()
        fake = FakeRemoteStorage()
        with mock.patch(f"{CMD}.is_remote_default", return_value=True), mock.patch(
            f"{CMD}.default_storage", fake
        ):
            out = _run(dry_run=True)
        self.assertEqual(fake.save_calls, 0)  # nothing written
        self.assertIn("would copy", out)

    def test_actual_run_uploads_present_and_skips_missing(self):
        present = self._make_file_row(b"present-bytes")
        missing = self._make_file_row(b"will-be-removed")
        # Remove the second file from disk to exercise the missing-on-disk path.
        FileSystemStorage(location=self._media).delete(missing.file.name)

        fake = FakeRemoteStorage()
        with mock.patch(f"{CMD}.is_remote_default", return_value=True), mock.patch(
            f"{CMD}.default_storage", fake
        ):
            out = _run()

        self.assertIn(present.file.name, fake.saved)  # present file uploaded
        self.assertNotIn(missing.file.name, fake.saved)  # missing skipped
        self.assertIn("missing on disk", out)
        # Local source is never deleted by the command.
        self.assertTrue(FileSystemStorage(location=self._media).exists(present.file.name))

    def test_rerun_is_idempotent_and_skips_existing(self):
        present = self._make_file_row(b"same-bytes")
        fake = FakeRemoteStorage()
        with mock.patch(f"{CMD}.is_remote_default", return_value=True), mock.patch(
            f"{CMD}.default_storage", fake
        ):
            _run()
            first_calls = fake.save_calls
            out = _run()  # second pass: object already present with matching size

        self.assertEqual(first_calls, 1)
        self.assertEqual(fake.save_calls, 1)  # not re-uploaded
        self.assertIn("skipped(existing)=1", out)
        self.assertIn(present.file.name, fake.saved)
