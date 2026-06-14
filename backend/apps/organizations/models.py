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
