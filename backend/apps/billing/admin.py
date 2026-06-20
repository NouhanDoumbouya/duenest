from django.contrib import admin

from .models import (
    BillingEmailSettings,
    BillingEvent,
    CustomerBillingProfile,
    InvoiceRecord,
    ManualAccessGrant,
    Plan,
    PlanEntitlement,
    PromoCode,
    PromoRedemption,
    ReceiptSettings,
    UserSubscription,
)


@admin.register(ReceiptSettings)
class ReceiptSettingsAdmin(admin.ModelAdmin):
    list_display = ("enabled", "mode", "send_for_manual", "updated_at")


@admin.register(BillingEmailSettings)
class BillingEmailSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "trial_ending_days_before",
        "renewal_upcoming_days_before",
        "grace_period_days",
        "dunning_followup_days",
        "updated_at",
    )


class PlanEntitlementInline(admin.TabularInline):
    model = PlanEntitlement
    extra = 0


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ("key", "name", "tier", "is_public", "is_active", "is_recommended")
    list_filter = ("tier", "is_public", "is_active")
    inlines = [PlanEntitlementInline]


@admin.register(UserSubscription)
class UserSubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "plan", "status", "billing_interval", "current_period_end")
    list_filter = ("status", "billing_interval", "provider")
    search_fields = ("user__email", "provider_subscription_id")


@admin.register(PromoCode)
class PromoCodeAdmin(admin.ModelAdmin):
    list_display = ("code", "promo_type", "is_active", "redemption_count")
    list_filter = ("promo_type", "is_active")
    search_fields = ("code",)


@admin.register(ManualAccessGrant)
class ManualAccessGrantAdmin(admin.ModelAdmin):
    list_display = ("user", "plan", "grant_status", "is_active", "ends_at")
    list_filter = ("grant_status", "is_active")


admin.site.register(CustomerBillingProfile)
admin.site.register(PromoRedemption)
admin.site.register(BillingEvent)
admin.site.register(InvoiceRecord)
