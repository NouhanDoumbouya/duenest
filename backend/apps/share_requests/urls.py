from django.urls import path

from .views import (
    PublicShareRequestView,
    ShareRequestDetailView,
    ShareRequestListCreateView,
    ShareRequestRespondView,
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
]
