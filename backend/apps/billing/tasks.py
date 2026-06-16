"""Celery tasks for billing. Scheduled access sync; webhook side effects can be
moved here later. Runs inline in lean mode."""

from __future__ import annotations

import logging

from celery import shared_task
from django.core.management import call_command

logger = logging.getLogger("duenest.billing")


@shared_task(name="apps.billing.tasks.sync_billing_access", acks_late=True)
def sync_billing_access() -> dict:
    """Scheduled: expire grants/grace periods and resync entitlement state."""
    call_command("sync_billing_access")
    logger.info("sync_billing_access_task complete")
    return {"ok": True}
