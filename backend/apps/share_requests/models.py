"""
Share Requests — inbound "please provide X, Y, Z" fulfilment.

A requester (a DueNest user) lists the documents they need; a logged-in responder
fulfils the checklist from their own vault. The fulfilment is delivered through the
existing Quick Share engine — a session owned by the responder with a pre-accepted
claim for the requester — so it lands in the requester's "Shared with me".

Security invariants:
* The respond URL carries only the random request token (never file ids or owner).
* A responder only ever attaches files they own; this is validated server-side.
* Closed or expired requests never accept a response.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone

# Reuse the vetted token generator so request tokens match share-link entropy.
from apps.documents.models import generate_share_token


class ShareRequest(models.Model):
    """A checklist of documents the owner is asking someone to provide."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESPONDED = "responded", "Responded"
        CLOSED = "closed", "Closed"
        EXPIRED = "expired", "Expired"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="share_requests",
    )
    title = models.CharField(max_length=255)
    message = models.TextField(blank=True)
    token = models.CharField(
        max_length=128, unique=True, db_index=True, default=generate_share_token
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.OPEN
    )
    expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "created_at"]),
            models.Index(fields=["token"]),
        ]

    def __str__(self):
        return f"ShareRequest({self.token[:8]}… {self.title})"

    @property
    def is_expired(self) -> bool:
        return self.expires_at is not None and timezone.now() >= self.expires_at

    @property
    def is_open(self) -> bool:
        """Whether the request can still accept a response."""
        return self.status == self.Status.OPEN and not self.is_expired

    @property
    def short_id(self) -> str:
        return self.token[:8]


class ShareRequestItem(models.Model):
    """One requested item. Mirrors DocumentBundleRequirement's shape."""

    request = models.ForeignKey(
        ShareRequest,
        on_delete=models.CASCADE,
        related_name="items",
    )
    label = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_required = models.BooleanField(default=True)
    expected_document_type = models.CharField(max_length=100, blank=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["sort_order", "created_at"]
        indexes = [
            models.Index(fields=["request", "sort_order"]),
        ]

    def __str__(self):
        return f"{self.label} ({self.request_id})"


class ShareRequestResponse(models.Model):
    """
    A responder's fulfilment of a request, delivered as a Quick Share session.

    ``summary`` records the per-item fulfilment (item id/label + the files provided)
    so the requester can see which items were satisfied without exposing vault data.
    """

    request = models.ForeignKey(
        ShareRequest,
        on_delete=models.CASCADE,
        related_name="responses",
    )
    responder = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="share_request_responses",
    )
    session = models.ForeignKey(
        "quick_share.QuickShareSession",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="share_request_responses",
    )
    summary = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["request", "responder"],
                name="uniq_share_request_responder",
            ),
        ]

    def __str__(self):
        return f"Response(request={self.request_id} responder={self.responder_id})"
