import os
import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


def generate_org_token() -> str:
    """Unguessable token for invite and upload links."""
    return secrets.token_urlsafe(32)


def org_request_upload_to(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    safe_name = f"{uuid.uuid4().hex}{ext}"
    return (
        f"organizations/org_{instance.organization_id}"
        f"/requests/request_{instance.request_id}/{safe_name}"
    )


def org_document_file_upload_to(instance, filename):
    ext = os.path.splitext(filename)[1].lower()
    safe_name = f"{uuid.uuid4().hex}{ext}"
    return (
        f"organizations/org_{instance.organization_id}"
        f"/documents/document_{instance.document_id}/{safe_name}"
    )


class Organization(models.Model):
    class OrganizationType(models.TextChoices):
        STUDENT_ASSOCIATION = "student_association", "Student association"
        NGO = "ngo", "NGO"
        CLUB = "club", "Club"
        SMALL_TEAM = "small_team", "Small team"
        COMPANY = "company", "Company"
        COMMUNITY_GROUP = "community_group", "Community group"
        SCHOLARSHIP_TEAM = "scholarship_team", "Scholarship team"
        COMPETITION_TEAM = "competition_team", "Competition team"
        OTHER = "other", "Other"

    name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=220, unique=True, blank=True)
    description = models.TextField(blank=True)
    website = models.URLField(blank=True)
    country = models.CharField(max_length=100, blank=True)
    # Recipient-facing branding for public request pages. brand_color is a hex
    # string (e.g. "#0f766e"); logo_image is a small re-encoded base64 data URL
    # (same in-row, no-public-URL approach as user avatars).
    brand_color = models.CharField(max_length=9, blank=True, default="")
    logo_image = models.TextField(blank=True, default="")
    organization_type = models.CharField(
        max_length=40,
        choices=OrganizationType.choices,
        default=OrganizationType.OTHER,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_organizations",
    )
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["slug"]),
            models.Index(fields=["created_by", "archived_at"]),
        ]

    def __str__(self):
        return self.name

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:180] or "organization"
            candidate = base
            counter = 2
            while Organization.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                suffix = f"-{counter}"
                candidate = f"{base[: 220 - len(suffix)]}{suffix}"
                counter += 1
            self.slug = candidate
        super().save(*args, **kwargs)


class OrganizationMembership(models.Model):
    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        ADMIN = "admin", "Admin"
        MEMBER = "member", "Member"
        VIEWER = "viewer", "Viewer"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INVITED = "invited", "Invited"
        SUSPENDED = "suspended", "Suspended"
        LEFT = "left", "Left"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="memberships"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="organization_memberships",
    )
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.MEMBER)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    joined_at = models.DateTimeField(null=True, blank=True)
    last_active_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["role", "user__email"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "user"], name="unique_org_membership_user"
            )
        ]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["user", "status"]),
        ]

    def __str__(self):
        return f"{self.user_id} in {self.organization_id} as {self.role}"

    @property
    def is_active_member(self) -> bool:
        return self.status == self.Status.ACTIVE

    def save(self, *args, **kwargs):
        if self.status == self.Status.ACTIVE and self.joined_at is None:
            self.joined_at = timezone.now()
        super().save(*args, **kwargs)


class OrganizationInvite(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        EXPIRED = "expired", "Expired"
        REVOKED = "revoked", "Revoked"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="invites"
    )
    email = models.EmailField()
    role = models.CharField(
        max_length=20,
        choices=OrganizationMembership.Role.choices,
        default=OrganizationMembership.Role.MEMBER,
    )
    token = models.CharField(
        max_length=128, unique=True, db_index=True, default=generate_org_token
    )
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sent_organization_invites",
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    expires_at = models.DateTimeField()
    accepted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="accepted_organization_invites",
    )
    accepted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["email", "status"]),
        ]

    def __str__(self):
        return f"{self.email} -> {self.organization_id}"

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_acceptable(self) -> bool:
        return self.status == self.Status.PENDING and not self.is_expired

    def save(self, *args, **kwargs):
        if self.expires_at is None:
            self.expires_at = timezone.now() + timedelta(days=7)
        self.email = (self.email or "").strip().lower()
        super().save(*args, **kwargs)


class OrganizationActivity(models.Model):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="activities"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="organization_activities",
    )
    action = models.CharField(max_length=80)
    target_type = models.CharField(max_length=80, blank=True)
    target_id = models.CharField(max_length=64, blank=True)
    safe_summary = models.CharField(max_length=255)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "created_at"]),
            models.Index(fields=["action", "created_at"]),
        ]

    def __str__(self):
        return f"{self.action}: {self.safe_summary}"


