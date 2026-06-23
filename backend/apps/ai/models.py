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


class AiUsage(models.Model):
    """
    One row per AI provider call attempt — the cost-control ledger.

    Written at the single provider chokepoint (``apps.ai.client.generate``) so
    every Anthropic call is metered: successes record real token usage and an
    estimated cost; budget-blocked attempts record a zero-token ``blocked`` row
    (they never reach the provider); provider errors record an ``error`` row.

    Privacy: this table stores **only safe routing/accounting metadata** — never
    raw prompts, document text, model responses, API keys, share/access codes, or
    payment data. ``metadata`` is for small safe hints only (e.g. which cap was
    hit), never user content.
    """

    STATUS_SUCCESS = "success"
    STATUS_ERROR = "error"
    STATUS_BLOCKED = "blocked"
    STATUS_CHOICES = [
        (STATUS_SUCCESS, "Success"),
        (STATUS_ERROR, "Error"),
        (STATUS_BLOCKED, "Blocked"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ai_usage",
    )
    feature = models.CharField(max_length=64, default="unknown")
    provider = models.CharField(max_length=32, default="anthropic")
    model = models.CharField(max_length=128, blank=True, default="")
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    total_tokens = models.PositiveIntegerField(default=0)
    estimated_cost_usd = models.DecimalField(
        max_digits=12, decimal_places=6, default=0
    )
    status = models.CharField(
        max_length=16, choices=STATUS_CHOICES, default=STATUS_SUCCESS
    )
    # Safe machine-readable reason code only, e.g. "budget", "rate_limit",
    # "not_configured", "provider_error", "refusal". Never a raw provider message.
    reason = models.CharField(max_length=64, blank=True, default="")
    # Safe provider request id when available — never sensitive.
    provider_request_id = models.CharField(max_length=128, blank=True, default="")
    # Small safe metadata only (e.g. {"cap": "user_daily"}). No user content.
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["status", "created_at"]),
            models.Index(fields=["feature", "created_at"]),
            models.Index(fields=["provider", "model"]),
        ]

    def __str__(self):
        return (
            f"AiUsage(user={self.user_id}, feature={self.feature}, "
            f"status={self.status}, tokens={self.total_tokens})"
        )
