"""
Custom Document Organization V1 — folders / tags / collections / smart views.

Covers the personal (owner-scoped) and organization (role-gated) surfaces:
folder CRUD + nesting + anti-cycle + archive, document move (and the guarantee
that moving never changes a file's stored object key), tags, collections, saved/
smart views, org folder permissions + scope isolation, case/person auto-folders,
opt-in auto-filing of accepted portal uploads, and the audit/privacy guarantees.
No AI is ever called.
"""

from __future__ import annotations

import json
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.documents.models import (
    AuditLogEntry,
    Document,
    DocumentCollection,
    DocumentFile,
    DocumentFolder,
    DocumentTag,
)
from apps.users import plans

User = get_user_model()


def _user(name, plan=plans.PLAN_PRO_PLACEHOLDER):
    u = User.objects.create_user(username=name, email=f"{name}@x.com",
                                 password="StrongPass123!DN", first_name=name.title())
    u.plan = plan
    u.save(update_fields=["plan"])
    return u


class PersonalFolderTests(APITestCase):
    def setUp(self):
        self.user = _user("owner")
        self.other = _user("other")
        self.client.force_authenticate(self.user)

    def _folder(self, name="Identity", parent=None):
        body = {"name": name}
        if parent:
            body["parent"] = parent
        return self.client.post("/api/v1/documents/folders/", body, format="json")

    def _doc(self, title="Passport", owner=None):
        return Document.objects.create(owner=owner or self.user, title=title)

    def test_create_folder(self):
        resp = self._folder()
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["name"], "Identity")

    def test_cannot_access_other_users_folder(self):
        fid = self._folder().data["id"]
        self.client.force_authenticate(self.other)
        resp = self.client.get(f"/api/v1/documents/folders/{fid}/")
        self.assertEqual(resp.status_code, 404)

    def test_nested_folders(self):
        parent = self._folder("Immigration").data["id"]
        child = self._folder("Visa", parent=parent)
        self.assertEqual(child.status_code, 201, child.data)
        self.assertEqual(child.data["parent_id"], parent)
        tree = self.client.get("/api/v1/documents/folders/").data["folders"]
        imm = next(f for f in tree if f["name"] == "Immigration")
        self.assertEqual(len(imm["children"]), 1)

    def test_circular_move_rejected(self):
        parent = self._folder("A").data["id"]
        child = self._folder("B", parent=parent).data["id"]
        # Moving A under B (its own descendant) must be rejected.
        resp = self.client.post(f"/api/v1/documents/folders/{parent}/move/",
                                {"parent_id": child}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_archive_hides_from_tree(self):
        fid = self._folder().data["id"]
        self.client.post(f"/api/v1/documents/folders/{fid}/archive/", {}, format="json")
        tree = self.client.get("/api/v1/documents/folders/").data["folders"]
        self.assertEqual([f for f in tree if f["id"] == fid], [])

    def test_move_document_to_folder(self):
        fid = self._folder().data["id"]
        doc = self._doc()
        resp = self.client.post(f"/api/v1/documents/{doc.id}/move-to-folder/",
                                {"folder_id": fid}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        doc.refresh_from_db()
        self.assertEqual(doc.primary_folder_id, fid)

    def test_moving_document_does_not_change_storage_key(self):
        fid = self._folder().data["id"]
        doc = self._doc()
        f = DocumentFile.objects.create(
            document=doc, uploaded_by=self.user,
            file=SimpleUploadedFile("p.pdf", b"%PDF-1.4", content_type="application/pdf"),
            original_filename="p.pdf",
        )
        key_before = f.file.name
        self.client.post(f"/api/v1/documents/{doc.id}/move-to-folder/",
                         {"folder_id": fid}, format="json")
        f.refresh_from_db()
        self.assertEqual(f.file.name, key_before)  # storage object key unchanged

    def test_tags_create_assign_remove(self):
        tag = self.client.post("/api/v1/documents/tags/", {"name": "Urgent"}, format="json")
        self.assertEqual(tag.status_code, 201, tag.data)
        doc = self._doc()
        self.client.post(f"/api/v1/documents/{doc.id}/tags/",
                         {"tag_ids": [tag.data["id"]]}, format="json")
        self.assertEqual(doc.tags.count(), 1)
        # Removing = assigning an empty set.
        self.client.post(f"/api/v1/documents/{doc.id}/tags/", {"tag_ids": []}, format="json")
        self.assertEqual(doc.tags.count(), 0)

    def test_collection_add_remove(self):
        col = self.client.post("/api/v1/documents/collections/",
                               {"name": "Visa pack"}, format="json").data["id"]
        doc = self._doc()
        add = self.client.post(f"/api/v1/documents/collections/{col}/items/",
                               {"document_id": doc.id}, format="json")
        self.assertEqual(add.status_code, 201, add.data)
        items = self.client.get(f"/api/v1/documents/collections/{col}/items/")
        self.assertEqual(items.data["count"], 1)
        self.client.post(f"/api/v1/documents/collections/{col}/items/",
                         {"document_id": doc.id, "remove": True}, format="json")
        items = self.client.get(f"/api/v1/documents/collections/{col}/items/")
        self.assertEqual(items.data["count"], 0)

    def test_saved_view_filter_returns_expected(self):
        d1 = self._doc("Expiring soon")
        d1.expiry_date = timezone.now().date() + timedelta(days=10)
        d1.save(update_fields=["expiry_date"])
        self._doc("No expiry")
        resp = self.client.post("/api/v1/documents/smart-view/",
                                {"expiring_soon": True}, format="json")
        ids = [d["id"] for d in resp.data["documents"]]
        self.assertIn(d1.id, ids)
        self.assertEqual(resp.data["count"], 1)

    def test_folder_cap_enforced_for_free_plan(self):
        self.user.plan = plans.PLAN_FREE
        self.user.save(update_fields=["plan"])
        # Free cap is 20 folders.
        for i in range(20):
            DocumentFolder.objects.create(owner=self.user, name=f"F{i}")
        resp = self._folder("Over limit")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("limit", resp.data["detail"].lower())

    def test_audit_metadata_has_no_sensitive_data(self):
        fid = self._folder().data["id"]
        doc = self._doc()
        self.client.post(f"/api/v1/documents/{doc.id}/move-to-folder/",
                         {"folder_id": fid}, format="json")
        events = AuditLogEntry.objects.filter(event_type__startswith="document_")
        self.assertTrue(events.exists())
        for e in events:
            blob = json.dumps(e.metadata)
            self.assertNotIn("http", blob)
            self.assertNotIn("/media/", blob)
            self.assertNotIn("%PDF", blob)


_SETTINGS = dict(DUENEST_APP_BASE_URL="https://app.certanest.test")


def _flag_on():
    return mock.patch("apps.features.flags.is_feature_enabled", return_value=True)


@override_settings(**_SETTINGS)
class OrgFolderTests(APITestCase):
    def setUp(self):
        from apps.organizations.models import Organization, OrganizationMembership
        from apps.organizations.portal_limits import set_organization_plan

        self.owner = _user("orgowner")
        self.admin = _user("orgadmin")
        self.member = _user("orgmember")
        self.outsider = _user("outsider")
        self.org = Organization.objects.create(
            name="Visa Agency",
            organization_type=Organization.OrganizationType.COMPANY,
            created_by=self.owner,
        )
        for u, role in ((self.owner, "owner"), (self.admin, "admin"), (self.member, "member")):
            OrganizationMembership.objects.create(
                organization=self.org, user=u,
                role=getattr(OrganizationMembership.Role, role.upper()),
                status=OrganizationMembership.Status.ACTIVE,
            )
        set_organization_plan(self.org, plan="teams_beta", portal_enabled=True)
        self.base = f"/api/v1/organizations/{self.org.id}/portal"
        self.client.force_authenticate(self.admin)

    def test_admin_can_create_org_folder(self):
        with _flag_on():
            resp = self.client.post(f"{self.base}/folders/", {"name": "Clients"}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        folder = DocumentFolder.objects.get(pk=resp.data["id"])
        self.assertEqual(folder.organization_id, self.org.id)
        self.assertEqual(folder.owner_id, self.owner.id)  # owned by org-owner user

    def test_non_member_cannot_access_org_folders(self):
        self.client.force_authenticate(self.outsider)
        with _flag_on():
            resp = self.client.get(f"{self.base}/folders/")
        self.assertIn(resp.status_code, (403, 404))

    def test_member_cannot_create_org_folder(self):
        self.client.force_authenticate(self.member)
        with _flag_on():
            resp = self.client.post(f"{self.base}/folders/", {"name": "X"}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_member_can_view_org_folders(self):
        with _flag_on():
            self.client.post(f"{self.base}/folders/", {"name": "Clients"}, format="json")
        self.client.force_authenticate(self.member)
        with _flag_on():
            resp = self.client.get(f"{self.base}/folders/")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_org_folder_parent_must_be_same_org(self):
        from apps.organizations.models import Organization

        other_org = Organization.objects.create(
            name="Other", organization_type=Organization.OrganizationType.COMPANY,
            created_by=self.owner,
        )
        foreign = DocumentFolder.objects.create(organization=other_org, owner=self.owner, name="Foreign")
        with _flag_on():
            resp = self.client.post(f"{self.base}/folders/",
                                    {"name": "Child", "parent": foreign.id}, format="json")
        # Parent not found in this org's scope → 400.
        self.assertEqual(resp.status_code, 400)

    def test_case_and_person_folders_auto_created(self):
        from apps.documents import folders as folders_svc
        from apps.organizations.models import PortalCase, PortalPerson

        person = PortalPerson.objects.create(
            organization=self.org, created_by=self.owner, full_name="Mamadou Diallo")
        case = PortalCase.objects.create(
            organization=self.org, person=person, created_by=self.owner, title="Visa application")
        folder = folders_svc.ensure_case_folder(case, self.admin)
        self.assertEqual(folder.linked_case_id, case.id)
        self.assertEqual(folder.folder_type, "case")
        # by_person default → there is a person folder ancestor.
        person_folder = DocumentFolder.objects.get(linked_person=person, folder_type="person")
        self.assertIsNotNone(person_folder)

    def test_accepted_upload_autofiles_when_enabled(self):
        from apps.documents import folders as folders_svc
        from apps.documents.models import DocumentBundleRequirement
        from apps.organizations import portal_reviews
        from apps.organizations.models import PortalCaseDocumentRequest
        from apps.documents.models import DocumentRequestLink

        # Enable opt-in auto-filing.
        pref = folders_svc.get_structure_preference(self.org)
        pref.auto_file_accepted_uploads = True
        pref.save(update_fields=["auto_file_accepted_uploads"])

        # Build a case + pack + request + recipient upload.
        with _flag_on():
            person = self.client.post(f"{self.base}/people/",
                                      {"full_name": "Mamadou", "email": "m@x.com"}, format="json").data
            case_id = self.client.post(f"{self.base}/cases/",
                                       {"person": person["id"], "title": "Visa", "case_type": "visa"},
                                       format="json").data["id"]
            self.client.post(f"{self.base}/cases/{case_id}/create-pack/",
                             {"requirements": ["Passport copy"]}, format="json")
            requirement = DocumentBundleRequirement.objects.get(bundle__portal_cases=case_id)
            self.client.post(f"{self.base}/cases/{case_id}/create-request/",
                             {"requested_document_title": "Passport copy", "requirement": requirement.id},
                             format="json")
        link = DocumentRequestLink.objects.get(portal_case_links__case_id=case_id)
        self.client.force_authenticate(None)
        with mock.patch("apps.documents.views._scan_upload_or_raise"):
            self.client.post(f"/api/v1/public/document-request-links/{link.token}/upload/",
                             {"file": SimpleUploadedFile("p.pdf", b"%PDF-1.4", content_type="application/pdf")},
                             format="multipart")
        self.client.force_authenticate(self.admin)
        cr = PortalCaseDocumentRequest.objects.get(document_request=link)
        # Accept → auto-file.
        portal_reviews.accept_case_document_request(cr, self.admin)
        link.refresh_from_db()
        self.assertIsNotNone(link.created_document_id)
        doc = link.created_document
        self.assertIsNotNone(doc.primary_folder_id)
        self.assertTrue(AuditLogEntry.objects.filter(event_type="document_auto_filed").exists())

    def test_accepted_upload_no_autofile_when_disabled(self):
        from apps.documents.models import DocumentBundleRequirement, DocumentRequestLink
        from apps.organizations import portal_reviews
        from apps.organizations.models import PortalCaseDocumentRequest

        with _flag_on():
            person = self.client.post(f"{self.base}/people/",
                                      {"full_name": "Aisha", "email": "a@x.com"}, format="json").data
            case_id = self.client.post(f"{self.base}/cases/",
                                       {"person": person["id"], "title": "Visa2", "case_type": "visa"},
                                       format="json").data["id"]
            self.client.post(f"{self.base}/cases/{case_id}/create-pack/",
                             {"requirements": ["Passport copy"]}, format="json")
            requirement = DocumentBundleRequirement.objects.get(bundle__portal_cases=case_id)
            self.client.post(f"{self.base}/cases/{case_id}/create-request/",
                             {"requested_document_title": "Passport copy", "requirement": requirement.id},
                             format="json")
        link = DocumentRequestLink.objects.get(portal_case_links__case_id=case_id)
        self.client.force_authenticate(None)
        with mock.patch("apps.documents.views._scan_upload_or_raise"):
            self.client.post(f"/api/v1/public/document-request-links/{link.token}/upload/",
                             {"file": SimpleUploadedFile("p.pdf", b"%PDF-1.4", content_type="application/pdf")},
                             format="multipart")
        self.client.force_authenticate(self.admin)
        cr = PortalCaseDocumentRequest.objects.get(document_request=link)
        portal_reviews.accept_case_document_request(cr, self.admin)
        link.refresh_from_db()
        # Pref off (default) → accept unchanged, no vault Document materialized.
        self.assertIsNone(link.created_document_id)

    def test_structure_preference_update(self):
        with _flag_on():
            resp = self.client.patch(f"{self.base}/document-organization/preferences/",
                                     {"structure_mode": "by_case",
                                      "auto_file_accepted_uploads": True}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["structure_mode"], "by_case")
        self.assertTrue(resp.data["auto_file_accepted_uploads"])

    def test_no_public_folder_endpoint(self):
        # The org folder surface requires auth — unauthenticated access denied.
        self.client.force_authenticate(None)
        with _flag_on():
            resp = self.client.get(f"{self.base}/folders/")
        self.assertIn(resp.status_code, (401, 403))
