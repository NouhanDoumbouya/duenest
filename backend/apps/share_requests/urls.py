from django.urls import path

from .views import (
    PublicShareRequestUploadView,
    PublicShareRequestView,
    ShareRequestDetailView,
    ShareRequestListCreateView,
    ShareRequestRespondView,
    ShareRequestSubmissionDownloadView,
)

urlpatterns = [
    # Public respond routes first so 'respond' is never captured as an id.
    path(
        "share-requests/respond/<str:token>/",
        PublicShareRequestView.as_view(),
        name="share-request-respond",
    ),
    path(
        "share-requests/respond/<str:token>/submit/",
        ShareRequestRespondView.as_view(),
        name="share-request-submit",
    ),
    # Public external upload (people without a DueNest account).
    path(
        "public/share-requests/<str:token>/upload/",
        PublicShareRequestUploadView.as_view(),
        name="share-request-public-upload",
    ),
    # Owner endpoints.
    path(
        "share-requests/",
        ShareRequestListCreateView.as_view(),
        name="share-requests",
    ),
    path(
        "share-requests/<int:request_id>/",
        ShareRequestDetailView.as_view(),
        name="share-request-detail",
    ),
    path(
        "share-requests/<int:request_id>/submissions/<int:submission_id>/download/",
        ShareRequestSubmissionDownloadView.as_view(),
        name="share-request-submission-download",
    ),
]
