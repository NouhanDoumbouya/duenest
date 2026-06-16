from django.conf import settings
from rest_framework.permissions import BasePermission


def _founder_emails() -> set[str]:
    return {
        e.strip().lower()
        for e in getattr(settings, "FOUNDER_EMAILS", [])
        if e and e.strip()
    }


def is_founder(user) -> bool:
    """Whether a user may use the founder console (SEC-009).

    Superusers are always founders. Otherwise a user must be an active staff
    member AND be on the explicit ``FOUNDER_EMAILS`` allowlist — so adding an
    ordinary staff account no longer grants founder/CRM/export access. For local
    dev convenience, ``FOUNDER_ALLOW_ALL_STAFF`` (default False; True in dev)
    lets any staff account in.
    """
    if not (user and user.is_authenticated):
        return False
    if user.is_superuser:
        return True
    if not user.is_staff:
        return False
    if getattr(settings, "FOUNDER_ALLOW_ALL_STAFF", False):
        return True
    return (user.email or "").strip().lower() in _founder_emails()


class IsFounderUser(BasePermission):
    """Allow only founder accounts into founder tools (SEC-009)."""

    message = "Founder access is required."

    def has_permission(self, request, view):
        return is_founder(request.user)
