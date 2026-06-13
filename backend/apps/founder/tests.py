from datetime import timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentChecklist,
    DocumentExtraction,
    DocumentFile,
    DocumentFileActivity,
    DocumentFileShareLink,
    DocumentReminderRule,
)

from .models import AppErrorLog, FeedbackItem, ProductEvent


User = get_user_model()


class FounderConsoleAPITests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="member",
            email="member@example.com",
            password="StrongPassword123!DueNest",
        )
        self.founder = User.objects.create_user(
            username="founder",
            email="founder@example.com",
            password="StrongPassword123!DueNest",
            is_staff=True,
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_normal_users_cannot_access_founder_endpoints(self):
        self.authenticate(self.user)
        urls = [
            "/api/v1/founder/me/",
            "/api/v1/founder/dashboard/",
            "/api/v1/founder/activation-funnel/",
            "/api/v1/founder/feature-adoption/",
            "/api/v1/founder/feedback/",
            "/api/v1/founder/templates/checklists/",
            "/api/v1/founder/errors/",
            "/api/v1/founder/security-overview/",
            "/api/v1/founder/users/",
        ]

        for url in urls:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_founder_can_access_founder_dashboard(self):
        Document.objects.create(owner=self.user, title="Passport")

        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_users"], 2)
        self.assertEqual(response.data["total_documents"], 1)

    def test_dashboard_metrics_do_not_expose_sensitive_document_data(self):
        Document.objects.create(
            owner=self.user,
            title="Secret Passport Title",
            notes="private document notes",
            physical_location_details="home safe",
        )

        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        content = str(response.data)
        self.assertNotIn("Secret Passport Title", content)
        self.assertNotIn("private document notes", content)
        self.assertNotIn("home safe", content)

    def test_activation_funnel_calculates_from_real_data(self):
        document = Document.objects.create(
            owner=self.user,
            title="Passport",
            expiry_date=timezone.localdate(),
        )
        DocumentFile.objects.create(
            document=document,
            uploaded_by=self.user,
            file="documents/test-passport.pdf",
            original_filename="passport.pdf",
        )
        DocumentReminderRule.objects.create(owner=self.user, document=document)
        DocumentChecklist.objects.create(owner=self.user, document=document, title="Renewal")
        ProductEvent.objects.create(
            user=self.user,
            event_type=ProductEvent.EventType.ATTENTION_NEEDED_VIEWED,
        )
        DocumentFileShareLink.objects.create(
            owner=self.user,
            document=document,
            file=document.files.first(),
            expires_at=timezone.now() + timedelta(days=1),
        )

        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/activation-funnel/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        counts = {step["step_id"]: step["count"] for step in response.data["steps"]}
        self.assertEqual(counts["signed_up"], 2)
        self.assertEqual(counts["created_first_document"], 1)
        self.assertEqual(counts["uploaded_first_file"], 1)
        self.assertEqual(counts["added_expiry_or_renewal_date"], 1)
        self.assertEqual(counts["created_reminder"], 1)
        self.assertEqual(counts["created_checklist_or_bundle"], 1)
        self.assertEqual(counts["created_secure_share_link"], 1)

    def test_feature_adoption_endpoint_works(self):
        document = Document.objects.create(owner=self.user, title="Passport")
        file = DocumentFile.objects.create(
            document=document,
            uploaded_by=self.user,
            file="documents/test-passport.pdf",
            original_filename="passport.pdf",
        )
        DocumentFileActivity.objects.create(
            owner=self.user,
            document=document,
            file=file,
            action=DocumentFileActivity.Action.FILE_PREVIEWED,
            actor_type=DocumentFileActivity.ActorType.OWNER,
        )

        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/feature-adoption/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        feature_keys = {item["feature_key"] for item in response.data["features"]}
        self.assertIn("preview", feature_keys)
        self.assertEqual(response.data["preview_used_count"], 1)

    def test_feedback_submission_and_founder_update(self):
        self.authenticate(self.user)
        create_response = self.client.post(
            "/api/v1/feedback/",
            {
                "category": "bug",
                "title": "Upload confusion",
                "message": "I was not sure what happened after upload.",
                "related_feature": "documents",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        item = FeedbackItem.objects.get()
        self.authenticate(self.founder)
        update_response = self.client.patch(
            f"/api/v1/founder/feedback/{item.id}/",
            {
                "status": "planned",
                "priority": "high",
                "founder_notes": "Improve upload completion copy.",
            },
            format="json",
        )

        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertEqual(item.status, FeedbackItem.Status.PLANNED)
        self.assertEqual(item.priority, FeedbackItem.Priority.HIGH)

    def test_template_mutation_is_founder_only(self):
        payload = {
            "title": "Passport renewal beta",
            "description": "Checklist for renewal prep.",
            "checklist_type": "renewal",
            "is_system_template": True,
            "items": [
                {
                    "title": "Check expiry",
                    "description": "Confirm dates before starting.",
                    "is_required": True,
                    "sort_order": 1,
                }
            ],
        }

        self.authenticate(self.user)
        denied = self.client.post(
            "/api/v1/founder/templates/checklists/",
            payload,
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.authenticate(self.founder)
        created = self.client.post(
            "/api/v1/founder/templates/checklists/",
            payload,
            format="json",
        )

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["title"], "Passport renewal beta")
        self.assertEqual(len(created.data["items"]), 1)

    def test_error_logs_are_founder_only(self):
        self.authenticate(self.user)
        create_response = self.client.post(
            "/api/v1/errors/client/",
            {
                "severity": "error",
                "source": "frontend",
                "error_type": "UIError",
                "message": "Could not save view state",
                "path": "/dashboard/documents",
                "metadata": {"access_code": "123456", "component": "DocumentsPage"},
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(AppErrorLog.objects.get().metadata["access_code"], "[redacted]")

        denied = self.client.get("/api/v1/founder/errors/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/errors/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)

    def test_security_overview_is_founder_only(self):
        document = Document.objects.create(owner=self.user, title="Passport")
        file = DocumentFile.objects.create(
            document=document,
            uploaded_by=self.user,
            file="documents/test-passport.pdf",
            original_filename="passport.pdf",
        )
        DocumentFileActivity.objects.create(
            owner=self.user,
            document=document,
            file=file,
            action=DocumentFileActivity.Action.SHARE_CODE_FAILED,
            actor_type=DocumentFileActivity.ActorType.SHARED_VIEWER,
        )

        self.authenticate(self.user)
        denied = self.client.get("/api/v1/founder/security-overview/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/security-overview/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["wrong_share_code_attempts_24h"], 1)
        self.assertNotIn("ip_address", str(response.data))

    def test_user_support_summary_excludes_sensitive_vault_data(self):
        document = Document.objects.create(
            owner=self.user,
            title="Secret Visa Title",
            notes="private notes",
            physical_location_details="cabinet drawer",
        )
        file = DocumentFile.objects.create(
            document=document,
            uploaded_by=self.user,
            file="documents/secret-visa.pdf",
            original_filename="secret-visa.pdf",
        )
        DocumentExtraction.objects.create(
            owner=self.user,
            document=document,
            file=file,
            raw_text="raw OCR private text",
        )

        self.authenticate(self.founder)
        response = self.client.get(f"/api/v1/founder/users/{self.user.id}/summary/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        content = str(response.data)
        self.assertIn("documents", response.data["counts"])
        self.assertNotIn("Secret Visa Title", content)
        self.assertNotIn("secret-visa.pdf", content)
        self.assertNotIn("raw OCR private text", content)
        self.assertNotIn("cabinet drawer", content)

    def test_product_event_does_not_store_sensitive_values_in_document_flow(self):
        self.authenticate(self.user)
        response = self.client.post(
            "/api/v1/documents/",
            {
                "title": "Sensitive Passport",
                "notes": "private note",
                "physical_location_details": "home safe",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        event = ProductEvent.objects.get(event_type=ProductEvent.EventType.DOCUMENT_CREATED)
        self.assertEqual(event.object_type, "document")
        self.assertNotIn("Sensitive Passport", str(event.metadata))
        self.assertNotIn("private note", str(event.metadata))
        self.assertNotIn("home safe", str(event.metadata))
