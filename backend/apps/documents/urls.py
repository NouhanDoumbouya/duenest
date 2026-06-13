from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    DocumentFileActivityView,
    DocumentFileDetailView,
    DocumentFileDownloadView,
    DocumentFileListCreateView,
    DocumentFilePreviewView,
    DocumentFileShareLinkDetailView,
    DocumentFileShareLinkListCreateView,
    DocumentFileShareLinkRevokeView,
    DocumentReminderRuleDetailView,
    DocumentReminderRuleListCreateView,
    DocumentViewSet,
    PublicSharedFileDownloadView,
    PublicSharedFileMetadataView,
    PublicSharedFilePreviewView,
    PublicSharedFileVerifyCodeView,
    UpcomingDocumentRemindersView,
)

router = DefaultRouter()
router.register("documents", DocumentViewSet, basename="document")

# Owner endpoints for files, previews, share links, and activity. Listed before
# the router so the more specific paths are matched first.
file_base = "documents/<int:document_id>/files"

urlpatterns = [
    path(
        f"{file_base}/",
        DocumentFileListCreateView.as_view(),
        name="document-files",
    ),
    path(
        f"{file_base}/<int:pk>/",
        DocumentFileDetailView.as_view(),
        name="document-file-detail",
    ),
    path(
        f"{file_base}/<int:pk>/download/",
        DocumentFileDownloadView.as_view(),
        name="document-file-download",
    ),
    path(
        f"{file_base}/<int:pk>/preview/",
        DocumentFilePreviewView.as_view(),
        name="document-file-preview",
    ),
    path(
        f"{file_base}/<int:file_id>/share-links/",
        DocumentFileShareLinkListCreateView.as_view(),
        name="document-file-share-links",
    ),
    path(
        f"{file_base}/<int:file_id>/share-links/<int:share_id>/",
        DocumentFileShareLinkDetailView.as_view(),
        name="document-file-share-link-detail",
    ),
    path(
        f"{file_base}/<int:file_id>/share-links/<int:share_id>/revoke/",
        DocumentFileShareLinkRevokeView.as_view(),
        name="document-file-share-link-revoke",
    ),
    path(
        f"{file_base}/<int:file_id>/activity/",
        DocumentFileActivityView.as_view(),
        name="document-file-activity",
    ),
    path(
        "documents/reminders/upcoming/",
        UpcomingDocumentRemindersView.as_view(),
        name="document-reminders-upcoming",
    ),
    path(
        "documents/<int:document_id>/reminder-rules/",
        DocumentReminderRuleListCreateView.as_view(),
        name="document-reminder-rules",
    ),
    path(
        "documents/<int:document_id>/reminder-rules/<int:rule_id>/",
        DocumentReminderRuleDetailView.as_view(),
        name="document-reminder-rule-detail",
    ),
    # Public share endpoints (token-gated, no authentication).
    path(
        "share/files/<str:token>/",
        PublicSharedFileMetadataView.as_view(),
        name="public-shared-file",
    ),
    path(
        "share/files/<str:token>/verify-code/",
        PublicSharedFileVerifyCodeView.as_view(),
        name="public-shared-file-verify-code",
    ),
    path(
        "share/files/<str:token>/preview/",
        PublicSharedFilePreviewView.as_view(),
        name="public-shared-file-preview",
    ),
    path(
        "share/files/<str:token>/download/",
        PublicSharedFileDownloadView.as_view(),
        name="public-shared-file-download",
    ),
] + router.urls
