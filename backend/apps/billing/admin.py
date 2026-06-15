from django.contrib import admin

from .models import (
    BillingEvent,
    CustomerBillingProfile,
    InvoiceRecord,
    ManualAccessGrant,
    Plan,
    PlanEntitlement,
    PromoCode,
    PromoRedemption,
    UserSubscription,
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
