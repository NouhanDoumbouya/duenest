"""
DueNest's own SaaS billing layer (plans, subscriptions, promo codes, billing
events, invoices, manual grants).

This is distinct from ``apps.subscriptions`` — that app tracks a *user's own*
recurring payments (Netflix, Spotify, …). This app monetizes DueNest itself.

Money is stored as integer minor units (cents/sen) to avoid float rounding.
``User.plan`` (free / pro_placeholder) stays the denormalized "effective tier"
that the existing limit enforcement reads, and is kept in sync from here so no
existing enforcement code has to change.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone


class Plan(models.Model):
    """A purchasable (or free) DueNest plan. Prices are integer minor units."""

    class Tier(models.TextChoices):
        FREE = "free", "Free"
        PRO = "pro", "Pro"
        FAMILY = "family", "Family"
        ORGANIZATION = "organization", "Organization"

    key = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)
    tier = models.CharField(max_length=20, choices=Tier.choices, default=Tier.PRO)
    is_public = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    is_recommended = models.BooleanField(default=False)
    currency = models.CharField(max_length=3, default="usd")
    # Minor units (e.g. cents). 0 for free. Null = price not offered for that interval.
    monthly_price = models.PositiveIntegerField(null=True, blank=True)
    yearly_price = models.PositiveIntegerField(null=True, blank=True)
    monthly_provider_price_id = models.CharField(max_length=120, blank=True)
    yearly_provider_price_id = models.CharField(max_length=120, blank=True)
    trial_days = models.PositiveSmallIntegerField(default=0)
    sort_order = models.PositiveSmallIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return f"{self.name} ({self.key})"

    @property
    def is_free(self) -> bool:
        return self.tier == self.Tier.FREE


class PlanEntitlement(models.Model):
    """One feature limit / flag for a plan (the source of truth for gating)."""

    class Period(models.TextChoices):
        TOTAL = "total", "Total"
        MONTH = "month", "Per month"
        DAY = "day", "Per day"

    plan = models.ForeignKey(
        Plan, on_delete=models.CASCADE, related_name="entitlements"
    )
    feature_key = models.CharField(max_length=64)
    # Null = unlimited when is_enabled. limit_value is meaningless for boolean flags.
    limit_value = models.IntegerField(null=True, blank=True)
    limit_period = models.CharField(
        max_length=10, choices=Period.choices, default=Period.TOTAL
    )
    is_enabled = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ("plan", "feature_key")
        ordering = ["plan_id", "feature_key"]

    def __str__(self):
        return f"{self.plan.key}:{self.feature_key}"


class CustomerBillingProfile(models.Model):
    """Provider customer record + billing identity for a user."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="billing_profile",
    )
    provider = models.CharField(max_length=20, default="stripe")
    provider_customer_id = models.CharField(max_length=120, blank=True, db_index=True)
    default_currency = models.CharField(max_length=3, default="usd")
    billing_email = models.EmailField(blank=True)
    country = models.CharField(max_length=2, blank=True)
    tax_region = models.CharField(max_length=40, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"BillingProfile<{self.user_id}>"


class UserSubscription(models.Model):
    """A user's (or organization's) DueNest subscription state."""

    class Status(models.TextChoices):
        FREE = "free", "Free"
        TRIALING = "trialing", "Trialing"
        ACTIVE = "active", "Active"
        PAST_DUE = "past_due", "Past due"
        CANCELED = "canceled", "Canceled"
        UNPAID = "unpaid", "Unpaid"
        INCOMPLETE = "incomplete", "Incomplete"
        INCOMPLETE_EXPIRED = "incomplete_expired", "Incomplete expired"
        GRACE_PERIOD = "grace_period", "Grace period"
        BETA = "beta", "Beta"
        FOUNDER = "founder", "Founder"
        LIFETIME = "lifetime", "Lifetime"
        MANUAL_PRO = "manual_pro", "Manual Pro"
        ORG_ACTIVE = "org_active", "Organization active"
        ORG_PAST_DUE = "org_past_due", "Organization past due"

    class Interval(models.TextChoices):
        MONTH = "month", "Monthly"
        YEAR = "year", "Yearly"
        LIFETIME = "lifetime", "Lifetime"
        NONE = "none", "None"

    # Statuses that currently grant paid (Pro-tier) access.
    PAID_STATUSES = {
        Status.TRIALING,
        Status.ACTIVE,
        Status.PAST_DUE,
        Status.GRACE_PERIOD,
        Status.BETA,
        Status.FOUNDER,
        Status.LIFETIME,
        Status.MANUAL_PRO,
        Status.ORG_ACTIVE,
        Status.ORG_PAST_DUE,
    }

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="duenest_subscriptions",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="duenest_subscriptions",
    )
    plan = models.ForeignKey(
        Plan, on_delete=models.PROTECT, related_name="subscriptions"
    )
    provider = models.CharField(max_length=20, default="stripe")
    provider_subscription_id = models.CharField(
        max_length=120, blank=True, db_index=True
    )
    provider_customer_id = models.CharField(max_length=120, blank=True)
    status = models.CharField(
        max_length=24, choices=Status.choices, default=Status.FREE
    )
    billing_interval = models.CharField(
        max_length=10, choices=Interval.choices, default=Interval.NONE
    )
    currency = models.CharField(max_length=3, default="usd")
    amount = models.PositiveIntegerField(default=0)  # minor units
    seats = models.PositiveIntegerField(default=1)
    current_period_start = models.DateTimeField(null=True, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)
    trial_start = models.DateTimeField(null=True, blank=True)
    trial_end = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)
    canceled_at = models.DateTimeField(null=True, blank=True)
    grace_period_until = models.DateTimeField(null=True, blank=True)
    active_promo_code = models.ForeignKey(
        "billing.PromoCode",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="subscriptions",
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "status"])]

    def __str__(self):
        return f"Sub<{self.user_id}:{self.plan.key}:{self.status}>"

    @property
    def grants_paid_access(self) -> bool:
        """Whether this subscription currently unlocks paid features."""
        if self.status not in self.PAID_STATUSES:
            return False
        if self.status == self.Status.GRACE_PERIOD and self.grace_period_until:
            return timezone.now() < self.grace_period_until
        # A canceled-at-period-end sub still grants access until the period ends.
        if self.cancel_at_period_end and self.current_period_end:
            return timezone.now() < self.current_period_end
        return True


