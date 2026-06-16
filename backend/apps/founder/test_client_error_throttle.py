"""SEC-008 regression tests: client error log endpoint is bounded + throttled."""

from unittest import mock

from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework.throttling import ScopedRateThrottle

URL = "/api/v1/errors/client/"
BASE = {"severity": "error", "source": "frontend", "error_type": "TypeError"}


class ClientErrorLogSecurityTests(APITestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_anonymous_error_log_accepted(self):
        resp = self.client.post(URL, {**BASE, "message": "boom"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_oversized_message_is_truncated(self):
        resp = self.client.post(URL, {**BASE, "message": "x" * 9000}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertLessEqual(len(resp.data["message"]), 2000)

    def test_oversized_metadata_rejected(self):
        resp = self.client.post(
            URL,
            {**BASE, "message": "m", "metadata": {"blob": "z" * 9000}},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_throttled_after_limit(self):
        # Force a low rate for the scoped throttle so the test is deterministic
        # regardless of the environment's configured rate.
        cache.clear()
        payload = {**BASE, "message": "m"}
        with mock.patch.object(ScopedRateThrottle, "get_rate", return_value="3/min"):
            codes = [
                self.client.post(URL, payload, format="json").status_code
                for _ in range(5)
            ]
        self.assertIn(status.HTTP_429_TOO_MANY_REQUESTS, codes)
