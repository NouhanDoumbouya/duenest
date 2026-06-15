"""Tests for the Founder Growth Command Center (access control, campaigns, UTM,
funnel/overview, actions)."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .growth import build_utm_url, normalize_utm_value
from .models import GrowthAction, MarketingCampaign

User = get_user_model()


class GrowthAccessControlTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="normal", email="normal@example.com", password="Pw!DueNest123"
        )
        self.founder = User.objects.create_user(
            username="founder",
            email="founder@example.com",
            password="Pw!DueNest123",
            is_staff=True,
        )

    def test_anonymous_blocked(self):
        resp = self.client.get(reverse("founder-growth-overview"))
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_normal_user_blocked(self):
        self.client.force_authenticate(self.user)
        for name in ("founder-growth-overview", "founder-growth-funnel", "founder-growth-campaigns"):
            resp = self.client.get(reverse(name))
            self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN, name)

    def test_founder_can_access_overview_and_funnel(self):
        self.client.force_authenticate(self.founder)
        overview = self.client.get(reverse("founder-growth-overview"))
        self.assertEqual(overview.status_code, status.HTTP_200_OK)
        self.assertIn("kpis", overview.json())
        self.assertIn("insights", overview.json())
        funnel = self.client.get(reverse("founder-growth-funnel"))
        self.assertEqual(funnel.status_code, status.HTTP_200_OK)
        self.assertIn("steps", funnel.json())
        self.assertIn("biggest_drop_off", funnel.json())


class GrowthCampaignTests(APITestCase):
    def setUp(self):
        self.founder = User.objects.create_user(
            username="founder", email="f@example.com", password="Pw!DueNest123", is_staff=True
        )
        self.client.force_authenticate(self.founder)

    def test_create_campaign_generates_slug_and_url(self):
        resp = self.client.post(
            reverse("founder-growth-campaigns"),
            {
                "name": "International Students July",
                "channel": "facebook",
                "source": "facebook",
                "medium": "community",
                "landing_url": "https://duenest.com/",
                "status": "active",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        body = resp.json()
        self.assertEqual(body["slug"], "international-students-july")
        self.assertIn("utm_campaign=international-students-july", body["generated_url"])
        self.assertIn("metrics", body)

    def test_update_campaign_status(self):
        campaign = MarketingCampaign.objects.create(name="Reddit launch", slug="reddit-launch")
        resp = self.client.patch(
            reverse("founder-growth-campaign-detail", args=[campaign.id]),
            {"status": "paused"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        campaign.refresh_from_db()
        self.assertEqual(campaign.status, "paused")
        self.assertEqual(campaign.updated_by, self.founder)


class UtmBuilderTests(APITestCase):
    def setUp(self):
        self.founder = User.objects.create_user(
            username="founder", email="f@example.com", password="Pw!DueNest123", is_staff=True
        )
        self.client.force_authenticate(self.founder)

    def test_builds_and_normalizes(self):
        resp = self.client.post(
            reverse("founder-growth-utm-builder"),
            {
                "base_url": "https://duenest.com/?ref=x",
                "source": "Facebook",
                "medium": "Community",
                "campaign": "International Students July",
                "content": "Visa Deadline Post",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.content)
        url = resp.json()["url"]
        self.assertIn("utm_source=facebook", url)
        self.assertIn("utm_campaign=international_students_july", url)
        self.assertIn("ref=x", url)  # preserved

    def test_invalid_url_rejected(self):
        resp = self.client.post(
            reverse("founder-growth-utm-builder"),
            {"base_url": "not a url", "source": "fb", "medium": "social", "campaign": "x"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("error", resp.json())

    def test_missing_required_rejected(self):
        resp = self.client.post(
            reverse("founder-growth-utm-builder"),
            {"base_url": "https://duenest.com/", "source": "", "medium": "", "campaign": ""},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_helpers(self):
        self.assertEqual(normalize_utm_value("  Hello World "), "hello_world")
        url = build_utm_url(
            "https://duenest.com/", source="tiktok", medium="video", campaign="demo"
        )
        self.assertIn("utm_medium=video", url)
        with self.assertRaises(ValueError):
            build_utm_url("ftp://x", source="a", medium="b", campaign="c")


class GrowthActionTests(APITestCase):
    def setUp(self):
        self.founder = User.objects.create_user(
            username="founder", email="f@example.com", password="Pw!DueNest123", is_staff=True
        )
        self.user = User.objects.create_user(
            username="n", email="n@example.com", password="Pw!DueNest123"
        )
        self.client.force_authenticate(self.founder)

    def test_create_and_resolve_action(self):
        resp = self.client.post(
            reverse("founder-growth-actions"),
            {"title": "Email users who didn't add a document", "priority": "high"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        action_id = resp.json()["id"]
        patch = self.client.patch(
            reverse("founder-growth-action-detail", args=[action_id]),
            {"status": "done"},
            format="json",
        )
        self.assertEqual(patch.status_code, status.HTTP_200_OK)
        self.assertEqual(GrowthAction.objects.get(id=action_id).status, "done")

    def test_actions_founder_only(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get(reverse("founder-growth-actions"))
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
