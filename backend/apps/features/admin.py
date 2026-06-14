from django.contrib import admin

from .models import FeatureFlag


@admin.register(FeatureFlag)
class FeatureFlagAdmin(admin.ModelAdmin):
    list_display = ("key", "name", "visibility", "maintenance_message", "updated_at")
    list_filter = ("visibility",)
    search_fields = ("key", "name", "description")
    readonly_fields = ("created_at", "updated_at", "updated_by")
    list_editable = ("visibility",)
    ordering = ("key",)

    def save_model(self, request, obj, form, change):
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)
