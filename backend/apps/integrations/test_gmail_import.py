"""
Gmail Import V1 — tests.

No real Gmail API is ever called: the provider's Gmail methods
(``search_gmail_messages`` / ``get_gmail_message`` / ``download_gmail_attachment``)
are mocked. Focus: auth/ownership, safe metadata (NO body/snippet/tokens),
type/size validation, dedup (idempotency), encrypted storage reuse, per-attachment
isolation, and no secrets/body/content in audit or operational metadata.
"""

from __future__ import annotations

import base64
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import Document, DocumentFile, DocumentFolder
from apps.features.models import FeatureFlag, Visibility

from .models import (
    ConnectedIntegrationAccount,
    ImportedGmailAttachment,
    Provider,
)
from .providers.base import get_provider

User = get_user_model()

GOOGLE_CONFIG = dict(
    GOOGLE_OAUTH_CLIENT_ID="test-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET="test-client-secret",
    GOOGLE_OAUTH_REDIRECT_URI="https://api.test/integrations/google/callback/",
    FRONTEND_APP_URL="https://app.test",
)

VALID_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)
ACCESS_TOKEN = "ya29.FAKE_GMAIL_ACCESS_TOKEN"
SECRET_SUBJECT = "SENSITIVE SUBJECT LINE"
SECRET_BODY = "BASE64_BODY_SHOULD_NEVER_LEAK"


def _raw_msg(msg_id, atts):
    """atts: list of (attachment_id, filename, mime, size)."""
    parts = [
        {"filename": f, "mimeType": m, "body": {"attachmentId": a, "size": str(s)}}
        for (a, f, m, s) in atts
    ]
    # A non-attachment body part — must be ignored, never surfaced.
    parts.append({"filename": "", "mimeType": "text/plain", "body": {"data": SECRET_BODY, "size": "10"}})
    return {
        "id": msg_id,
        "threadId": f"t{msg_id}",
        "snippet": SECRET_BODY,
        "payload": {
            "headers": [
                {"name": "From", "value": "Jane Doe <jane@x.com>"},
                {"name": "Subject", "value": SECRET_SUBJECT},
                {"name": "Date", "value": "Mon, 1 Jan 2026"},
            ],
            "parts": parts,
        },
    }


def _enable_flags():
    for key in ("integrations", "google_integrations", "gmail_import"):
        FeatureFlag.objects.update_or_create(key=key, defaults={"visibility": Visibility.ENABLED})


@override_settings(**GOOGLE_CONFIG)
class GmailBaseTest(APITestCase):
    def setUp(self):
        _enable_flags()
        self.user = User.objects.create_user(username="alice", email="a@x.com", password="StrongPassword123!DN")
        self.other = User.objects.create_user(username="bob", email="b@x.com", password="StrongPassword123!DN")
        self.account = self._make_account(self.user)
        self.other_account = self._make_account(self.other)
        self.client.force_authenticate(self.user)

    def _make_account(self, user):
        acct = ConnectedIntegrationAccount.objects.create(
            user=user, provider=Provider.GOOGLE, provider_account_id=f"sub-{user.id}",
            status=ConnectedIntegrationAccount.Status.CONNECTED,
            token_expires_at=timezone.now() + timedelta(hours=1),
        )
        acct.set_tokens(access_token=ACCESS_TOKEN, refresh_token="refresh")
        acct.save()
        return acct

    def _provider(self):
        return get_provider("google")


