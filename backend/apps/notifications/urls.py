from django.urls import path

from .email_webhook_views import ResendWebhookView, UnsubscribeView
from .views import (
    NotificationDismissView,
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationPreferenceView,
    NotificationSummaryView,
    PushPublicKeyView,
    PushSubscribeView,
    PushUnsubscribeView,
)

urlpatterns = [
    path("notifications/", NotificationListView.as_view(), name="notifications"),
    path(
        "notifications/summary/",
        NotificationSummaryView.as_view(),
        name="notifications-summary",
    ),
    path(
        "notifications/preferences/",
        NotificationPreferenceView.as_view(),
        name="notification-preferences",
    ),
    path(
        "notifications/mark-all-read/",
        NotificationMarkAllReadView.as_view(),
        name="notifications-mark-all-read",
    ),
    path(
        "notifications/<int:pk>/mark-read/",
        NotificationMarkReadView.as_view(),
        name="notification-mark-read",
    ),
    path(
        "notifications/<int:pk>/dismiss/",
        NotificationDismissView.as_view(),
        name="notification-dismiss",
    ),
    path(
        "notifications/push/public-key/",
        PushPublicKeyView.as_view(),
        name="notifications-push-public-key",
    ),
    path(
        "notifications/push/subscribe/",
        PushSubscribeView.as_view(),
        name="notifications-push-subscribe",
    ),
    path(
        "notifications/push/unsubscribe/",
        PushUnsubscribeView.as_view(),
        name="notifications-push-unsubscribe",
    ),
    path(
        "email/webhook/resend/",
        ResendWebhookView.as_view(),
        name="email-webhook-resend",
    ),
    path("email/unsubscribe/", UnsubscribeView.as_view(), name="email-unsubscribe"),
]
