from rest_framework.permissions import BasePermission


class IsFounderUser(BasePermission):
    """Allow only authenticated staff/superuser accounts into founder tools."""

    message = "Founder access is required."

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (user.is_staff or user.is_superuser)
        )
