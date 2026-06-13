"""
Tests for the document intelligence polish: confidence scoring, last-safe-action
dates, the missing/health scanners, tags, custom fields, lifecycle status,
renewal history, appointments, and payments — with strict ownership checks.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Document,
    DocumentAppointment,
    DocumentBundle,
    DocumentPayment,
    DocumentRenewalEvent,
    DocumentReminderRule,
    DocumentTag,
)
from .services import compute_confidence, compute_last_safe_action

User = get_user_model()


def make_pdf(name="doc.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 fake", content_type="application/pdf")


class IntelligenceTestBase(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", email="alice@example.com", password="Pw!DueNest123"
        )
        self.bob = User.objects.create_user(
            username="bob", email="bob@example.com", password="Pw!DueNest123"
        )

    def auth(self, user):
        self.client.force_authenticate(user=user)


class ConfidenceAndLastSafeActionTests(IntelligenceTestBase):
    def test_bare_document_has_low_confidence(self):
        doc = Document.objects.create(owner=self.alice, title="Bare")
        confidence = compute_confidence(doc)
        # No file, no expiry, no reminder, no location → well below strong.
        self.assertLess(confidence.score, 60)
        self.assertIn(confidence.label, {"Low", "Fair"})
        keys = {r["key"] for r in confidence.reasons}
        self.assertIn("has_file", keys)

    def test_complete_document_scores_higher(self):
        today = timezone.localdate()
        doc = Document.objects.create(
            owner=self.alice,
            title="Complete",
            expiry_date=today + timedelta(days=200),
            physical_location_label="Home safe",
        )
        from .models import DocumentFile

        DocumentFile.objects.create(
            document=doc,
            uploaded_by=self.alice,
            file=make_pdf(),
            original_filename="doc.pdf",
            file_size=10,
        )
        DocumentReminderRule.objects.create(
            owner=self.alice, document=doc, days_before=30, is_enabled=True
        )
        confidence = compute_confidence(doc)
        self.assertGreaterEqual(confidence.score, 85)
        self.assertEqual(confidence.label, "Strong")

    def test_last_safe_action_from_expiry_buffer(self):
        today = timezone.localdate()
        doc = Document.objects.create(
            owner=self.alice, title="X", expiry_date=today + timedelta(days=100)
        )
        lsa = compute_last_safe_action(doc)
        self.assertEqual(lsa.date, today + timedelta(days=70))  # 100 - 30 buffer
        self.assertEqual(lsa.status, "ok")
        self.assertFalse(lsa.is_manual)

    def test_last_safe_action_manual_override_and_passed(self):
        today = timezone.localdate()
        doc = Document.objects.create(
            owner=self.alice,
            title="X",
            last_safe_action_date=today - timedelta(days=3),
        )
        lsa = compute_last_safe_action(doc)
        self.assertTrue(lsa.is_manual)
        self.assertEqual(lsa.status, "passed")

    def test_serializer_exposes_intelligence_fields(self):
        doc = Document.objects.create(owner=self.alice, title="X")
        self.auth(self.alice)
        response = self.client.get(f"/api/v1/documents/{doc.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for key in (
            "confidence_score",
            "confidence_label",
            "confidence_reasons",
            "last_safe_action_status",
            "lifecycle_status",
            "custom_fields",
            "tags",
            "is_shared_externally",
        ):
            self.assertIn(key, response.data)


class ScannerTests(IntelligenceTestBase):
    def test_missing_summary_is_owner_scoped(self):
        Document.objects.create(owner=self.bob, title="Bob doc")  # no file
        self.auth(self.alice)
        response = self.client.get("/api/v1/documents/missing-summary/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Alice has nothing, so totals are zero despite Bob's gappy document.
        self.assertEqual(response.data["total"], 0)

    def test_missing_summary_flags_gaps(self):
        Document.objects.create(owner=self.alice, title="No file no expiry")
        self.auth(self.alice)
        data = self.client.get("/api/v1/documents/missing-summary/").data
        groups = {g["key"]: g for g in data["groups"]}
        self.assertEqual(len(groups["missing_files"]["items"]), 1)
        self.assertEqual(len(groups["missing_expiry"]["items"]), 1)
        self.assertEqual(len(groups["without_reminders"]["items"]), 1)

    def test_health_overview_groups(self):
        today = timezone.localdate()
        Document.objects.create(
            owner=self.alice, title="Expired", expiry_date=today - timedelta(days=1)
        )
        self.auth(self.alice)
        data = self.client.get("/api/v1/documents/health-overview/").data
        groups = {g["key"]: g for g in data["groups"]}
        self.assertEqual(groups["expired"]["count"], 1)
        self.assertEqual(data["total"], 1)

    def test_scanner_requires_auth(self):
        self.assertEqual(
            self.client.get("/api/v1/documents/missing-summary/").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )


class TagTests(IntelligenceTestBase):
    def test_create_and_list_tags_owner_scoped(self):
        DocumentTag.objects.create(owner=self.bob, name="Bob tag")
        self.auth(self.alice)
        created = self.client.post("/api/v1/document-tags/", {"name": "Travel"})
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        listing = self.client.get("/api/v1/document-tags/")
        names = [t["name"] for t in listing.data["results"]]
        self.assertEqual(names, ["Travel"])  # Bob's tag is not visible

    def test_cannot_assign_another_users_tag(self):
        bob_tag = DocumentTag.objects.create(owner=self.bob, name="Bob")
        doc = Document.objects.create(owner=self.alice, title="X")
        self.auth(self.alice)
        response = self.client.patch(
            f"/api/v1/documents/{doc.id}/", {"tag_ids": [bob_tag.id]}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_assign_and_filter_by_own_tag(self):
        self.auth(self.alice)
        tag = DocumentTag.objects.create(owner=self.alice, name="Important")
        doc = Document.objects.create(owner=self.alice, title="X")
        patch = self.client.patch(
            f"/api/v1/documents/{doc.id}/", {"tag_ids": [tag.id]}, format="json"
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        self.assertEqual(len(patch.data["tags"]), 1)
        filtered = self.client.get(f"/api/v1/documents/?tag={tag.id}")
        self.assertEqual(filtered.data["count"], 1)


class CustomFieldsAndLifecycleTests(IntelligenceTestBase):
    def test_custom_fields_round_trip(self):
        self.auth(self.alice)
        doc = Document.objects.create(owner=self.alice, title="Passport")
        response = self.client.patch(
            f"/api/v1/documents/{doc.id}/",
            {"custom_fields": {"passport_number": "X1234", "nationality": "GN"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["custom_fields"]["passport_number"], "X1234")

    def test_custom_fields_reject_non_object(self):
        self.auth(self.alice)
        doc = Document.objects.create(owner=self.alice, title="X")
        response = self.client.patch(
            f"/api/v1/documents/{doc.id}/",
            {"custom_fields": ["not", "an", "object"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_lifecycle_status_is_writable_and_separate(self):
        self.auth(self.alice)
        doc = Document.objects.create(owner=self.alice, title="X")
        response = self.client.patch(
            f"/api/v1/documents/{doc.id}/",
            {"lifecycle_status": "submitted"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["lifecycle_status"], "submitted")
        # Computed status is unaffected by lifecycle status.
        self.assertIn("computed_status", response.data)


class RenewalEventTests(IntelligenceTestBase):
    def test_create_and_list_renewal_events(self):
        self.auth(self.alice)
        doc = Document.objects.create(owner=self.alice, title="Passport")
        today = timezone.localdate()
        created = self.client.post(
            f"/api/v1/documents/{doc.id}/renewal-events/",
            {
                "renewal_date": today.isoformat(),
                "new_expiry_date": (today + timedelta(days=3650)).isoformat(),
                "cost": "120.00",
                "currency": "GBP",
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        listing = self.client.get(f"/api/v1/documents/{doc.id}/renewal-events/")
        self.assertEqual(listing.data["count"], 1)

    def test_cannot_access_others_renewal_events(self):
        bob_doc = Document.objects.create(owner=self.bob, title="Bob")
        DocumentRenewalEvent.objects.create(
            owner=self.bob, document=bob_doc, renewal_date=timezone.localdate()
        )
        self.auth(self.alice)
        # Bob's document is not in Alice's scope → 404.
        response = self.client.get(
            f"/api/v1/documents/{bob_doc.id}/renewal-events/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class AppointmentTests(IntelligenceTestBase):
    def test_create_appointment_requires_link(self):
        self.auth(self.alice)
        response = self.client.post(
            "/api/v1/appointments/",
            {"title": "Biometrics", "appointment_at": timezone.now().isoformat()},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_and_owner_isolation(self):
        self.auth(self.alice)
        doc = Document.objects.create(owner=self.alice, title="X")
        created = self.client.post(
            "/api/v1/appointments/",
            {
                "title": "Interview",
                "appointment_at": timezone.now().isoformat(),
                "document": doc.id,
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        # Bob cannot see Alice's appointment.
        self.auth(self.bob)
        listing = self.client.get("/api/v1/appointments/")
        self.assertEqual(listing.data["count"], 0)

    def test_cannot_link_appointment_to_others_document(self):
        bob_doc = Document.objects.create(owner=self.bob, title="Bob")
        self.auth(self.alice)
        response = self.client.post(
            "/api/v1/appointments/",
            {
                "title": "X",
                "appointment_at": timezone.now().isoformat(),
                "document": bob_doc.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PaymentTests(IntelligenceTestBase):
    def test_create_payment_and_filter_by_document(self):
        self.auth(self.alice)
        doc = Document.objects.create(owner=self.alice, title="X")
        created = self.client.post(
            "/api/v1/payments/",
            {
                "label": "Renewal fee",
                "expected_cost": "85.00",
                "currency": "GBP",
                "payment_status": "pending",
                "document": doc.id,
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        filtered = self.client.get(f"/api/v1/payments/?document={doc.id}")
        self.assertEqual(filtered.data["count"], 1)

    def test_payment_owner_isolation(self):
        bob_doc = Document.objects.create(owner=self.bob, title="Bob")
        DocumentPayment.objects.create(
            owner=self.bob, document=bob_doc, label="x", payment_status="paid"
        )
        self.auth(self.alice)
        self.assertEqual(self.client.get("/api/v1/payments/").data["count"], 0)
