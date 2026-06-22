"""Organization branding: brand colour + logo, surfaced on public requests."""

import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users import plans

from .models import DocumentRequest, Organization, OrganizationMembership

User = get_user_model()


def _png():
    buf = io.BytesIO()
    Image.new("RGB", (20, 20), (10, 120, 110)).save(buf, format="PNG")
    return SimpleUploadedFile("logo.png", buf.getvalue(), content_type="image/png")


class OrganizationBrandingTests(APITestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            username="owner", email="owner@example.com", password="pw-12345!DueNest"
        )
        self.owner.plan = plans.PLAN_PRO_PLACEHOLDER
        self.owner.save(update_fields=["plan"])
        self.org = Organization.objects.create(
            name="Student Association",
            organization_type=Organization.OrganizationType.STUDENT_ASSOCIATION,
            created_by=self.owner,
        )
        OrganizationMembership.objects.create(
            organization=self.org,
            user=self.owner,
            role=OrganizationMembership.Role.OWNER,
            status=OrganizationMembership.Status.ACTIVE,
        )
        self.client.force_authenticate(self.owner)

    def _org_url(self):
        return f"/api/v1/organizations/{self.org.id}/"

    def _logo_url(self):
        return f"/api/v1/organizations/{self.org.id}/logo/"

    def test_set_valid_brand_color(self):
        resp = self.client.patch(
            self._org_url(), {"brand_color": "#0F766E"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.org.refresh_from_db()
        self.assertEqual(self.org.brand_color, "#0F766E")

    def test_invalid_brand_color_rejected(self):
        resp = self.client.patch(
            self._org_url(), {"brand_color": "teal"}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_logo_upload_then_remove(self):
        resp = self.client.post(
            self._logo_url(), {"logo": _png()}, format="multipart"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["logo_image"].startswith("data:image/jpeg;base64,"))

        resp = self.client.delete(self._logo_url())
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.org.refresh_from_db()
        self.assertEqual(self.org.logo_image, "")

    def test_public_request_exposes_branding(self):
        self.org.brand_color = "#0F766E"
        self.org.logo_image = "data:image/jpeg;base64,AAAA"
        self.org.save(update_fields=["brand_color", "logo_image"])
        created = self.client.post(
            f"/api/v1/organizations/{self.org.id}/document-requests/",
            {"title": "Transcript", "recipient_email": "ref@example.com"},
            format="json",
        )
        token = created.data["public_upload_token"]
        self.client.force_authenticate(user=None)
        resp = self.client.get(f"/api/v1/public/document-requests/{token}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["organization_brand_color"], "#0F766E")
        self.assertEqual(resp.data["organization_logo"], "data:image/jpeg;base64,AAAA")

    def test_non_member_cannot_set_logo(self):
        outsider = User.objects.create_user(
            username="nobody", email="nobody@example.com", password="pw-12345!DueNest"
        )
        self.client.force_authenticate(outsider)
        resp = self.client.post(
            self._logo_url(), {"logo": _png()}, format="multipart"
        )
        self.assertIn(
            resp.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
        )
