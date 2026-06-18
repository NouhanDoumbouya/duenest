"""
Models for the Subscription / Recurring Renewal Tracker.

This feature lets a user track *their own* recurring payments and renewals
(streaming, software, domains, hosting, insurance, telecom, gym, memberships,
etc.). It is **not** DueNest SaaS billing — there is no Stripe, no payment
checkout, and no bank/card integration here.

Privacy rules baked into the schema:

* Every record is owner-scoped through ``owner`` (subscriptions) or the parent
  subscription's owner (payment records). Access is always filtered by owner in
  the viewsets, so one user can never see another's data.
* We never store full card numbers, CVV, or banking credentials.
  ``payment_method_label`` is a free-text *human label only* (e.g.
  "Visa ending 1234"); a model-level validator rejects anything that looks like
  a full card number.
"""

import re

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


# A run of 13–19 digits (optionally separated by spaces/dashes) looks like a
# full PAN and must never be stored in a human label.
_CARD_NUMBER_RE = re.compile(r"(?:\d[ -]?){13,19}")


def validate_no_card_number(value: str) -> None:
    """Reject values that look like a full payment card number."""
    if value and _CARD_NUMBER_RE.search(value):
        raise ValidationError(
            "Do not store full card numbers. Use a label like "
            "“Visa ending 1234” instead."
        )