class OrganizationDocument(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        UNDER_REVIEW = "under_review", "Under review"
        APPROVED = "approved", "Approved"
        ARCHIVED = "archived", "Archived"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="documents"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_organization_documents",
    )
    assigned_to = models.ForeignKey(
        OrganizationMembership,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_documents",
    )
    title = models.CharField(max_length=255)
    document_type = models.CharField(max_length=100, blank=True)
    issuer = models.CharField(max_length=255, blank=True)
    country = models.CharField(max_length=100, blank=True)
    issue_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    renewal_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.ACTIVE)
    notes = models.TextField(blank=True)
    is_archived = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["organization", "expiry_date"]),
            models.Index(fields=["organization", "is_archived"]),
        ]

    def __str__(self):
        return self.title

    def clean(self):
        if self.issue_date and self.expiry_date and self.expiry_date < self.issue_date:
            raise ValidationError({"expiry_date": "Expiry date cannot be before issue date."})
        if self.renewal_date and self.expiry_date and self.renewal_date > self.expiry_date:
            raise ValidationError(
                {"renewal_date": "Renewal date cannot be after expiry date."}
            )


class OrganizationDocumentFile(models.Model):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="document_files"
    )
    document = models.ForeignKey(
        OrganizationDocument, on_delete=models.CASCADE, related_name="files"
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="uploaded_organization_files",
    )
    file = models.FileField(upload_to=org_document_file_upload_to)
    original_filename = models.CharField(max_length=255)
    content_type = models.CharField(max_length=120, blank=True)
    file_size = models.PositiveIntegerField(default=0)
    # Encryption-at-rest (SEC-002). file_uuid binds the ciphertext AAD; new
    # uploads store an encrypted envelope and set is_encrypted=True. Legacy rows
    # stay False until migrated by the encrypt_legacy_org_files command.
    file_uuid = models.UUIDField(default=uuid.uuid4, editable=False)
    is_encrypted = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "created_at"]),
            models.Index(fields=["document", "created_at"]),
        ]

    def __str__(self):
        return self.original_filename


class DocumentCollectionCampaign(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        ARCHIVED = "archived", "Archived"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="campaigns"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_organization_campaigns",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    deadline = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    target_all_members = models.BooleanField(default=True)
    instructions = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["organization", "deadline"]),
        ]

    def __str__(self):
        return self.title


class CampaignRequirement(models.Model):
    campaign = models.ForeignKey(
        DocumentCollectionCampaign,
        on_delete=models.CASCADE,
        related_name="requirements",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    required_file_type = models.CharField(max_length=80, blank=True)
    is_required = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return self.title


class CampaignTargetMember(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PARTIALLY_SUBMITTED = "partially_submitted", "Partially submitted"
        SUBMITTED = "submitted", "Submitted"
        APPROVED = "approved", "Approved"
        OVERDUE = "overdue", "Overdue"
        EXCLUDED = "excluded", "Excluded"

    campaign = models.ForeignKey(
        DocumentCollectionCampaign, on_delete=models.CASCADE, related_name="targets"
    )
    member = models.ForeignKey(
        OrganizationMembership, on_delete=models.CASCADE, related_name="campaign_targets"
    )
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["member__user__email"]
        constraints = [
            models.UniqueConstraint(
                fields=["campaign", "member"], name="unique_campaign_target_member"
            )
        ]

    def __str__(self):
        return f"{self.member_id} -> {self.campaign_id}"


class DocumentRequest(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        SUBMITTED = "submitted", "Submitted"
        NEEDS_CHANGES = "needs_changes", "Needs changes"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"
        OVERDUE = "overdue", "Overdue"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="document_requests"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_organization_requests",
    )
    assigned_to_member = models.ForeignKey(
        OrganizationMembership,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_document_requests",
    )
    recipient_email = models.EmailField(blank=True)
    campaign = models.ForeignKey(
        DocumentCollectionCampaign,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="document_requests",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    required_file_type = models.CharField(max_length=80, blank=True)
    deadline = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.OPEN)
    linked_document = models.ForeignKey(
        OrganizationDocument,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="document_requests",
    )
    public_upload_token = models.CharField(
        max_length=128, unique=True, null=True, blank=True, db_index=True
    )
    public_upload_expires_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    internal_note = models.TextField(blank=True)
    last_reminded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["deadline", "-created_at"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["organization", "deadline"]),
            models.Index(fields=["public_upload_token"]),
        ]

    def __str__(self):
        return self.title

    @property
    def is_overdue(self) -> bool:
        return (
            self.deadline is not None
            and self.deadline < timezone.localdate()
            and self.status in {self.Status.OPEN, self.Status.NEEDS_CHANGES}
        )

    @property
    def public_upload_active(self) -> bool:
        return bool(
            self.public_upload_token
            and self.public_upload_expires_at
            and timezone.now() < self.public_upload_expires_at
            and self.status not in {self.Status.APPROVED, self.Status.CANCELLED}
        )


class DocumentRequestSubmission(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "submitted", "Submitted"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        NEEDS_CHANGES = "needs_changes", "Needs changes"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="request_submissions"
    )
    request = models.ForeignKey(
        DocumentRequest, on_delete=models.CASCADE, related_name="submissions"
    )
    submitted_by_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="organization_request_submissions",
    )
    submitted_by_email = models.EmailField(blank=True)
    file = models.FileField(upload_to=org_request_upload_to, null=True, blank=True)
    original_filename = models.CharField(max_length=255, blank=True)
    content_type = models.CharField(max_length=120, blank=True)
    file_size = models.PositiveIntegerField(default=0)
    # Encryption-at-rest (SEC-002); see OrganizationDocumentFile.
    file_uuid = models.UUIDField(default=uuid.uuid4, editable=False)
    is_encrypted = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.SUBMITTED
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_organization_submissions",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["request", "created_at"]),
        ]

    def __str__(self):
        return f"Submission for request {self.request_id}"


