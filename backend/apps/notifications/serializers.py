from rest_framework import serializers

from .models import Notification, NotificationPreference, PushWebSubscription


class NotificationSerializer(serializers.ModelSerializer):
    is_unread = serializers.BooleanField(read_only=True)

    class Meta:
        model = Notification
        fields = [
            "id",
            "type",
            "title",
            "message",
            "severity",
            "status",
            "source_type",
            "source_id",
            "action_url",
            "scheduled_for",
            "delivered_in_app_at",
            "delivered_email_at",
            "read_at",
            "dismissed_at",
            "metadata",
            "created_at",
            "updated_at",
            "is_unread",
        ]
        read_only_fields = fields


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = [
            "in_app_enabled",
            "email_enabled",
            "push_enabled",
            "push_quiet_hours_enabled",
            "push_quiet_start_hour",
            "push_quiet_end_hour",
            "document_reminders_enabled",
            "subscription_reminders_enabled",
            "checklist_bundle_reminders_enabled",
            "organization_reminders_enabled",
            "emergency_reminders_enabled",
            "security_alerts_enabled",
            "activity_notifications_enabled",
            "reminder_digest_enabled",
            "default_reminder_lead_days",
            "timezone",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]

    def _validate_hour(self, value):
        if value is None:
            return value
        if not (0 <= int(value) <= 23):
            raise serializers.ValidationError("Hour must be between 0 and 23.")
        return value

    def validate_push_quiet_start_hour(self, value):
        return self._validate_hour(value)

    def validate_push_quiet_end_hour(self, value):
        return self._validate_hour(value)

    def validate_default_reminder_lead_days(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("Lead days must be a list of numbers.")
        cleaned = []
        for item in value:
            try:
                days = int(item)
            except (TypeError, ValueError):
                raise serializers.ValidationError("Lead days must be whole numbers.")
            if days < 0 or days > 365:
                raise serializers.ValidationError("Lead days must be between 0 and 365.")
            if days not in cleaned:
                cleaned.append(days)
        return sorted(cleaned, reverse=True)


class PushSubscriptionWriteSerializer(serializers.Serializer):
    """Validates a browser PushSubscription payload (endpoint + keys)."""

    endpoint = serializers.URLField(max_length=500)
    p256dh = serializers.CharField(max_length=255)
    auth = serializers.CharField(max_length=255)
    device_label = serializers.CharField(
        max_length=120, required=False, allow_blank=True, default=""
    )


class PushSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushWebSubscription
        fields = ["id", "device_label", "created_at", "last_used_at"]
        read_only_fields = fields
