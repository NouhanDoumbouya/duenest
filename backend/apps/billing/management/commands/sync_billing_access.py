"""
Expire time-bound billing access and re-sync the denormalized ``User.plan``.

Access correctly stops at read time (``UserSubscription.grants_paid_access`` and
``ManualAccessGrant.is_current`` are time-aware), but ``User.plan`` only changes
when something calls ``sync_user_plan``. Run this on a schedule (e.g. hourly) so
the stored tier — which the existing limit enforcement reads — stays accurate.

Idempotent and safe to run repeatedly.
"""

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.billing import entitlements
from apps.billing.models import ManualAccessGrant, UserSubscription


def _email_once(sub, key: str, stamp: str) -> bool:
    """Record that a lifecycle email was sent for (sub, key, stamp); return True
    only the first time. Lets the daily cron email once per trial/renewal cycle
    instead of every run. Stored in ``sub.metadata['lifecycle_emails']``."""
    meta = sub.metadata or {}
    sent = meta.get("lifecycle_emails") or {}
    if sent.get(key) == stamp:
        return False
    sent[key] = stamp
    meta["lifecycle_emails"] = sent
    sub.metadata = meta
    sub.save(update_fields=["metadata", "updated_at"])
    return True


class Command(BaseCommand):
    help = "Expire ended manual grants / grace periods and re-sync User.plan."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Report what would change without writing.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        now = timezone.now()
        affected_users = set()
        expired_grants = 0
        expired_grace = 0
        expired_canceled = 0

        # 1) Manual grants whose window has closed.
        for grant in ManualAccessGrant.objects.filter(
            is_active=True, ends_at__isnull=False, ends_at__lte=now
        ):
            expired_grants += 1
            affected_users.add(grant.user_id)
            if not dry_run:
                grant.is_active = False
                grant.save(update_fields=["is_active", "updated_at"])

        # 2) Grace periods that have elapsed -> access ends (unpaid).
        for sub in UserSubscription.objects.filter(
            status=UserSubscription.Status.GRACE_PERIOD,
            grace_period_until__isnull=False,
            grace_period_until__lte=now,
        ):
            expired_grace += 1
            affected_users.add(sub.user_id)
            if not dry_run:
                sub.status = UserSubscription.Status.UNPAID
                sub.save(update_fields=["status", "updated_at"])

        # 3) cancel-at-period-end subs whose period has ended -> canceled.
        for sub in UserSubscription.objects.filter(
            cancel_at_period_end=True,
            current_period_end__isnull=False,
            current_period_end__lte=now,
        ).exclude(status=UserSubscription.Status.CANCELED).select_related("user"):
            expired_canceled += 1
            affected_users.add(sub.user_id)
            if not dry_run:
                sub.status = UserSubscription.Status.CANCELED
                sub.save(update_fields=["status", "updated_at"])
                from apps.billing.lifecycle_email import (
                    send_subscription_canceled_email,
                )

                send_subscription_canceled_email(sub.user, sub)

        # 3b) Trials whose end has passed with no conversion -> Free. Scoped to
        # manual / no-provider trials; Stripe-backed trials are governed by
        # provider webhooks (trial-end invoice -> active or dunning).
        trials_expired = 0
        for sub in UserSubscription.objects.filter(
            status=UserSubscription.Status.TRIALING,
            trial_end__isnull=False,
            trial_end__lte=now,
            provider_subscription_id="",
        ).select_related("user"):
            trials_expired += 1
            affected_users.add(sub.user_id)
            if not dry_run:
                sub.status = UserSubscription.Status.FREE
                sub.save(update_fields=["status", "updated_at"])
                from apps.billing.lifecycle_email import send_trial_ended_email

                send_trial_ended_email(sub.user, sub)

        # 4) Trial-ending reminders (within 3 days). Deduped by trial date.
        trial_notices = 0
        soon = now + timezone.timedelta(days=3)
        for sub in UserSubscription.objects.filter(
            status=UserSubscription.Status.TRIALING,
            trial_end__isnull=False,
            trial_end__gt=now,
            trial_end__lte=soon,
        ).select_related("user"):
            trial_notices += 1
            if not dry_run:
                from apps.billing.lifecycle_email import send_trial_ending_email
                from apps.billing.services import notify_billing

                notify_billing(
                    sub.user,
                    "billing_trial_ending",
                    "Your trial is ending soon",
                    "Your DueNest Pro trial ends soon. Add a payment method to "
                    "keep Pro features without interruption.",
                    severity="warning",
                    suffix=sub.trial_end.strftime("%Y%m%d"),
                )
                if _email_once(sub, "trial_ending", sub.trial_end.strftime("%Y%m%d")):
                    send_trial_ending_email(sub.user, sub)

        # 5) Renewal-upcoming heads-up (within 3 days), for active paid subs that
        # are NOT canceling. Deduped by period-end so the daily cron emails once.
        renewal_notices = 0
        for sub in UserSubscription.objects.filter(
            status=UserSubscription.Status.ACTIVE,
            cancel_at_period_end=False,
            billing_interval__in=["month", "year"],
            current_period_end__isnull=False,
            current_period_end__gt=now,
            current_period_end__lte=soon,
        ).select_related("user"):
            renewal_notices += 1
            if not dry_run:
                from apps.billing.lifecycle_email import send_renewal_upcoming_email

                stamp = sub.current_period_end.strftime("%Y%m%d")
                if _email_once(sub, "renewal_upcoming", stamp):
                    send_renewal_upcoming_email(sub.user, sub)

        # Re-sync the denormalized tier for everyone affected.
        synced = 0
        if not dry_run:
            from apps.users.models import User

            for user in User.objects.filter(id__in=affected_users):
                if entitlements.sync_user_plan(user):
                    synced += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"billing access sync{' (dry-run)' if dry_run else ''}: "
                f"grants_expired={expired_grants} grace_expired={expired_grace} "
                f"period_canceled={expired_canceled} trials_expired={trials_expired} "
                f"trial_notices={trial_notices} renewal_notices={renewal_notices} "
                f"users_resynced={synced}"
            )
        )
