"""Profile editing + avatar upload/remove."""

import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from .avatars import AvatarProcessingError, build_avatar_data_url

User = get_user_model()


def _png_bytes() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (12, 12), (200, 100, 50)).save(buffer, format="PNG")
    return buffer.getvalue()


class ProfileAvatarTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="ann", email="ann@example.com", password="pw-12345!"
        )
        self.client.force_authenticate(user=self.user)

    def test_patch_updates_name_only(self):
        resp = self.client.patch(
            "/api/v1/users/me/",
            {"first_name": "Ann", "last_name": "Lee", "email": "evil@example.com"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.first_name, "Ann")
        self.assertEqual(self.user.last_name, "Lee")
        # Email is identity-sensitive and not editable via this endpoint.
        self.assertEqual(self.user.email, "ann@example.com")

    def test_avatar_upload_then_delete(self):
        upload = SimpleUploadedFile("a.png", _png_bytes(), content_type="image/png")
        resp = self.client.post(
            "/api/v1/users/me/avatar/", {"avatar": upload}, format="multipart"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(
            resp.data["profile_image_url"].startswith("data:image/jpeg;base64,")
        )
        self.user.refresh_from_db()
        self.assertTrue(self.user.avatar_image)

        resp = self.client.delete("/api/v1/users/me/avatar/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.avatar_image, "")
        self.assertEqual(resp.data["profile_image_url"], "")

    def test_avatar_rejects_non_image(self):
        bad = SimpleUploadedFile("a.txt", b"not an image", content_type="text/plain")
        resp = self.client.post(
            "/api/v1/users/me/avatar/", {"avatar": bad}, format="multipart"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_avatar_requires_auth(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(
            "/api/v1/users/me/avatar/", {}, format="multipart"
        )
        self.assertIn(
            resp.status_code,
            (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
        )

    def test_build_avatar_data_url_rejects_garbage(self):
        with self.assertRaises(AvatarProcessingError):
            build_avatar_data_url(b"definitely not an image")

    def test_me_exposes_profile_image_url_field(self):
        resp = self.client.get("/api/v1/users/me/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("profile_image_url", resp.data)
