from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    DocumentFileDetailView,
    DocumentFileDownloadView,
    DocumentFileListCreateView,
    DocumentViewSet,
)

router = DefaultRouter()
router.register("documents", DocumentViewSet, basename="document")

# Nested file routes are listed before the router so the more specific
# `documents/<id>/files/...` paths are matched first.
urlpatterns = [
    path(
        "documents/<int:document_id>/files/",
        DocumentFileListCreateView.as_view(),
        name="document-files",
    ),
    path(
        "documents/<int:document_id>/files/<int:pk>/",
        DocumentFileDetailView.as_view(),
        name="document-file-detail",
    ),
    path(
        "documents/<int:document_id>/files/<int:pk>/download/",
        DocumentFileDownloadView.as_view(),
        name="document-file-download",
    ),
] + router.urls
