from django.urls import path

from .views import (
    AccountCancelDeletionView,
    AccountDataSummaryView,
    AccountRequestDataExportView,
    AccountRequestDeletionView,
    CookieTokenRefreshView,
    CsrfTokenView,
    CurrentUserView,
    DemoDocumentDataClearView,
    DemoDocumentDataCreateView,
    DocumentSetupChecklistView,
    EmailVerificationConfirmView,
    EmailVerificationSendView,
    GoogleAuthView,
    LoginView,
    LogoutView,
    OnboardingAttentionReviewedView,
    OnboardingCompleteView,
    OnboardingDismissView,
    OnboardingStateView,
    OnboardingTrustReviewedView,
    PasswordResetConfirmView,
    PasswordResetRequestView,
    RegisterView,
    TrustSecuritySummaryView,
)

urlpatterns = [
    path("auth/register/", RegisterView.as_view(), name="auth-register"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/refresh/", CookieTokenRefreshView.as_view(), name="auth-refresh"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("auth/csrf/", CsrfTokenView.as_view(), name="auth-csrf"),
    path("auth/google/", GoogleAuthView.as_view(), name="auth-google"),
    path(
        "auth/password-reset/",
        PasswordResetRequestView.as_view(),
        name="auth-password-reset",
    ),
    path(
        "auth/password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="auth-password-reset-confirm",
    ),
    path(
        "auth/email/send-verification/",
        EmailVerificationSendView.as_view(),
        name="auth-email-send-verification",
    ),
    path(
        "auth/email/verify/",
        EmailVerificationConfirmView.as_view(),
        name="auth-email-verify",
    ),
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
