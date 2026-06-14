"""
Plan-limit enforcement for subscriptions.

Reuses the shared enforcement helper and ``PlanLimitExceeded`` exception so the
free-tier subscription cap behaves and reports exactly like every other tracked
resource. Limit values live in :mod:`apps.users.plans`.
"""

from apps.documents.plan_usage import PlanLimitExceeded, enforce_plan_limit
from apps.users import plans

__all__ = ["PlanLimitExceeded", "enforce_subscription_limit"]


def enforce_subscription_limit(user) -> None:
    """Raise :class:`PlanLimitExceeded` if another subscription would exceed the plan."""
    enforce_plan_limit(user, plans.RESOURCE_SUBSCRIPTIONS)
