from rest_framework import serializers

from .models import AiPreference


class AiPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = AiPreference
        fields = ["ai_enabled", "redact_sensitive", "consented_at", "updated_at"]
        read_only_fields = ["consented_at", "updated_at"]
