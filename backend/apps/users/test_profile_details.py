"""Encrypted, owner-scoped personal profile details."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import UserProfileDetails

User = get_user_model()
URL = "/api/v1/users/me/profile-details/"


class ProfileDetailsTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ann", email="ann@example.com", password="pw-12345!"
        )
        self.client.force_authenticate(user=self.user)

    def test_get_starts_empty(self):
        resp = self.client.get(URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["legal_name"], "")
        self.assertEqual(resp.data["passport_number"], "")
        # Every known field is present (as empty strings).
        for field in UserProfileDetails.PROFILE_FIELDS:
            self.assertIn(field, resp.data)

    def test_patch_saves_and_reads_back(self):
        resp = self.client.patch(
            URL,
            {"legal_name": "Ann Lee", "passport_number": "A1234567"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["legal_name"], "Ann Lee")
        self.assertEqual(resp.data["passport_number"], "A1234567")

        # Round-trips on a fresh GET.
        self.assertEqual(self.client.get(URL).data["legal_name"], "Ann Lee")

    def test_values_are_encrypted_at_rest(self):
        self.client.patch(
            URL, {"passport_number": "A1234567"}, format="json"
        )
        details = UserProfileDetails.objects.get(user=self.user)
        self.assertIsNotNone(details.data_ciphertext)
        # The plaintext must not appear in the stored bytes.
        self.assertNotIn(b"A1234567", bytes(details.data_ciphertext))

    def test_partial_update_preserves_other_fields(self):
        self.client.patch(URL, {"legal_name": "Ann Lee"}, format="json")
        self.client.patch(URL, {"phone": "+15551234"}, format="json")
        data = self.client.get(URL).data
        self.assertEqual(data["legal_name"], "Ann Lee")
        self.assertEqual(data["phone"], "+15551234")

    def test_blank_clears_a_single_field(self):
        self.client.patch(URL, {"legal_name": "Ann Lee"}, format="json")
        resp = self.client.patch(URL, {"legal_name": ""}, format="json")
        self.assertEqual(resp.data["legal_name"], "")

    def test_delete_clears_everything(self):
        self.client.patch(
            URL, {"legal_name": "Ann Lee", "phone": "+1"}, format="json"
        )
        resp = self.client.delete(URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["legal_name"], "")
        details = UserProfileDetails.objects.get(user=self.user)
        self.assertIsNone(details.data_ciphertext)

    def test_details_are_owner_scoped(self):
        self.client.patch(URL, {"legal_name": "Ann Lee"}, format="json")
        other = User.objects.create_user(
            username="bob", email="bob@example.com", password="pw-12345!"
        )
        self.client.force_authenticate(user=other)
        # Bob sees only his own (empty) details, never Ann's.
        self.assertEqual(self.client.get(URL).data["legal_name"], "")

    def test_requires_auth(self):
        self.client.force_authenticate(user=None)
        self.assertIn(
            self.client.get(URL).status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )
