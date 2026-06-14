from django.urls import path

from .views import (
    FeatureMapView,
    FounderFeatureFlagDetailView,
    FounderFeatureFlagListView,
)

urlpatterns = [
    path("features/", FeatureMapView.as_view(), name="feature-map"),
    path(
        "founder/feature-flags/",
        FounderFeatureFlagListView.as_view(),
        name="founder-feature-flags",
    ),
    path(
        "founder/feature-flags/<str:key>/",
        FounderFeatureFlagDetailView.as_view(),
        name="founder-feature-flag-detail",
    ),
]
