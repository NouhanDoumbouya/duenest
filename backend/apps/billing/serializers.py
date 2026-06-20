from rest_framework import serializers

from .models import (
    BillingEvent,
    InvoiceRecord,
    ManualAccessGrant,
    Plan,
    PlanEntitlement,
    PromoCode,
    ReceiptSettings,
    UserSubscription,
)


class PlanEntitlementSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlanEntitlement
        fields = ["feature_key", "limit_value", "limit_period", "is_enabled"]


class PlanSerializer(serializers.ModelSerializer):
    """Public plan representation. Provider price IDs are never exposed."""

    entitlements = PlanEntitlementSerializer(many=True, read_only=True)

    class Meta:
        model = Plan
        fields = [
            "key",
            "name",
            "description",
            "tier",
            "is_public",
            "is_recommended",
            "currency",
            "monthly_price",
            "yearly_price",
            "trial_days",
            "sort_order",
            "entitlements",
            "metadata",
        ]


class CheckoutSerializer(serializers.Serializer):
    plan_key = serializers.CharField(max_length=64)
    interval = serializers.ChoiceField(choices=["month", "year"])
    promo_code = serializers.CharField(
        max_length=64, required=False, allow_blank=True, default=""
    )


class PromoValidateSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=64)
    plan_key = serializers.CharField(max_length=64, required=False, allow_blank=True)
    interval = serializers.ChoiceField(
        choices=["month", "year"], required=False, allow_blank=True
    )


class InvoiceRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceRecord
        fields = [
            "provider_invoice_id",
            "amount_due",
            "amount_paid",
            "currency",
            "status",
            "hosted_invoice_url",
            "invoice_pdf_url",
            "period_start",
            "period_end",
            "paid_at",
            "created_at",
        ]
        read_only_fields = fields


# ---- Founder / admin -------------------------------------------------------


class PromoCodeSerializer(serializers.ModelSerializer):
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = PromoCode
        fields = [
            "id",
            "code",
            "name",
            "description",
            "promo_type",
            "percent_off",
            "amount_off",
            "currency",
            "duration",
            "duration_months",
            "trial_extension_days",
            "starts_at",
            "ends_at",
            "max_redemptions",
            "max_redemptions_per_user",
            "redemption_count",
            "applies_to_plans",
            "applies_to_billing_intervals",
            "is_active",
            "created_by",
            "created_at",
        ]
        read_only_fields = ["id", "redemption_count", "created_by", "created_at"]

    def validate_code(self, value):
        normalized = PromoCode.normalize(value)
        if not normalized:
            raise serializers.ValidationError("Enter a code.")
        qs = PromoCode.objects.filter(code=normalized)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A code with this value already exists.")
        return normalized


class ManualAccessGrantSerializer(serializers.ModelSerializer):
    granted_by = serializers.PrimaryKeyRelatedField(read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)
    plan_key = serializers.CharField(source="plan.key", read_only=True)

    class Meta:
        model = ManualAccessGrant
        fields = [
            "id",
            "user",
            "user_email",
            "plan",
            "plan_key",
            "grant_status",
            "reason",
            "granted_by",
            "starts_at",
            "ends_at",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "granted_by", "user_email", "plan_key", "created_at"]


class SubscriberSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    plan_key = serializers.CharField(source="plan.key", read_only=True)

    class Meta:
        model = UserSubscription
        fields = [
            "id",
            "user",
            "user_email",
            "plan_key",
            "status",
            "billing_interval",
            "currency",
            "amount",
            "current_period_end",
            "cancel_at_period_end",
            "created_at",
        ]
        read_only_fields = fields


class BillingEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = BillingEvent
        fields = [
            "id",
            "provider",
            "provider_event_id",
            "event_type",
            "status",
            "error_message",
            "processed_at",
        ]
        read_only_fields = fields


class ReceiptSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReceiptSettings
        fields = [
            "enabled",
            "mode",
            "send_for_manual",
            "business_legal_name",
            "business_address",
            "tax_id",
            "support_email",
            "updated_at",
        ]
        read_only_fields = ["updated_at"]
