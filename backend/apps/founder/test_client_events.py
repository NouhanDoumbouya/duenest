"""Tests for the privacy-safe client UI event ingest endpoint."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.founder.models import ProductEvent

User = get_user_model()

URL = "/api/v1/events/client/"


class ClientEventTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="alice", email="alice@example.com", password="StrongPass123!Ev"
        )

    def test_records_allowed_event_with_frontend_source(self):
        self.client.force_authenticate(self.user)
        res = self.client.post(
            URL,
            {"event_type": "forgetting_check_used", "metadata": {"source": "hero"}},
            format="json",
        )
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        event = ProductEvent.objects.filter(
            user=self.user, event_type="forgetting_check_used"
        ).first()
        self.assertIsNotNone(event)
        self.assertEqual(event.event_source, ProductEvent.Source.FRONTEND)

    def test_rejects_non_allowlisted_event_type(self):
        self.client.force_authenticate(self.user)
        # A real event type, but not one clients may submit.
        res = self.client.post(URL, {"event_type": "user_signed_up"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            ProductEvent.objects.filter(event_type="user_signed_up").exists()
        )

    def test_rejects_unknown_event_type(self):
        self.client.force_authenticate(self.user)
        res = self.client.post(URL, {"event_type": "not_a_real_event"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_requires_authentication(self):
        res = self.client.post(URL, {"event_type": "dashboard_viewed"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
