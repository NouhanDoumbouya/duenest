"""
Plan-limit enforcement for organization workspace resources.

This reuses the shared ``PlanLimitExceeded`` exception from the document app so
organization limits report exactly like the existing free-tier limits.
"""

from apps.documents.plan_usage import PlanLimitExceeded, enforce_plan_limit
from apps.users import plans

__all__ = [
    "PlanLimitExceeded",
    "enforce_organization_limit",
    "enforce_organization_document_limit",
    "enforce_organization_member_limit",
    "enforce_organization_request_limit",
    "enforce_organization_campaign_limit",
    "enforce_organization_room_limit",
]


def enforce_organization_limit(user) -> None:
    enforce_plan_limit(user, plans.RESOURCE_ORGANIZATIONS)


def enforce_organization_document_limit(user) -> None:
    enforce_plan_limit(user, plans.RESOURCE_ORGANIZATION_DOCUMENTS)


def enforce_organization_member_limit(user) -> None:
    enforce_plan_limit(user, plans.RESOURCE_ORGANIZATION_MEMBERS)


def enforce_organization_request_limit(user) -> None:
    enforce_plan_limit(user, plans.RESOURCE_ORGANIZATION_REQUESTS)


def enforce_organization_campaign_limit(user) -> None:
    enforce_plan_limit(user, plans.RESOURCE_ORGANIZATION_CAMPAIGNS)


def enforce_organization_room_limit(user) -> None:
    enforce_plan_limit(user, plans.RESOURCE_ORGANIZATION_ROOMS)
