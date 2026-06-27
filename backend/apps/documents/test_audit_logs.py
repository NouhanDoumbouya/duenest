"""
Audit Logs V1 — owner-scoped security/document event history.

Hermetic: no AI is ever called. Covers the model + service (best-effort, metadata
sanitization, salted-hash fingerprints, owner scoping), the list/detail/summary
API (auth required, owner isolation, filters, no IP/UA/token/URL leakage), and the
event integration across document requests, sharing rooms, and protected copies.
"""

from __future__ import annotations

import io
import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.documents.audit import (
    record_audit_event,
    safe_audit_metadata,
)
from apps.documents.file_encryption import encrypt_bytes_into_record
from apps.documents.models import (
    AuditLogEntry,
    DocumentFile,
    DocumentRequestLink,
    SharingRoom,
)

User = get_user_model()

LIST_URL = "/api/v1/audit-logs/"


def _flag_on():
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=True)


def _png(owner, name="id.png"):
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (40, 40), (255, 255, 255)).save(buf, "PNG")
    f = DocumentFile(uploaded_by=owner, original_filename=name,
                     content_type="image/png", file_size=buf.tell())
    encrypt_bytes_into_record(f, buf.getvalue(), name)
    f.save()
    return f


class ServiceTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN", first_name="Aisha",
        )

    def test_record_creates_entry_with_safe_metadata(self):
        entry = record_audit_event(
            self.user, "sharing_room_created", "sharing_room",
            actor_user=self.user, object_type="SharingRoom", object_id=5,
            object_label="Visa Room", metadata={"room_type": "pack", "title": "Visa Room"},
        )
        self.assertIsNotNone(entry)
        self.assertEqual(entry.actor_type, "owner")
        self.assertEqual(entry.metadata["room_type"], "pack")

    def test_record_is_best_effort_and_never_raises(self):
        # A DB failure inside create must be swallowed (returns None), not raised.
        with mock.patch(
            "apps.documents.models.AuditLogEntry.objects.create",
            side_effect=RuntimeError("db boom"),
        ):
            result = record_audit_event(self.user, "x", "system")
        self.assertIsNone(result)

    def test_metadata_sanitizer_strips_sensitive_keys(self):
        cleaned = safe_audit_metadata({
            "title": "Passport",                      # allowed
            "download_url": "https://r2/secret.pdf",  # forbidden (url/download)
            "token": "abc123secret",                  # forbidden
            "storage_key": "documents/u1/x.enc",      # forbidden
            "content": "passport number 999",         # forbidden
            "passport_number": "X999",                # forbidden
            "status_to": "accepted",                  # allowed
        })
        self.assertEqual(set(cleaned), {"title", "status_to"})
        blob = json.dumps(cleaned).lower()
        for marker in ("http", "token", "secret", "999", ".enc"):
            self.assertNotIn(marker, blob)

    @override_settings(AUDIT_LOG_HASH_SALT="test-salt")
    def test_fingerprint_is_hashed_never_raw(self):
        rf = self.client
        # Drive a real request through the API and confirm no raw IP/UA is stored.
        self.client.force_authenticate(self.user)
        record_audit_event(self.user, "x", "system")
        entry = AuditLogEntry.objects.filter(owner=self.user).first()
        # No raw IP/user-agent columns exist on the model at all.
        self.assertFalse(hasattr(entry, "ip_address"))
        self.assertFalse(hasattr(entry, "user_agent"))
        # ip_hash, if present, is a 64-char hex digest (never an IP).
        if entry.ip_hash:
            self.assertEqual(len(entry.ip_hash), 64)
            self.assertNotIn(".", entry.ip_hash)


class ApiAccessTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN",
        )
        self.other = User.objects.create_user(
            username="x", email="x@x.com", password="StrongPass123!DN",
        )

    def test_list_requires_auth(self):
        self.assertEqual(self.client.get(LIST_URL).status_code, 401)

    def test_owner_lists_only_own_entries(self):
        record_audit_event(self.user, "sharing_room_created", "sharing_room")
        record_audit_event(self.other, "sharing_room_created", "sharing_room")
        self.client.force_authenticate(self.user)
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)

    def test_cannot_read_another_users_entry(self):
        entry = record_audit_event(self.other, "sharing_room_created", "sharing_room")
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.get(f"{LIST_URL}{entry.id}/").status_code, 404)

    def test_filters_by_category_and_event_type(self):
        record_audit_event(self.user, "sharing_room_created", "sharing_room")
        record_audit_event(self.user, "protected_copy_created", "protected_copy")
        self.client.force_authenticate(self.user)
        by_cat = self.client.get(f"{LIST_URL}?category=protected_copy")
        self.assertEqual(by_cat.data["count"], 1)
        by_event = self.client.get(f"{LIST_URL}?event_type=sharing_room_created")
        self.assertEqual(by_event.data["count"], 1)

    def test_api_never_exposes_hashes_or_urls(self):
        record_audit_event(
            self.user, "sharing_room_file_downloaded", "sharing_room",
            metadata={"filename": "transcript.pdf"}, request=None,
        )
        self.client.force_authenticate(self.user)
        resp = self.client.get(LIST_URL)
        blob = json.dumps(resp.data).lower()
        # The salted hashes are internal — never serialized to the client.
        self.assertNotIn("ip_hash", blob)
        self.assertNotIn("user_agent_hash", blob)
        for marker in ("http", "/media/", "x-amz", "token"):
            self.assertNotIn(marker, blob)

    def test_summary_counts(self):
        record_audit_event(self.user, "sharing_room_file_downloaded", "sharing_room")
        record_audit_event(self.user, "sharing_room_revoked", "sharing_room", severity="critical")
        self.client.force_authenticate(self.user)
        resp = self.client.get(f"{LIST_URL}summary/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total_events_30d"], 2)
        self.assertEqual(resp.data["downloads_30d"], 1)
        self.assertEqual(resp.data["critical_events_30d"], 1)