class OrganizationRequestTemplate(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="request_templates",
    )
    name = models.CharField(max_length=160)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=80, blank=True)
    required_file_type = models.CharField(max_length=80, blank=True)
    is_system = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_organization_request_templates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["is_system", "name"]
        indexes = [
            models.Index(fields=["organization", "is_system"]),
        ]

    def __str__(self):
        return self.name


class OrganizationBundle(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        IN_PROGRESS = "in_progress", "In progress"
        READY = "ready", "Ready"
        SUBMITTED = "submitted", "Submitted"
        ARCHIVED = "archived", "Archived"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="bundles"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_organization_bundles",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    target_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    readiness_score = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["organization", "target_date"]),
        ]

    def __str__(self):
        return self.title


class OrganizationSecureRoom(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ACTIVE = "active", "Active"
        REVOKED = "revoked", "Revoked"
        EXPIRED = "expired", "Expired"

    class Permission(models.TextChoices):
        VIEW_ONLY = "view_only", "View only"
        DOWNLOAD_ALLOWED = "download_allowed", "View and download"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="secure_rooms"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_organization_secure_rooms",
    )
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    recipient_label = models.CharField(max_length=160, blank=True)
    instructions = models.TextField(blank=True)
    permission = models.CharField(
        max_length=32, choices=Permission.choices, default=Permission.VIEW_ONLY
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    token = models.CharField(
        max_length=128, unique=True, null=True, blank=True, db_index=True
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "status"]),
            models.Index(fields=["token"]),
        ]

    def __str__(self):
        return self.title

    @property
    def is_active_public(self) -> bool:
        return bool(
            self.status == self.Status.ACTIVE
            and self.token
            and self.revoked_at is None
            and (self.expires_at is None or timezone.now() < self.expires_at)
        )


class OrganizationSecureRoomItem(models.Model):
    room = models.ForeignKey(
        OrganizationSecureRoom, on_delete=models.CASCADE, related_name="items"
    )
    document = models.ForeignKey(
        OrganizationDocument,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="secure_room_items",
    )
    file = models.ForeignKey(
        OrganizationDocumentFile,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="secure_room_items",
    )
    notes = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "created_at"]

    def __str__(self):
        return f"Room item {self.id}"


class OrganizationReadinessReport(models.Model):
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="readiness_reports"
    )
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="generated_organization_reports",
    )
    title = models.CharField(max_length=255)
    snapshot_data = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "created_at"]),
        ]

    def __str__(self):
        return self.title


# ---- B2B Portals MVP --------------------------------------------------------
#
# Portal People + Cases are a thin, org-scoped ORCHESTRATION layer over the
# existing per-user primitives (apps.documents: DocumentBundle/requirements,
# SharingRoom, DocumentRequestLink, TrackedApplication, AuditLogEntry). They do
# NOT duplicate uploads/rooms/requests — a case creates and links those existing
# objects. The legacy parallel org systems (OrganizationSecureRoom,
# OrganizationDocument, the org-side DocumentRequest/campaigns) are left untouched.


