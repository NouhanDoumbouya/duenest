from django.urls import path

from .search import workspace_search
from .views import health_check, readiness_check

urlpatterns = [
    path("health/", health_check, name="health-check"),
    # Readiness: DB + cache round-trip (503 when degraded). For LB / uptime.
    path("readiness/", readiness_check, name="readiness-check"),
    # Unified owner-scoped quick search for the command palette.
    path("search/", workspace_search, name="workspace-search"),
]
