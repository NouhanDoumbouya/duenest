"""
Plan and usage-limit definitions for CertaNest.

This is a deliberately small internal foundation: there is **no real payment
integration**. A user simply has a ``plan`` (``free`` or ``pro_placeholder``)
and each plan maps to a set of usage limits. The limits are enforced in the
backend on the relevant create paths and surfaced read-only through the plan
usage endpoint so the UI can show a usage card, plan badge, and upgrade prompt.

Keeping the limits here (rather than scattered through the views) means there is
a single source of truth for both enforcement and reporting.
"""

# Plan identifiers — kept in sync with ``User.Plan``.
PLAN_FREE = "free"
PLAN_PRO_PLACEHOLDER = "pro_placeholder"

PLAN_LABELS = {
    PLAN_FREE: "Free",
    PLAN_PRO_PLACEHOLDER: "Pro",
}

# Resource keys used by both the usage report and the enforcement helper.
RESOURCE_DOCUMENTS = "documents"
RESOURCE_FILES = "files"
RESOURCE_BUNDLES = "bundles"
RESOURCE_REMINDERS = "reminders"
RESOURCE_SHARE_LINKS = "active_share_links"
RESOURCE_EMERGENCY_PACKS = "emergency_packs"
RESOURCE_SUBSCRIPTIONS = "subscriptions"
RESOURCE_ORGANIZATIONS = "organizations"
RESOURCE_ORGANIZATION_DOCUMENTS = "organization_documents"
RESOURCE_ORGANIZATION_MEMBERS = "organization_members"
RESOURCE_ORGANIZATION_REQUESTS = "organization_document_requests"
RESOURCE_ORGANIZATION_CAMPAIGNS = "organization_campaigns"
RESOURCE_ORGANIZATION_ROOMS = "organization_secure_rooms"

# Human-friendly labels for each tracked resource (used in error messages/UI).
RESOURCE_LABELS = {
    RESOURCE_DOCUMENTS: "documents",
    RESOURCE_FILES: "files",
    RESOURCE_BUNDLES: "bundles",
    RESOURCE_REMINDERS: "reminders",
    RESOURCE_SHARE_LINKS: "active share links",
    RESOURCE_EMERGENCY_PACKS: "emergency access packs",
    RESOURCE_SUBSCRIPTIONS: "subscriptions",
    RESOURCE_ORGANIZATIONS: "organizations",
    RESOURCE_ORGANIZATION_DOCUMENTS: "organization documents",
    RESOURCE_ORGANIZATION_MEMBERS: "organization members",
    RESOURCE_ORGANIZATION_REQUESTS: "organization document requests",
    RESOURCE_ORGANIZATION_CAMPAIGNS: "organization campaigns",
    RESOURCE_ORGANIZATION_ROOMS: "organization secure rooms",
    # Personal external document collection (share requests open to non-users).
    "external_collection_requests": "external collection requests",
}

# Storage is reported but not hard-enforced on its own (the file count limit is
# the practical guard). Bytes, so the UI can render a friendly size.
FREE_STORAGE_BYTES = 100 * 1024 * 1024  # 100 MB

# A value of ``None`` means unlimited for that resource on that plan.
PLAN_LIMITS = {
    PLAN_FREE: {
        RESOURCE_DOCUMENTS: 25,
        RESOURCE_FILES: 60,
        RESOURCE_BUNDLES: 3,
        RESOURCE_REMINDERS: 40,
        RESOURCE_SHARE_LINKS: 5,
        RESOURCE_EMERGENCY_PACKS: 1,
        RESOURCE_SUBSCRIPTIONS: 10,
        RESOURCE_ORGANIZATIONS: 1,
        RESOURCE_ORGANIZATION_DOCUMENTS: 25,
        RESOURCE_ORGANIZATION_MEMBERS: 3,
        RESOURCE_ORGANIZATION_REQUESTS: 20,
        RESOURCE_ORGANIZATION_CAMPAIGNS: 3,
        RESOURCE_ORGANIZATION_ROOMS: 1,
        "storage_bytes": FREE_STORAGE_BYTES,
    },
    PLAN_PRO_PLACEHOLDER: {
        RESOURCE_DOCUMENTS: None,
        RESOURCE_FILES: None,
        RESOURCE_BUNDLES: None,
        RESOURCE_REMINDERS: None,
        RESOURCE_SHARE_LINKS: None,
        RESOURCE_EMERGENCY_PACKS: None,
        RESOURCE_SUBSCRIPTIONS: None,
        RESOURCE_ORGANIZATIONS: None,
        RESOURCE_ORGANIZATION_DOCUMENTS: None,
        RESOURCE_ORGANIZATION_MEMBERS: None,
        RESOURCE_ORGANIZATION_REQUESTS: None,
        RESOURCE_ORGANIZATION_CAMPAIGNS: None,
        RESOURCE_ORGANIZATION_ROOMS: None,
        "storage_bytes": None,
    },
}

# Resources that the enforcement helper guards on create.
ENFORCED_RESOURCES = (
    RESOURCE_DOCUMENTS,
    RESOURCE_FILES,
    RESOURCE_BUNDLES,
    RESOURCE_REMINDERS,
    RESOURCE_SHARE_LINKS,
    RESOURCE_EMERGENCY_PACKS,
    RESOURCE_SUBSCRIPTIONS,
    RESOURCE_ORGANIZATIONS,
    RESOURCE_ORGANIZATION_DOCUMENTS,
    RESOURCE_ORGANIZATION_MEMBERS,
    RESOURCE_ORGANIZATION_REQUESTS,
    RESOURCE_ORGANIZATION_CAMPAIGNS,
    RESOURCE_ORGANIZATION_ROOMS,
)


def normalize_plan(plan: str) -> str:
    """Fall back to the free plan for unknown/empty plan values."""
    return plan if plan in PLAN_LIMITS else PLAN_FREE


def get_plan_limits(plan: str) -> dict:
    """All limits for a plan (defaults to the free plan)."""
    return PLAN_LIMITS[normalize_plan(plan)]


def get_limit(plan: str, resource: str):
    """The limit for one resource on a plan; ``None`` means unlimited."""
    return get_plan_limits(plan).get(resource)


def is_unlimited(plan: str, resource: str) -> bool:
    return get_limit(plan, resource) is None
