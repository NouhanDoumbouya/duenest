"""SEC-012 regression tests: legacy plaintext detection command."""

import shutil
import tempfile
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import override_settings
from rest_framework.test import APITestCase

from .models import Document, DocumentFile

User = get_user_model()
_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-legacyaudit-")


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class LegacyPlaintextAuditTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def test_reports_clean_when_no_legacy(self):
        out = StringIO()
        # No SystemExit expected when nothing is plaintext.
        call_command("audit_legacy_plaintext_files", stdout=out)
        self.assertIn("No legacy plaintext files found", out.getvalue())

    def test_detects_legacy_vault_file_and_exits_nonzero(self):
        user = User.objects.create_user(
            username="u", email="u@example.com", password="StrongPassword123!DN"
        )
        doc = Document.objects.create(owner=user, title="Doc")
        DocumentFile.objects.create(
            document=doc, uploaded_by=user,
            file=SimpleUploadedFile("a.pdf", b"%PDF-1.4 x", content_type="application/pdf"),
            original_filename="a.pdf", content_type="application/pdf", file_size=9,
            encryption_status=DocumentFile.EncryptionStatus.PLAINTEXT_LEGACY,
        )
        out = StringIO()
        with self.assertRaises(SystemExit) as ctx:
            call_command("audit_legacy_plaintext_files", stdout=out)
        self.assertEqual(ctx.exception.code, 1)
        self.assertIn("plaintext record", out.getvalue())
