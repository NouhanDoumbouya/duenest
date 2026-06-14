"""
Quick Share QR — a fast, secure, account-to-account / public document exchange.

Quick Share sits on top of DueNest's existing secure-document model. A session
is a token-gated collection of explicitly selected files (never the whole vault),
with a permission, expiry, optional access code, optional one-time / limited
claims, and optional sender approval. Every access rule is enforced server-side.

Security invariants (also covered by tests):
* The QR / claim URL carries ONLY the random session token — never file ids,
  storage paths, access codes, or permission payloads.
* ``access_code_hash`` is hashed (``make_password``) and never serialized.
* A receiver only ever sees the items explicitly attached to the session.
* Expired or revoked sessions never grant access.
"""

from __future__ import annotations

import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone

# Reuse the vetted token generator from the documents app so Quick Share tokens
# have the same entropy and shape as secure-room / share-link tokens.
from apps.documents.models import generate_share_token

# Human-typable DueNest code alphabet: upper-case letters + digits with the
# visually ambiguous characters removed (no 0/O, 1/I/L, 5/S, 2/Z, 8/B). The
# code is for the "Receive code" flow and must be easy to read aloud and type.
DN_CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY3467"


def generate_dn_code() -> str:
    """
    Short, human-typable DueNest code, e.g. ``DN-4KQ7-PXMR``.

    Independent of the secret session token (never derived from it) so it can be
    spoken or typed without weakening the token. Eight characters drawn from a
    24-symbol unambiguous alphabet give ~24**8 ≈ 1.1e11 combinations, which —
    combined with server-side rate limiting on the receive endpoint — makes
    enumeration infeasible. Uniqueness is enforced by the caller on save.
    """
    raw = "".join(secrets.choice(DN_CODE_ALPHABET) for _ in range(8))
    return f"DN-{raw[:4]}-{raw[4:]}"


def normalize_dn_code(value: str) -> str:
    """
    Canonicalize user-typed input into the stored ``DN-XXXX-XXXX`` form.

    Tolerates lower-case, spaces, missing/extra dashes, and an optional leading
    ``DN`` prefix so a recipient can type the code however they read it. Returns
    "" when the input cannot be a valid code (wrong length or symbols).
    """
    if not value:
        return ""
    cleaned = "".join(ch for ch in value.upper() if ch.isalnum())
    if cleaned.startswith("DN"):
        cleaned = cleaned[2:]
    if len(cleaned) != 8 or any(ch not in DN_CODE_ALPHABET for ch in cleaned):
        return ""
    return f"DN-{cleaned[:4]}-{cleaned[4:]}"


