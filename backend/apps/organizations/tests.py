import shutil
import tempfile
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.users import plans

from .models import (
    DocumentCollectionCampaign,
    DocumentRequest,
    DocumentRequestSubmission,
    Organization,
    OrganizationDocument,
    OrganizationInvite,
    OrganizationMembership,
    OrganizationSecureRoom,
)

User = get_user_model()


def org_url(org_id=None):
    return "/api/v1/organizations/" if org_id is None else f"/api/v1/organizations/{org_id}/"


def members_url(org_id):
    return f"/api/v1/organizations/{org_id}/members/"


def member_detail_url(org_id, membership_id):
    return f"/api/v1/organizations/{org_id}/members/{membership_id}/"


def invites_url(org_id):
    return f"/api/v1/organizations/{org_id}/invites/"


def invite_accept_url(token):
    return f"/api/v1/organization-invites/{token}/accept/"


def documents_url(org_id):
    return f"/api/v1/organizations/{org_id}/documents/"


def document_files_url(org_id, document_id):
    return f"/api/v1/organizations/{org_id}/documents/{document_id}/files/"


def requests_url(org_id):
    return f"/api/v1/organizations/{org_id}/document-requests/"


def request_submit_url(org_id, request_id):
    return f"/api/v1/organizations/{org_id}/document-requests/{request_id}/submit/"


def request_approve_url(org_id, request_id):
    return f"/api/v1/organizations/{org_id}/document-requests/{request_id}/approve/"


def campaigns_url(org_id):
    return f"/api/v1/organizations/{org_id}/campaigns/"


def secure_rooms_url(org_id):
    return f"/api/v1/organizations/{org_id}/secure-rooms/"


def public_request_url(token):
    return f"/api/v1/public/document-requests/{token}/"


def public_request_upload_url(token):
    return f"/api/v1/public/document-requests/{token}/upload/"


def public_room_url(token):
    return f"/api/v1/public/organization-secure-rooms/{token}/"


def make_pdf(name="passport.pdf", content=b"%PDF-1.4 fake pdf bytes"):
    return SimpleUploadedFile(name, content, content_type="application/pdf")


_TEMP_MEDIA = tempfile.mkdtemp(prefix="duenest-org-test-media-")