class PromoCode(models.Model):
    """A reduction / access code applied at checkout or by an admin."""

    class PromoType(models.TextChoices):
        PERCENTAGE_DISCOUNT = "percentage_discount", "Percentage discount"
        FIXED_DISCOUNT = "fixed_discount", "Fixed discount"
        TRIAL_EXTENSION = "trial_extension", "Trial extension"
        FREE_MONTHS = "free_months", "Free months"
        FOUNDER_DISCOUNT = "founder_discount", "Founder discount"
        BETA_ACCESS = "beta_access", "Beta access"
        STUDENT_DISCOUNT = "student_discount", "Student discount"
        REFERRAL_CREDIT = "referral_credit", "Referral credit"
        MANUAL_CODE = "manual_code", "Manual code"

    class Duration(models.TextChoices):
        ONCE = "once", "First payment only"
        REPEATING = "repeating", "Repeating"
        FOREVER = "forever", "Forever"

    code = models.CharField(max_length=64, unique=True)  # stored normalized (UPPER)
    name = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    promo_type = models.CharField(
        max_length=24,
        choices=PromoType.choices,
        default=PromoType.PERCENTAGE_DISCOUNT,
    )
    percent_off = models.PositiveSmallIntegerField(null=True, blank=True)  # 1-100
    amount_off = models.PositiveIntegerField(null=True, blank=True)  # minor units
    currency = models.CharField(max_length=3, blank=True)
    duration = models.CharField(
        max_length=12, choices=Duration.choices, default=Duration.ONCE
    )
    duration_months = models.PositiveSmallIntegerField(null=True, blank=True)
    trial_extension_days = models.PositiveSmallIntegerField(null=True, blank=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    max_redemptions = models.PositiveIntegerField(null=True, blank=True)
    max_redemptions_per_user = models.PositiveSmallIntegerField(default=1)
    redemption_count = models.PositiveIntegerField(default=0)
    # List of plan keys this applies to ([] = all plans).
    applies_to_plans = models.JSONField(default=list, blank=True)
    # List of intervals ("month"/"year") this applies to ([] = all).
    applies_to_billing_intervals = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    provider_coupon_id = models.CharField(max_length=120, blank=True)
    provider_promotion_code_id = models.CharField(max_length=120, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_promo_codes",
    )
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return self.code

    @staticmethod
    def normalize(code: str) -> str:
        return (code or "").strip().upper()


class PromoRedemption(models.Model):
    """An audit record of a promo code redeemed by a user."""

    promo_code = models.ForeignKey(
        PromoCode, on_delete=models.CASCADE, related_name="redemptions"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="promo_redemptions",
    )
    subscription = models.ForeignKey(
        UserSubscription,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="promo_redemptions",
    )
    redeemed_at = models.DateTimeField(auto_now_add=True)
    provider_redemption_id = models.CharField(max_length=120, blank=True)
    amount_discounted = models.PositiveIntegerField(null=True, blank=True)
    currency = models.CharField(max_length=3, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-redeemed_at"]
        indexes = [models.Index(fields=["promo_code", "user"])]

    def __str__(self):
        return f"Redemption<{self.promo_code.code}:{self.user_id}>"


class BillingEvent(models.Model):
    """Idempotency + audit log for provider webhook events."""

    class Status(models.TextChoices):
        PROCESSED = "processed", "Processed"
        IGNORED = "ignored", "Ignored"
        FAILED = "failed", "Failed"

    provider = models.CharField(max_length=20, default="stripe")
    provider_event_id = models.CharField(max_length=140, unique=True)
    event_type = models.CharField(max_length=80)
    processed_at = models.DateTimeField(default=timezone.now)
    payload_hash = models.CharField(max_length=64, blank=True)
    status = models.CharField(
        max_length=12, choices=Status.choices, default=Status.PROCESSED
    )
    error_message = models.CharField(max_length=255, blank=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_events",
    )
    subscription = models.ForeignKey(
        UserSubscription,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="billing_events",
    )
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-processed_at"]

    def __str__(self):
        return f"{self.provider}:{self.event_type}:{self.provider_event_id}"


class InvoiceRecord(models.Model):
    """A provider invoice mirrored for in-app billing history."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="invoice_records",
    )
    subscription = models.ForeignKey(
        UserSubscription,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="invoice_records",
    )
    provider_invoice_id = models.CharField(max_length=140, unique=True)
    # Human, sequential receipt number (e.g. DN-2026-00042), assigned when the
    # branded receipt is sent. Blank until then; unique when set.
    receipt_number = models.CharField(
        max_length=32, blank=True, default="", db_index=True
    )
    amount_due = models.PositiveIntegerField(default=0)
    amount_paid = models.PositiveIntegerField(default=0)
    # Tax portion of the amount (minor units), shown as a separate receipt line.
    tax_amount = models.PositiveIntegerField(default=0)
    currency = models.CharField(max_length=3, default="usd")
    status = models.CharField(max_length=20, blank=True)
    hosted_invoice_url = models.URLField(blank=True)
    invoice_pdf_url = models.URLField(blank=True)
    period_start = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    # When a branded receipt email was sent for this invoice. Guards against
    # duplicate sends, since payment webhooks can be retried by the provider.
    receipt_sent_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Invoice<{self.provider_invoice_id}>"


class ManualAccessGrant(models.Model):
    """An admin-granted plan access (beta/founder/comp), logged and revocable."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="manual_access_grants",
    )
    plan = models.ForeignKey(
        Plan, on_delete=models.PROTECT, related_name="manual_grants"
    )
    # Maps onto a UserSubscription.Status (e.g. manual_pro, beta, founder, lifetime).
    grant_status = models.CharField(
        max_length=24,
        choices=UserSubscription.Status.choices,
        default=UserSubscription.Status.MANUAL_PRO,
    )
    reason = models.CharField(max_length=255, blank=True)
    granted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="manual_grants_given",
    )
    starts_at = models.DateTimeField(default=timezone.now)
    ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "is_active"])]

    def __str__(self):
        return f"ManualGrant<{self.user_id}:{self.plan.key}>"

    @property
    def is_current(self) -> bool:
        if not self.is_active:
            return False
        now = timezone.now()
        if self.starts_at and now < self.starts_at:
            return False
        if self.ends_at and now >= self.ends_at:
            return False
        return True


