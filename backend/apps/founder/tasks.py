"""
Celery tasks for founder analytics.

``rollup_daily_analytics`` pre-aggregates ProductEvent rows into one
DailyAnalyticsRollup row per day so dashboards don't scan the raw event table
forever. Idempotent (update_or_create on date). Also clears the cached analytics
payload so the dashboard reflects the fresh rollup. Stores counts only — never
document contents or PII.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from celery import shared_task
from django.contrib.auth import get_user_model
from django.db.models import Count
from django.db.models.functions import TruncDate
from django.utils import timezone

logger = logging.getLogger("duenest.founder")


@shared_task(name="apps.founder.tasks.rollup_daily_analytics", acks_late=True)
def rollup_daily_analytics(days_back: int = 2) -> dict:
    """Upsert daily rollups for the last ``days_back`` days (default today + 1).

    Recent days are recomputed each run so late-arriving events are captured;
    older days are immutable once written.
    """
    from apps.documents.models import Document
    from apps.founder.models import DailyAnalyticsRollup, ProductEvent

    today = timezone.localdate()
    start = today - timedelta(days=max(0, days_back - 1))
    User = get_user_model()

    written = 0
    day = start
    while day <= today:
        next_day = day + timedelta(days=1)
        day_events = ProductEvent.objects.filter(
            created_at__date=day
        )
        counts = {
            row["event_type"]: row["n"]
            for row in day_events.values("event_type").annotate(n=Count("id"))
        }
        total = sum(counts.values())
        active = (
            day_events.exclude(user__isnull=True)
            .values("user_id")
            .distinct()
            .count()
        )
        new_users = User.objects.filter(
            date_joined__date=day
        ).count()
        new_docs = Document.objects.filter(created_at__date=day).count()

        DailyAnalyticsRollup.objects.update_or_create(
            date=day,
            defaults={
                "total_events": total,
                "active_users": active,
                "new_users": new_users,
                "new_documents": new_docs,
                "event_counts": counts,
            },
        )
        written += 1
        day = next_day

    _invalidate_analytics_cache()
    logger.info("rollup_daily_analytics days_written=%s through=%s", written, today)
    return {"days_written": written, "through": today.isoformat()}


def _invalidate_analytics_cache() -> None:
    """Drop cached founder analytics payloads so the dashboard reloads fresh."""
    try:
        from apps.core.cache import global_key, invalidate

        # Range keys used by build_founder_analytics (see _range_config).
        for rk in ("default", "7d", "30d", "90d", "all", "today"):
            invalidate(global_key("founder", "analytics", rk))
    except Exception:  # noqa: BLE001 - cache issues must not fail the rollup
        logger.warning("analytics_cache_invalidation_failed")
