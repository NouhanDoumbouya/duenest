from django.urls import path

from .views import health_check, readiness_check

urlpatterns = [
    path("health/", health_check, name="health-check"),
    # Readiness: DB + cache round-trip (503 when degraded). For LB / uptime.
    path("readiness/", readiness_check, name="readiness-check"),
]
