"""Per-user AI consent + privacy controls."""

from __future__ import annotations

from django.conf import settings
from django.db import models


class AiPreference(models.Model):
    """
    A user's AI consent and privacy settings. AI is **off until the user opts
    in** (``ai_enabled``) — even when a key is configured and the feature flags
    are on. ``redact_sensitive`` enables Privacy Mode, which masks obvious
    sensitive values (emails, long ID/card numbers) in document text before it is
    sent to the AI provider (answers about masked values won't work — that's the
    trade-off, and it's the user's choice).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_preference",
    )
    ai_enabled = models.BooleanField(default=False)
    redact_sensitive = models.BooleanField(default=False)
    consented_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"AiPreference(user={self.user_id}, enabled={self.ai_enabled})"
