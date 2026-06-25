"""
Google Drive Import V1 — tests.

No real Google API is ever called: the Google provider's Drive methods
(``list_drive_files`` / ``get_drive_file_metadata`` / ``download_drive_file``) are
mocked. The focus is the security + correctness contract: auth/ownership, type/size
validation, encrypted storage reuse, per-file isolation, destination scope, plan
limits, and that no token / download URL / file content leaks into responses or
audit/operational metadata.
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

from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentFile,
    DocumentFolder,
)
from apps.features.models import FeatureFlag, Visibility

from .models import ConnectedIntegrationAccount, Provider
from .providers.base import ProviderProfile, get_provider

User = get_user_model()

GOOGLE_CONFIG = dict(
    GOOGLE_OAUTH_CLIENT_ID="test-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET="test-client-secret",
    GOOGLE_OAUTH_REDIRECT_URI="https://api.test/integrations/google/callback/",
    FRONTEND_APP_URL="https://app.test",
)

# A genuinely valid 1x1 PNG so the real structure validation (PIL) accepts it.
VALID_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)

ACCESS_TOKEN = "ya29.FAKE_DRIVE_ACCESS_TOKEN"


def _meta(file_id, name, mime, size):
    return {"id": file_id, "name": name, "mimeType": mime, "size": size,
            "modifiedTime": "2026-01-01T00:00:00Z", "trashed": False}


def _enable_flags():
    for key in ("integrations", "google_integrations", "google_drive_import"):
        FeatureFlag.objects.update_or_create(key=key, defaults={"visibility": Visibility.ENABLED})


@override_settings(**GOOGLE_CONFIG)
class DriveImportBaseTest(APITestCase):
    def setUp(self):
        _enable_flags()
        self.user = User.objects.create_user(
            username="alice", email="a@x.com", password="StrongPassword123!DN"
        )
        self.other = User.objects.create_user(
            username="bob", email="b@x.com", password="StrongPassword123!DN"
        )
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


class DriveListTests(DriveImportBaseTest):
    def test_requires_authentication(self):
        self.client.force_authenticate(None)
        resp = self.client.get(f"/api/v1/integrations/google-drive/files/?account_id={self.account.id}")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_requires_connected_account(self):
        resp = self.client.get("/api/v1/integrations/google-drive/files/?account_id=999999")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_use_another_users_account(self):
        resp = self.client.get(
            f"/api/v1/integrations/google-drive/files/?account_id={self.other_account.id}"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    @override_settings(GOOGLE_OAUTH_CLIENT_SECRET="")
    def test_provider_not_configured_returns_safe_error(self):
        resp = self.client.get(f"/api/v1/integrations/google-drive/files/?account_id={self.account.id}")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["status"], "not_configured")

    def test_listing_returns_safe_metadata_only(self):
        raw = {"files": [_meta("f1", "Transcript.pdf", "application/pdf", "1024")],
               "nextPageToken": "next"}
        with patch.object(self._provider(), "_drive_get", return_value=raw):
            resp = self.client.get(
                f"/api/v1/integrations/google-drive/files/?account_id={self.account.id}"
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        f = resp.data["files"][0]
        self.assertEqual(f["provider_file_id"], "f1")
        self.assertEqual(f["type_label"], "PDF")
        # No tokens, URLs, permissions, or raw API fields are surfaced.
        for forbidden in ("access_token", "token", "web_view_link", "webViewLink",
                          "iconLink", "download_url", "permissions"):
            self.assertNotIn(forbidden, f)


@override_settings(**GOOGLE_CONFIG)
class DriveImportTests(DriveImportBaseTest):
    def _import(self, files, destination):
        return self.client.post(
            "/api/v1/integrations/google-drive/import/",
            {"account_id": self.account.id, "files": files, "destination": destination},
            format="json",
        )

    def _mock_provider(self, meta_by_id, content=VALID_PNG):
        prov = self._provider()
        return (
            patch.object(prov, "get_drive_file_metadata",
                         side_effect=lambda *, access_token, file_id: meta_by_id[file_id]),
            patch.object(prov, "download_drive_file",
                         return_value=content),
        )

    def test_import_preview_validates_types_and_sizes(self):
        resp = self.client.post(
            "/api/v1/integrations/google-drive/import/preview/",
            {
                "account_id": self.account.id,
                "files": [
                    {"provider_file_id": "ok", "name": "a.pdf", "mime_type": "application/pdf", "size": 1024},
                    {"provider_file_id": "big", "name": "b.pdf", "mime_type": "application/pdf", "size": 99 * 1024 * 1024},
                    {"provider_file_id": "vid", "name": "c.mp4", "mime_type": "video/mp4", "size": 10},
                ],
                "destination": {"type": "file_inbox"},
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        by_id = {r["provider_file_id"]: r for r in resp.data["results"]}
        self.assertEqual(by_id["ok"]["status"], "will_import")
        self.assertEqual(by_id["big"]["reason"], "too_large")
        self.assertEqual(by_id["vid"]["reason"], "unsupported_type")

    def test_import_succeeds_for_supported_image_into_file_inbox(self):
        meta = {"img": _meta("img", "photo.png", "image/png", str(len(VALID_PNG)))}
        m1, m2 = self._mock_provider(meta)
        with m1, m2:
            resp = self._import(
                [{"provider_file_id": "img", "name": "photo.png", "mime_type": "image/png"}],
                {"type": "file_inbox"},
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["imported_count"], 1)
        self.assertEqual(resp.data["results"][0]["status"], "imported")
        # Stored as an encrypted, owner-scoped File Inbox file (no parent Document).
        df = DocumentFile.objects.get(uploaded_by=self.user)
        self.assertIsNone(df.document_id)
        self.assertEqual(df.encryption_status, DocumentFile.EncryptionStatus.ENCRYPTED)
        self.assertTrue(df.wrapped_dek)
        # Ciphertext on disk is not the plaintext PNG.
        df.file.seek(0)
        self.assertNotEqual(df.file.read(), VALID_PNG)

    def test_import_fails_gracefully_for_unsupported_type(self):
        meta = {"vid": _meta("vid", "movie.mp4", "video/mp4", "1024")}
        with patch.object(self._provider(), "get_drive_file_metadata",
                          side_effect=lambda *, access_token, file_id: meta[file_id]), \
                patch.object(self._provider(), "download_drive_file") as dl:
            resp = self._import(
                [{"provider_file_id": "vid", "name": "movie.mp4", "mime_type": "video/mp4"}],
                {"type": "file_inbox"},
            )
        self.assertEqual(resp.data["failed_count"], 1)
        self.assertEqual(resp.data["results"][0]["reason"], "unsupported_type")
        # Unsupported file is never downloaded.
        dl.assert_not_called()
        self.assertFalse(DocumentFile.objects.filter(uploaded_by=self.user).exists())

    def test_partial_import_returns_per_file_results(self):
        meta = {
            "img": _meta("img", "photo.png", "image/png", str(len(VALID_PNG))),
            "vid": _meta("vid", "movie.mp4", "video/mp4", "1024"),
        }
        m1, m2 = self._mock_provider(meta)
        with m1, m2:
            resp = self._import(
                [
                    {"provider_file_id": "img", "name": "photo.png", "mime_type": "image/png"},
                    {"provider_file_id": "vid", "name": "movie.mp4", "mime_type": "video/mp4"},
                ],
                {"type": "file_inbox"},
            )
        self.assertEqual(resp.data["imported_count"], 1)
        self.assertEqual(resp.data["failed_count"], 1)
        self.assertEqual(resp.data["status"], "completed")

    def test_folder_destination_assigns_primary_folder(self):
        folder = DocumentFolder.objects.create(owner=self.user, name="Visa")
        meta = {"img": _meta("img", "photo.png", "image/png", str(len(VALID_PNG)))}
        m1, m2 = self._mock_provider(meta)
        with m1, m2:
            self._import(
                [{"provider_file_id": "img", "name": "photo.png", "mime_type": "image/png"}],
                {"type": "folder", "folder_id": folder.id},
            )
        doc = Document.objects.get(owner=self.user)
        self.assertEqual(doc.primary_folder_id, folder.id)

    def test_pack_destination_attaches_requirement(self):
        bundle = DocumentBundle.objects.create(owner=self.user, title="Scholarship")
        meta = {"img": _meta("img", "photo.png", "image/png", str(len(VALID_PNG)))}
        m1, m2 = self._mock_provider(meta)
        with m1, m2:
            self._import(
                [{"provider_file_id": "img", "name": "photo.png", "mime_type": "image/png"}],
                {"type": "pack", "pack_id": bundle.id},
            )
        req = DocumentBundleRequirement.objects.get(bundle=bundle)
        self.assertEqual(req.status, DocumentBundleRequirement.Status.ATTACHED)
        self.assertIsNotNone(req.linked_file_id)

    def test_folder_destination_must_be_owned(self):
        others_folder = DocumentFolder.objects.create(owner=self.other, name="Theirs")
        resp = self._import(
            [{"provider_file_id": "img", "name": "photo.png", "mime_type": "image/png"}],
            {"type": "folder", "folder_id": others_folder.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["status"], "invalid_destination")

    def test_org_destination_is_deferred(self):
        resp = self._import(
            [{"provider_file_id": "img", "name": "photo.png", "mime_type": "image/png"}],
            {"type": "org_case"},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["status"], "destination_not_supported")

    def test_respects_plan_limit(self):
        from apps.documents.plan_usage import PlanLimitExceeded

        meta = {"img": _meta("img", "photo.png", "image/png", str(len(VALID_PNG)))}
        m1, m2 = self._mock_provider(meta)
        with m1, m2, patch(
            "apps.integrations.drive_import.enforce_plan_limit",
            side_effect=PlanLimitExceeded(resource="files", limit=0, plan="free"),
        ):
            resp = self._import(
                [{"provider_file_id": "img", "name": "photo.png", "mime_type": "image/png"}],
                {"type": "file_inbox"},
            )
        self.assertEqual(resp.data["results"][0]["reason"], "limit_reached")
        self.assertFalse(DocumentFile.objects.filter(uploaded_by=self.user).exists())

    def test_audit_and_operational_metadata_have_no_secrets(self):
        from apps.documents.models import AuditLogEntry
        from apps.founder.models import OperationalEvent

        meta = {"img": _meta("img", "photo.png", "image/png", str(len(VALID_PNG)))}
        m1, m2 = self._mock_provider(meta)
        with m1, m2:
            self._import(
                [{"provider_file_id": "img", "name": "photo.png", "mime_type": "image/png"}],
                {"type": "file_inbox"},
            )
        # Drive import events were recorded.
        self.assertTrue(
            AuditLogEntry.objects.filter(owner=self.user, event_type="google_drive_file_imported").exists()
        )
        self.assertTrue(
            OperationalEvent.objects.filter(source="google_drive_import").exists()
        )
        for entry in AuditLogEntry.objects.filter(owner=self.user):
            blob = " ".join(str(v) for v in (entry.metadata or {}).values())
            self.assertNotIn(ACCESS_TOKEN, blob)
            self.assertNotIn("FAKE_DRIVE", blob)
            self.assertNotIn("googleapis.com", blob)
            self.assertEqual(set(entry.metadata or {}) & {"access_token", "refresh_token", "download_url"}, set())
        for ev in OperationalEvent.objects.filter(source="google_drive_import"):
            blob = " ".join(str(v) for v in (ev.metadata or {}).values())
            self.assertNotIn(ACCESS_TOKEN, blob)
            self.assertNotIn("googleapis.com", blob)


class DriveFlagGateTests(DriveImportBaseTest):
    def test_drive_flag_disabled_blocks_endpoints(self):
        FeatureFlag.objects.update_or_create(
            key="google_drive_import", defaults={"visibility": Visibility.DISABLED}
        )
        resp = self.client.get(
            f"/api/v1/integrations/google-drive/files/?account_id={self.account.id}"
        )
        self.assertEqual(resp.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(resp.data["feature"], "google_drive_import")
