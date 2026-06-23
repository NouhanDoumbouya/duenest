"""
AI usage metering + budget guard.

This is the cost-control layer that sits at the provider chokepoint
(``apps.ai.client.generate``). Two responsibilities:

  * **Metering** — :func:`record_usage` writes one :class:`AiUsage` row per call
    attempt (success, blocked, or error). It stores only safe accounting metadata
    (tokens, estimated cost, feature, model) — never prompts, document text,
    responses, or secrets. Writes are best-effort: a metering failure is logged
    and swallowed so it can never break the AI action it is measuring.
  * **Budget guard** — :func:`check_budget` enforces conservative caps before any
    paid call: per-user daily tokens, global daily tokens, and global monthly
    estimated cost. It **fails closed** — if the usage tables can't be read, the
    call is blocked rather than allowed to spend unmetered.

Caps and the on/off switches come from settings (see ``apps.ai.config`` /
``config/settings/base.py``). With ``AI_BUDGET_GUARD_ENABLED`` off the guard is a
no-op; with ``AI_USAGE_METERING_ENABLED`` off no rows are written.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from django.conf import settings
from django.db.models import Sum
from django.utils import timezone

from .config import estimate_cost_usd

logger = logging.getLogger(__name__)


def _safe_user(user):
    """Return the user only when it's a real, authenticated, saved user."""
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    if getattr(user, "pk", None) is None:
        return None
    return user


def check_budget(user) -> str | None:
    """
    Return ``None`` when the call is within budget, else a short cap code:
    ``"global_daily"``, ``"user_daily"`` or ``"monthly_cost"``.

    Only ``success`` rows count toward usage (blocked attempts never spent
    anything). Fails closed: any unexpected error returns ``"budget"`` so a
    read failure blocks rather than allows unmetered spend.
    """
    if not getattr(settings, "AI_BUDGET_GUARD_ENABLED", True):
        return None

    try:
        from .models import AiUsage

        now = timezone.now()
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = day_start.replace(day=1)

        spent = AiUsage.objects.filter(status=AiUsage.STATUS_SUCCESS)

        global_day = (
            spent.filter(created_at__gte=day_start).aggregate(t=Sum("total_tokens"))[
                "t"
            ]
            or 0
        )
        if global_day >= int(getattr(settings, "AI_DAILY_TOKEN_CAP_GLOBAL", 0) or 0):
            return "global_daily"

        safe = _safe_user(user)
        if safe is not None:
            user_day = (
                spent.filter(created_at__gte=day_start, user=safe).aggregate(
                    t=Sum("total_tokens")
                )["t"]
                or 0
            )
            if user_day >= int(
                getattr(settings, "AI_DAILY_TOKEN_CAP_USER", 0) or 0
            ):
                return "user_daily"

        month_cost = spent.filter(created_at__gte=month_start).aggregate(
            c=Sum("estimated_cost_usd")
        )["c"] or Decimal("0")
        limit = Decimal(str(getattr(settings, "AI_MONTHLY_COST_LIMIT_USD", 0) or 0))
        if month_cost >= limit:
            return "monthly_cost"

        return None
    except Exception:  # noqa: BLE001 — fail closed: block rather than overspend
        logger.warning("AI budget check failed; blocking call (fail-closed)")
        return "budget"


def record_usage(
    *,
    user=None,
    feature: str = "unknown",
    model: str = "",
    provider: str = "anthropic",
    input_tokens: int = 0,
    output_tokens: int = 0,
    status: str = "success",
    reason: str = "",
    provider_request_id: str = "",
    metadata: dict | None = None,
):
    """
    Write one :class:`AiUsage` row. Best-effort: never raises.

    Cost is estimated from the pricing map (unknown model -> $0, tokens still
    recorded). Returns the created row, or ``None`` if metering is disabled or
    the write failed (both are non-fatal for the caller).
    """
    if not getattr(settings, "AI_USAGE_METERING_ENABLED", True):
        return None
    try:
        from .models import AiUsage

        in_tok = int(input_tokens or 0)
        out_tok = int(output_tokens or 0)
        return AiUsage.objects.create(
            user=_safe_user(user),
            feature=(feature or "unknown")[:64],
            provider=(provider or "anthropic")[:32],
            model=(model or "")[:128],
            input_tokens=in_tok,
            output_tokens=out_tok,
            total_tokens=in_tok + out_tok,
            estimated_cost_usd=estimate_cost_usd(model, in_tok, out_tok),
            status=status,
            reason=(reason or "")[:64],
            provider_request_id=(provider_request_id or "")[:128],
            metadata=metadata or {},
        )
    except Exception:  # noqa: BLE001 — metering must never break the AI action
        logger.warning("AiUsage write failed (metering is non-fatal)", exc_info=True)
        return None


def usage_summary(user) -> dict:
    """
    Safe per-user usage snapshot for the AI status endpoint.

    Exposes only the current user's own numbers plus their cap — never global
    spend. Fails safe to zeros on any read error.
    """
    cap = int(getattr(settings, "AI_DAILY_TOKEN_CAP_USER", 0) or 0)
    out = {"daily_tokens_used": 0, "daily_token_cap": cap, "paused": False}
    safe = _safe_user(user)
    if safe is None:
        return out
    try:
        from .models import AiUsage

        day_start = timezone.now().replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        used = (
            AiUsage.objects.filter(
                user=safe, status=AiUsage.STATUS_SUCCESS, created_at__gte=day_start
            ).aggregate(t=Sum("total_tokens"))["t"]
            or 0
        )
        out["daily_tokens_used"] = int(used)
        out["paused"] = check_budget(safe) is not None
    except Exception:  # noqa: BLE001 — status must never break the endpoint
        logger.warning("AI usage summary failed", exc_info=True)
    return out