class QuickShareSession(models.Model):
    """A single Quick Share QR exchange owned by one user."""

    class Mode(models.TextChoices):
        ACCOUNT_TO_ACCOUNT = "account_to_account", "Account to account"
        PUBLIC_SECURE_QR = "public_secure_qr", "Public secure QR"
        EMERGENCY_QR = "emergency_qr", "Emergency QR"
        ORGANIZATION_COLLECTION = "organization_collection", "Organization collection"

    class ShareMethod(models.TextChoices):
        # How the sender chose to hand off the share. All methods resolve to the
        # same session token server-side; this only drives which delivery the UI
        # leads with (the others remain available).
        QR = "qr", "QR code"
        LINK = "link", "Secure link"
        CODE = "code", "DueNest code"

    class Permission(models.TextChoices):
        VIEW_ONLY = "view_only", "View only"
        DOWNLOAD_ALLOWED = "download_allowed", "Allow download"
        SAVE_COPY_ALLOWED = "save_copy_allowed", "Allow save copy"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CLAIMED = "claimed", "Claimed"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        EXPIRED = "expired", "Expired"
        REVOKED = "revoked", "Revoked"
        CONSUMED = "consumed", "Consumed"

    token = models.CharField(
        max_length=128, unique=True, db_index=True, default=generate_share_token
    )
    # Short, human-typable code for the "Receive code" flow. Independent of the
    # secret token; safe to read aloud or type. Resolved server-side only.
    dn_code = models.CharField(
        max_length=20, unique=True, db_index=True, default=generate_dn_code
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="quick_share_sessions",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="quick_share_sessions",
    )
    mode = models.CharField(
        max_length=32, choices=Mode.choices, default=Mode.ACCOUNT_TO_ACCOUNT
    )
    # Sender's chosen delivery method (presentation only; all methods work).
    share_method = models.CharField(
        max_length=8, choices=ShareMethod.choices, default=ShareMethod.QR
    )
    title = models.CharField(max_length=255, blank=True)
    purpose = models.CharField(max_length=255, blank=True)
    permission = models.CharField(
        max_length=32, choices=Permission.choices, default=Permission.VIEW_ONLY
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )

    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    access_code_required = models.BooleanField(default=False)
    # Hashed access code only — never stored or returned in plain text.
    access_code_hash = models.CharField(max_length=255, blank=True)

    one_time = models.BooleanField(default=False)
    max_claims = models.PositiveIntegerField(null=True, blank=True)
    claim_count = models.PositiveIntegerField(default=0)

    require_sender_approval = models.BooleanField(default=False)
    watermark_enabled = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["owner", "created_at"]),
            models.Index(fields=["token"]),
            models.Index(fields=["owner", "revoked_at"]),
            models.Index(fields=["expires_at"]),
        ]

    def __str__(self) -> str:
        return f"QuickShare({self.token[:8]}… {self.title or self.mode})"

    def save(self, *args, **kwargs):
        """Retry once on the (vanishingly rare) dn_code collision before insert."""
        if not self.pk and self.dn_code:
            for _ in range(5):
                if not QuickShareSession.objects.filter(dn_code=self.dn_code).exists():
                    break
                self.dn_code = generate_dn_code()
        super().save(*args, **kwargs)

    # ---- Derived state -----------------------------------------------------

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_consumed(self) -> bool:
        return self.status == self.Status.CONSUMED

    @property
    def download_allowed(self) -> bool:
        return self.permission in {
            self.Permission.DOWNLOAD_ALLOWED,
            self.Permission.SAVE_COPY_ALLOWED,
        }

    @property
    def save_copy_allowed(self) -> bool:
        return self.permission == self.Permission.SAVE_COPY_ALLOWED

    @property
    def effective_max_claims(self):
        """Maximum number of accepted claims, or None when unlimited."""
        if self.one_time:
            return 1
        return self.max_claims

    @property
    def is_claim_limit_reached(self) -> bool:
        cap = self.effective_max_claims
        return cap is not None and self.claim_count >= cap

    @property
    def is_active(self) -> bool:
        return (
            not self.is_revoked
            and not self.is_expired
            and not self.is_consumed
            and not self.is_claim_limit_reached
        )

    @property
    def short_id(self) -> str:
        """A short, non-secret identifier safe for display/watermarks."""
        return self.token[:8]

    @property
    def watermark_text(self) -> str:
        return self.title or ""


class QuickShareItem(models.Model):
    """One file (and its parent document) exposed by a Quick Share session."""

    session = models.ForeignKey(
        QuickShareSession,
        on_delete=models.CASCADE,
        related_name="items",
    )
    document = models.ForeignKey(
        "documents.Document",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="quick_share_items",
    )
    file = models.ForeignKey(
        "documents.DocumentFile",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="quick_share_items",
    )
    # A bundle item shares all of the bundle's currently available files, so the
    # share tracks the bundle's contents over time (like a document-level item).
    bundle = models.ForeignKey(
        "documents.DocumentBundle",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="quick_share_items",
    )
    display_name = models.CharField(max_length=255, blank=True)
    order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["order", "created_at"]
        indexes = [
            models.Index(fields=["session", "order"]),
        ]

    def __str__(self) -> str:
        return f"QuickShareItem(session={self.session_id} file={self.file_id})"


