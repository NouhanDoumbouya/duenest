"""
Security & Compliance Hardening V1 — activity-trail metadata privacy.

Every owner-visible activity/event trail (file, room, document, emergency) routes
its ``metadata`` through ``safe_audit_metadata`` before persisting. These trails
also record actions taken by anonymous public-link visitors, so unsanitized
metadata would be the easiest way for a token, private URL, storage key, or raw
document/OCR content to slip into a record the owner (or a future data export)
reads back. These tests lock that guarantee in.
"""

import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from .models import (
    Document,
    DocumentActivity,
    DocumentFile,
    DocumentFileActivity,
    EmergencyAccessPack,
    EmergencyActivityEvent,
    RoomActivity,
    ShareRoom,
)
from .services import (
    log_activity,
    log_document_activity,
    log_emergency_event,
    log_room_activity,
)

User = get_user_model()
_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-activity-privacy-")

# A metadata payload a careless (or hostile public-visitor-driven) caller might
# pass: forbidden keys that MUST be dropped, plus safe operational keys that MUST
# survive so the trail stays useful.
SENSITIVE = {
    "share_token": "tok_should_never_persist",
    "file_url": "https://r2.example.com/private/abc?sig=secret",
    "download_url": "https://r2.example.com/x",
    "storage_key": "media/user_1/passport.pdf.enc",
    "ocr_text": "Passport number A1234567",
    "content": "raw document body text",
    "access_code": "1234",
    "password": "hunter2",
    "authorization": "Bearer eyJabc.def.ghi",
    # Safe, non-sensitive context that should be preserved:
    "count": 3,
    "format": "pdf",
    "action": "viewed",
}
FORBIDDEN_KEYS = {
    "share_token", "file_url", "download_url", "storage_key", "ocr_text",
    "content", "access_code", "password", "authorization",
}
SAFE_KEYS = {"count", "format", "action"}
LEAK_FRAGMENTS = ("tok_should_never_persist", "r2.example.com", ".pdf.enc", "Bearer ")


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class ActivityMetadataPrivacyTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.user = User.objects.create_user(
            username="u", email="u@x.com", password="StrongPassword123!DN"
        )
        self.doc = Document.objects.create(owner=self.user, title="Passport")
        self.file = DocumentFile.objects.create(
            document=self.doc,
            uploaded_by=self.user,
            file=SimpleUploadedFile(
                "p.pdf", b"%PDF-1.4 fake", content_type="application/pdf"
            ),
            original_filename="p.pdf",
            content_type="application/pdf",
            file_size=12,
        )
        self.room = ShareRoom.objects.create(owner=self.user, title="Visa room")
        self.pack = EmergencyAccessPack.objects.create(
            owner=self.user, title="Emergency pack"
        )

    def _assert_clean(self, metadata):
        keys = set(metadata.keys())
        leaked = keys & FORBIDDEN_KEYS
        self.assertEqual(leaked, set(), f"forbidden keys leaked: {leaked}")
        dropped = SAFE_KEYS - keys
        self.assertEqual(dropped, set(), f"safe keys were dropped: {dropped}")
        blob = " ".join(str(v) for v in metadata.values())
        for needle in LEAK_FRAGMENTS:
            self.assertNotIn(needle, blob)

    def test_file_activity_metadata_is_sanitized(self):
        log_activity(
            file=self.file,
            action="file_previewed",
            actor_type="shared_viewer",
            metadata=dict(SENSITIVE),
        )
        entry = DocumentFileActivity.objects.filter(file=self.file).latest("id")
        self._assert_clean(entry.metadata)

    def test_room_activity_metadata_is_sanitized(self):
        log_room_activity(
            room=self.room,
            action="room_opened",
            actor_type="shared_viewer",
            metadata=dict(SENSITIVE),
        )
        entry = RoomActivity.objects.filter(room=self.room).latest("id")
        self._assert_clean(entry.metadata)

    def test_document_activity_metadata_is_sanitized(self):
        log_document_activity(
            owner=self.user,
            action="document_updated",
            document=self.doc,
            metadata=dict(SENSITIVE),
        )
        entry = DocumentActivity.objects.filter(document=self.doc).latest("id")
        self._assert_clean(entry.metadata)

    def test_emergency_event_metadata_is_sanitized(self):
        log_emergency_event(
            pack=self.pack,
            event_type="qr_scanned",
            metadata=dict(SENSITIVE),
        )
        entry = EmergencyActivityEvent.objects.filter(pack=self.pack).latest("id")
        self._assert_clean(entry.metadata)

    def test_logging_never_raises_on_non_dict_metadata(self):
        # Non-dict metadata must never break the recorded action; it becomes {}.
        log_document_activity(
            owner=self.user,
            action="document_created",
            document=self.doc,
            metadata="not-a-dict",  # type: ignore[arg-type]
        )
        entry = DocumentActivity.objects.filter(document=self.doc).latest("id")
        self.assertEqual(entry.metadata, {})
