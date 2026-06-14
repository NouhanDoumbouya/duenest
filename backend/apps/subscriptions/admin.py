from django.contrib import admin

from .models import (
    Subscription,
    SubscriptionCategory,
    SubscriptionPaymentRecord,
)


@admin.register(SubscriptionCategory)
class SubscriptionCategoryAdmin(admin.ModelAdmin):
    list_display = ("name", "slug", "is_system", "owner", "sort_order")
    list_filter = ("is_system",)
    search_fields = ("name", "slug")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "owner",
        "status",
        "billing_cycle",
        "amount",
        "currency",
        "next_billing_date",
        "auto_renew",
        "is_archived",
    )
    list_filter = ("status", "billing_cycle", "auto_renew", "is_archived")
    search_fields = ("name", "provider", "plan_name")
    raw_id_fields = ("owner", "category")
    date_hierarchy = "next_billing_date"


@admin.register(SubscriptionPaymentRecord)
class SubscriptionPaymentRecordAdmin(admin.ModelAdmin):
    list_display = ("subscription", "owner", "amount", "currency", "paid_on")
    list_filter = ("currency",)
    raw_id_fields = ("owner", "subscription")
    date_hierarchy = "paid_on"
