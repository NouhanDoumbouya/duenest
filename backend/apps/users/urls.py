from django.urls import path

from .views import (
    AccountCancelDeletionView,
    AccountDataSummaryView,
    AccountRequestDataExportView,
    AccountRequestDeletionView,
    CurrentUserView,
    DemoDocumentDataClearView,
    DemoDocumentDataCreateView,
    DocumentSetupChecklistView,
    GoogleAuthView,
    OnboardingAttentionReviewedView,
    OnboardingCompleteView,
    OnboardingDismissView,
    OnboardingStateView,
    OnboardingTrustReviewedView,
    RegisterView,
    TrustSecuritySummaryView,
)
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", TokenObtainPairView.as_view(), name="auth-login"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="auth-refresh"),
    path("auth/google/", GoogleAuthView.as_view(), name="auth-google"),
    path("users/me/", CurrentUserView.as_view(), name="users-me"),
    path("onboarding/state/", OnboardingStateView.as_view(), name="onboarding-state"),
    path(
        "onboarding/complete/",
        OnboardingCompleteView.as_view(),
        name="onboarding-complete",
    ),
    path(
        "onboarding/dismiss/",
        OnboardingDismissView.as_view(),
        name="onboarding-dismiss",
    ),
    path(
        "onboarding/document-setup-checklist/",
        DocumentSetupChecklistView.as_view(),
        name="document-setup-checklist",
    ),
    path(
        "onboarding/attention-reviewed/",
        OnboardingAttentionReviewedView.as_view(),
        name="onboarding-attention-reviewed",
    ),
    path(
        "onboarding/trust-reviewed/",
        OnboardingTrustReviewedView.as_view(),
        name="onboarding-trust-reviewed",
    ),
    path(
        "demo/create-document-demo-data/",
        DemoDocumentDataCreateView.as_view(),
        name="demo-create-document-data",
    ),
    path(
        "demo/clear-document-demo-data/",
        DemoDocumentDataClearView.as_view(),
        name="demo-clear-document-data",
    ),
    path(
        "trust/security-summary/",
        TrustSecuritySummaryView.as_view(),
        name="trust-security-summary",
    ),
    path(
        "account/data-summary/",
        AccountDataSummaryView.as_view(),
        name="account-data-summary",
    ),
    path(
        "account/request-data-export/",
        AccountRequestDataExportView.as_view(),
        name="account-request-data-export",
    ),
    path(
        "account/request-account-deletion/",
        AccountRequestDeletionView.as_view(),
        name="account-request-deletion",
    ),
    path(
        "account/cancel-account-deletion/",
        AccountCancelDeletionView.as_view(),
        name="account-cancel-deletion",
    ),
]