class PortalPerson(models.Model):
    """
    A client / student / applicant / employee an organization manages in its
    portal. Org-scoped; NOT a CertaNest user account. Stores only contact + status
    metadata — never their document contents.
    """

    class PersonType(models.TextChoices):
        CLIENT = "client", "Client"
        STUDENT = "student", "Student"
        APPLICANT = "applicant", "Applicant"
        EMPLOYEE = "employee", "Employee"
        FAMILY_MEMBER = "family_member", "Family member"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        WAITING_FOR_DOCUMENTS = "waiting_for_documents", "Waiting for documents"
        UNDER_REVIEW = "under_review", "Under review"
        COMPLETED = "completed", "Completed"
        ARCHIVED = "archived", "Archived"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="portal_people"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name="portal_people_created",
    )
    full_name = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    person_type = models.CharField(
        max_length=20, choices=PersonType.choices, default=PersonType.CLIENT
    )
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.ACTIVE
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["organization", "status", "-updated_at"]),
        ]

    def __str__(self):
        return f"PortalPerson(org={self.organization_id}, name={self.full_name!r})"


class PortalCase(models.Model):
    """
    A document case for a portal person — the unit of work an org tracks. Links to
    the existing primitives: a pack (checklist/progress), an application, and a
    Sharing Room (secure workspace). Document requests are linked through
    ``PortalCaseDocumentRequest``. Org-scoped.
    """

    class CaseType(models.TextChoices):
        VISA = "visa", "Visa"
        SCHOLARSHIP = "scholarship", "Scholarship"
        ADMISSION = "admission", "Admission"
        EMPLOYEE_ONBOARDING = "employee_onboarding", "Employee onboarding"
        COMPLIANCE = "compliance", "Compliance"
        CLIENT_FILE = "client_file", "Client file"
        INSURANCE_CLAIM = "insurance_claim", "Insurance claim"
        GRANT = "grant", "Grant"
        INTERNSHIP = "internship", "Internship"
        GENERAL = "general", "General"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        COLLECTING_DOCUMENTS = "collecting_documents", "Collecting documents"
        WAITING_FOR_REVIEW = "waiting_for_review", "Waiting for review"
        READY = "ready", "Ready"
        SUBMITTED = "submitted", "Submitted"
        COMPLETED = "completed", "Completed"
        BLOCKED = "blocked", "Blocked"
        ARCHIVED = "archived", "Archived"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        NORMAL = "normal", "Normal"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    # Statuses that count as "active" (shown in active queues / not archived).
    ACTIVE_STATUSES = (
        Status.DRAFT, Status.COLLECTING_DOCUMENTS, Status.WAITING_FOR_REVIEW,
        Status.READY, Status.SUBMITTED, Status.BLOCKED,
    )

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="portal_cases"
    )
    person = models.ForeignKey(
        PortalPerson, on_delete=models.CASCADE, related_name="cases"
    )
    # The org member who created the case. Their CertaNest user owns the linked
    # primitives (pack/room/request) so the existing per-user services apply.
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name="portal_cases_created",
    )
    title = models.CharField(max_length=255)
    case_type = models.CharField(
        max_length=24, choices=CaseType.choices, default=CaseType.GENERAL
    )
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.DRAFT
    )
    priority = models.CharField(
        max_length=8, choices=Priority.choices, default=Priority.NORMAL
    )
    due_date = models.DateField(null=True, blank=True)

    # Links to existing primitives (SET_NULL — deleting a primitive never destroys
    # the case record). These belong to apps.documents.
    linked_bundle = models.ForeignKey(
        "documents.DocumentBundle", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="portal_cases",
    )
    linked_application = models.ForeignKey(
        "documents.TrackedApplication", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="portal_cases",
    )
    linked_room = models.ForeignKey(
        "documents.SharingRoom", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="portal_cases",
    )

    # B2B Custom Fields and Statuses V1 — an OPTIONAL org-defined status that LAYERS
    # on top of the fixed system ``status`` (never replaces it). When set, the
    # system ``status`` is kept in sync from the custom status's category so the
    # dashboard / reminders / review workflows keep working unchanged.
    custom_status = models.ForeignKey(
        "OrganizationCaseStatusDefinition", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="cases",
    )

    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["organization", "status", "-updated_at"]),
            models.Index(fields=["organization", "person"]),
        ]

    def __str__(self):
        return f"PortalCase(org={self.organization_id}, title={self.title!r})"