class SubscriptionCategory(models.Model):
    """
    A grouping for subscriptions (Streaming, Software, Insurance, …).

    V1 ships a fixed set of system categories (``is_system=True``, no owner).
    The optional ``owner`` field is reserved so user-defined categories can be
    added later without a migration; when set, the category is private to that
    user.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscription_categories",
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=100)
    slug = models.SlugField(max_length=120)
    # Optional lucide icon name + hex/CSS colour token the UI can render.
    icon = models.CharField(max_length=60, blank=True)
    color = models.CharField(max_length=40, blank=True)
    is_system = models.BooleanField(default=False)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "subscription categories"
        ordering = ["sort_order", "name"]
        constraints = [
            # System category slugs are globally unique; per-user category slugs
            # are unique within that user.
            models.UniqueConstraint(
                fields=["slug"],
                condition=models.Q(owner__isnull=True),
                name="uniq_system_subscription_category_slug",
            ),
            models.UniqueConstraint(
                fields=["owner", "slug"],
                name="uniq_owner_subscription_category_slug",
            ),
        ]

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)


class Subscription(models.Model):
    """A single user-owned recurring payment / renewal the user wants tracked."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        TRIAL = "trial", "Trial"
        PAUSED = "paused", "Paused"
        CANCELLED = "cancelled", "Cancelled"
        EXPIRED = "expired", "Expired"

    class BillingCycle(models.TextChoices):
        WEEKLY = "weekly", "Weekly"
        MONTHLY = "monthly", "Monthly"
        QUARTERLY = "quarterly", "Quarterly"
        YEARLY = "yearly", "Yearly"
        CUSTOM = "custom", "Custom"

    class IntervalUnit(models.TextChoices):
        DAYS = "days", "Days"
        WEEKS = "weeks", "Weeks"
        MONTHS = "months", "Months"
        YEARS = "years", "Years"

    class Importance(models.TextChoices):
        ESSENTIAL = "essential", "Essential"
        USEFUL = "useful", "Useful"
        OPTIONAL = "optional", "Optional"
        RARELY_USED = "rarely_used", "Rarely used"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscriptions",
    )
    category = models.ForeignKey(
        SubscriptionCategory,
        on_delete=models.SET_NULL,
        related_name="subscriptions",
        null=True,
        blank=True,
    )

    name = models.CharField(max_length=200)
    provider = models.CharField(max_length=200, blank=True)
    # Optional reference to a curated frontend template (e.g. "netflix") used to
    # show a brand logo/accent. Blank for fully custom subscriptions.
    provider_key = models.CharField(max_length=64, blank=True, db_index=True)
    plan_name = models.CharField(max_length=200, blank=True)
    account_email = models.EmailField(blank=True)
    website_url = models.URLField(blank=True)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )

    # Cost. We never convert currencies (no live FX in this branch); aggregates
    # are grouped by currency instead.
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    currency = models.CharField(max_length=3, default="USD")

    billing_cycle = models.CharField(
        max_length=20, choices=BillingCycle.choices, default=BillingCycle.MONTHLY
    )
    custom_interval_count = models.PositiveIntegerField(null=True, blank=True)
    custom_interval_unit = models.CharField(
        max_length=10, choices=IntervalUnit.choices, blank=True
    )

    start_date = models.DateField(null=True, blank=True)
    next_billing_date = models.DateField(null=True, blank=True)
    cancellation_deadline = models.DateField(null=True, blank=True)

    auto_renew = models.BooleanField(default=True)
    # Days before the next billing date to surface an in-app reminder event.
    reminder_days_before = models.PositiveIntegerField(default=7)

    # Human label only — never a full card number (validated below + serializer).
    payment_method_label = models.CharField(
        max_length=120, blank=True, validators=[validate_no_card_number]
    )

    importance = models.CharField(
        max_length=20, choices=Importance.choices, default=Importance.USEFUL
    )
    last_used_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    # Optional, user-entered note about a price change, e.g. "Up from $9.99 to
    # $15.99". Free text only — the no-card-number rule still applies.
    price_change_note = models.CharField(max_length=255, blank=True)

    # Lightweight review/triage state the user controls directly (separate from
    # the rule-based review_status computed in services).
    pinned = models.BooleanField(default=False)
    cancel_candidate = models.BooleanField(default=False)
    last_reviewed_at = models.DateTimeField(null=True, blank=True)

    # Soft archive (mirrors the documents trash pattern). Archived subscriptions
    # are hidden from active lists, summaries, calendar, timeline, and attention
    # until restored.
    is_archived = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)

    # "I've seen this — remind me later." When set to a future datetime, the
    # subscription is hidden from the Life Radar / Attention surfaces until then.
    attention_snoozed_until = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["next_billing_date", "name"]
        indexes = [
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["owner", "next_billing_date"]),
            models.Index(fields=["owner", "is_archived"]),
        ]

    def __str__(self):
        return f"{self.name} ({self.owner})"

    def clean(self):
        """Cross-field validation, enforced at the model layer too."""
        if self.billing_cycle == self.BillingCycle.CUSTOM:
            if not self.custom_interval_count or not self.custom_interval_unit:
                raise ValidationError(
                    {
                        "custom_interval_count": (
                            "A custom billing cycle needs an interval count and "
                            "unit (e.g. every 2 months)."
                        )
                    }
                )
        if (
            self.cancellation_deadline
            and self.next_billing_date
            and self.cancellation_deadline > self.next_billing_date
        ):
            raise ValidationError(
                {
                    "cancellation_deadline": (
                        "The cancellation deadline is the last day to cancel "
                        "before renewal, so it cannot be after the next billing "
                        "date."
                    )
                }
            )

    def archive(self):
        self.is_archived = True
        self.archived_at = timezone.now()
        self.save(update_fields=["is_archived", "archived_at", "updated_at"])

    def restore(self):
        self.is_archived = False
        self.archived_at = None
        self.save(update_fields=["is_archived", "archived_at", "updated_at"])


class SubscriptionPaymentRecord(models.Model):
    """
    A logged payment for a subscription (manual, owner-entered).

    V1 is metadata-only. Receipt *file* attachments are intentionally deferred
    (documented in docs/api-spec.md) so this stays consistent with how the rest
    of the app handles files without a larger storage change.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscription_payments",
    )
    subscription = models.ForeignKey(
        Subscription,
        on_delete=models.CASCADE,
        related_name="payments",
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(0)],
    )
    currency = models.CharField(max_length=3, default="USD")
    paid_on = models.DateField()
    billing_period_start = models.DateField(null=True, blank=True)
    billing_period_end = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-paid_on", "-created_at"]
        indexes = [
            models.Index(fields=["owner", "paid_on"]),
            models.Index(fields=["subscription", "paid_on"]),
        ]

    def __str__(self):
        return f"{self.subscription_id} · {self.amount} {self.currency} on {self.paid_on}"

    def clean(self):
        if (
            self.billing_period_start
            and self.billing_period_end
            and self.billing_period_end < self.billing_period_start
        ):
            raise ValidationError(
                {
                    "billing_period_end": (
                        "The billing period end cannot be before its start."
                    )
                }
            )
