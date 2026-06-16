from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    """
    Custom user model for DueNest.

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
