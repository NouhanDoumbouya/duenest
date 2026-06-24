import json

from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.security.encryption import (
    decrypt_field_value,
    encrypt_field_value,
)


class User(AbstractUser):
    """
    Custom user model for CertaNest.

    Starts from Django's AbstractUser (so username/password auth keeps working)
    and adds a few fields needed to support third-party (Google) sign-in.
    """

    # Email is now unique so it can act as a stable identity across both
    # password-based accounts and Google accounts. Existing rows all use
    # distinct emails, so adding the unique constraint is safe.
    email = models.EmailField("email address", unique=True)

    # The "sub" claim from a verified Google ID token. It is the stable,
    # unique identifier Google gives each account. Null/blank for users who
    # signed up with a password and never linked Google.
    google_id = models.CharField(
        max_length=255,
        unique=True,
        null=True,
        blank=True,
        help_text="Google account subject identifier (the 'sub' claim).",
    )

    # Optional profile picture URL returned by Google.
    avatar_url = models.URLField(blank=True, default="")

    # User-uploaded profile picture, stored as a small, re-encoded base64 data
    # URL (max ~256px, JPEG/PNG). Kept in-row rather than object storage so it
    # serves uniformly in both cookie and Bearer deployments without exposing a
    # storage URL — consistent with CertaNest never delivering files via public
    # storage links. Re-encoding through Pillow strips EXIF and guarantees a
    # clean raster image (no SVG/script payloads).
    avatar_image = models.TextField(blank=True, default="")

    # Email verification (SEC-007). Google accounts are created already verified
    # (Google asserts a verified email); password signups start unverified and
    # confirm via a time-limited emailed token.
    email_verified = models.BooleanField(default=False)
    email_verified_at = models.DateTimeField(null=True, blank=True)

    # Billing/plan placeholder. There is no real payment integration yet; this
    # only drives the internal usage limits in ``apps.users.plans`` so the free
    # tier can be enforced and an upgrade path can be shown in the UI.
    class Plan(models.TextChoices):
        FREE = "free", "Free"
        PRO_PLACEHOLDER = "pro_placeholder", "Pro (placeholder)"

    plan = models.CharField(
        max_length=32,
        choices=Plan.choices,
        default=Plan.FREE,
    )


class UserOnboardingState(models.Model):
    """
    Owner-scoped progress state for the document onboarding experience.

    The timestamps are used as durable product signals only; document access and
    ownership still come from the underlying document models and permissions.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="onboarding_state",
    )
    has_completed_document_onboarding = models.BooleanField(default=False)

    first_document_created_at = models.DateTimeField(null=True, blank=True)
    first_file_uploaded_at = models.DateTimeField(null=True, blank=True)
    first_expiry_date_added_at = models.DateTimeField(null=True, blank=True)
    first_reminder_created_at = models.DateTimeField(null=True, blank=True)
    first_share_link_created_at = models.DateTimeField(null=True, blank=True)
    first_checklist_created_at = models.DateTimeField(null=True, blank=True)
    checklist_completed_at = models.DateTimeField(null=True, blank=True)
    dismissed_onboarding_at = models.DateTimeField(null=True, blank=True)

    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["user_id"]

    def __str__(self):
        return f"Onboarding state for user {self.user_id}"


class AccountDeletionRequest(models.Model):
    """
    A safe account-deletion request record.

    Requests are tracked and cancellable while in the requested state. The API
    deliberately does not delete the account synchronously.
    """

    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        PROCESSING = "processing", "Processing"
        CANCELLED = "cancelled", "Cancelled"
        COMPLETED = "completed", "Completed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="account_deletion_requests",
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.REQUESTED,
    )
    requested_at = models.DateTimeField(default=timezone.now)
    scheduled_for = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    reason = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["scheduled_for"]),
        ]

    def __str__(self):
        return f"{self.status} deletion request for user {self.owner_id}"

    @property
    def can_cancel(self) -> bool:
        return self.status == self.Status.REQUESTED


class UserProfileDetails(models.Model):
    """Owner-scoped personal details a user opts to save, to pre-fill their own
    forms later.

    The whole record is stored as a single AES-256-GCM ciphertext blob
    (AAD-bound via ``apps.core.security.encryption``), so CertaNest never holds
    these PII values in plaintext at rest. It is returned only to the owner and
    is never shared. Cleared with the account (``on_delete=CASCADE``).
    """

    # Plaintext field names carried inside the encrypted blob.
    PROFILE_FIELDS = (
        "legal_name",
        "preferred_name",
        "date_of_birth",
        "nationality",
        "phone",
        "address_street",
        "address_city",
        "address_region",
        "address_postal_code",
        "address_country",
        "passport_number",
        "national_id",
    )

    _AAD_MODEL = "userprofiledetails"
    _AAD_FIELD = "data"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="profile_details",
    )
    # Encrypted JSON of the saved PROFILE_FIELDS. Null when nothing is stored.
    data_ciphertext = models.BinaryField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile details for user {self.user_id}"

    def get_details(self) -> dict:
        """Decrypt and return every field (missing ones as empty strings)."""
        raw: dict = {}
        if self.data_ciphertext:
            decoded = decrypt_field_value(
                bytes(self.data_ciphertext),
                model=self._AAD_MODEL,
                field=self._AAD_FIELD,
                record_id=self.user_id,
            )
            raw = json.loads(decoded)
        return {key: raw.get(key, "") for key in self.PROFILE_FIELDS}

    def set_details(self, values: dict) -> None:
        """Encrypt and store the given fields. Blank values are dropped; if
        nothing remains, the ciphertext is cleared entirely."""
        cleaned = {
            key: str(values.get(key, "")).strip()
            for key in self.PROFILE_FIELDS
            if str(values.get(key, "")).strip()
        }
        if not cleaned:
            self.data_ciphertext = None
            return
        self.data_ciphertext = encrypt_field_value(
            json.dumps(cleaned, ensure_ascii=False),
            model=self._AAD_MODEL,
            field=self._AAD_FIELD,
            record_id=self.user_id,
        )


# ---- Smart Profile V1 (reusable application data; deterministic, no AI) -----
#
# Smart Profile adds the *professional/background* layer on top of the existing
# encrypted identity store (``UserProfileDetails`` holds legal name, DOB,
# nationality, phone, address, passport_number, national_id as one AES-GCM blob).
# The most-sensitive identity/document numbers therefore stay in the encrypted
# store and are NOT duplicated here. These models hold lower-sensitivity reusable
# data (extras, education, work, skills, achievements, common answers) as
# standard owner-scoped rows; all are cleared with the account (CASCADE).


class SmartProfile(models.Model):
    """Per-user scalar extras + cached completeness for Smart Profile V1.

    Sensitive identity/document fields live in ``UserProfileDetails`` (encrypted);
    this holds the additional reusable application fields the user opts to save.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="smart_profile",
    )
    email_for_applications = models.EmailField(blank=True)
    country_of_residence = models.CharField(max_length=120, blank=True)
    current_address = models.TextField(blank=True)
    permanent_address = models.TextField(blank=True)
    passport_expiry_date = models.DateField(null=True, blank=True)
    emergency_contact_name = models.CharField(max_length=200, blank=True)
    emergency_contact_relationship = models.CharField(max_length=120, blank=True)
    emergency_contact_phone = models.CharField(max_length=40, blank=True)
    # Cached 0–100 completeness (recomputed by the service on read).
    profile_completeness = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"SmartProfile<{self.user_id}>"