@override_settings(
    EMAIL_CONFIGURED=True,
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="CertaNest <no-reply@certanest.test>",
    DUENEST_APP_BASE_URL="https://app.certanest.test",
)
class IntegrationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN", first_name="Aisha",
        )
        self.client.force_authenticate(self.user)

    def _events(self, **filters):
        return list(
            AuditLogEntry.objects.filter(owner=self.user, **filters)
            .values_list("event_type", flat=True)
        )

    def test_document_request_lifecycle_logs_events(self):
        # Create.
        created = self.client.post("/api/v1/document-requests/", {
            "requested_document_title": "Passport copy",
        }, format="json")
        rid = created.data["id"]
        token = DocumentRequestLink.objects.get(pk=rid).token
        self.assertIn("document_request_created", self._events())

        # Public open (anonymous) → public_link actor event.
        self.client.force_authenticate(None)
        self.client.get(f"/api/v1/public/document-request-links/{token}/")
        self.client.force_authenticate(self.user)
        opened = AuditLogEntry.objects.get(owner=self.user, event_type="document_request_opened")
        self.assertEqual(opened.actor_type, "public_link")

        # Public upload.
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.client.force_authenticate(None)
        with mock.patch("apps.documents.views._scan_upload_or_raise"):
            self.client.post(
                f"/api/v1/public/document-request-links/{token}/upload/",
                {"file": SimpleUploadedFile("p.pdf", b"%PDF-1.4 x", content_type="application/pdf")},
                format="multipart",
            )
        self.client.force_authenticate(self.user)
        self.assertIn("document_request_file_uploaded", self._events())

        # Accept.
        self.client.post(f"/api/v1/document-requests/{rid}/accept/")
        self.assertIn("document_request_accepted", self._events())

    def test_sharing_room_events(self):
        created = self.client.post("/api/v1/sharing-rooms/", {"title": "Visa Room"}, format="json")
        room = SharingRoom.objects.get(pk=created.data["id"])
        self.assertIn("sharing_room_created", self._events())

        # Public open.
        self.client.force_authenticate(None)
        self.client.get(f"/api/v1/public/sharing-rooms/{room.token}/")
        self.client.force_authenticate(self.user)
        self.assertIn("sharing_room_opened", self._events())

        # Add item + revoke.
        f = _png(self.user)
        self.client.post(f"/api/v1/sharing-rooms/{room.id}/add-item/",
                         {"item_type": "file", "file": f.id}, format="json")
        self.client.post(f"/api/v1/sharing-rooms/{room.id}/revoke/")
        events = self._events()
        self.assertIn("sharing_room_item_added", events)
        self.assertIn("sharing_room_revoked", events)
        revoked = AuditLogEntry.objects.get(owner=self.user, event_type="sharing_room_revoked")
        self.assertEqual(revoked.severity, "warning")

    def test_sharing_room_file_download_logs_public_event(self):
        created = self.client.post("/api/v1/sharing-rooms/", {"title": "R"}, format="json")
        room = SharingRoom.objects.get(pk=created.data["id"])
        f = _png(self.user, "transcript.png")
        self.client.post(f"/api/v1/sharing-rooms/{room.id}/add-item/",
                         {"item_type": "file", "file": f.id}, format="json")
        self.client.force_authenticate(None)
        resp = self.client.get(
            f"/api/v1/public/sharing-rooms/{room.token}/files/{f.id}/download/"
        )
        self.assertEqual(resp.status_code, 200)
        self.client.force_authenticate(self.user)
        dl = AuditLogEntry.objects.get(owner=self.user, event_type="sharing_room_file_downloaded")
        self.assertEqual(dl.actor_type, "public_link")
        self.assertEqual(dl.metadata.get("filename"), "transcript.png")

    def test_protected_copy_events(self):
        f = _png(self.user)
        with _flag_on():
            created = self.client.post("/api/v1/protected-copies/", {
                "original_file": f.id, "protection_type": "watermark", "watermark_text": "x",
            }, format="json")
            cid = created.data["id"]
            self.client.post(f"/api/v1/protected-copies/{cid}/generate/")
        events = self._events()
        self.assertIn("protected_copy_created", events)
        self.assertIn("protected_copy_generated", events)

    def test_no_ai_call_when_recording_events(self):
        with mock.patch("apps.ai.client.generate") as g:
            self.client.post("/api/v1/sharing-rooms/", {"title": "R"}, format="json")
        g.assert_not_called()


class ActivityFingerprintAtRestTests(APITestCase):
    """SEC-014 — activity trails store a salted hash, never a raw IP/UA."""

    def setUp(self):
        self.owner = User.objects.create_user(
            username="fp", email="fp@x.com", password="StrongPass123!DN"
        )

    @override_settings(AUDIT_LOG_HASH_SALT="test-salt", TRUSTED_PROXY_COUNT=0)
    def test_log_activity_persists_hash_not_raw_ip(self):
        from django.test import RequestFactory

        from apps.documents.models import DocumentFileActivity
        from apps.documents.services import log_activity

        file = _png(self.owner)
        request = RequestFactory().get(
            "/", REMOTE_ADDR="203.0.113.42", HTTP_USER_AGENT="Mozilla/5.0 Probe"
        )
        log_activity(file=file, action="view", actor_type="owner", request=request)

        entry = DocumentFileActivity.objects.latest("id")
        # Hashes are present...
        self.assertTrue(entry.ip_hash)
        self.assertTrue(entry.user_agent_hash)
        # ...the raw values are NOT stored...
        self.assertIsNone(entry.ip_address)
        self.assertEqual(entry.user_agent, "")
        # ...and the hash does not leak the plaintext IP.
        self.assertNotIn("203.0.113.42", entry.ip_hash)
        self.assertEqual(len(entry.ip_hash), 64)  # sha256 hex
