import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .constants import MAX_FILE_SIZE
from .models import Document, DocumentFile, DocumentReminderRule

User = get_user_model()

LIST_URL = "/api/v1/documents/"


def detail_url(document_id):
    return f"/api/v1/documents/{document_id}/"


def files_url(document_id):
    return f"/api/v1/documents/{document_id}/files/"


def file_detail_url(document_id, file_id):
    return f"/api/v1/documents/{document_id}/files/{file_id}/"


def attention_url():
    return "/api/v1/documents/attention-needed/"


def reminder_rules_url(document_id):
    return f"/api/v1/documents/{document_id}/reminder-rules/"


def reminder_rule_detail_url(document_id, rule_id):
    return f"/api/v1/documents/{document_id}/reminder-rules/{rule_id}/"


def upcoming_reminders_url():
    return "/api/v1/documents/reminders/upcoming/"


def make_pdf(name="passport.pdf", content=b"%PDF-1.4 fake pdf bytes"):
    return SimpleUploadedFile(name, content, content_type="application/pdf")


class DocumentAPITests(APITestCase):
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

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    # 1. Anonymous users cannot list documents.
    def test_anonymous_cannot_list_documents(self):
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # 2. Authenticated user can create a document.
    def test_authenticated_user_can_create_document(self):
        self.authenticate(self.alice)
        response = self.client.post(
            LIST_URL,
            {"title": "My Passport", "document_type": "passport"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["title"], "My Passport")
        self.assertEqual(Document.objects.count(), 1)

    # 3. Document owner is set automatically from the authenticated user.
    def test_owner_is_set_from_request_user(self):
        self.authenticate(self.alice)
        # Even if the client tries to set another owner, it must be ignored.
        response = self.client.post(
            LIST_URL,
            {"title": "Visa", "owner": self.bob.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        document = Document.objects.get(id=response.data["id"])
        self.assertEqual(document.owner, self.alice)

    # 4. Authenticated user can list only their own documents.
    def test_user_lists_only_their_own_documents(self):
        Document.objects.create(owner=self.alice, title="Alice Doc")
        Document.objects.create(owner=self.bob, title="Bob Doc")

        self.authenticate(self.alice)
        response = self.client.get(LIST_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Alice Doc")

    # 5. Authenticated user can retrieve their own document.
    def test_user_can_retrieve_own_document(self):
        document = Document.objects.create(owner=self.alice, title="Alice Doc")
        self.authenticate(self.alice)
        response = self.client.get(detail_url(document.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["title"], "Alice Doc")

    # 6. Authenticated user cannot retrieve another user's document.
    def test_user_cannot_retrieve_other_users_document(self):
        document = Document.objects.create(owner=self.bob, title="Bob Doc")
        self.authenticate(self.alice)
        response = self.client.get(detail_url(document.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # 7. Authenticated user can update their own document.
    def test_user_can_update_own_document(self):
        document = Document.objects.create(owner=self.alice, title="Old Title")
        self.authenticate(self.alice)
        response = self.client.patch(
            detail_url(document.id),
            {"title": "New Title", "status": "archived"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        document.refresh_from_db()
        self.assertEqual(document.title, "New Title")
        self.assertEqual(document.status, "archived")

    def test_user_cannot_update_other_users_document(self):
        document = Document.objects.create(owner=self.bob, title="Bob Doc")
        self.authenticate(self.alice)
        response = self.client.patch(
            detail_url(document.id), {"title": "Hacked"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        document.refresh_from_db()
        self.assertEqual(document.title, "Bob Doc")

    # 8. Authenticated user can move their own document to trash.
    def test_user_can_delete_own_document(self):
        document = Document.objects.create(owner=self.alice, title="Alice Doc")
        self.authenticate(self.alice)
        response = self.client.delete(detail_url(document.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        document.refresh_from_db()
        self.assertTrue(document.is_trashed)
        self.assertIsNotNone(document.trashed_at)

    def test_user_cannot_delete_other_users_document(self):
        document = Document.objects.create(owner=self.bob, title="Bob Doc")
        self.authenticate(self.alice)
        response = self.client.delete(detail_url(document.id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Document.objects.filter(id=document.id).exists())

    # 9. Invalid date order is rejected.
    def test_expiry_before_issue_is_rejected(self):
        self.authenticate(self.alice)
        response = self.client.post(
            LIST_URL,
            {
                "title": "Bad Dates",
                "issue_date": "2026-01-10",
                "expiry_date": "2026-01-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expiry_date", response.data)

    def test_renewal_after_expiry_is_rejected(self):
        self.authenticate(self.alice)
        response = self.client.post(
            LIST_URL,
            {
                "title": "Bad Renewal",
                "expiry_date": "2026-01-01",
                "renewal_date": "2026-02-01",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("renewal_date", response.data)


# Route uploads to a throwaway dir so tests never touch real MEDIA_ROOT.
_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-test-media-")


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class DocumentFileAPITests(APITestCase):
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
        self.alice_doc = Document.objects.create(owner=self.alice, title="Alice Doc")
        self.bob_doc = Document.objects.create(owner=self.bob, title="Bob Doc")

    def upload(self, document, upload=None):
        return self.client.post(
            files_url(document.id),
            {"file": upload or make_pdf()},
            format="multipart",
        )

    # 1. Anonymous users cannot list document files.
    def test_anonymous_cannot_list_files(self):
        response = self.client.get(files_url(self.alice_doc.id))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # 2. Authenticated user can upload a valid file to their own document.
    def test_user_can_upload_valid_file(self):
        self.client.force_authenticate(self.alice)
        response = self.upload(self.alice_doc)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(DocumentFile.objects.count(), 1)

    # 3. Uploaded file metadata is stored correctly.
    def test_uploaded_metadata_is_stored(self):
        self.client.force_authenticate(self.alice)
        response = self.upload(self.alice_doc, make_pdf(name="my passport.pdf"))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        file = DocumentFile.objects.get(id=response.data["id"])
        self.assertEqual(file.original_filename, "my passport.pdf")
        self.assertEqual(file.content_type, "application/pdf")
        self.assertGreater(file.file_size, 0)
        self.assertEqual(len(file.checksum), 64)  # sha256 hex
        self.assertEqual(file.uploaded_by, self.alice)
        # The stored path must not leak in the response.
        self.assertNotIn("file", response.data)
        self.assertNotIn("/media/", str(response.data.get("download_url", "")))
        # Filename is not used as the storage path (uuid-based).
        self.assertNotIn("my passport", file.file.name)

    # 4. Authenticated user can list only files for their own document.
    def test_user_lists_only_own_document_files(self):
        DocumentFile.objects.create(
            document=self.alice_doc,
            uploaded_by=self.alice,
            file=make_pdf(),
            original_filename="a.pdf",
            file_size=10,
        )
        DocumentFile.objects.create(
            document=self.bob_doc,
            uploaded_by=self.bob,
            file=make_pdf(),
            original_filename="b.pdf",
            file_size=10,
        )
        self.client.force_authenticate(self.alice)
        response = self.client.get(files_url(self.alice_doc.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["original_filename"], "a.pdf")

    # 5. Authenticated user cannot upload a file to another user's document.
    def test_user_cannot_upload_to_other_users_document(self):
        self.client.force_authenticate(self.alice)
        response = self.upload(self.bob_doc)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(DocumentFile.objects.count(), 0)

    # 6. Authenticated user cannot retrieve another user's document file.
    def test_user_cannot_retrieve_other_users_file(self):
        bob_file = DocumentFile.objects.create(
            document=self.bob_doc,
            uploaded_by=self.bob,
            file=make_pdf(),
            original_filename="b.pdf",
            file_size=10,
        )
        self.client.force_authenticate(self.alice)
        # Even guessing the right document/file ids must not leak it.
        response = self.client.get(
            file_detail_url(self.bob_doc.id, bob_file.id)
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_user_cannot_download_other_users_file(self):
        bob_file = DocumentFile.objects.create(
            document=self.bob_doc,
            uploaded_by=self.bob,
            file=make_pdf(),
            original_filename="b.pdf",
            file_size=10,
        )
        self.client.force_authenticate(self.alice)
        response = self.client.get(
            f"{file_detail_url(self.bob_doc.id, bob_file.id)}download/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # 7. Authenticated user can move their own document file to trash.
    def test_user_can_delete_own_file(self):
        self.client.force_authenticate(self.alice)
        created = self.upload(self.alice_doc)
        file_id = created.data["id"]

        response = self.client.delete(
            file_detail_url(self.alice_doc.id, file_id)
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        file = DocumentFile.objects.get(id=file_id)
        self.assertTrue(file.is_trashed)
        self.assertIsNotNone(file.trashed_at)

    def test_owner_can_download_own_file(self):
        self.client.force_authenticate(self.alice)
        created = self.upload(self.alice_doc)
        file_id = created.data["id"]
        response = self.client.get(
            f"{file_detail_url(self.alice_doc.id, file_id)}download/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    # 8. Invalid file type is rejected.
    def test_invalid_file_type_is_rejected(self):
        self.client.force_authenticate(self.alice)
        bad = SimpleUploadedFile(
            "evil.exe", b"MZ binary", content_type="application/x-msdownload"
        )
        response = self.upload(self.alice_doc, bad)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(DocumentFile.objects.count(), 0)

    # 9. Oversized file is rejected.
    def test_oversized_file_is_rejected(self):
        self.client.force_authenticate(self.alice)
        big = SimpleUploadedFile(
            "big.pdf",
            b"0" * (MAX_FILE_SIZE + 1),
            content_type="application/pdf",
        )
        response = self.upload(self.alice_doc, big)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(DocumentFile.objects.count(), 0)


class DocumentIntelligenceTests(APITestCase):
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
        self.today = timezone.localdate()

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def document(self, owner=None, **kwargs):
        defaults = {"owner": owner or self.alice, "title": "Passport"}
        defaults.update(kwargs)
        return Document.objects.create(**defaults)

    def attach_file(self, document):
        return DocumentFile.objects.create(
            document=document,
            uploaded_by=document.owner,
            file=make_pdf(name=f"{document.id}.pdf"),
            original_filename=f"{document.title}.pdf",
            content_type="application/pdf",
            file_size=10,
        )

    def test_future_expiry_beyond_threshold_is_active(self):
        doc = self.document(expiry_date=self.today + timedelta(days=140))
        self.attach_file(doc)
        self.authenticate(self.alice)
        response = self.client.get(detail_url(doc.id))
        self.assertEqual(response.data["computed_status"], "active")
        self.assertEqual(response.data["urgency_level"], "none")
        self.assertFalse(response.data["needs_attention"])

    def test_expiring_within_90_days_is_expiring_soon(self):
        doc = self.document(expiry_date=self.today + timedelta(days=58))
        self.attach_file(doc)
        self.authenticate(self.alice)
        response = self.client.get(detail_url(doc.id))
        self.assertEqual(response.data["computed_status"], "expiring_soon")
        self.assertEqual(response.data["days_until_expiry"], 58)
        self.assertTrue(response.data["is_expiring_soon"])

    def test_renewal_date_today_is_renewal_due(self):
        doc = self.document(
            expiry_date=self.today + timedelta(days=180),
            renewal_date=self.today,
        )
        self.attach_file(doc)
        self.authenticate(self.alice)
        response = self.client.get(detail_url(doc.id))
        self.assertEqual(response.data["computed_status"], "renewal_due")
        self.assertTrue(response.data["is_renewal_due"])

    def test_expiry_before_today_is_expired(self):
        doc = self.document(expiry_date=self.today - timedelta(days=3))
        self.attach_file(doc)
        self.authenticate(self.alice)
        response = self.client.get(detail_url(doc.id))
        self.assertEqual(response.data["computed_status"], "expired")
        self.assertTrue(response.data["is_expired"])

    def test_missing_file_and_missing_expiry_are_reported(self):
        doc = self.document(title="Incomplete record")
        self.authenticate(self.alice)
        response = self.client.get(detail_url(doc.id))
        self.assertTrue(response.data["missing_file"])
        self.assertTrue(response.data["missing_expiry_date"])
        self.assertTrue(response.data["needs_attention"])

    def test_archived_document_remains_archived(self):
        doc = self.document(status=Document.Status.ARCHIVED)
        self.authenticate(self.alice)
        response = self.client.get(detail_url(doc.id))
        self.assertEqual(response.data["computed_status"], "archived")
        self.assertFalse(response.data["needs_attention"])

    def test_computed_fields_appear_in_list_response(self):
        self.document(expiry_date=self.today + timedelta(days=10))
        self.authenticate(self.alice)
        response = self.client.get(LIST_URL)
        result = response.data["results"][0]
        self.assertIn("computed_status", result)
        self.assertIn("status_reason", result)
        self.assertIn("needs_attention", result)

    def test_user_cannot_see_other_users_computed_data(self):
        bob_doc = self.document(owner=self.bob, title="Bob secret")
        self.authenticate(self.alice)
        self.assertEqual(
            self.client.get(detail_url(bob_doc.id)).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_search_matches_fields_and_is_owner_scoped(self):
        own = self.document(title="Passport", issuer="Immigration Office")
        self.document(owner=self.bob, title="Passport", issuer="Immigration Office")
        self.authenticate(self.alice)
        by_title = self.client.get(LIST_URL, {"search": "passport"})
        by_issuer = self.client.get(LIST_URL, {"search": "immigration"})
        self.assertEqual(by_title.data["count"], 1)
        self.assertEqual(by_title.data["results"][0]["id"], own.id)
        self.assertEqual(by_issuer.data["count"], 1)

    def test_search_matches_country_and_reference_number(self):
        self.document(country="Malaysia", reference_number="ABC-123")
        self.authenticate(self.alice)
        self.assertEqual(self.client.get(LIST_URL, {"search": "malaysia"}).data["count"], 1)
        self.assertEqual(self.client.get(LIST_URL, {"search": "ABC-123"}).data["count"], 1)

    def test_computed_status_and_attention_filters(self):
        soon = self.document(expiry_date=self.today + timedelta(days=20))
        self.attach_file(soon)
        safe = self.document(
            title="Safe",
            expiry_date=self.today + timedelta(days=200),
        )
        self.attach_file(safe)
        self.authenticate(self.alice)
        filtered = self.client.get(LIST_URL, {"computed_status": "expiring_soon"})
        attention = self.client.get(LIST_URL, {"needs_attention": "true"})
        self.assertEqual([item["id"] for item in filtered.data["results"]], [soon.id])
        self.assertIn(soon.id, [item["id"] for item in attention.data["results"]])
        self.assertNotIn(safe.id, [item["id"] for item in attention.data["results"]])

    def test_missing_file_and_missing_expiry_filters(self):
        missing = self.document(title="Missing")
        complete = self.document(
            title="Complete",
            expiry_date=self.today + timedelta(days=200),
        )
        self.attach_file(complete)
        self.authenticate(self.alice)
        missing_file = self.client.get(LIST_URL, {"missing_file": "true"})
        missing_expiry = self.client.get(LIST_URL, {"missing_expiry_date": "true"})
        self.assertEqual([item["id"] for item in missing_file.data["results"]], [missing.id])
        self.assertEqual([item["id"] for item in missing_expiry.data["results"]], [missing.id])

    def test_expiry_range_and_expiring_within_filters(self):
        soon = self.document(expiry_date=self.today + timedelta(days=15))
        later = self.document(expiry_date=self.today + timedelta(days=80))
        self.attach_file(soon)
        self.attach_file(later)
        self.authenticate(self.alice)
        ranged = self.client.get(
            LIST_URL,
            {
                "expiry_from": (self.today + timedelta(days=10)).isoformat(),
                "expiry_to": (self.today + timedelta(days=20)).isoformat(),
            },
        )
        within = self.client.get(LIST_URL, {"expiring_within_days": "30"})
        self.assertEqual([item["id"] for item in ranged.data["results"]], [soon.id])
        self.assertEqual([item["id"] for item in within.data["results"]], [soon.id])

    def test_ordering_and_invalid_ordering_are_safe(self):
        later = self.document(title="B", expiry_date=self.today + timedelta(days=90))
        soon = self.document(title="A", expiry_date=self.today + timedelta(days=10))
        self.authenticate(self.alice)
        ordered = self.client.get(LIST_URL, {"ordering": "expiry_date"})
        invalid = self.client.get(LIST_URL, {"ordering": "owner__password"})
        self.assertEqual([item["id"] for item in ordered.data["results"]], [soon.id, later.id])
        self.assertEqual(invalid.status_code, status.HTTP_200_OK)

    def test_anonymous_user_cannot_search_documents(self):
        response = self.client.get(LIST_URL, {"search": "passport"})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_attention_endpoint_requires_authentication(self):
        response = self.client.get(attention_url())
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_attention_endpoint_returns_only_user_documents_sorted(self):
        expired = self.document(
            title="Expired",
            expiry_date=self.today - timedelta(days=1),
        )
        due = self.document(
            title="Due",
            expiry_date=self.today + timedelta(days=200),
            renewal_date=self.today,
        )
        missing = self.document(title="Missing file")
        safe = self.document(
            title="Safe",
            expiry_date=self.today + timedelta(days=200),
        )
        archived = self.document(
            title="Archived",
            status=Document.Status.ARCHIVED,
        )
        self.document(owner=self.bob, title="Bob expired", expiry_date=self.today - timedelta(days=5))
        for doc in (expired, due, safe, archived):
            self.attach_file(doc)

        self.authenticate(self.alice)
        response = self.client.get(attention_url())
        ids = [item["id"] for item in response.data["items"]]
        self.assertEqual(ids[:3], [expired.id, due.id, missing.id])
        self.assertNotIn(safe.id, ids)
        self.assertNotIn(archived.id, ids)
        self.assertEqual(response.data["count"], 3)


class DocumentReminderRuleTests(APITestCase):
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
        today = timezone.localdate()
        self.alice_doc = Document.objects.create(
            owner=self.alice,
            title="Passport",
            expiry_date=today + timedelta(days=120),
            renewal_date=today + timedelta(days=60),
        )
        self.bob_doc = Document.objects.create(
            owner=self.bob,
            title="Bob Passport",
            expiry_date=today + timedelta(days=120),
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_anonymous_cannot_access_reminder_rules(self):
        response = self.client.get(reminder_rules_url(self.alice_doc.id))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_owner_can_create_rule_for_own_document(self):
        self.authenticate(self.alice)
        response = self.client.post(
            reminder_rules_url(self.alice_doc.id),
            {"trigger_type": "before_expiry", "days_before": 90},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["owner"], self.alice.id)
        self.assertEqual(response.data["document"], self.alice_doc.id)
        self.assertEqual(DocumentReminderRule.objects.count(), 1)

    def test_user_cannot_create_rule_for_another_users_document(self):
        self.authenticate(self.alice)
        response = self.client.post(
            reminder_rules_url(self.bob_doc.id),
            {"trigger_type": "before_expiry", "days_before": 30},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_rule_requires_valid_trigger_type(self):
        self.authenticate(self.alice)
        response = self.client.post(
            reminder_rules_url(self.alice_doc.id),
            {"trigger_type": "bad", "days_before": 30},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rule_requires_source_date(self):
        doc = Document.objects.create(owner=self.alice, title="No dates")
        self.authenticate(self.alice)
        response = self.client.post(
            reminder_rules_url(doc.id),
            {"trigger_type": "before_expiry", "days_before": 30},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_owner_can_list_update_and_delete_rules(self):
        rule = DocumentReminderRule.objects.create(
            owner=self.alice,
            document=self.alice_doc,
            trigger_type="before_expiry",
            days_before=30,
        )
        self.authenticate(self.alice)
        listed = self.client.get(reminder_rules_url(self.alice_doc.id))
        self.assertEqual(len(listed.data["results"]), 1)

        updated = self.client.patch(
            reminder_rule_detail_url(self.alice_doc.id, rule.id),
            {"is_enabled": False, "days_before": 7},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK)
        self.assertFalse(updated.data["is_enabled"])
        self.assertEqual(updated.data["days_before"], 7)

        deleted = self.client.delete(reminder_rule_detail_url(self.alice_doc.id, rule.id))
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(DocumentReminderRule.objects.filter(id=rule.id).exists())

    def test_upcoming_reminder_date_is_calculated(self):
        self.authenticate(self.alice)
        response = self.client.post(
            reminder_rules_url(self.alice_doc.id),
            {"trigger_type": "before_expiry", "days_before": 90},
            format="json",
        )
        expected = self.alice_doc.expiry_date - timedelta(days=90)
        self.assertEqual(response.data["upcoming_reminder_date"], expected.isoformat())

    def test_upcoming_reminders_endpoint_is_owner_scoped(self):
        alice_rule = DocumentReminderRule.objects.create(
            owner=self.alice,
            document=self.alice_doc,
            trigger_type="before_expiry",
            days_before=30,
        )
        DocumentReminderRule.objects.create(
            owner=self.bob,
            document=self.bob_doc,
            trigger_type="before_expiry",
            days_before=30,
        )
        self.authenticate(self.alice)
        response = self.client.get(upcoming_reminders_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["items"][0]["id"], alice_rule.id)
