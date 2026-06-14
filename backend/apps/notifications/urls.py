from django.urls import path

from .views import (
    NotificationDismissView,
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationPreferenceView,
    NotificationSummaryView,
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
]
