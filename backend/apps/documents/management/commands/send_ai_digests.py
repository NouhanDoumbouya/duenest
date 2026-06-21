"""
Send the opt-in weekly AI briefing digest email to eligible users.

Eligibility (all required):
  * ``settings.AI_CONFIGURED`` and ``settings.EMAIL_CONFIGURED`` (global) — else
    the command no-ops.
  * The user opted in (``NotificationPreference.ai_briefing_digest_enabled``) and
    has email delivery on, is active, and has an address.
  * The ``ai_features`` + ``ai_briefing`` flags resolve enabled for that user.
  * Their briefing actually has items (we never email "all caught up").

Idempotent: skips a recipient who already received a digest in the last
``--dedupe-days`` (default 6) days (checked via EmailLog), so a weekly beat plus
an accidental manual rerun won't double-send. Suppression/unsubscribe are
enforced inside ``send_branded_email`` (category ``lifecycle``).
"""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Send the opt-in weekly AI briefing digest email to eligible users."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument("--dedupe-days", type=int, default=6)

    def handle(self, *args, **options):
        if not getattr(settings, "AI_CONFIGURED", False):
            self.stdout.write("AI not configured — nothing to do.")
            return
        if not getattr(settings, "EMAIL_CONFIGURED", False):
            self.stdout.write("Email not configured — nothing to do.")
            return

        from apps.ai.privacy import ai_consented
        from apps.documents.ai_briefing import build_briefing
        from apps.features.flags import is_feature_enabled
        from apps.notifications.models import EmailLog, NotificationPreference
        from common.email import send_branded_email

        dry_run = options["dry_run"]
        cutoff = timezone.now() - timedelta(days=options["dedupe_days"])
        base = (getattr(settings, "DUENEST_APP_BASE_URL", "") or "").rstrip("/")
        action_url = f"{base}/dashboard/briefing"
        preferences_url = f"{base}/dashboard/settings"

        prefs = NotificationPreference.objects.filter(
            ai_briefing_digest_enabled=True, email_enabled=True
        ).select_related("user")

        sent = skipped = 0
        for pref in prefs:
            user = pref.user
            if not user.is_active or not user.email:
                skipped += 1
                continue
            if not (
                ai_consented(user)
                and is_feature_enabled("ai_features", user)
                and is_feature_enabled("ai_briefing", user)
            ):
                skipped += 1
                continue
            if EmailLog.objects.filter(
                recipient__iexact=user.email,
                email_type="ai_briefing_digest",
                status="sent",
                created_at__gte=cutoff,
            ).exists():
                skipped += 1
                continue

            result = build_briefing(user)
            if not result.get("available") or not result.get("items"):
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(
                    f"[dry-run] would send to {user.email} "
                    f"({len(result['items'])} items)"
                )
                sent += 1
                continue

            ok = send_branded_email(
                subject="Your DueNest weekly briefing",
                template="ai_digest",
                context={
                    "summary": result.get("summary", ""),
                    "items": result["items"],
                    "action_url": action_url,
                    "preferences_url": preferences_url,
                },
                to=user.email,
                email_type="ai_briefing_digest",
                category="lifecycle",
            )
            if ok:
                sent += 1
            else:
                skipped += 1

        self.stdout.write(
            f"AI digest: sent={sent} skipped={skipped} dry_run={dry_run}"
        )
