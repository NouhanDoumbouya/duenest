from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include("apps.core.urls")),
    path("api/v1/", include("apps.users.urls")),
    path("api/v1/", include("apps.documents.urls")),
    path("api/v1/", include("apps.subscriptions.urls")),
    path("api/v1/", include("apps.organizations.urls")),
    path("api/v1/", include("apps.founder.urls")),
    path("api/v1/", include("apps.quick_share.urls")),
    path("api/v1/", include("apps.notifications.urls")),
    path("api/v1/", include("apps.features.urls")),
    path("api/v1/", include("apps.billing.urls")),
]