class PortalCaseDocumentRequest(models.Model):
    """Links a case to a reused ``DocumentRequestLink`` (and optionally the pack
    requirement it satisfies). No second request system — this is just the join,
    plus the staff REVIEW metadata (B2B Review + Approval Workflow V1).

    The review status is the staff-facing mirror of the linked DocumentRequestLink
    status; it is kept here for fast review-queue/progress queries and to hold the
    reviewer + note. The decision history lives in ``PortalCaseReviewDecision``.
    """

    class ReviewStatus(models.TextChoices):
        PENDING_UPLOAD = "pending_upload", "Pending upload"
        UPLOADED = "uploaded", "Uploaded"
        UNDER_REVIEW = "under_review", "Under review"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        NEEDS_REPLACEMENT = "needs_replacement", "Needs replacement"
        CANCELLED = "cancelled", "Cancelled"

    # Review statuses that belong in the staff review queue.
    REVIEW_QUEUE_STATUSES = (ReviewStatus.UPLOADED, ReviewStatus.UNDER_REVIEW)

    case = models.ForeignKey(
        PortalCase, on_delete=models.CASCADE, related_name="case_requests"
    )
    document_request = models.ForeignKey(
        "documents.DocumentRequestLink", on_delete=models.CASCADE,
        related_name="portal_case_links",
    )
    requirement = models.ForeignKey(
        "documents.DocumentBundleRequirement", on_delete=models.SET_NULL,
        null=True, blank=True, related_name="portal_case_requests",
    )

    review_status = models.CharField(
        max_length=20, choices=ReviewStatus.choices, default=ReviewStatus.PENDING_UPLOAD
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="portal_reviews_made",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)
    last_submitted_at = models.DateTimeField(null=True, blank=True)
    decision_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["case", "-created_at"]),
            models.Index(fields=["review_status"]),
        ]

    def __str__(self):
        return f"PortalCaseDocumentRequest(case={self.case_id}, req={self.document_request_id})"


class PortalCaseReviewDecision(models.Model):
    """Append-only history of staff review decisions on a case's document request
    (B2B Review + Approval Workflow V1). Stores no document contents/tokens/URLs."""

    class Decision(models.TextChoices):
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        NEEDS_REPLACEMENT = "needs_replacement", "Needs replacement"

    case_request = models.ForeignKey(
        PortalCaseDocumentRequest, on_delete=models.CASCADE, related_name="decisions"
    )
    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="portal_review_decisions"
    )
    case = models.ForeignKey(
        PortalCase, on_delete=models.CASCADE, related_name="review_decisions"
    )
    document_request = models.ForeignKey(
        "documents.DocumentRequestLink", on_delete=models.CASCADE,
        related_name="portal_review_decisions",
    )
    decision = models.CharField(max_length=20, choices=Decision.choices)
    note = models.TextField(blank=True)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name="portal_decisions_made",
    )
    decided_at = models.DateTimeField(auto_now_add=True)
    previous_status = models.CharField(max_length=20, blank=True)
    new_status = models.CharField(max_length=20, blank=True)
    notified_recipient = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-decided_at"]
        indexes = [models.Index(fields=["case_request", "-decided_at"])]

    def __str__(self):
        return f"PortalCaseReviewDecision(cr={self.case_request_id}, decision={self.decision})"


class PortalReminderBatch(models.Model):
    """
    A staff-triggered batch of operational reminder emails to portal recipients
    (B2B Bulk Reminder Emails V1). Built from the org's existing dashboard queues
    (missing documents / overdue requests / needs-replacement / rejected / due-soon
    / collecting) — it does NOT introduce a new email or request system. Each send
    flows through the shared branded-email helper; outcomes are recorded per
    recipient in ``PortalReminderRecipient``. Stores no document contents, file
    URLs, or raw tokens.
    """

    class ReminderType(models.TextChoices):
        MISSING_DOCUMENTS = "missing_documents", "Missing documents"
        OVERDUE_REQUESTS = "overdue_requests", "Overdue requests"
        NEEDS_REPLACEMENT = "needs_replacement", "Needs replacement"
        REJECTED_DOCUMENTS = "rejected_documents", "Rejected documents"
        DUE_SOON_CASES = "due_soon_cases", "Due soon cases"
        COLLECTING_DOCUMENTS = "collecting_documents", "Collecting documents"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENDING = "sending", "Sending"
        SENT = "sent", "Sent"
        PARTIALLY_FAILED = "partially_failed", "Partially failed"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="portal_reminder_batches"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name="portal_reminder_batches_created",
    )
    # Optional case scope (set for a case-specific reminder send).
    case = models.ForeignKey(
        PortalCase, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="reminder_batches",
    )
    reminder_type = models.CharField(max_length=24, choices=ReminderType.choices)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    subject = models.CharField(max_length=255, blank=True)
    message_intro = models.TextField(blank=True)
    recipient_count = models.PositiveIntegerField(default=0)
    sent_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    failed_count = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organization", "-created_at"]),
            models.Index(fields=["organization", "reminder_type", "-created_at"]),
        ]

    def __str__(self):
        return f"PortalReminderBatch(org={self.organization_id}, type={self.reminder_type})"


