import logging

from django.db import connection
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.cache import cache_healthy

logger = logging.getLogger("duenest.health")


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    """Liveness probe — cheap, always 200 if the process is up."""
    return Response(
        {
            "status": "ok",
            "service": "duenest-backend",
            "version": "v0.1",
        }
    )


def _db_healthy() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return True
    except Exception:  # noqa: BLE001 - report degraded rather than 500
        logger.warning("readiness_db_unavailable")
        return False


@api_view(["GET"])
@permission_classes([AllowAny])
def readiness_check(request):
    """Readiness probe — verifies the database and cache backends respond.

    Returns 200 when both are healthy, 503 otherwise, so a load balancer /
    uptime monitor can route around a degraded instance. Never exposes
    connection strings, credentials, or any sensitive configuration.
    """
    db_ok = _db_healthy()
    cache_ok = cache_healthy()
    healthy = db_ok and cache_ok
    return Response(
        {
            "status": "ok" if healthy else "degraded",
            "checks": {"database": db_ok, "cache": cache_ok},
        },
        status=200 if healthy else 503,
    )
