from rest_framework import serializers

from .models import FeatureFlag, Visibility


class FeatureFlagSerializer(serializers.ModelSerializer):
    """Founder-facing read view of a feature flag."""

    class Meta:
        model = FeatureFlag
        fields = [
            "id",
            "key",
            "name",
            "description",
            "visibility",
            "maintenance_message",
            "updated_at",
        ]
        read_only_fields = fields


class FeatureFlagUpdateSerializer(serializers.Serializer):
    """Founder-facing writable subset (visibility + maintenance message only)."""

    visibility = serializers.ChoiceField(choices=Visibility.choices, required=False)
    maintenance_message = serializers.CharField(
        max_length=255, required=False, allow_blank=True
    )