class GmailSearchTests(GmailBaseTest):
    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        resp = self.client.get(f"/api/v1/integrations/gmail/messages/?account_id={self.account.id}")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_requires_connected_account(self):
        resp = self.client.get("/api/v1/integrations/gmail/messages/?account_id=999999")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_use_another_users_account(self):
        resp = self.client.get(f"/api/v1/integrations/gmail/messages/?account_id={self.other_account.id}")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    @override_settings(GOOGLE_OAUTH_CLIENT_SECRET="")
    def test_provider_not_configured(self):
        resp = self.client.get(f"/api/v1/integrations/gmail/messages/?account_id={self.account.id}")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["status"], "not_configured")

    def test_search_returns_safe_metadata_only(self):
        prov = self._provider()
        with patch.object(prov, "search_gmail_messages",
                          return_value={"message_ids": ["m1"], "next_page_token": "next"}), \
                patch.object(prov, "get_gmail_message",
                             return_value=_raw_msg("m1", [("att1", "Transcript.pdf", "application/pdf", 2048)])):
            resp = self.client.get(f"/api/v1/integrations/gmail/messages/?account_id={self.account.id}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        msg = resp.data["messages"][0]
        self.assertEqual(msg["from_email"], "jane@x.com")
        self.assertEqual(msg["attachment_count"], 1)
        self.assertEqual(msg["attachments"][0]["filename"], "Transcript.pdf")
        # Body / snippet / tokens NEVER surface.
        blob = str(resp.data)
        self.assertNotIn(SECRET_BODY, blob)
        self.assertNotIn(ACCESS_TOKEN, blob)
        self.assertNotIn("snippet", msg)
        self.assertNotIn("data", msg["attachments"][0])


@override_settings(**GOOGLE_CONFIG)
class GmailImportTests(GmailBaseTest):
    def _import(self, attachments, destination, force=False):
        return self.client.post(
            "/api/v1/integrations/gmail/import/",
            {"account_id": self.account.id, "attachments": attachments,
             "destination": destination, "force": force},
            format="json",
        )

    def _ref(self, msg_id="m1", att_id="att1", filename="photo.png", mime="image/png"):
        return {"provider_message_id": msg_id, "provider_attachment_id": att_id,
                "filename": filename, "mime_type": mime}

    def test_attachment_listing_returns_safe_metadata(self):
        prov = self._provider()
        with patch.object(prov, "get_gmail_message",
                          return_value=_raw_msg("m1", [("att1", "a.pdf", "application/pdf", 2048)])):
            resp = self.client.get(
                f"/api/v1/integrations/gmail/messages/m1/attachments/?account_id={self.account.id}"
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["attachments"][0]["provider_attachment_id"], "att1")
        self.assertNotIn(SECRET_BODY, str(resp.data))

    def test_preview_validates_and_flags_duplicates(self):
        # Pre-mark att1 as already imported.
        from .gmail_import import _hash_id
        ImportedGmailAttachment.objects.create(
            user=self.user, account=self.account,
            provider_message_id_hash=_hash_id("m1"),
            provider_attachment_id_hash=_hash_id("att1"),
        )
        resp = self.client.post(
            "/api/v1/integrations/gmail/import/preview/",
            {
                "account_id": self.account.id,
                "attachments": [
                    self._ref("m1", "att1", "dupe.pdf", "application/pdf"),
                    self._ref("m2", "att2", "ok.pdf", "application/pdf"),
                    self._ref("m3", "att3", "big.zip", "application/zip"),
                ],
                "destination": {"type": "file_inbox"},
            },
            format="json",
        )
        by_id = {r["provider_attachment_id"]: r for r in resp.data["results"]}
        self.assertEqual(by_id["att1"]["reason"], "already_imported")
        self.assertEqual(by_id["att2"]["status"], "will_import")
        self.assertEqual(by_id["att3"]["reason"], "unsupported_type")

    def test_import_succeeds_and_stores_encrypted(self):
        prov = self._provider()
        with patch.object(prov, "get_gmail_message",
                          return_value=_raw_msg("m1", [("att1", "photo.png", "image/png", len(VALID_PNG))])), \
                patch.object(prov, "download_gmail_attachment", return_value=VALID_PNG):
            resp = self._import([self._ref()], {"type": "file_inbox"})
        self.assertEqual(resp.data["imported_count"], 1)
        df = DocumentFile.objects.get(uploaded_by=self.user)
        self.assertIsNone(df.document_id)
        self.assertEqual(df.encryption_status, DocumentFile.EncryptionStatus.ENCRYPTED)
        df.file.seek(0)
        self.assertNotEqual(df.file.read(), VALID_PNG)
        # Idempotency row written with safe metadata only.
        rec = ImportedGmailAttachment.objects.get(user=self.user)
        self.assertEqual(rec.sanitized_metadata.get("mime_type"), "image/png")
        self.assertNotIn(SECRET_SUBJECT, str(rec.sanitized_metadata))

    def test_import_skips_duplicate_by_default(self):
        prov = self._provider()
        with patch.object(prov, "get_gmail_message",
                          return_value=_raw_msg("m1", [("att1", "photo.png", "image/png", len(VALID_PNG))])), \
                patch.object(prov, "download_gmail_attachment", return_value=VALID_PNG):
            first = self._import([self._ref()], {"type": "file_inbox"})
            second = self._import([self._ref()], {"type": "file_inbox"})
        self.assertEqual(first.data["imported_count"], 1)
        self.assertEqual(second.data["skipped_count"], 1)
        self.assertEqual(second.data["results"][0]["reason"], "already_imported")
        self.assertEqual(DocumentFile.objects.filter(uploaded_by=self.user).count(), 1)

    def test_import_fails_for_unsupported_type(self):
        prov = self._provider()
        with patch.object(prov, "get_gmail_message",
                          return_value=_raw_msg("m1", [("att1", "a.zip", "application/zip", 100)])), \
                patch.object(prov, "download_gmail_attachment") as dl:
            resp = self._import([self._ref("m1", "att1", "a.zip", "application/zip")], {"type": "file_inbox"})
        self.assertEqual(resp.data["failed_count"], 1)
        self.assertEqual(resp.data["results"][0]["reason"], "unsupported_type")
        dl.assert_not_called()

    def test_partial_import(self):
        prov = self._provider()
        raw = _raw_msg("m1", [
            ("att1", "photo.png", "image/png", len(VALID_PNG)),
            ("att2", "movie.mp4", "video/mp4", 1024),
        ])
        with patch.object(prov, "get_gmail_message", return_value=raw), \
                patch.object(prov, "download_gmail_attachment", return_value=VALID_PNG):
            resp = self._import(
                [self._ref("m1", "att1", "photo.png", "image/png"),
                 self._ref("m1", "att2", "movie.mp4", "video/mp4")],
                {"type": "file_inbox"},
            )
        self.assertEqual(resp.data["imported_count"], 1)
        self.assertEqual(resp.data["failed_count"], 1)

    def test_folder_destination_assigns_folder(self):
        folder = DocumentFolder.objects.create(owner=self.user, name="Visa")
        prov = self._provider()
        with patch.object(prov, "get_gmail_message",
                          return_value=_raw_msg("m1", [("att1", "photo.png", "image/png", len(VALID_PNG))])), \
                patch.object(prov, "download_gmail_attachment", return_value=VALID_PNG):
            self._import([self._ref()], {"type": "folder", "folder_id": folder.id})
        self.assertEqual(Document.objects.get(owner=self.user).primary_folder_id, folder.id)

    def test_respects_plan_limit(self):
        from apps.documents.plan_usage import PlanLimitExceeded

        prov = self._provider()
        with patch.object(prov, "get_gmail_message",
                          return_value=_raw_msg("m1", [("att1", "photo.png", "image/png", len(VALID_PNG))])), \
                patch.object(prov, "download_gmail_attachment", return_value=VALID_PNG), \
                patch("apps.integrations.gmail_import.enforce_plan_limit",
                      side_effect=PlanLimitExceeded(resource="files", limit=0, plan="free")):
            resp = self._import([self._ref()], {"type": "file_inbox"})
        self.assertEqual(resp.data["results"][0]["reason"], "limit_reached")
        self.assertFalse(DocumentFile.objects.filter(uploaded_by=self.user).exists())

    def test_audit_and_operational_have_no_secrets(self):
        from apps.documents.models import AuditLogEntry
        from apps.founder.models import OperationalEvent

        prov = self._provider()
        with patch.object(prov, "get_gmail_message",
                          return_value=_raw_msg("m1", [("att1", "photo.png", "image/png", len(VALID_PNG))])), \
                patch.object(prov, "download_gmail_attachment", return_value=VALID_PNG):
            self._import([self._ref()], {"type": "file_inbox"})
        self.assertTrue(AuditLogEntry.objects.filter(owner=self.user, event_type="gmail_attachment_imported").exists())
        self.assertTrue(OperationalEvent.objects.filter(source="gmail_import").exists())
        for entry in AuditLogEntry.objects.filter(owner=self.user):
            blob = " ".join(str(v) for v in (entry.metadata or {}).values())
            self.assertNotIn(ACCESS_TOKEN, blob)
            self.assertNotIn(SECRET_SUBJECT, blob)
            self.assertNotIn(SECRET_BODY, blob)
            self.assertNotIn("gmail.googleapis.com", blob)
        for ev in OperationalEvent.objects.filter(source="gmail_import"):
            blob = " ".join(str(v) for v in (ev.metadata or {}).values())
            self.assertNotIn(ACCESS_TOKEN, blob)
            self.assertNotIn(SECRET_SUBJECT, blob)


class GmailFlagGateTests(GmailBaseTest):
    def test_gmail_flag_disabled_blocks(self):
        FeatureFlag.objects.update_or_create(key="gmail_import", defaults={"visibility": Visibility.DISABLED})
        resp = self.client.get(f"/api/v1/integrations/gmail/messages/?account_id={self.account.id}")
        self.assertEqual(resp.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(resp.data["feature"], "gmail_import")
