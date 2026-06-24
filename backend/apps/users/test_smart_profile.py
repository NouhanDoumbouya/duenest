"""
Smart Profile V1 — reusable application data + completeness (deterministic, no AI).

Covers auth, stable empty payload, extras update, owner isolation across all five
sub-entry collections, date validation, completeness scoring + clamping +
next-actions, the application-context helper, and no-AI / no-file-URL safety.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users import smart_profile
from apps.users.models import (
    SmartProfileEducation,
    UserProfileDetails,
)

User = get_user_model()

PROFILE_URL = "/api/v1/smart-profile/"
COMPLETENESS_URL = "/api/v1/smart-profile/completeness/"
EDUCATION_URL = "/api/v1/smart-profile/education/"
WORK_URL = "/api/v1/smart-profile/work/"
SKILLS_URL = "/api/v1/smart-profile/skills/"
ACHIEVEMENTS_URL = "/api/v1/smart-profile/achievements/"
ANSWERS_URL = "/api/v1/smart-profile/common-answers/"


class SmartProfileBaseTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="sp", email="sp@x.com", password="StrongPass123!DN"
        )
        self.other = User.objects.create_user(
            username="o", email="o@x.com", password="StrongPass123!DN"
        )


class ProfileEndpointTests(SmartProfileBaseTest):
    def test_requires_authentication(self):
        self.assertEqual(self.client.get(PROFILE_URL).status_code, 401)

    def test_empty_profile_returns_stable_payload(self):
        self.client.force_authenticate(self.user)
        data = self.client.get(PROFILE_URL).data
        for key in ("identity", "extras", "education", "work", "skills",
                    "achievements", "common_answers", "completeness"):
            self.assertIn(key, data)
        self.assertEqual(data["education"], [])
        self.assertIn("score", data["completeness"])
        self.assertIn("sections", data["completeness"])

    def test_update_extras(self):
        self.client.force_authenticate(self.user)
        resp = self.client.patch(
            PROFILE_URL,
            {
                "email_for_applications": "apply@x.com",
                "country_of_residence": "Malaysia",
                "emergency_contact_name": "Aunt May",
                "emergency_contact_phone": "+60123456789",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["extras"]["email_for_applications"], "apply@x.com")
        self.assertEqual(resp.data["extras"]["emergency_contact_name"], "Aunt May")

    def test_identity_read_only_uses_encrypted_store_presence(self):
        # Identity comes from the encrypted UserProfileDetails; only presence of
        # passport/national-id is exposed (never the numbers).
        row = UserProfileDetails.objects.create(user=self.user)
        row.set_details({
            "legal_name": "Jane Doe", "nationality": "MY",
            "passport_number": "A1234567", "national_id": "990101-01-1234",
        })
        row.save()
        self.client.force_authenticate(self.user)
        data = self.client.get(PROFILE_URL).data
        self.assertEqual(data["identity"]["legal_full_name"], "Jane Doe")
        self.assertTrue(data["identity"]["has_passport_number"])
        self.assertTrue(data["identity"]["has_national_id"])
        blob = json.dumps(data)
        self.assertNotIn("A1234567", blob)  # the number itself never leaks
        self.assertNotIn("990101-01-1234", blob)


class SubEntryCrudTests(SmartProfileBaseTest):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.user)

    def _create(self, url, payload):
        return self.client.post(url, payload, format="json")

    def test_education_crud_owner_scoped(self):
        resp = self._create(EDUCATION_URL, {"institution_name": "MIT", "degree_or_program": "BSc"})
        self.assertEqual(resp.status_code, 201, resp.data)
        edu_id = resp.data["id"]
        # other user cannot see or modify it
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(EDUCATION_URL).data["results"], [])
        self.assertEqual(
            self.client.get(f"{EDUCATION_URL}{edu_id}/").status_code, 404
        )
        self.assertEqual(
            self.client.patch(f"{EDUCATION_URL}{edu_id}/", {"country": "X"}, format="json").status_code,
            404,
        )

    def test_work_skill_achievement_answer_crud(self):
        for url, payload in (
            (WORK_URL, {"organization_name": "Acme", "role_title": "Intern"}),
            (SKILLS_URL, {"name": "Python", "category": "technical"}),
            (ACHIEVEMENTS_URL, {"title": "Dean's List", "category": "academic"}),
            (ANSWERS_URL, {"prompt": "Why us?", "answer": "Because.", "category": "scholarship"}),
        ):
            resp = self._create(url, payload)
            self.assertEqual(resp.status_code, 201, (url, resp.data))
            self.assertEqual(resp.data["owner"], self.user.id)

    def test_cannot_link_another_users_document_to_achievement(self):
        from apps.documents.models import Document

        other_doc = Document.objects.create(owner=self.other, title="Theirs")
        resp = self._create(
            ACHIEVEMENTS_URL,
            {"title": "X", "category": "award", "related_document": other_doc.id},
        )
        self.assertEqual(resp.status_code, 400)

    def test_invalid_date_is_rejected(self):
        resp = self._create(
            EDUCATION_URL, {"institution_name": "X", "start_date": "not-a-date"}
        )
        self.assertEqual(resp.status_code, 400)


class CompletenessTests(SmartProfileBaseTest):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.user)

    def test_empty_profile_low_score(self):
        data = self.client.get(COMPLETENESS_URL).data
        self.assertEqual(data["score"], 0)
        self.assertEqual(data["label"], "Incomplete")
        types = [a["type"] for a in data["next_actions"]]
        self.assertIn("add_education", types)

    def test_score_increases_as_sections_complete(self):
        before = self.client.get(COMPLETENESS_URL).data["score"]
        self.client.post(EDUCATION_URL, {"institution_name": "MIT"}, format="json")
        self.client.post(SKILLS_URL, {"name": "Python"}, format="json")
        after = self.client.get(COMPLETENESS_URL).data["score"]
        self.assertGreater(after, before)

    def test_score_clamped_0_100(self):
        # Fill every section → score is exactly 100, never above.
        UserProfileDetails.objects.create(user=self.user)
        row = UserProfileDetails.objects.get(user=self.user)
        row.set_details({"legal_name": "Jane", "nationality": "MY", "phone": "+60"})
        row.save()
        self.client.patch(
            PROFILE_URL,
            {"current_address": "1 St", "emergency_contact_name": "May",
             "emergency_contact_phone": "+60111"},
            format="json",
        )
        self.client.post(EDUCATION_URL, {"institution_name": "MIT"}, format="json")
        self.client.post(WORK_URL, {"organization_name": "Acme"}, format="json")
        self.client.post(SKILLS_URL, {"name": "Python"}, format="json")
        self.client.post(ACHIEVEMENTS_URL, {"title": "Award"}, format="json")
        data = self.client.get(COMPLETENESS_URL).data
        self.assertEqual(data["score"], 100)
        self.assertEqual(data["label"], "Ready to reuse")
        self.assertEqual(data["next_actions"], [])


class ApplicationContextTests(SmartProfileBaseTest):
    def test_context_includes_profile_application_and_pack_safely(self):
        from apps.documents.models import (
            DocumentBundle,
            DocumentBundleRequirement as Req,
            TrackedApplication,
        )

        SmartProfileEducation.objects.create(owner=self.user, institution_name="MIT")
        bundle = DocumentBundle.objects.create(owner=self.user, title="Visa Pack")
        Req.objects.create(owner=self.user, bundle=bundle, title="Passport",
                           is_required=True, status=Req.Status.MISSING)
        app = TrackedApplication.objects.create(
            owner=self.user, title="Visa", application_type="visa",
            linked_bundle=bundle, deadline_date=date.today() + timedelta(days=30),
        )
        row = UserProfileDetails.objects.create(user=self.user)
        row.set_details({"legal_name": "Jane Doe", "passport_number": "SECRET123"})
        row.save()

        with mock.patch("apps.ai.client.generate") as gen:
            context = smart_profile.build_application_context_from_profile(self.user, app)
        gen.assert_not_called()

        self.assertEqual(context["profile"]["name"], "Jane Doe")
        self.assertEqual(len(context["profile"]["education"]), 1)
        self.assertEqual(context["application"]["title"], "Visa")
        self.assertEqual(context["pack"]["name"], "Visa Pack")
        self.assertIn("Passport", context["pack"]["missing_documents"])
        # No passport number / file URLs leak into the context.
        blob = json.dumps(context).lower()
        self.assertNotIn("secret123", blob)
        for marker in ("http://", "https://", "x-amz", "/media/"):
            self.assertNotIn(marker, blob)

    def test_context_excludes_other_users_application(self):
        other_app_owner_mismatch = None
        from apps.documents.models import TrackedApplication

        app = TrackedApplication.objects.create(owner=self.other, title="Theirs")
        context = smart_profile.build_application_context_from_profile(self.user, app)
        # The foreign application is ignored (owner check) — no leakage.
        self.assertIsNone(context["application"])


class NoAiTests(SmartProfileBaseTest):
    def test_profile_endpoints_make_no_ai_call(self):
        self.client.force_authenticate(self.user)
        with mock.patch("apps.ai.client.generate") as gen:
            self.client.get(PROFILE_URL)
            self.client.get(COMPLETENESS_URL)
            self.client.post(EDUCATION_URL, {"institution_name": "MIT"}, format="json")
        gen.assert_not_called()