class FeatureUsageCounter(models.Model):
    """
    Per-user, per-period counter for metered features (e.g. scanner scans or
    quick shares per month). ``period_key`` is "total", "YYYY-MM" (monthly), or
    "YYYY-MM-DD" (daily) so a new period starts a fresh count automatically.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="feature_usage_counters",
    )
    feature_key = models.CharField(max_length=64)
    period_key = models.CharField(max_length=16)
    count = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("user", "feature_key", "period_key")
        indexes = [models.Index(fields=["user", "feature_key", "period_key"])]

    def __str__(self):
        return f"Usage<{self.user_id}:{self.feature_key}:{self.period_key}={self.count}>"


class ReceiptSettings(models.Model):
    """Founder-configurable branded receipt emails for DueNest subscriptions.

    A single row (pk=1) holds the active configuration; ``load()`` returns it,
    creating defaults on first use, so callers never deal with absence. Disabled
    by default — receipts only go out once a founder turns them on.
    """

    class Mode(models.TextChoices):
        EMAIL_LINK = "email_link", "Branded email + provider invoice link"
        EMAIL_PDF = "email_pdf", "Branded email + DueNest PDF attachment"
        EMAIL_ONLY = "email_only", "Branded email only"

    enabled = models.BooleanField(default=False)
    mode = models.CharField(
        max_length=20, choices=Mode.choices, default=Mode.EMAIL_LINK
    )
    # Monotonic counter for human receipt numbers (DN-<year>-<seq>). Incremented
    # under select_for_update when a receipt is sent, so numbers never collide.
    last_receipt_number = models.PositiveIntegerField(default=0)
    # Stripe payments always send a receipt when enabled. This also covers the
    # manual/dev provider so receipts can be exercised offline; turn it off to
    # avoid emailing on every local checkout.
    send_for_manual = models.BooleanField(default=True)
    # Merchant / legal details printed on the receipt. Blank for now; the
    # template and PDF render them only when present, so they can be filled in
    # later without code changes.
    business_legal_name = models.CharField(max_length=200, blank=True)
    business_address = models.TextField(blank=True)
    tax_id = models.CharField(max_length=80, blank=True)
    support_email = models.EmailField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        verbose_name = "Receipt settings"
        verbose_name_plural = "Receipt settings"

    def __str__(self):
        return f"ReceiptSettings(enabled={self.enabled}, mode={self.mode})"

    def save(self, *args, **kwargs):
        # Enforce the singleton: there is only ever one configuration row.
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "ReceiptSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class BillingEmailSettings(models.Model):
    """Founder-configurable timing for billing lifecycle/dunning emails.

    A single row (pk=1) holds the timing knobs the webhook + ``sync_billing_access``
    cron read. Content/on-off for each email lives in the transactional registry
    (founder Emails page); this only governs *when* the scheduled ones fire.
    """

    # Scheduled-email lead times: how many days before the event to send.
    trial_ending_days_before = models.PositiveSmallIntegerField(default=3)
    renewal_upcoming_days_before = models.PositiveSmallIntegerField(default=3)
    # How long Pro features stay active after a failed payment.
    grace_period_days = models.PositiveSmallIntegerField(default=7)
    # 0 disables the second dunning email; >0 sends a follow-up this many days
    # after the failed payment (clamped to land inside the grace window).
    dunning_followup_days = models.PositiveSmallIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        verbose_name = "Billing email settings"
        verbose_name_plural = "Billing email settings"

    def __str__(self):
        return "BillingEmailSettings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls) -> "BillingEmailSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
