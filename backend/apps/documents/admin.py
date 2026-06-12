from django.contrib import admin

from .models import Document, DocumentCategory


@admin.register(DocumentCategory)
class DocumentCategoryAdmin(admin.ModelAdmin):
    list_display = ["name", "slug", "created_at"]
    search_fields = ["name", "slug"]
    prepopulated_fields = {"slug": ("name",)}


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = [
        "title",
        "owner",
        "category",
        "expiry_date",
        "status",
        "created_at",
    ]
    list_filter = ["status", "category"]
    search_fields = ["title", "issuer", "reference_number", "owner__username"]
    # owner uses raw_id (the custom User model isn't registered for autocomplete);
    # category supports autocomplete via DocumentCategoryAdmin.search_fields.
    raw_id_fields = ["owner"]
    autocomplete_fields = ["category"]
    date_hierarchy = "created_at"