class PortalReminderRecipient(models.Model):
    """One recipient row in a ``PortalReminderBatch`` — the per-recipient outcome
    of a reminder send. Also the source of truth for the duplicate/cooldown check
    (match on org + reminder_type + recipient_email + case/case_request within the
    cooldown window). Stores no file URLs, raw tokens, or document contents."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        SKIPPED = "skipped", "Skipped"
        FAILED = "failed", "Failed"

    batch = models.ForeignKey(
        PortalReminderBatch, on_delete=models.CASCADE, related_name="recipients"
    )
    portal_case = models.ForeignKey(
        PortalCase, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="reminder_recipients",
    )
    portal_person = models.ForeignKey(
        PortalPerson, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="reminder_recipients",
    )
    case_request = models.ForeignKey(
        PortalCaseDocumentRequest, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="reminder_recipients",
    )
    document_request = models.ForeignKey(
        "documents.DocumentRequestLink", on_delete=models.SET_NULL, null=True, blank=True,
        related_name="portal_reminder_recipients",
    )
    recipient_email = models.EmailField()
    recipient_name = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.PENDING
    )
    skip_reason = models.CharField(max_length=40, blank=True)
    error_message = models.CharField(max_length=255, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        indexes = [
            models.Index(fields=["batch", "status"]),
            # Cooldown lookups: recent sent reminders for an email in an org.
            models.Index(fields=["recipient_email", "status", "-created_at"]),
            models.Index(fields=["case_request", "-created_at"]),
            models.Index(fields=["portal_case", "-created_at"]),
        ]

    def __str__(self):
        return f"PortalReminderRecipient(batch={self.batch_id}, email={self.recipient_email!r})"


class OrganizationCaseTemplate(models.Model):
    """
    A reusable case workflow an organization defines once and applies to new portal
    cases (Organization Templates V1). It captures the defaults staff would
    otherwise re-enter every time — case type, title pattern, priority, due offset,
    a checklist of requirements, and whether to auto-create the pack / sharing room
    / document requests. It is org-scoped configuration only: it stores NO document
    contents, files, tokens, or recipient data — applying it CREATES the existing
    primitives (PortalCase / DocumentBundle / SharingRoom / DocumentRequestLink),
    never a new system.
    """

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ARCHIVED = "archived", "Archived"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="case_templates"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True,
        related_name="case_templates_created",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    # Mirrors PortalCase.CaseType values (stored as a plain string so the template
    # set can extend independently); unknown values fall back to GENERAL on apply.
    case_type = models.CharField(max_length=24, default=PortalCase.CaseType.GENERAL)
    # Title pattern; supports the ``{person_name}`` placeholder.
    default_case_title = models.CharField(max_length=255, blank=True)
    default_priority = models.CharField(
        max_length=8, choices=PortalCase.Priority.choices,
        default=PortalCase.Priority.NORMAL,
    )
    default_due_days = models.PositiveIntegerField(null=True, blank=True)
    auto_create_pack = models.BooleanField(default=True)
    auto_create_room = models.BooleanField(default=True)
    auto_create_requests = models.BooleanField(default=False)
    default_room_title = models.CharField(max_length=255, blank=True)
    default_room_description = models.TextField(blank=True)
    # B2B Custom Fields and Statuses V1 — optional template defaults (additive).
    # ``default_custom_status_key`` is an OrganizationCaseStatusDefinition.key;
    # ``default_custom_field_values`` is a {field_key: value} map applied (and
    # validated) when a case is created from the template.
    default_custom_status_key = models.CharField(max_length=80, blank=True)
    default_custom_field_values = models.JSONField(default=dict, blank=True)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.ACTIVE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [
            models.Index(fields=["organization", "status", "-updated_at"]),
        ]

    def __str__(self):
        return f"OrganizationCaseTemplate(org={self.organization_id}, name={self.name!r})"


class OrganizationCaseTemplateRequirement(models.Model):
    """One checklist item in an ``OrganizationCaseTemplate``. Becomes a pack
    requirement (and optionally a document request) when the template is applied.
    Configuration only — no document contents/files/tokens."""

    template = models.ForeignKey(
        OrganizationCaseTemplate, on_delete=models.CASCADE, related_name="requirements"
    )
    title = models.CharField(max_length=255)
    instructions = models.TextField(blank=True)
    required = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    # Default instructions text used for the document request to the recipient.
    request_message = models.TextField(blank=True)
    # Days from case creation this requirement's request is due (optional).
    due_days_offset = models.PositiveIntegerField(null=True, blank=True)
    # Optional advisory list of accepted file types (NOT enforced in V1).
    accepted_file_types = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "id"]
        indexes = [
            models.Index(fields=["template", "sort_order"]),
        ]

    def __str__(self):
        return f"OrganizationCaseTemplateRequirement(template={self.template_id}, title={self.title!r})"


class OrganizationPlanProfile(models.Model):
    """
    Organization-level entitlement for B2B Portals (Teams Plan V1).

    Governs whether an organization may use portals and its org-level resource
    limits — independent of any single staff member's personal Free/Pro plan. V1
    is activated by a founder/beta management command (no Stripe checkout). The
    numeric caps default from a central table (see ``portal_limits`` /
    ``ORG_PORTAL_PLAN_LIMITS``); the nullable ``max_*`` fields here are optional
    PER-ORG overrides (``null`` → use the plan default; a plan default of ``None``
    means unlimited).
    """

    class Plan(models.TextChoices):
        FREE = "free", "Free"
        PRO = "pro", "Pro"
        TEAMS_BETA = "teams_beta", "Teams (beta)"
        TEAMS = "teams", "Teams"
        ENTERPRISE = "enterprise", "Enterprise"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        TRIALING = "trialing", "Trialing"
        DISABLED = "disabled", "Disabled"
        CANCELLED = "cancelled", "Cancelled"

    organization = models.OneToOneField(
        Organization, on_delete=models.CASCADE, related_name="plan_profile"
    )
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.FREE)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.ACTIVE
    )
    portal_enabled = models.BooleanField(default=False)

    # Optional per-org overrides (null = use the central plan default).
    max_members = models.PositiveIntegerField(null=True, blank=True)
    max_portal_people = models.PositiveIntegerField(null=True, blank=True)
    max_active_portal_cases = models.PositiveIntegerField(null=True, blank=True)
    max_active_document_requests = models.PositiveIntegerField(null=True, blank=True)
    max_active_sharing_rooms = models.PositiveIntegerField(null=True, blank=True)

    notes = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"OrganizationPlanProfile(org={self.organization_id}, plan={self.plan})"


# ---- B2B Custom Fields and Statuses V1 --------------------------------------
#
# Org-defined metadata + workflow statuses for portal people/cases. SAFE design:
# field VALUES live in a JSON column on a dedicated value model (validated by
# field_type) — NO dynamic DB columns, NO raw SQL. Custom statuses LAYER on top of
# the fixed PortalCase.Status (each maps to a system category) so existing
# dashboards/reminders/review keep working. Stores no files, tokens, or secrets.


class OrganizationCustomField(models.Model):
    """An org-defined field attached to portal people OR cases."""

    class Target(models.TextChoices):
        PERSON = "person", "Person"
        CASE = "case", "Case"

    class FieldType(models.TextChoices):
        SHORT_TEXT = "short_text", "Short text"
        LONG_TEXT = "long_text", "Long text"
        NUMBER = "number", "Number"
        DATE = "date", "Date"
        BOOLEAN = "boolean", "Boolean"
        SINGLE_SELECT = "single_select", "Single select"
        MULTI_SELECT = "multi_select", "Multi select"
        EMAIL = "email", "Email"
        PHONE = "phone", "Phone"
        URL = "url", "URL"

    class Visibility(models.TextChoices):
        INTERNAL = "internal", "Internal"
        PUBLIC_READONLY = "public_readonly", "Public read-only"
        PUBLIC_EDITABLE = "public_editable", "Public editable"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="custom_fields"
    )
    key = models.SlugField(max_length=80)
    label = models.CharField(max_length=120)
    description = models.CharField(max_length=255, blank=True)
    target = models.CharField(max_length=8, choices=Target.choices)
    field_type = models.CharField(max_length=16, choices=FieldType.choices)
    # For select fields: a list of {"key","label","color"?,"sort_order"?}.
    options = models.JSONField(default=list, blank=True)
    required = models.BooleanField(default=False)
    visibility = models.CharField(
        max_length=16, choices=Visibility.choices, default=Visibility.INTERNAL
    )
    sort_order = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="custom_fields_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["target", "sort_order", "label"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "target", "key"],
                name="unique_custom_field_key_per_org_target",
            )
        ]
        indexes = [
            models.Index(fields=["organization", "target", "is_active", "sort_order"]),
        ]

    def __str__(self):
        return f"OrganizationCustomField(org={self.organization_id}, {self.target}.{self.key})"


class OrganizationCustomFieldValue(models.Model):
    """One field value bound to exactly one target (person XOR case). The value is
    stored as validated JSON — never a dynamic column. Size-limited at write time."""

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="custom_field_values"
    )
    field = models.ForeignKey(
        OrganizationCustomField, on_delete=models.CASCADE, related_name="values"
    )
    person = models.ForeignKey(
        PortalPerson, on_delete=models.CASCADE, null=True, blank=True,
        related_name="custom_field_values",
    )
    case = models.ForeignKey(
        PortalCase, on_delete=models.CASCADE, null=True, blank=True,
        related_name="custom_field_values",
    )
    value = models.JSONField(null=True, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="custom_field_values_updated",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["field", "person"], name="unique_field_value_per_person",
                condition=models.Q(person__isnull=False),
            ),
            models.UniqueConstraint(
                fields=["field", "case"], name="unique_field_value_per_case",
                condition=models.Q(case__isnull=False),
            ),
        ]
        indexes = [
            models.Index(fields=["organization", "field"]),
            models.Index(fields=["person"]),
            models.Index(fields=["case"]),
        ]

    def __str__(self):
        return f"OrganizationCustomFieldValue(field={self.field_id})"


class OrganizationCaseStatusDefinition(models.Model):
    """An org-defined case status. Each maps to a system ``category`` (and an
    informational ``maps_to_system_status``) so the fixed PortalCase.Status stays
    authoritative for dashboards/reminders/review."""

    class Category(models.TextChoices):
        PLANNING = "planning", "Planning"
        COLLECTING = "collecting", "Collecting"
        REVIEWING = "reviewing", "Reviewing"
        READY = "ready", "Ready"
        SUBMITTED = "submitted", "Submitted"
        COMPLETED = "completed", "Completed"
        BLOCKED = "blocked", "Blocked"
        CLOSED = "closed", "Closed"

    class SystemStatus(models.TextChoices):
        PLANNING = "planning", "Planning"
        CHECKLIST_CREATED = "checklist_created", "Checklist created"
        DOCUMENTS_MISSING = "documents_missing", "Documents missing"
        READY_TO_SUBMIT = "ready_to_submit", "Ready to submit"
        SUBMITTED = "submitted", "Submitted"
        UNDER_REVIEW = "under_review", "Under review"
        INTERVIEW = "interview", "Interview"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        WITHDRAWN = "withdrawn", "Withdrawn"
        RENEWAL_NEEDED = "renewal_needed", "Renewal needed"

    organization = models.ForeignKey(
        Organization, on_delete=models.CASCADE, related_name="case_status_definitions"
    )
    key = models.SlugField(max_length=80)
    label = models.CharField(max_length=120)
    description = models.CharField(max_length=255, blank=True)
    category = models.CharField(max_length=12, choices=Category.choices)
    color = models.CharField(max_length=20, blank=True)
    icon = models.CharField(max_length=40, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    is_default = models.BooleanField(default=False)
    is_terminal = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    maps_to_system_status = models.CharField(
        max_length=20, choices=SystemStatus.choices, blank=True
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="case_status_definitions_created",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "label"]
        constraints = [
            models.UniqueConstraint(
                fields=["organization", "key"], name="unique_case_status_key_per_org"
            )
        ]
        indexes = [
            models.Index(fields=["organization", "is_active", "sort_order"]),
        ]

    def __str__(self):
        return f"OrganizationCaseStatusDefinition(org={self.organization_id}, key={self.key})"
