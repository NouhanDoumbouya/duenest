from django.contrib import admin

from .models import (
    QuickShareActivity,
    QuickShareClaim,
    QuickShareItem,
    QuickShareSession,
)


class QuickShareItemInline(admin.TabularInline):
    model = QuickShareItem
    extra = 0
    raw_id_fields = ("document", "file")


@admin.register(QuickShareSession)
class QuickShareSessionAdmin(admin.ModelAdmin):
    list_display = (
        "short_id",
        "owner",
        "mode",
        "permission",
        "status",
        "expires_at",
        "claim_count",
        "created_at",
    )
    list_filter = ("mode", "permission", "status")
    search_fields = ("title", "owner__email")
    # Never surface the hash or full token for casual browsing.
    exclude = ("access_code_hash",)
    readonly_fields = ("token", "claim_count", "created_at", "updated_at")
    inlines = [QuickShareItemInline]


@admin.register(QuickShareClaim)
class QuickShareClaimAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "receiver_user", "status", "approval", "created_at")
    list_filter = ("status", "approval")


@admin.register(QuickShareActivity)
class QuickShareActivityAdmin(admin.ModelAdmin):
    list_display = ("id", "session", "action", "actor_type", "created_at")
    list_filter = ("action", "actor_type")
