from django.contrib import admin

from .models import Document, DocumentCategory, DocumentFile


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


@admin.register(DocumentFile)
class DocumentFileAdmin(admin.ModelAdmin):
    list_display = [
        "original_filename",
        "document",
        "uploaded_by",
        "content_type",
        "file_size",
        "created_at",
    ]
    list_filter = ["content_type"]
    search_fields = ["original_filename", "uploaded_by__username"]
    raw_id_fields = ["document", "uploaded_by"]
    readonly_fields = ["file_size", "checksum", "created_at", "updated_at"]
    date_hierarchy = "created_at"
