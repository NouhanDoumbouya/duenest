"""Tests for the remaining Growth modules: content, segments, ambassadors,
referrals, charts, exports, auto-actions, and signup attribution."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.documents.models import Document

from .growth_modules import (
    capture_attribution,
    evaluate_segment_queryset,
    get_or_create_referral_profile,
    record_referral_signup,
)
from .models import (
    AmbassadorProfile,
    AudienceSegment,
    ContentItem,
    ReferralAttribution,
    UserAttribution,
)

User = get_user_model()


class GrowthModuleAccessTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="n", email="n@e.com", password="Pw!DueNest123")
        self.founder = User.objects.create_user(
            username="f", email="f@e.com", password="Pw!DueNest123", is_staff=True
        )

    def test_normal_user_blocked_everywhere(self):
        self.client.force_authenticate(self.user)
        for name in (
            "founder-growth-content",
            "founder-growth-segments",
            "founder-growth-ambassadors",
            "founder-growth-referrals",
            "founder-growth-charts",
        ):
            self.assertEqual(self.client.get(reverse(name)).status_code, status.HTTP_403_FORBIDDEN, name)

    def test_export_founder_only(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(
            self.client.get(reverse("founder-growth-export") + "?type=campaigns").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.client.force_authenticate(self.founder)
        resp = self.client.get(reverse("founder-growth-export") + "?type=campaigns")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp["Content-Type"], "text/csv")


class ContentSegmentTests(APITestCase):
    def setUp(self):
        self.founder = User.objects.create_user(
            username="f", email="f@e.com", password="Pw!DueNest123", is_staff=True
        )
        self.client.force_authenticate(self.founder)

    def test_content_crud(self):
        resp = self.client.post(
            reverse("founder-growth-content"),
            {"title": "LinkedIn founder story", "channel": "linkedin", "status": "idea"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        item_id = resp.json()["id"]
        patch = self.client.patch(
            reverse("founder-growth-content-detail", args=[item_id]),
            {"status": "published"},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        self.assertEqual(ContentItem.objects.get(id=item_id).status, "published")

    def test_segment_with_summary_and_members(self):
        u = User.objects.create_user(username="s", email="s@e.com", password="Pw!DueNest123", plan="free")
        Document.objects.create(owner=u, title="Passport")
        resp = self.client.post(
            reverse("founder-growth-segments"),
            {"name": "Activated free users", "rules_json": {"plan": "free", "activation": "activated"}},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        seg_id = resp.json()["id"]
        self.assertGreaterEqual(resp.json()["summary"]["size"], 1)
        members = self.client.get(reverse("founder-growth-segment-members", args=[seg_id]))
        self.assertEqual(members.status_code, status.HTTP_200_OK)
        self.assertTrue(any(m["email"] == "s@e.com" for m in members.json()["members"]))


class ReferralTests(APITestCase):
    def test_referral_anti_self_and_dedupe(self):
        referrer = User.objects.create_user(username="r", email="r@e.com", password="Pw!DueNest123")
        referred = User.objects.create_user(username="d", email="d@e.com", password="Pw!DueNest123")
        profile = get_or_create_referral_profile(referrer)

        # self-referral rejected
        self.assertIsNone(record_referral_signup(referrer, profile.referral_code))
        # valid referral
        attr = record_referral_signup(referred, profile.referral_code)
        self.assertIsNotNone(attr)
        # dedupe
        self.assertIsNone(record_referral_signup(referred, profile.referral_code))
        self.assertEqual(ReferralAttribution.objects.filter(referred_user=referred).count(), 1)

    def test_ambassador_leaderboard_via_code(self):
        founder = User.objects.create_user(
            username="f", email="f@e.com", password="Pw!DueNest123", is_staff=True
        )
        self.client.force_authenticate(founder)
        resp = self.client.post(
            reverse("founder-growth-ambassadors"),
            {"name": "Campus Lead", "community": "ABC University", "referral_code": "amb123"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertTrue(AmbassadorProfile.objects.filter(referral_code="amb123").exists())
        ref = self.client.get(reverse("founder-growth-referrals"))
        self.assertEqual(ref.status_code, status.HTTP_200_OK)
        self.assertIn("ambassadors", ref.json())


class AttributionTests(APITestCase):
    def test_capture_first_and_last_touch(self):
        user = User.objects.create_user(username="u", email="u@e.com", password="Pw!DueNest123")
        capture_attribution(user, {"utm_source": "facebook", "utm_campaign": "july"})
        capture_attribution(user, {"utm_source": "linkedin", "utm_campaign": "august"})
        attr = UserAttribution.objects.get(user=user)
        self.assertEqual(attr.first_utm_source, "facebook")  # first preserved
        self.assertEqual(attr.last_utm_source, "linkedin")  # last updated

    def test_attribution_endpoint_requires_auth(self):
        resp = self.client.post(reverse("growth-attribution-capture"), {"utm_source": "x"}, format="json")
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_signup_captures_attribution(self):
        resp = self.client.post(
            reverse("auth-register"),
            {
                "username": "newbie",
                "email": "newbie@example.com",
                "password": "Pw!DueNest123",
                "utm_source": "tiktok",
                "utm_campaign": "demo_video",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        user = User.objects.get(username="newbie")
        attr = UserAttribution.objects.get(user=user)
        self.assertEqual(attr.first_utm_source, "tiktok")


class SegmentEngineTests(APITestCase):
    def test_not_activated_excludes_document_owners(self):
        active = User.objects.create_user(username="a", email="a@e.com", password="Pw!DueNest123")
        Document.objects.create(owner=active, title="ID")
        dormant = User.objects.create_user(username="b", email="b@e.com", password="Pw!DueNest123")
        not_activated = list(evaluate_segment_queryset({"activation": "not_activated"}).values_list("id", flat=True))
        self.assertIn(dormant.id, not_activated)
        self.assertNotIn(active.id, not_activated)
