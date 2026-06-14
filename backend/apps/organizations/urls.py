from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    OrganizationInviteTokenView,
    OrganizationViewSet,
    PublicDocumentRequestView,
    PublicOrganizationSecureRoomView,
)

router = DefaultRouter()
router.register("organizations", OrganizationViewSet, basename="organization")

urlpatterns = [
    *router.urls,
    path(
        "organization-invites/<str:token>/",
        OrganizationInviteTokenView.as_view(),
        name="organization-invite-detail",
    ),
    path(
        "organization-invites/<str:token>/accept/",
        OrganizationInviteTokenView.as_view(),
        name="organization-invite-accept",
    ),
    path(
        "public/document-requests/<str:token>/",
        PublicDocumentRequestView.as_view(),
        name="public-organization-document-request",
    ),
    path(
        "public/document-requests/<str:token>/upload/",
        PublicDocumentRequestView.as_view(),
        name="public-organization-document-request-upload",
    ),
    path(
        "public/organization-secure-rooms/<str:token>/",
        PublicOrganizationSecureRoomView.as_view(),
        name="public-organization-secure-room",
    ),
]