class QuickShareClaim(models.Model):
    """
    A receiver's claim against a session.

    For account-to-account sessions, one claim is created per logged-in receiver
    when they open the QR; accepting it grants access and surfaces the session in
    their "Shared with me" area. For public sessions a lightweight anonymous claim
    records the first access for counting/limits.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        ACCEPTED = "accepted", "Accepted"
        DECLINED = "declined", "Declined"
        BLOCKED = "blocked", "Blocked"
        EXPIRED = "expired", "Expired"

    class Approval(models.TextChoices):
        NOT_REQUIRED = "not_required", "Not required"
        PENDING = "pending", "Awaiting sender approval"
        APPROVED = "approved", "Approved"
        DENIED = "denied", "Denied"

    session = models.ForeignKey(
        QuickShareSession,
        on_delete=models.CASCADE,
        related_name="claims",
    )
    receiver_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="quick_share_claims",
    )
    receiver_email = models.EmailField(blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    approval = models.CharField(
        max_length=20, choices=Approval.choices, default=Approval.NOT_REQUIRED
    )
    # The receiver chose to hide this share from their own list (does not revoke
    # access — only the owner can revoke).
    removed_by_receiver = models.BooleanField(default=False)

    # Short, non-identifying client summary (e.g. "Chrome on Android"). We do not
    # store raw IP addresses for Quick Share — only an approximate UA summary.
    user_agent_summary = models.CharField(max_length=120, blank=True)

    claimed_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    declined_at = models.DateTimeField(null=True, blank=True)
    last_accessed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["session", "status"]),
            models.Index(fields=["receiver_user", "status"]),
        ]

    def __str__(self) -> str:
        return f"QuickShareClaim(session={self.session_id} status={self.status})"

    @property
    def is_active_for_receiver(self) -> bool:
        """Whether this claim currently grants the receiver access."""
        return (
            self.status == self.Status.ACCEPTED
            and self.approval
            in {self.Approval.NOT_REQUIRED, self.Approval.APPROVED}
            and self.session.is_active
        )


class QuickShareActivity(models.Model):
    """Owner-facing activity trail. Tokens and access codes are never logged."""

    class Action(models.TextChoices):
        SESSION_CREATED = "session_created", "Quick Share created"
        QR_VIEWED = "qr_viewed", "QR opened"
        CLAIM_STARTED = "claim_started", "Claim started"
        CLAIM_ACCEPTED = "claim_accepted", "Claim accepted"
        CLAIM_DECLINED = "claim_declined", "Claim declined"
        SENDER_APPROVED = "sender_approved", "Sender approved"
        SENDER_DENIED = "sender_denied", "Sender denied"
        FILE_PREVIEWED = "file_previewed", "File previewed"
        FILE_DOWNLOADED = "file_downloaded", "File downloaded"
        COPY_SAVED = "copy_saved", "Copy saved to vault"
        SESSION_REVOKED = "session_revoked", "Quick Share revoked"
        SESSION_EXPIRED = "session_expired", "Quick Share expired"
        ACCESS_CODE_VERIFIED = "access_code_verified", "Access code verified"
        ACCESS_CODE_FAILED = "access_code_failed", "Access code failed"

    class ActorType(models.TextChoices):
        OWNER = "owner", "Owner"
        RECEIVER = "receiver", "Receiver"
        SYSTEM = "system", "System"

    session = models.ForeignKey(
        QuickShareSession,
        on_delete=models.CASCADE,
        related_name="activities",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quick_share_activities",
    )
    action = models.CharField(max_length=40, choices=Action.choices)
    actor_type = models.CharField(max_length=20, choices=ActorType.choices)
    safe_summary = models.CharField(max_length=255, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["session", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.action} on session {self.session_id}"
