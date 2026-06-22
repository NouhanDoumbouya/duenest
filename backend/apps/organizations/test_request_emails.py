"""Organization document requests email their external recipients (R1)."""

from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users import plans

from .models import DocumentRequest, Organization, OrganizationMembership

User = get_user_model()

SEND_TARGET = "apps.organizations.services.send_transactional_email"


class DocumentRequestEmailTests(APITestCase):
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

    def _requests_url(self):
        return f"/api/v1/organizations/{self.org.id}/document-requests/"

    def _remind_url(self, request_id):
        return (
            f"/api/v1/organizations/{self.org.id}"
            f"/document-requests/{request_id}/remind/"
        )

    def test_create_with_recipient_sends_invite_email(self):
        with mock.patch(SEND_TARGET, return_value=True) as send:
            resp = self.client.post(
                self._requests_url(),
                {"title": "Recommendation letter", "recipient_email": "ref@example.com"},
                format="json",
            )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        send.assert_called_once()
        _, kwargs = send.call_args
        self.assertEqual(send.call_args.args[0], "org_document_request_invite")
        self.assertEqual(kwargs["to"], "ref@example.com")
        # The recipient-facing upload link is included.
        token = resp.data["public_upload_token"]
        self.assertIn(f"/org-request/{token}", kwargs["context"]["action_url"])

    def test_create_without_recipient_sends_no_email(self):
        with mock.patch(SEND_TARGET, return_value=True) as send:
            resp = self.client.post(
                self._requests_url(),
                {"title": "Internal-only request"},
                format="json",
            )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        send.assert_not_called()

    def test_remind_sends_reminder_email(self):
        created = self.client.post(
            self._requests_url(),
            {"title": "Transcript", "recipient_email": "ref@example.com"},
            format="json",
        )
        request_id = created.data["id"]
        with mock.patch(SEND_TARGET, return_value=True) as send:
            resp = self.client.post(self._remind_url(request_id), {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        send.assert_called_once()
        self.assertEqual(
            send.call_args.args[0], "org_document_request_reminder"
        )

    def test_only_admins_can_create(self):
        outsider = User.objects.create_user(
            username="nobody", email="nobody@example.com", password="pw-12345!DueNest"
        )
        self.client.force_authenticate(outsider)
        resp = self.client.post(
            self._requests_url(),
            {"title": "Nope", "recipient_email": "ref@example.com"},
            format="json",
        )
        self.assertIn(
            resp.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
        )