class SmartProfileEducation(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="smart_profile_education",
    )
    institution_name = models.CharField(max_length=255)
    degree_or_program = models.CharField(max_length=255, blank=True)
    field_of_study = models.CharField(max_length=255, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    currently_studying = models.BooleanField(default=False)
    grade_or_cgpa = models.CharField(max_length=60, blank=True)
    country = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "-end_date", "-created_at"]
        indexes = [models.Index(fields=["owner", "sort_order"])]

    def __str__(self):
        return f"SmartProfileEducation<{self.owner_id}:{self.institution_name}>"


class SmartProfileWork(models.Model):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="smart_profile_work",
    )
    organization_name = models.CharField(max_length=255)
    role_title = models.CharField(max_length=255, blank=True)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    currently_working = models.BooleanField(default=False)
    location = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    achievements = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "-end_date", "-created_at"]
        indexes = [models.Index(fields=["owner", "sort_order"])]

    def __str__(self):
        return f"SmartProfileWork<{self.owner_id}:{self.organization_name}>"


class SmartProfileAchievement(models.Model):
    class Category(models.TextChoices):
        ACADEMIC = "academic", "Academic"
        WORK = "work", "Work"
        LEADERSHIP = "leadership", "Leadership"
        VOLUNTEER = "volunteer", "Volunteer"
        AWARD = "award", "Award"
        CERTIFICATION = "certification", "Certification"
        PROJECT = "project", "Project"
        OTHER = "other", "Other"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="smart_profile_achievements",
    )
    title = models.CharField(max_length=255)
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.OTHER
    )
    date = models.DateField(null=True, blank=True)
    description = models.TextField(blank=True)
    related_document = models.ForeignKey(
        "documents.Document",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="smart_profile_achievements",
    )
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "-date", "-created_at"]
        indexes = [models.Index(fields=["owner", "sort_order"])]

    def __str__(self):
        return f"SmartProfileAchievement<{self.owner_id}:{self.title}>"


class SmartProfileSkill(models.Model):
    class Category(models.TextChoices):
        TECHNICAL = "technical", "Technical"
        LANGUAGE = "language", "Language"
        SOFT = "soft", "Soft"
        TOOL = "tool", "Tool"
        OTHER = "other", "Other"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="smart_profile_skills",
    )
    name = models.CharField(max_length=120)
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.OTHER
    )
    proficiency = models.CharField(max_length=60, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name"]
        indexes = [models.Index(fields=["owner", "sort_order"])]

    def __str__(self):
        return f"SmartProfileSkill<{self.owner_id}:{self.name}>"


class SmartProfileCommonAnswer(models.Model):
    class Category(models.TextChoices):
        SCHOLARSHIP = "scholarship", "Scholarship"
        VISA = "visa", "Visa"
        JOB = "job", "Job"
        UNIVERSITY = "university", "University"
        GENERAL = "general", "General"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="smart_profile_common_answers",
    )
    prompt = models.CharField(max_length=500)
    answer = models.TextField()
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.GENERAL
    )
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "-created_at"]
        indexes = [models.Index(fields=["owner", "sort_order"])]

    def __str__(self):
        return f"SmartProfileCommonAnswer<{self.owner_id}:{self.prompt[:30]}>"
