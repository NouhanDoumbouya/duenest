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

from .models import (
    AppErrorLog,
    BetaUserProfile,
    FeatureCompletionItem,
    FeedbackItem,
    FounderAuditLog,
    InviteCode,
    InviteCodeUse,
    LaunchChecklistItem,
    ProductEvent,
    WaitlistEntry,
)
from .services import track_product_event


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
            "/api/v1/founder/analytics/",
            "/api/v1/founder/activation-funnel/",
            "/api/v1/founder/feature-adoption/",
            "/api/v1/founder/feature-completion/",
            "/api/v1/founder/feedback/",
            "/api/v1/founder/templates/checklists/",
            "/api/v1/founder/errors/",
            "/api/v1/founder/security-overview/",
            "/api/v1/founder/audit-logs/",
            "/api/v1/founder/users/",
            "/api/v1/founder/beta-users/",
            "/api/v1/founder/launch-readiness/",
            "/api/v1/founder/country-activity/",
            "/api/v1/founder/private-beta/",
            "/api/v1/founder/waitlist/",
            "/api/v1/founder/invites/",
        ]

        for url in urls:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_public_waitlist_submission_and_duplicate_protection(self):
        response = self.client.post(
            "/api/v1/waitlist/",
            {
                "full_name": "Amina Student",
                "email": "Amina@example.com",
                "persona": "international_student",
                "country": "Malaysia",
                "message": "I need help tracking visa documents.",
                "referral_source": "campus",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        entry = WaitlistEntry.objects.get()
        self.assertEqual(entry.email, "amina@example.com")
        self.assertEqual(entry.status, WaitlistEntry.Status.PENDING)
        self.assertNotIn("founder_notes", response.data)
        self.assertTrue(
            ProductEvent.objects.filter(
                event_type=ProductEvent.EventType.WAITLIST_JOINED
            ).exists()
        )

        duplicate = self.client.post(
            "/api/v1/waitlist/",
            {
                "full_name": "Amina Student",
                "email": "amina@example.com",
                "persona": "international_student",
            },
            format="json",
        )

        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invite_validate_endpoint_is_public_but_limited_to_code_health(self):
        invite = InviteCode.objects.create(
            code="DN-PUBLIC-123",
            label="Public validation test",
            max_uses=3,
        )

        response = self.client.post(
            "/api/v1/invites/validate/",
            {"code": "dn-public-123"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["valid"])
        self.assertEqual(response.data["remaining_uses"], 3)
        self.assertNotIn("notes", response.data)
        self.assertTrue(
            ProductEvent.objects.filter(
                event_type=ProductEvent.EventType.INVITE_VALIDATED,
                object_id=str(invite.id),
            ).exists()
        )

    def test_public_invite_validation_rejects_disabled_code(self):
        InviteCode.objects.create(
            code="DN-DISABLED",
            label="Disabled",
            is_active=False,
        )

        response = self.client.post(
            "/api/v1/invites/validate/",
            {"code": "DN-DISABLED"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["valid"])

    def test_founder_can_review_waitlist_and_create_invite(self):
        entry = WaitlistEntry.objects.create(
            full_name="Omar Freelancer",
            email="omar@example.com",
            persona=WaitlistEntry.Persona.FREELANCER,
            country="UAE",
            message="Need to track contracts and visas.",
        )

        self.authenticate(self.founder)
        list_response = self.client.get("/api/v1/founder/waitlist/?search=omar")
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(list_response.data["count"], 1)
        self.assertIn("omar@example.com", str(list_response.data))

        update_response = self.client.patch(
            f"/api/v1/founder/waitlist/{entry.id}/",
            {"founder_notes": "Strong fit.", "status": "pending"},
            format="json",
        )
        self.assertEqual(update_response.status_code, status.HTTP_200_OK)

        invite_response = self.client.post(
            f"/api/v1/founder/waitlist/{entry.id}/create-invite/",
            {"max_uses": 1, "notes": "Send manually."},
            format="json",
        )

        self.assertEqual(invite_response.status_code, status.HTTP_201_CREATED)
        entry.refresh_from_db()
        self.assertEqual(entry.status, WaitlistEntry.Status.INVITED)
        self.assertIsNotNone(entry.invite_code)
        self.assertTrue(
            FounderAuditLog.objects.filter(action="founder_created_invite").exists()
        )

    def test_founder_can_create_update_and_disable_invite_code(self):
        self.authenticate(self.founder)
        created = self.client.post(
            "/api/v1/founder/invites/",
            {
                "label": "Scholarship cohort",
                "custom_code": "dn-scholar-1",
                "max_uses": 2,
                "persona_target": "scholarship_applicant",
                "notes": "Manual outreach.",
            },
            format="json",
        )

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.data["code"], "DN-SCHOLAR-1")
        invite = InviteCode.objects.get(code="DN-SCHOLAR-1")

        updated = self.client.patch(
            f"/api/v1/founder/invites/{invite.id}/",
            {"max_uses": 3, "is_active": True},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["max_uses"], 3)

        disabled = self.client.post(
            f"/api/v1/founder/invites/{invite.id}/disable/",
            format="json",
        )
        self.assertEqual(disabled.status_code, status.HTTP_200_OK)
        self.assertFalse(disabled.data["is_active"])

    def test_private_beta_metrics_are_aggregate(self):
        WaitlistEntry.objects.create(
            full_name="Private Person",
            email="private@example.com",
            persona=WaitlistEntry.Persona.VISA_HOLDER,
            message="Sensitive visa details should not be in metrics.",
        )
        invite = InviteCode.objects.create(code="DN-METRICS", label="Metrics")
        InviteCodeUse.objects.create(
            invite_code=invite,
            user=self.user,
            email="private@example.com",
        )

        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/private-beta/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_waitlist_entries"], 1)
        self.assertEqual(response.data["total_invite_uses"], 1)
        self.assertNotIn("Sensitive visa details", str(response.data))

    def test_founder_can_access_founder_dashboard(self):
        Document.objects.create(owner=self.user, title="Passport")

        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/dashboard/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["total_users"], 2)
        self.assertEqual(response.data["total_documents"], 1)
        self.assertIn("launch_readiness_percent", response.data)
        self.assertIn("feature_completion_percent", response.data)
        self.assertTrue(
            FounderAuditLog.objects.filter(
                action="founder_viewed_dashboard"
            ).exists()
        )

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

    def test_analytics_endpoint_is_aggregate_and_privacy_safe(self):
        Document.objects.create(
            owner=self.user,
            title="Secret Visa Title",
            notes="raw private notes",
            physical_location_details="home safe",
        )
        ProductEvent.objects.create(
            user=self.user,
            event_type=ProductEvent.EventType.DOCUMENT_CREATED,
            country="Malaysia",
            metadata={"document_title": "Secret Visa Title"},
        )

        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/analytics/?range=30d")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("series", response.data)
        self.assertIn("attention_breakdown", response.data)
        content = str(response.data)
        self.assertNotIn("raw private notes", content)
        self.assertNotIn("home safe", content)
        self.assertNotIn("Secret Visa Title", content)

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

    def test_feature_completion_tracker_is_editable_and_audited(self):
        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/feature-completion/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["summary"]["total"], 1)

        created = self.client.post(
            "/api/v1/founder/feature-completion/",
            {
                "feature_name": "File Inbox",
                "module": "Documents",
                "status": "in_progress",
                "priority": "high",
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data["key"], "file-inbox")

        item_id = response.data["items"][0]["id"]
        updated = self.client.patch(
            f"/api/v1/founder/feature-completion/{item_id}/",
            {"status": "ready", "polished": True, "notes": "Ready for beta."},
            format="json",
        )

        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertEqual(updated.data["status"], FeatureCompletionItem.Status.READY)
        self.assertTrue(
            FounderAuditLog.objects.filter(
                action="founder_updated_feature_completion"
            ).exists()
        )

    def test_launch_readiness_tracker_is_editable_and_summarized(self):
        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/launch-readiness/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["summary"]["total"], 1)
        self.assertIn("generated_blockers", response.data["summary"])
        self.assertIn("private_beta_ready_percent", response.data["summary"])

        item_id = response.data["items"][0]["id"]
        updated = self.client.patch(
            f"/api/v1/founder/launch-readiness/{item_id}/",
            {"is_complete": True, "priority": "critical", "notes": "Verified."},
            format="json",
        )

        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertTrue(updated.data["is_complete"])
        self.assertIsNotNone(updated.data["completed_at"])
        self.assertEqual(LaunchChecklistItem.objects.filter(is_complete=True).count(), 1)

    def test_beta_user_profiles_are_founder_only_and_privacy_safe(self):
        document = Document.objects.create(
            owner=self.user,
            title="Private Passport",
            notes="private note",
        )
        DocumentFile.objects.create(
            document=document,
            uploaded_by=self.user,
            file="documents/private-passport.pdf",
            original_filename="private-passport.pdf",
        )

        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/beta-users/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["count"], 2)

        profile = BetaUserProfile.objects.get(user=self.user)
        updated = self.client.patch(
            f"/api/v1/founder/beta-users/{profile.id}/",
            {
                "invite_status": "active",
                "persona": "visa_holder",
                "tags": ["visa_holder", "traveler"],
                "notes": "Good beta candidate.",
            },
            format="json",
        )

        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        content = str(response.data) + str(updated.data)
        self.assertNotIn("Private Passport", content)
        self.assertNotIn("private-passport.pdf", content)
        self.assertNotIn("private note", content)

    def test_country_activity_uses_aggregate_country_metadata_only(self):
        ProductEvent.objects.create(
            user=self.user,
            event_type=ProductEvent.EventType.USER_SIGNED_UP,
            country="Malaysia",
            ip_address="203.0.113.10",
        )
        ProductEvent.objects.create(
            user=self.user,
            event_type=ProductEvent.EventType.DOCUMENT_CREATED,
            country="Malaysia",
            ip_address="203.0.113.10",
        )
        WaitlistEntry.objects.create(
            full_name="Amina Student",
            email="amina-map@example.com",
            persona=WaitlistEntry.Persona.INTERNATIONAL_STUDENT,
            country="Malaysia",
        )
        WaitlistEntry.objects.create(
            full_name="Accepted Beta",
            email="accepted-map@example.com",
            persona=WaitlistEntry.Persona.VISA_HOLDER,
            country="Malaysia",
            status=WaitlistEntry.Status.ACCEPTED,
            accepted_user=self.user,
            accepted_at=timezone.now(),
        )

        self.authenticate(self.founder)
        response = self.client.get("/api/v1/founder/country-activity/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["countries"][0]["country"], "Malaysia")
        self.assertEqual(response.data["countries"][0]["documents_created"], 1)
        self.assertEqual(response.data["countries"][0]["waitlist_entries"], 2)
        self.assertEqual(response.data["countries"][0]["beta_users"], 1)
        self.assertNotIn("203.0.113.10", str(response.data))

    def test_feedback_submission_and_founder_update(self):
        self.authenticate(self.user)
        create_response = self.client.post(
            "/api/v1/feedback/",
            {
                "category": "bug",
                "title": "Upload confusion",
                "message": "I was not sure what happened after upload.",
                "urgency": "high",
                "contact_preference": "email",
                "related_feature": "documents",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_response.data["urgency"], "high")

        item = FeedbackItem.objects.get()
        self.authenticate(self.founder)
        update_response = self.client.patch(
            f"/api/v1/founder/feedback/{item.id}/",
            {
                "status": "planned",
                "priority": "high",
                "founder_notes": "Improve upload completion copy.",
                "founder_response": "Thanks, this is now on the beta fix list.",
            },
            format="json",
        )

        self.assertEqual(update_response.status_code, status.HTTP_200_OK)
        item.refresh_from_db()
        self.assertEqual(item.status, FeedbackItem.Status.PLANNED)
        self.assertEqual(item.priority, FeedbackItem.Priority.HIGH)
        self.assertTrue(item.founder_response)
        self.assertIsNotNone(item.responded_at)

    def test_product_event_tracking_deduplicates_repeated_client_event(self):
        track_product_event(
            event_type=ProductEvent.EventType.DOCUMENT_CREATED,
            user=self.user,
            object_type="document",
            object_id="123",
            metadata={"client_event_id": "client-evt-1"},
        )
        track_product_event(
            event_type=ProductEvent.EventType.DOCUMENT_CREATED,
            user=self.user,
            object_type="document",
            object_id="123",
            metadata={"client_event_id": "client-evt-1"},
        )

        self.assertEqual(
            ProductEvent.objects.filter(
                event_type=ProductEvent.EventType.DOCUMENT_CREATED,
                object_id="123",
            ).count(),
            1,
        )

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
