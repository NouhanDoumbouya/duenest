from django.urls import path

from .views import (
    ClientErrorLogCreateView,
    FeedbackCreateView,
    FounderActivationFunnelView,
    FounderChecklistTemplateDetailView,
    FounderChecklistTemplateListCreateView,
    FounderDashboardView,
    FounderErrorLogDetailView,
    FounderErrorLogListView,
    FounderErrorResolveView,
    FounderFeatureAdoptionView,
    FounderFeedbackDetailView,
    FounderFeedbackListView,
    FounderMeView,
    FounderSecurityEventListView,
    FounderSecurityOverviewView,
    FounderUserListView,
    FounderUserSummaryView,
)

urlpatterns = [
    path("feedback/", FeedbackCreateView.as_view(), name="feedback-create"),
    path("errors/client/", ClientErrorLogCreateView.as_view(), name="client-error-log"),
    path("founder/me/", FounderMeView.as_view(), name="founder-me"),
    path("founder/dashboard/", FounderDashboardView.as_view(), name="founder-dashboard"),
    path(
        "founder/activation-funnel/",
        FounderActivationFunnelView.as_view(),
        name="founder-activation-funnel",
    ),
    path(
        "founder/feature-adoption/",
        FounderFeatureAdoptionView.as_view(),
        name="founder-feature-adoption",
    ),
    path("founder/feedback/", FounderFeedbackListView.as_view(), name="founder-feedback"),
    path(
        "founder/feedback/<int:feedback_id>/",
        FounderFeedbackDetailView.as_view(),
        name="founder-feedback-detail",
    ),
    path(
        "founder/templates/checklists/",
        FounderChecklistTemplateListCreateView.as_view(),
        name="founder-checklist-templates",
    ),
    path(
        "founder/templates/checklists/<int:template_id>/",
        FounderChecklistTemplateDetailView.as_view(),
        name="founder-checklist-template-detail",
    ),
    path("founder/errors/", FounderErrorLogListView.as_view(), name="founder-errors"),
    path(
        "founder/errors/<int:error_id>/",
        FounderErrorLogDetailView.as_view(),
        name="founder-error-detail",
    ),
    path(
        "founder/errors/<int:error_id>/resolve/",
        FounderErrorResolveView.as_view(),
        name="founder-error-resolve",
    ),
    path(
        "founder/security-overview/",
        FounderSecurityOverviewView.as_view(),
        name="founder-security-overview",
    ),
    path(
        "founder/security-events/",
        FounderSecurityEventListView.as_view(),
        name="founder-security-events",
    ),
    path("founder/users/", FounderUserListView.as_view(), name="founder-users"),
    path(
        "founder/users/<int:user_id>/summary/",
        FounderUserSummaryView.as_view(),
        name="founder-user-summary",
    ),
]
