from django.db.models import Q
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification, NotificationPreference, PushWebSubscription
from .push import is_push_configured, public_key
from .serializers import (
    NotificationPreferenceSerializer,
    NotificationSerializer,
    PushSubscriptionSerializer,
    PushSubscriptionWriteSerializer,
)


def get_preferences(user):
    prefs, _ = NotificationPreference.objects.get_or_create(user=user)
    return prefs


class NotificationListView(generics.ListAPIView):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = Notification.objects.filter(user=self.request.user)
        status_filter = self.request.query_params.get("status")
        unread = self.request.query_params.get("unread")
        type_filter = self.request.query_params.get("type")
        severity = self.request.query_params.get("severity")
        include_dismissed = self.request.query_params.get("include_dismissed")

        if unread in {"1", "true", "True"}:
            qs = qs.filter(read_at__isnull=True).exclude(
                status__in=[
                    Notification.Status.DISMISSED,
                    Notification.Status.CANCELLED,
                ]
            )
        if status_filter:
            qs = qs.filter(status=status_filter)
        elif include_dismissed not in {"1", "true", "True"}:
            qs = qs.exclude(status=Notification.Status.DISMISSED)
        if type_filter:
            qs = qs.filter(type=type_filter)
        if severity:
            qs = qs.filter(severity=severity)
        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(Q(title__icontains=search) | Q(message__icontains=search))
        return qs


class NotificationSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        base = Notification.objects.filter(user=request.user).exclude(
            status__in=[Notification.Status.DISMISSED, Notification.Status.CANCELLED]
        )
        unread = base.filter(read_at__isnull=True)
        latest = unread.order_by("-created_at")[:5]
        return Response(
            {
                "unread_count": unread.count(),
                "urgent_count": unread.filter(
                    severity__in=[
                        Notification.Severity.URGENT,
                        Notification.Severity.SECURITY,
                    ]
                ).count(),
                "latest": NotificationSerializer(latest, many=True).data,
            }
        )


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        notification = generics.get_object_or_404(
            Notification, pk=pk, user=request.user
        )
        now = timezone.now()
        if notification.read_at is None:
            notification.read_at = now
        if notification.status not in {
            Notification.Status.DISMISSED,
            Notification.Status.CANCELLED,
        }:
            notification.status = Notification.Status.READ
        notification.save(update_fields=["read_at", "status", "updated_at"])
        return Response(NotificationSerializer(notification).data)


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        now = timezone.now()
        updated = (
            Notification.objects.filter(user=request.user, read_at__isnull=True)
            .exclude(
                status__in=[
                    Notification.Status.DISMISSED,
                    Notification.Status.CANCELLED,
                ]
            )
            .update(read_at=now, status=Notification.Status.READ, updated_at=now)
        )
        return Response({"updated": updated})


class NotificationDismissView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        notification = generics.get_object_or_404(
            Notification, pk=pk, user=request.user
        )
        now = timezone.now()
        notification.dismissed_at = now
        notification.status = Notification.Status.DISMISSED
        if notification.read_at is None:
            notification.read_at = now
        notification.save(
            update_fields=["dismissed_at", "read_at", "status", "updated_at"]
        )
        return Response(NotificationSerializer(notification).data)


class NotificationPreferenceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(NotificationPreferenceSerializer(get_preferences(request.user)).data)

    def patch(self, request):
        prefs = get_preferences(request.user)
        serializer = NotificationPreferenceSerializer(
            prefs, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)


class PushPublicKeyView(APIView):
    """Expose whether Web Push is available and the VAPID public key to subscribe."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        configured = is_push_configured()
        return Response(
            {
                "enabled": configured,
                "public_key": public_key() if configured else "",
            }
        )


class PushSubscribeView(APIView):
    """Register (or refresh) this device's Web Push subscription for the user."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = PushSubscriptionWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        subscription, _ = PushWebSubscription.objects.update_or_create(
            endpoint=data["endpoint"],
            defaults={
                "user": request.user,
                "p256dh": data["p256dh"],
                "auth": data["auth"],
                "device_label": data.get("device_label", ""),
                "failure_count": 0,
            },
        )
        return Response(
            PushSubscriptionSerializer(subscription).data,
            status=status.HTTP_201_CREATED,
        )


class PushUnsubscribeView(APIView):
    """Remove this device's Web Push subscription (by endpoint)."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        endpoint = (request.data.get("endpoint") or "").strip()
        if not endpoint:
            return Response(
                {"detail": "endpoint is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        deleted, _ = PushWebSubscription.objects.filter(
            user=request.user, endpoint=endpoint
        ).delete()
        return Response({"deleted": deleted})
