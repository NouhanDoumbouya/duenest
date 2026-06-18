"""
Feature Flags Lite — lightweight kill switches for beta safety.

A `FeatureFlag` row controls one feature key. Resolution order at runtime is:
DB row → environment variable (`DUENEST_FEATURE_<KEY>`) → registry default.

This is intentionally simple: visibility is a single enum (no separate
is_enabled), there are no rollout percentages, cohorts, or targeting. The goal is
that a founder can pause a risky feature quickly without removing code.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models


class Visibility(models.TextChoices):
    ENABLED = "enabled", "Enabled (everyone)"
    BETA_ONLY = "beta_only", "Beta users only"
    FOUNDER_ONLY = "founder_only", "Founder/admin only"
    DISABLED = "disabled", "Disabled (off)"


# Canonical registry of feature keys this build understands. Only keys that map
# to real features are listed. `default` is the visibility used when there is no
# DB row and no env override — defaults to ENABLED so adding the switch never
# silently disables an already-shipped, tested feature. Founders can dial any of
# these down (beta_only / founder_only / disabled) at runtime.
FEATURE_DEFINITIONS: list[dict] = [
    {"key": "documents", "name": "Documents", "default": Visibility.ENABLED, "description": "Core document vault."},
    {"key": "file_inbox", "name": "File Inbox", "default": Visibility.ENABLED, "description": "Standalone file uploads."},
    {"key": "ocr", "name": "OCR / Document Intelligence", "default": Visibility.ENABLED, "description": "Review-staged text/field extraction."},
    {"key": "document_categorization", "name": "Document categorization", "default": Visibility.ENABLED, "description": "Categories and tags."},
    {"key": "bundles", "name": "Bundles", "default": Visibility.ENABLED, "description": "Application/renewal bundles."},
    {"key": "quick_share", "name": "Quick Share", "default": Visibility.ENABLED, "description": "Create secure shares."},
    {"key": "quick_share_code", "name": "Quick Share — DueNest code", "default": Visibility.ENABLED, "description": "Receive-by-code claiming."},
    {"key": "quick_share_qr", "name": "Quick Share — QR", "default": Visibility.ENABLED, "description": "QR delivery."},
    {"key": "quick_share_public_viewer", "name": "Quick Share — public viewer", "default": Visibility.ENABLED, "description": "Recipient/public claim viewer."},
    {"key": "bundle_sharing", "name": "Bundle sharing", "default": Visibility.ENABLED, "description": "Share a whole bundle."},
    {"key": "shared_with_me", "name": "Shared with me", "default": Visibility.ENABLED, "description": "Recipient inbox."},
    {"key": "secure_rooms", "name": "Secure Rooms", "default": Visibility.ENABLED, "description": "Controlled collection sharing."},
    {"key": "emergency_access", "name": "Emergency Access", "default": Visibility.ENABLED, "description": "Emergency packs."},
    {"key": "emergency_public_viewer", "name": "Emergency public viewer", "default": Visibility.ENABLED, "description": "Token-gated emergency viewer."},
    {"key": "subscriptions", "name": "Subscriptions", "default": Visibility.ENABLED, "description": "Subscription Radar."},
    {"key": "organizations", "name": "Organizations", "default": Visibility.ENABLED, "description": "Workspaces."},
    {"key": "email_reminders", "name": "Email reminders", "default": Visibility.ENABLED, "description": "Reminder email delivery."},
    {"key": "notification_center", "name": "Notification center", "default": Visibility.ENABLED, "description": "In-app notifications."},
    {"key": "waitlist", "name": "Public waitlist", "default": Visibility.ENABLED, "description": "Waitlist submissions."},
    {"key": "invite_signup", "name": "Invite signup", "default": Visibility.ENABLED, "description": "Invite-code registration."},
    {"key": "feedback", "name": "Feedback", "default": Visibility.ENABLED, "description": "Feedback submissions."},
    {"key": "founder_console", "name": "Founder Console", "default": Visibility.FOUNDER_ONLY, "description": "Founder tools."},
    # --- Advanced scanner / document-preparation tools -------------------
    # These are new differentiators (prepare/protect/organize/share scanned
    # documents). They default to FOUNDER_ONLY so they are NOT visible to
    # normal users until a founder deliberately launches each one (beta_only
    # / enabled). `scanner_advanced_tools` is the master gate for the whole
    # surface; the per-tool keys allow launching tools one at a time.
    {"key": "scanner_advanced_tools", "name": "Scanner — advanced tools", "default": Visibility.FOUNDER_ONLY, "description": "Master gate for advanced scanner/document-preparation tools."},
    {"key": "scan_to_safesend", "name": "Scanner — share safely", "default": Visibility.FOUNDER_ONLY, "description": "Continue a scanned document into Quick Share / SafeSend."},
    {"key": "scan_to_bundle", "name": "Scanner — add to bundle", "default": Visibility.FOUNDER_ONLY, "description": "Add a scanned document to an application/renewal bundle."},
    {"key": "scan_to_reminder", "name": "Scanner — add reminder", "default": Visibility.FOUNDER_ONLY, "description": "Create an expiry/deadline reminder from a scanned document."},
    {"key": "scan_safe_copy", "name": "Scanner — prepare copy", "default": Visibility.FOUNDER_ONLY, "description": "Create a prepared copy (the original is never modified)."},
    {"key": "scan_watermark", "name": "Scanner — watermark", "default": Visibility.FOUNDER_ONLY, "description": "Burn a label watermark into a prepared/exported copy."},
    {"key": "scan_compression", "name": "Scanner — compress PDF", "default": Visibility.FOUNDER_ONLY, "description": "Create a smaller PDF copy for uploads/portals."},
    {"key": "scan_page_export", "name": "Scanner — export selected pages", "default": Visibility.FOUNDER_ONLY, "description": "Export only selected scanned pages as a new copy (also covers combining scanned pages into one PDF)."},
    {"key": "scan_redaction", "name": "Scanner — redact (experimental)", "default": Visibility.FOUNDER_ONLY, "description": "Burn-in redaction on scanned image pages. Experimental; founder-only."},
    {"key": "document_merge", "name": "Documents — merge PDFs", "default": Visibility.FOUNDER_ONLY, "description": "Combine selected File Inbox PDFs into one new PDF (client-side; originals preserved)."},
    {"key": "document_page_extract", "name": "Documents — export PDF pages", "default": Visibility.FOUNDER_ONLY, "description": "Export selected pages of a File Inbox PDF as a new PDF (client-side; original preserved)."},
    {"key": "document_redaction", "name": "Documents — redact PDF (experimental)", "default": Visibility.FOUNDER_ONLY, "description": "Flatten a File Inbox PDF to images and burn in redaction areas (non-recoverable). Experimental; founder-only."},
    {"key": "scan_pdf_import", "name": "Scanner — import PDF", "default": Visibility.FOUNDER_ONLY, "description": "Import an existing PDF into the scanner (rasterized to pages) for re-export/preparation."},
    {"key": "document_compress", "name": "Documents — shrink PDF", "default": Visibility.FOUNDER_ONLY, "description": "Make a smaller image-based copy of a scanned/image-heavy File Inbox PDF (client-side; original preserved)."},
    # --- Scanner Document Organization v2 -------------------------------
    {"key": "duplicate_detection", "name": "Documents — duplicate detection", "default": Visibility.FOUNDER_ONLY, "description": "Warn before adding a file that matches an existing one (checksum/name/size). Never auto-deletes or replaces."},
    {"key": "document_versioning", "name": "Documents — version history", "default": Visibility.FOUNDER_ONLY, "description": "View a document's version history and restore previous metadata. Originals/previous files are preserved."},
]

FEATURE_KEYS = [d["key"] for d in FEATURE_DEFINITIONS]
FEATURE_DEFAULTS: dict[str, str] = {d["key"]: d["default"] for d in FEATURE_DEFINITIONS}
FEATURE_META: dict[str, dict] = {d["key"]: d for d in FEATURE_DEFINITIONS}


class FeatureFlag(models.Model):
    """One runtime-controllable feature key."""

    key = models.CharField(max_length=64, unique=True, db_index=True)
    name = models.CharField(max_length=120, blank=True)
    description = models.CharField(max_length=255, blank=True)
    visibility = models.CharField(
        max_length=20, choices=Visibility.choices, default=Visibility.ENABLED
    )
    # Shown to users when the feature is paused. Never include internal config.
    maintenance_message = models.CharField(max_length=255, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="feature_flag_updates",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key"]

    def __str__(self) -> str:
        return f"{self.key} ({self.visibility})"
