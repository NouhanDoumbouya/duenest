"""
Serializers for the Subscription tracker.

Validation mirrors the model-level rules and adds request-time guards. The
``owner`` is never accepted from the client — viewsets set it from
``request.user`` — so a user can only ever create rows they own.
"""

from rest_framework import serializers

from .models import (
    Subscription,
    SubscriptionCategory,
    SubscriptionPaymentRecord,
    validate_no_card_number,
)
from .services import compute_subscription_state


class SubscriptionCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionCategory
        fields = [
            "id",
            "name",
            "slug",
            "icon",
            "color",
            "is_system",
            "sort_order",
        ]
        read_only_fields = fields


class SubscriptionPaymentRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPaymentRecord
        fields = [
            "id",
            "subscription",
            "amount",
            "currency",
            "paid_on",
            "billing_period_start",
            "billing_period_end",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "subscription", "created_at", "updated_at"]

    def validate_amount(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Amount cannot be negative.")
        return value

    def validate(self, attrs):
        start = attrs.get("billing_period_start")
        end = attrs.get("billing_period_end")
        if start and end and end < start:
            raise serializers.ValidationError(
                {"billing_period_end": "The period end cannot be before its start."}
            )
        return attrs


class SubscriptionSerializer(serializers.ModelSerializer):
    # Accept a category id on write; expose a compact nested object on read.
    category = serializers.PrimaryKeyRelatedField(
        queryset=SubscriptionCategory.objects.all(),
        required=False,
        allow_null=True,
    )
    category_detail = SubscriptionCategorySerializer(source="category", read_only=True)
    state = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = [
            "id",
            "category",
            "category_detail",
            "name",
            "provider",
            "plan_name",
            "account_email",
            "website_url",
            "status",
            "amount",
            "currency",
            "billing_cycle",
            "custom_interval_count",
            "custom_interval_unit",
            "start_date",
            "next_billing_date",
            "cancellation_deadline",
            "auto_renew",
            "reminder_days_before",
            "payment_method_label",
            "importance",
            "last_used_date",
            "notes",
            "is_archived",
            "archived_at",
            "state",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "is_archived",
            "archived_at",
            "created_at",
            "updated_at",
        ]

    def get_state(self, obj):
        return compute_subscription_state(obj)

    def validate_amount(self, value):
        if value is not None and value < 0:
            raise serializers.ValidationError("Amount must be a positive number.")
        return value

    def validate_currency(self, value):
        value = (value or "").strip().upper()
        if not value:
            raise serializers.ValidationError("Currency is required.")
        if len(value) != 3 or not value.isalpha():
            raise serializers.ValidationError(
                "Use a 3-letter currency code, e.g. USD, GBP, EUR."
            )
        return value

    def validate_payment_method_label(self, value):
        # Reuse the model validator so the no-card-number rule lives in one place.
        validate_no_card_number(value)
        return value

    def validate(self, attrs):
        # Merge incoming values over the existing instance for partial updates.
        def current(field, default=None):
            if field in attrs:
                return attrs[field]
            if self.instance is not None:
                return getattr(self.instance, field)
            return default

        cycle = current("billing_cycle", Subscription.BillingCycle.MONTHLY)
        if cycle == Subscription.BillingCycle.CUSTOM:
            count = current("custom_interval_count")
            unit = current("custom_interval_unit")
            if not count or not unit:
                raise serializers.ValidationError(
                    {
                        "custom_interval_count": (
                            "A custom billing cycle needs an interval count and "
                            "unit (e.g. every 2 months)."
                        )
                    }
                )

        deadline = current("cancellation_deadline")
        nbd = current("next_billing_date")
        if deadline and nbd and deadline > nbd:
            raise serializers.ValidationError(
                {
                    "cancellation_deadline": (
                        "The cancellation deadline cannot be after the next "
                        "billing date."
                    )
                }
            )
        return attrs
