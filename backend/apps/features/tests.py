"""Tests for Feature Flags Lite: resolution, enforcement, and founder control."""

import os
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.features.flags import (
    FeatureDisabled,
    is_feature_enabled,
    require_feature_enabled,
)
from apps.features.models import FeatureFlag, Visibility

User = get_user_model()


class FlagResolutionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="u", email="u@x.com", password="StrongPassword123!DN"
        )
        self.founder = User.objects.create_user(
            username="f", email="f@x.com", password="StrongPassword123!DN",
            is_staff=True,
        )

    def test_missing_flag_defaults_safe_enabled(self):
        # No row, no env → registry default (enabled) so shipped features work.
        self.assertTrue(is_feature_enabled("quick_share", self.user))

    def test_disabled_blocks_everyone(self):
        FeatureFlag.objects.create(key="quick_share", visibility=Visibility.DISABLED)
        self.assertFalse(is_feature_enabled("quick_share", self.user))
        self.assertFalse(is_feature_enabled("quick_share", self.founder))

    def test_founder_only_allows_only_founder(self):
        FeatureFlag.objects.create(key="ocr", visibility=Visibility.FOUNDER_ONLY)
        self.assertFalse(is_feature_enabled("ocr", self.user))
        self.assertTrue(is_feature_enabled("ocr", self.founder))
        self.assertFalse(is_feature_enabled("ocr", None))

    def test_beta_only_allows_authenticated(self):
        FeatureFlag.objects.create(key="ocr", visibility=Visibility.BETA_ONLY)
        self.assertTrue(is_feature_enabled("ocr", self.user))
        self.assertTrue(is_feature_enabled("ocr", self.founder))
        self.assertFalse(is_feature_enabled("ocr", None))

    @mock.patch.dict(os.environ, {"DUENEST_FEATURE_FEEDBACK": "false"})
    def test_env_fallback_when_no_row(self):
        self.assertFalse(is_feature_enabled("feedback", self.user))

    def test_db_overrides_env(self):
        FeatureFlag.objects.create(key="feedback", visibility=Visibility.ENABLED)
        with mock.patch.dict(os.environ, {"DUENEST_FEATURE_FEEDBACK": "false"}):
            self.assertTrue(is_feature_enabled("feedback", self.user))

    def test_require_raises_feature_disabled(self):
        FeatureFlag.objects.create(key="quick_share", visibility=Visibility.DISABLED)
        with self.assertRaises(FeatureDisabled):
            require_feature_enabled("quick_share", self.user)


class FounderFlagApiTests(APITestCase):
    LIST = "/api/v1/founder/feature-flags/"
    MAP = "/api/v1/features/"

    def setUp(self):
        self.user = User.objects.create_user(
            username="u", email="u@x.com", password="StrongPassword123!DN"
        )
        self.founder = User.objects.create_user(
            username="f", email="f@x.com", password="StrongPassword123!DN",
            is_staff=True,
        )

    def test_feature_map_is_public_and_lists_keys(self):
        resp = self.client.get(self.MAP)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("quick_share", resp.data["features"])
        self.assertIn("enabled", resp.data["features"]["quick_share"])

    def test_non_founder_cannot_list_or_toggle(self):
        self.client.force_authenticate(self.user)
        self.assertIn(self.client.get(self.LIST).status_code, (401, 403))
        self.assertIn(
            self.client.patch(
                f"{self.LIST}quick_share/", {"visibility": "disabled"}, format="json"
            ).status_code,
            (401, 403, 404),
        )

    def test_founder_can_disable_and_it_takes_effect(self):
        self.client.force_authenticate(self.founder)
        resp = self.client.patch(
            f"{self.LIST}quick_share/", {"visibility": "disabled"}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["visibility"], "disabled")
        self.assertFalse(is_feature_enabled("quick_share", self.user))


_TEMP = "/tmp/duenest-feature-flag-test"


@override_settings(MEDIA_ROOT=_TEMP)
class EnforcementEndpointTests(APITestCase):
    """A disabled flag blocks the real endpoint, not just the UI."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="u", email="u@x.com", password="StrongPassword123!DN"
        )

    def test_disabled_quick_share_blocks_create(self):
        FeatureFlag.objects.create(key="quick_share", visibility=Visibility.DISABLED)
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/quick-share/sessions/",
            {
                "permission": "view_only",
                "expires_at": (timezone.now() + timedelta(minutes=10)).isoformat(),
                "file_ids": [],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 503, resp.data)
        self.assertEqual(resp.data["feature"], "quick_share")
        self.assertEqual(resp.data["status"], "disabled")

    def test_disabled_quick_share_public_viewer_blocks_access(self):
        FeatureFlag.objects.create(
            key="quick_share_public_viewer", visibility=Visibility.DISABLED
        )
        resp = self.client.get("/api/v1/quick-share/claim/sometoken/")
        self.assertEqual(resp.status_code, 503)
        self.assertEqual(resp.data["feature"], "quick_share_public_viewer")

    def test_disabled_emergency_public_viewer_blocks_access(self):
        FeatureFlag.objects.create(
            key="emergency_public_viewer", visibility=Visibility.DISABLED
        )
        resp = self.client.get("/api/v1/share/emergency-packs/sometoken/")
        self.assertEqual(resp.status_code, 503)
        self.assertEqual(resp.data["feature"], "emergency_public_viewer")
