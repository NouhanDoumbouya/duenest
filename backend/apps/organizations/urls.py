from django.urls import path
from rest_framework.routers import DefaultRouter

from .portal_views import (
    PortalCaseArchiveView,
    PortalCaseCreatePackView,
    PortalCaseCreateRequestView,
    PortalCaseCreateRoomView,
    PortalCaseDetailView,
    PortalCaseProgressView,
    PortalCasesView,
    PortalPeopleView,
    PortalPersonArchiveView,
    PortalPersonDetailView,
    PortalReviewQueueView,
    PortalSummaryView,
    PortalDashboardView,
    PortalLimitsView,
    PortalCaseReviewItemsView,
    PortalCaseRequestStartReviewView,
    PortalCaseRequestReviewView,
    PortalCaseRequestDecisionsView,
    PortalCaseRequestFilePreviewView,
    PortalCaseRequestFileDownloadView,
    PortalReminderPreviewView,
    PortalReminderBatchesView,
    PortalReminderBatchDetailView,
    PortalReminderBatchSendView,
    PortalReminderBatchCancelView,
    PortalTemplatesView,
    PortalTemplateDetailView,
    PortalTemplateArchiveView,
    PortalTemplateDuplicateView,
    PortalTemplateCreateCaseView,
)
from .views import (
    OrganizationInviteTokenView,
    OrganizationViewSet,
    PublicDocumentRequestView,
    PublicOrganizationSecureRoomView,
)

router = DefaultRouter()
router.register("organizations", OrganizationViewSet, basename="organization")

_PORTAL = "organizations/<int:org_id>/portal"

urlpatterns = [
    *router.urls,
    # B2B Portals MVP — org-scoped, feature-gated (b2b_portals).
    path(f"{_PORTAL}/summary/", PortalSummaryView.as_view(), name="portal-summary"),
    # Organization Dashboard V1 — operational command center (read-only).
    path(f"{_PORTAL}/dashboard/", PortalDashboardView.as_view(), name="portal-dashboard"),
    # Organization Templates V1 — reusable case workflows.
    path(f"{_PORTAL}/templates/", PortalTemplatesView.as_view(), name="portal-templates"),
    path(f"{_PORTAL}/templates/<int:template_id>/", PortalTemplateDetailView.as_view(), name="portal-template-detail"),
    path(f"{_PORTAL}/templates/<int:template_id>/archive/", PortalTemplateArchiveView.as_view(), name="portal-template-archive"),
    path(f"{_PORTAL}/templates/<int:template_id>/duplicate/", PortalTemplateDuplicateView.as_view(), name="portal-template-duplicate"),
    path(f"{_PORTAL}/templates/<int:template_id>/create-case/", PortalTemplateCreateCaseView.as_view(), name="portal-template-create-case"),
    path(f"{_PORTAL}/limits/", PortalLimitsView.as_view(), name="portal-limits"),
    path(f"{_PORTAL}/people/", PortalPeopleView.as_view(), name="portal-people"),
    path(f"{_PORTAL}/people/<int:person_id>/", PortalPersonDetailView.as_view(), name="portal-person-detail"),
    path(f"{_PORTAL}/people/<int:person_id>/archive/", PortalPersonArchiveView.as_view(), name="portal-person-archive"),
    path(f"{_PORTAL}/cases/", PortalCasesView.as_view(), name="portal-cases"),
    path(f"{_PORTAL}/cases/<int:case_id>/", PortalCaseDetailView.as_view(), name="portal-case-detail"),
    path(f"{_PORTAL}/cases/<int:case_id>/archive/", PortalCaseArchiveView.as_view(), name="portal-case-archive"),
    path(f"{_PORTAL}/cases/<int:case_id>/create-pack/", PortalCaseCreatePackView.as_view(), name="portal-case-create-pack"),
    path(f"{_PORTAL}/cases/<int:case_id>/create-room/", PortalCaseCreateRoomView.as_view(), name="portal-case-create-room"),
    path(f"{_PORTAL}/cases/<int:case_id>/create-request/", PortalCaseCreateRequestView.as_view(), name="portal-case-create-request"),
    path(f"{_PORTAL}/cases/<int:case_id>/progress/", PortalCaseProgressView.as_view(), name="portal-case-progress"),
    path(f"{_PORTAL}/review-queue/", PortalReviewQueueView.as_view(), name="portal-review-queue"),
    # B2B Bulk Reminder Emails V1.
    path(f"{_PORTAL}/reminders/preview/", PortalReminderPreviewView.as_view(), name="portal-reminder-preview"),
    path(f"{_PORTAL}/reminders/batches/", PortalReminderBatchesView.as_view(), name="portal-reminder-batches"),
    path(f"{_PORTAL}/reminders/batches/<int:batch_id>/", PortalReminderBatchDetailView.as_view(), name="portal-reminder-batch-detail"),
    path(f"{_PORTAL}/reminders/batches/<int:batch_id>/send/", PortalReminderBatchSendView.as_view(), name="portal-reminder-batch-send"),
    path(f"{_PORTAL}/reminders/batches/<int:batch_id>/cancel/", PortalReminderBatchCancelView.as_view(), name="portal-reminder-batch-cancel"),
    # B2B Review + Approval Workflow V1.
    path(f"{_PORTAL}/cases/<int:case_id>/review-items/", PortalCaseReviewItemsView.as_view(), name="portal-case-review-items"),
    path(f"{_PORTAL}/cases/<int:case_id>/requests/<int:case_request_id>/start-review/", PortalCaseRequestStartReviewView.as_view(), name="portal-case-request-start-review"),
    path(f"{_PORTAL}/cases/<int:case_id>/requests/<int:case_request_id>/review/", PortalCaseRequestReviewView.as_view(), name="portal-case-request-review"),
    path(f"{_PORTAL}/cases/<int:case_id>/requests/<int:case_request_id>/decisions/", PortalCaseRequestDecisionsView.as_view(), name="portal-case-request-decisions"),
    path(f"{_PORTAL}/cases/<int:case_id>/requests/<int:case_request_id>/file/preview/", PortalCaseRequestFilePreviewView.as_view(), name="portal-case-request-file-preview"),
    path(f"{_PORTAL}/cases/<int:case_id>/requests/<int:case_request_id>/file/download/", PortalCaseRequestFileDownloadView.as_view(), name="portal-case-request-file-download"),
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
