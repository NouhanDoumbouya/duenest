"""
Integration account foundation.

Two models:

* :class:`ConnectedIntegrationAccount` — a user's connected external account
  (V1: Google only). OAuth access/refresh tokens are stored **encrypted at rest**
  (AES-256-GCM envelope via ``apps.core.security.encryption``, AAD-bound to the
  account). Tokens are NEVER serialized to the frontend and NEVER logged.
* :class:`IntegrationOAuthState` — short-lived, single-use OAuth ``state`` for CSRF
  protection. Only a **salted hash** of the state is stored — never the raw value.

This branch is the foundation only: no Drive/Calendar/Gmail data is imported, no
background sync, and nothing is ever written back to the provider.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.security.encryption import (
    DecryptionError,
    decrypt_field_value,
    encrypt_field_value,
)


class Provider(models.TextChoices):
    GOOGLE = "google", "Google"
    # Reserved for future providers — not implemented in this branch.
    MICROSOFT = "microsoft", "Microsoft"
    DROPBOX = "dropbox", "Dropbox"
    OTHER = "other", "Other"


class ConnectedIntegrationAccount(models.Model):
    """One external account a user has connected for future import-only use."""

    class Status(models.TextChoices):
        CONNECTED = "connected", "Connected"
        EXPIRED = "expired", "Expired"
        REVOKED = "revoked", "Revoked"
        ERROR = "error", "Error"
        DISCONNECTED = "disconnected", "Disconnected"

    _AAD_MODEL = "connectedintegrationaccount"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="integration_accounts",
    )
    # Optional for future org-level integrations. V1 connect flow is user-level.
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="integration_accounts",
    )
    provider = models.CharField(max_length=20, choices=Provider.choices)
    # Stable provider-side account id (Google "sub"). Not secret.
    provider_account_id = models.CharField(max_length=255)
    provider_email = models.EmailField(blank=True)
    display_name = models.CharField(max_length=255, blank=True)
    # Granted OAuth scopes (strings) and the user-facing scope groups chosen.
    scopes = models.JSONField(default=list, blank=True)
    scope_groups = models.JSONField(default=list, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.CONNECTED
    )
    # Encrypted token envelopes (opaque bytes). Never serialized, never logged.
    access_token_ciphertext = models.BinaryField(null=True, blank=True)
    refresh_token_ciphertext = models.BinaryField(null=True, blank=True)
    token_expires_at = models.DateTimeField(null=True, blank=True)
    last_refresh_at = models.DateTimeField(null=True, blank=True)
    last_checked_at = models.DateTimeField(null=True, blank=True)
    last_error_code = models.CharField(max_length=80, blank=True)
    last_error_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    disconnected_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "provider", "provider_account_id"],
                name="uniq_user_provider_account",
            )
        ]
        indexes = [
            models.Index(fields=["user", "provider"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self) -> str:
        return f"{self.provider}:{self.provider_account_id} for user {self.user_id}"

    # ---- Token storage (encrypted at rest; AAD-bound to this record) --------

    def _set_token(self, field: str, value: str | None) -> None:
        if self.pk is None:
            # AAD binds to the record id, so the row must exist first.
            raise ValueError("Save the account before setting tokens.")
        if not value:
            setattr(self, f"{field}_ciphertext", None)
            return
        setattr(
            self,
            f"{field}_ciphertext",
            encrypt_field_value(
                value, model=self._AAD_MODEL, field=field, record_id=self.pk
            ),
        )

    def _get_token(self, field: str) -> str | None:
        raw = getattr(self, f"{field}_ciphertext", None)
        if not raw:
            return None
        try:
            return decrypt_field_value(
                bytes(raw), model=self._AAD_MODEL, field=field, record_id=self.pk
            )
        except DecryptionError:
            # Fail closed: a token we cannot open is treated as absent.
            return None

    def set_tokens(
        self, *, access_token: str | None = None, refresh_token: str | None = None
    ) -> None:
        """Encrypt and store tokens. Pass ``None`` to leave a token unchanged is
        NOT supported here — callers pass the values they want stored; a falsy
        value clears that token."""
        self._set_token("access_token", access_token)
        # Google omits a refresh_token on re-consent; only overwrite when given.
        if refresh_token:
            self._set_token("refresh_token", refresh_token)

    def get_access_token(self) -> str | None:
        return self._get_token("access_token")

    def get_refresh_token(self) -> str | None:
        return self._get_token("refresh_token")

    def clear_tokens(self) -> None:
        self.access_token_ciphertext = None
        self.refresh_token_ciphertext = None

    # ---- Derived state ------------------------------------------------------

    @property
    def is_token_expired(self) -> bool:
        return bool(self.token_expires_at and self.token_expires_at <= timezone.now())

    @property
    def needs_attention(self) -> bool:
        return self.status in {self.Status.EXPIRED, self.Status.ERROR, self.Status.REVOKED}


class IntegrationOAuthState(models.Model):
    """Short-lived, single-use OAuth state for CSRF/replay protection.

    Only a salted SHA-256 hash of the raw state is stored. The raw value lives
    only in the authorization URL handed to the browser and is matched by hash on
    callback. States expire and are consumed exactly once.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="integration_oauth_states",
    )
    organization = models.ForeignKey(
        "organizations.Organization",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="integration_oauth_states",
    )
    provider = models.CharField(max_length=20, choices=Provider.choices)
    state_hash = models.CharField(max_length=64, db_index=True)
    # Safe, internal-only path to return the user to after the callback.
    redirect_path = models.CharField(max_length=255, blank=True)
    scopes = models.JSONField(default=list, blank=True)
    scope_groups = models.JSONField(default=list, blank=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["state_hash", "provider"])]

    def __str__(self) -> str:
        return f"oauth-state {self.provider} for user {self.user_id}"

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()

    @property
    def is_consumed(self) -> bool:
        return self.consumed_at is not None


class ImportedCalendarEvent(models.Model):
    """Idempotency record for a calendar event a user has imported.

    Stores ONLY safe identifiers + a sanitized title and links to the CertaNest
    records that were created (a fileless "deadline" Document and its reminder
    rule). It never stores the event description, attendees, conference links, or
    any raw provider payload. The unique key prevents a second import of the same
    provider event from silently creating duplicate deadlines.
    """

    class Status(models.TextChoices):
        IMPORTED = "imported", "Imported"
        # Reserved for a future "the source records were deleted" state.
        REMOVED = "removed", "Removed"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="imported_calendar_events",
    )
    account = models.ForeignKey(
        ConnectedIntegrationAccount,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="imported_calendar_events",
    )
    provider = models.CharField(max_length=20, choices=Provider.choices, default=Provider.GOOGLE)
    provider_calendar_id = models.CharField(max_length=255)
    provider_event_id = models.CharField(max_length=255)

    # The records this import created. SET_NULL so deleting the deadline/reminder
    # in the vault leaves an honest "was imported" trail without a dangling row.
    imported_document = models.ForeignKey(
        "documents.Document",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )
    imported_reminder = models.ForeignKey(
        "documents.DocumentReminderRule",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    # Safe display only — the event title, single-line and length-capped. Never a
    # description/body.
    sanitized_title = models.CharField(max_length=255, blank=True)
    event_start_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.IMPORTED)
    imported_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-imported_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner", "provider", "provider_calendar_id", "provider_event_id"],
                name="uniq_imported_calendar_event_per_owner",
            )
        ]
        indexes = [
            models.Index(fields=["owner", "provider"]),
        ]

    def __str__(self) -> str:
        return f"imported {self.provider} event for user {self.owner_id}"
