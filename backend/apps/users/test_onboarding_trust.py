import json
import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import (
    Document,
    DocumentChecklist,
    DocumentFile,
    DocumentFileShareLink,
    DocumentReminderRule,
)

from .models import AccountDeletionRequest, UserOnboardingState
from .services import DEMO_MARKER

User = get_user_model()
_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-onboarding-test-")


def future():
    return timezone.now() + timedelta(days=7)


def make_file(document, user):
    content = b"%PDF-1.4\n% DueNest test file\n"
    return DocumentFile.objects.create(
        document=document,
        uploaded_by=user,
        file=ContentFile(content, name="test.pdf"),
        original_filename="test.pdf",
        content_type="application/pdf",
        file_size=len(content),
    )


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class OnboardingTrustAPITests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice",
            email="alice@example.com",
            password="StrongPassword123!DueNest",
        )
        self.bob = User.objects.create_user(
            username="bob",
            email="bob@example.com",
            password="StrongPassword123!DueNest",
        )

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def read_stream(self, response):
        if getattr(response, "streaming", False):
            content = b"".join(response.streaming_content)
            response.close()
            return content
        return response.content

    def test_onboarding_state_is_owner_scoped(self):
        self.auth(self.alice)
        response = self.client.get("/api/v1/onboarding/state/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["user"], self.alice.id)
        self.assertFalse(response.data["has_completed_document_onboarding"])

        updated = self.client.patch(
            "/api/v1/onboarding/state/",
            {
                "has_completed_document_onboarding": True,
                "metadata": {"trust_center_reviewed_at": "2026-06-13T00:00:00Z"},
            },
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertTrue(updated.data["has_completed_document_onboarding"])

        self.auth(self.bob)
        bob_state = self.client.get("/api/v1/onboarding/state/")
        self.assertEqual(bob_state.status_code, status.HTTP_200_OK)
        self.assertEqual(bob_state.data["user"], self.bob.id)
        self.assertFalse(bob_state.data["has_completed_document_onboarding"])
        self.assertEqual(bob_state.data["metadata"], {})

    def test_setup_checklist_is_computed_from_real_owner_data(self):
        document = Document.objects.create(
            owner=self.alice,
            title="Alice Passport",
            document_type="passport",
            expiry_date=timezone.localdate() + timedelta(days=120),
        )
        file = make_file(document, self.alice)
        DocumentReminderRule.objects.create(
            owner=self.alice,
            document=document,
            trigger_type=DocumentReminderRule.TriggerType.BEFORE_EXPIRY,
            days_before=30,
        )
        DocumentChecklist.objects.create(
            owner=self.alice,
            document=document,
            title="Passport renewal",
        )
        DocumentFileShareLink.objects.create(
            owner=self.alice,
            document=document,
            file=file,
            expires_at=future(),
        )
        Document.objects.create(owner=self.bob, title="Bob Passport")

        self.auth(self.alice)
        self.client.post("/api/v1/onboarding/attention-reviewed/")
        self.client.post("/api/v1/onboarding/trust-reviewed/")
        response = self.client.get("/api/v1/onboarding/document-setup-checklist/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        steps = {step["key"]: step for step in response.data["steps"]}
        self.assertEqual(response.data["counts"]["documents"], 1)
        self.assertTrue(steps["create_first_document"]["completed"])
        self.assertTrue(steps["upload_first_file"]["completed"])
        self.assertTrue(steps["add_expiry_or_renewal"]["completed"])
        self.assertTrue(steps["create_reminder"]["completed"])
        self.assertTrue(steps["create_renewal_checklist"]["completed"])
        self.assertTrue(steps["try_secure_sharing"]["completed"])
        self.assertTrue(steps["review_trust_center"]["completed"])

    def test_document_flows_mark_onboarding_progress(self):
        self.auth(self.alice)
        created = self.client.post(
            "/api/v1/documents/",
            {
                "title": "Passport",
                "expiry_date": (
                    timezone.localdate() + timedelta(days=120)
                ).isoformat(),
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)

        state = UserOnboardingState.objects.get(user=self.alice)
        self.assertIsNotNone(state.first_document_created_at)
        self.assertIsNotNone(state.first_expiry_date_added_at)

    def test_demo_data_is_labeled_and_clear_is_owner_scoped(self):
        Document.objects.create(
            owner=self.bob,
            title="[Demo] Bob record",
            notes=f"Other user {DEMO_MARKER}",
        )
        self.auth(self.alice)

        created = self.client.post("/api/v1/demo/create-document-demo-data/")
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        alice_demo_docs = Document.objects.filter(
            owner=self.alice,
            notes__contains=DEMO_MARKER,
        )
        self.assertEqual(alice_demo_docs.count(), 3)
        self.assertTrue(all(doc.title.startswith("[Demo]") for doc in alice_demo_docs))

        cleared = self.client.delete("/api/v1/demo/clear-document-demo-data/")
        self.assertEqual(cleared.status_code, status.HTTP_200_OK)
        self.assertFalse(
            Document.objects.filter(
                owner=self.alice,
                notes__contains=DEMO_MARKER,
            ).exists()
        )
        self.assertTrue(
            Document.objects.filter(owner=self.bob, notes__contains=DEMO_MARKER).exists()
        )

    def test_data_summary_and_deletion_request_are_owner_scoped(self):
        Document.objects.create(owner=self.alice, title="Alice Passport")
        Document.objects.create(owner=self.bob, title="Bob Passport")

        self.auth(self.alice)
        summary = self.client.get("/api/v1/account/data-summary/")
        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertEqual(summary.data["counts"]["documents"], 1)

        deletion = self.client.post(
            "/api/v1/account/request-account-deletion/",
            {"reason": "Testing controls"},
            format="json",
        )
        self.assertEqual(deletion.status_code, status.HTTP_201_CREATED)
        self.assertEqual(deletion.data["status"], AccountDeletionRequest.Status.REQUESTED)
        self.assertTrue(deletion.data["can_cancel"])

        self.auth(self.bob)
        bob_summary = self.client.get("/api/v1/account/data-summary/")
        self.assertIsNone(bob_summary.data["active_deletion_request"])

        self.auth(self.alice)
        cancelled = self.client.post("/api/v1/account/cancel-account-deletion/")
        self.assertEqual(cancelled.status_code, status.HTTP_200_OK)
        self.assertEqual(cancelled.data["status"], AccountDeletionRequest.Status.CANCELLED)

    def test_trust_summary_exposes_no_sensitive_values(self):
        self.auth(self.alice)
        response = self.client.get("/api/v1/trust/security-summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = json.dumps(response.data)
        self.assertNotIn("access_code_hash", body)
        self.assertNotIn("SECRET_KEY", body)
        self.assertNotIn("password", body.lower())
        self.assertTrue(response.data["capabilities"])

    def test_account_export_is_owner_scoped_and_secret_free(self):
        Document.objects.create(owner=self.alice, title="Alice Passport")
        Document.objects.create(owner=self.bob, title="Bob Passport")

        self.auth(self.alice)
        response = self.client.post("/api/v1/account/request-data-export/")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], "completed")
        self.assertTrue(response.data["download_url"])

        downloaded = self.client.get(response.data["download_url"])
        self.assertEqual(downloaded.status_code, status.HTTP_200_OK)
        payload = json.loads(self.read_stream(downloaded).decode("utf-8"))
        body = json.dumps(payload)
        self.assertIn("Alice Passport", body)
        self.assertNotIn("Bob Passport", body)
        self.assertNotIn("access_code_hash", body)