@override_settings(MEDIA_ROOT=_TEMP_MEDIA)
class OrganizationWorkspaceAPITests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_TEMP_MEDIA, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        self.owner = self.make_user("owner", "owner@example.com")
        self.admin = self.make_user("admin", "admin@example.com")
        self.member = self.make_user("member", "member@example.com")
        self.viewer = self.make_user("viewer", "viewer@example.com")
        self.outsider = self.make_user("outsider", "outsider@example.com")

    def make_user(self, username, email):
        user = User.objects.create_user(
            username=username,
            email=email,
            password="StrongPassword123!DueNest",
        )
        user.plan = plans.PLAN_PRO_PLACEHOLDER
        user.save(update_fields=["plan"])
        return user

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def make_org(self, owner=None, name="Student Association"):
        owner = owner or self.owner
        org = Organization.objects.create(
            name=name,
            organization_type=Organization.OrganizationType.STUDENT_ASSOCIATION,
            created_by=owner,
        )
        owner_membership = OrganizationMembership.objects.create(
            organization=org,
            user=owner,
            role=OrganizationMembership.Role.OWNER,
            status=OrganizationMembership.Status.ACTIVE,
        )
        return org, owner_membership

    def add_member(self, organization, user, role=OrganizationMembership.Role.MEMBER):
        return OrganizationMembership.objects.create(
            organization=organization,
            user=user,
            role=role,
            status=OrganizationMembership.Status.ACTIVE,
        )

    def test_create_organization_sets_owner_membership_and_tracks_usage(self):
        free_user = User.objects.create_user(
            username="freeuser",
            email="free@example.com",
            password="StrongPassword123!DueNest",
        )
        self.authenticate(free_user)
        response = self.client.post(
            org_url(),
            {
                "name": "Scholarship Team",
                "organization_type": "scholarship_team",
                "country": "Malaysia",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        org = Organization.objects.get(name="Scholarship Team")
        membership = OrganizationMembership.objects.get(organization=org, user=free_user)
        self.assertEqual(membership.role, OrganizationMembership.Role.OWNER)

        usage = self.client.get("/api/v1/plan/usage/")
        self.assertEqual(
            usage.data["resources"][plans.RESOURCE_ORGANIZATIONS]["used"],
            1,
        )
        self.assertEqual(
            usage.data["resources"][plans.RESOURCE_ORGANIZATION_MEMBERS]["used"],
            1,
        )

        blocked = self.client.post(org_url(), {"name": "Second org"}, format="json")
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(blocked.data["resource"], plans.RESOURCE_ORGANIZATIONS)

    def test_membership_scopes_access_and_removed_member_loses_access(self):
        org, _ = self.make_org()
        membership = self.add_member(org, self.member)

        self.authenticate(self.outsider)
        detail = self.client.get(org_url(org.id))
        summary = self.client.get(f"/api/v1/organizations/{org.id}/summary/")
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(summary.status_code, status.HTTP_403_FORBIDDEN)

        self.authenticate(self.owner)
        removed = self.client.delete(member_detail_url(org.id, membership.id))
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)

        self.authenticate(self.member)
        denied = self.client.get(f"/api/v1/organizations/{org.id}/summary/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_cannot_change_owner_and_last_owner_is_protected(self):
        org, owner_membership = self.make_org()
        self.add_member(org, self.admin, OrganizationMembership.Role.ADMIN)

        self.authenticate(self.admin)
        blocked = self.client.patch(
            member_detail_url(org.id, owner_membership.id),
            {"role": OrganizationMembership.Role.MEMBER},
            format="json",
        )
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)

        self.authenticate(self.owner)
        last_owner = self.client.delete(member_detail_url(org.id, owner_membership.id))
        self.assertEqual(last_owner.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invite_can_be_accepted_only_by_matching_email(self):
        org, _ = self.make_org()
        self.authenticate(self.owner)
        created = self.client.post(
            invites_url(org.id),
            {"email": self.member.email, "role": OrganizationMembership.Role.MEMBER},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertTrue(created.data["invite_url"].startswith("/org-invite/"))
        token = created.data["token"]

        self.authenticate(self.outsider)
        wrong_email = self.client.post(invite_accept_url(token), {}, format="json")
        self.assertEqual(wrong_email.status_code, status.HTTP_403_FORBIDDEN)

        self.authenticate(self.member)
        accepted = self.client.post(invite_accept_url(token), {}, format="json")
        self.assertEqual(accepted.status_code, status.HTTP_200_OK)
        invite = OrganizationInvite.objects.get(token=token)
        self.assertEqual(invite.status, OrganizationInvite.Status.ACCEPTED)
        self.assertTrue(
            OrganizationMembership.objects.filter(
                organization=org,
                user=self.member,
                status=OrganizationMembership.Status.ACTIVE,
            ).exists()
        )

    def test_document_file_upload_and_request_approval_flow(self):
        org, _ = self.make_org()
        member_membership = self.add_member(org, self.member)

        self.authenticate(self.owner)
        doc_response = self.client.post(
            documents_url(org.id),
            {"title": "Event approval letter", "document_type": "approval"},
            format="json",
        )
        self.assertEqual(doc_response.status_code, status.HTTP_201_CREATED)
        document_id = doc_response.data["id"]

        file_response = self.client.post(
            document_files_url(org.id, document_id),
            {"file": make_pdf("approval.pdf")},
            format="multipart",
        )
        self.assertEqual(file_response.status_code, status.HTTP_201_CREATED)

        request_response = self.client.post(
            requests_url(org.id),
            {
                "title": "Upload passport copy",
                "assigned_to_member": member_membership.id,
                "deadline": (timezone.localdate() + timedelta(days=7)).isoformat(),
                "linked_document": document_id,
            },
            format="json",
        )
        self.assertEqual(request_response.status_code, status.HTTP_201_CREATED)
        request_id = request_response.data["id"]

        self.authenticate(self.member)
        submitted = self.client.post(
            request_submit_url(org.id, request_id),
            {"file": make_pdf("passport.pdf"), "notes": "Uploaded for review."},
            format="multipart",
        )
        self.assertEqual(submitted.status_code, status.HTTP_201_CREATED)

        self.authenticate(self.owner)
        approved = self.client.post(request_approve_url(org.id, request_id), {})
        self.assertEqual(approved.status_code, status.HTTP_200_OK)
        request_obj = DocumentRequest.objects.get(id=request_id)
        submission = DocumentRequestSubmission.objects.get(request=request_obj)
        self.assertEqual(request_obj.status, DocumentRequest.Status.APPROVED)
        self.assertEqual(submission.status, DocumentRequestSubmission.Status.APPROVED)

    def test_cross_organization_assignee_is_rejected(self):
        org, _ = self.make_org(name="Org A")
        other_org, _ = self.make_org(owner=self.outsider, name="Org B")
        other_member = self.add_member(other_org, self.member)

        self.authenticate(self.owner)
        response = self.client.post(
            requests_url(org.id),
            {
                "title": "Cross org request",
                "assigned_to_member": other_member.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assigned_to_member", response.data)

    def test_campaign_progress_targets_members(self):
        org, owner_membership = self.make_org()
        member_membership = self.add_member(org, self.member)

        self.authenticate(self.owner)
        response = self.client.post(
            campaigns_url(org.id),
            {
                "title": "Collect participant IDs",
                "target_all_members": False,
                "target_member_ids": [owner_membership.id, member_membership.id],
                "requirements": [
                    {
                        "title": "Student ID",
                        "required_file_type": "PDF/JPG/PNG",
                        "is_required": True,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        campaign = DocumentCollectionCampaign.objects.get(id=response.data["id"])
        self.assertEqual(campaign.targets.count(), 2)
        self.assertEqual(response.data["progress"]["target_count"], 2)

    def test_public_request_upload_uses_only_request_token(self):
        org, _ = self.make_org()
        self.authenticate(self.owner)
        created = self.client.post(
            requests_url(org.id),
            {
                "title": "External recommendation letter",
                "recipient_email": "referee@example.com",
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        token = created.data["public_upload_token"]
        self.client.force_authenticate(user=None)

        public_detail = self.client.get(public_request_url(token))
        self.assertEqual(public_detail.status_code, status.HTTP_200_OK)
        self.assertNotIn("internal_note", public_detail.data)

        upload = self.client.post(
            public_request_upload_url(token),
            {
                "email": "referee@example.com",
                "file": make_pdf("recommendation.pdf"),
            },
            format="multipart",
        )
        self.assertEqual(upload.status_code, status.HTTP_201_CREATED)
        request_obj = DocumentRequest.objects.get(public_upload_token=token)
        self.assertEqual(request_obj.status, DocumentRequest.Status.SUBMITTED)

    def test_public_secure_room_exposes_only_selected_metadata(self):
        org, _ = self.make_org()
        document = OrganizationDocument.objects.create(
            organization=org,
            created_by=self.owner,
            title="Sponsor pack",
        )
        self.authenticate(self.owner)
        file_response = self.client.post(
            document_files_url(org.id, document.id),
            {"file": make_pdf("sponsor.pdf")},
            format="multipart",
        )
        self.assertEqual(file_response.status_code, status.HTTP_201_CREATED)

        room_response = self.client.post(
            secure_rooms_url(org.id),
            {
                "title": "Advisor review room",
                "status": OrganizationSecureRoom.Status.ACTIVE,
                "items": [
                    {"document": document.id, "file": file_response.data["id"]},
                ],
            },
            format="json",
        )
        self.assertEqual(room_response.status_code, status.HTTP_201_CREATED)
        token = room_response.data["token"]
        self.client.force_authenticate(user=None)

        public = self.client.get(public_room_url(token))
        self.assertEqual(public.status_code, status.HTTP_200_OK)
        self.assertEqual(public.data["organization_name"], org.name)
        self.assertEqual(public.data["items"][0]["file_name"], "sponsor.pdf")
        self.assertNotIn("token", public.data)
