from django.urls import path

from .views import (
    GoogleOAuthCallbackView,
    GoogleOAuthStartView,
    IntegrationAccountDisconnectView,
    IntegrationAccountHealthView,
    IntegrationAccountRefreshView,
    IntegrationAccountsView,
    IntegrationProvidersView,
)

urlpatterns = [
    path(
        "integrations/providers/",
        IntegrationProvidersView.as_view(),
        name="integration-providers",
    ),
    path(
        "integrations/accounts/",
        IntegrationAccountsView.as_view(),
        name="integration-accounts",
    ),
    path(
        "integrations/google/start/",
        GoogleOAuthStartView.as_view(),
        name="integration-google-start",
    ),
    path(
        "integrations/google/callback/",
        GoogleOAuthCallbackView.as_view(),
        name="integration-google-callback",
    ),
    path(
        "integrations/accounts/<int:pk>/disconnect/",
        IntegrationAccountDisconnectView.as_view(),
        name="integration-account-disconnect",
    ),
    path(
        "integrations/accounts/<int:pk>/refresh/",
        IntegrationAccountRefreshView.as_view(),
        name="integration-account-refresh",
    ),
    path(
        "integrations/accounts/<int:pk>/health/",
        IntegrationAccountHealthView.as_view(),
        name="integration-account-health",
    ),
]
