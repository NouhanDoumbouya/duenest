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
    {"key": "verified_shares", "name": "Verified shares", "default": Visibility.FOUNDER_ONLY, "description": "Tamper-evident, DueNest-signed shares with a public /verify page. Provenance + integrity only."},
    {"key": "share_requests", "name": "Share Requests", "default": Visibility.FOUNDER_ONLY, "description": "Request documents from someone; they fulfil the checklist from their vault. Delivered via the Quick Share engine."},
    {"key": "private_share", "name": "Minimal-disclosure share", "default": Visibility.FOUNDER_ONLY, "description": "Share a prepared/redacted copy directly via Quick Share; the original is never shared."},
    {"key": "smart_redaction", "name": "Smart redaction", "default": Visibility.FOUNDER_ONLY, "description": "Assistive auto-redaction — OCR finds sensitive data (bank/card numbers, emails, a custom term) and pre-draws redaction boxes for review."},
    {"key": "bundle_sharing", "name": "Bundle sharing", "default": Visibility.ENABLED, "description": "Share a whole bundle."},
    {"key": "shared_with_me", "name": "Shared with me", "default": Visibility.ENABLED, "description": "Recipient inbox."},
    {"key": "secure_rooms", "name": "Secure Rooms", "default": Visibility.ENABLED, "description": "Controlled collection sharing."},
    {"key": "emergency_access", "name": "Emergency Access", "default": Visibility.ENABLED, "description": "Emergency packs."},
    {"key": "emergency_public_viewer", "name": "Emergency public viewer", "default": Visibility.ENABLED, "description": "Token-gated emergency viewer."},
    {"key": "emergency_checkin", "name": "Emergency — safety check-in", "default": Visibility.FOUNDER_ONLY, "description": "Dead-man's-switch check-in: if the owner doesn't check in by the deadline, trusted contacts are emailed (server-side, works with phone off). Owner can extend/cancel. Founder-only until launched."},
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
    {"key": "filename_templates", "name": "Scanner — filename templates", "default": Visibility.FOUNDER_ONLY, "description": "Quick clean-name chips (document type + year) when saving a scan. Editable; nothing invented."},
    {"key": "scan_modes", "name": "Scanner — scan modes", "default": Visibility.FOUNDER_ONLY, "description": "Friendly presets (Document/ID/Certificate/Receipt/Application/Photo) that set safe filter + quality defaults. User-chosen; not auto-recognition."},
    {"key": "scan_ocr", "name": "Scanner — extract text (OCR)", "default": Visibility.FOUNDER_ONLY, "description": "On-device text extraction (Tesseract.js) from a scanned page. Runs in the browser; no image leaves the device. User-triggered; nothing is auto-filled."},
    {"key": "scan_hands_free", "name": "Scanner — hands-free batch", "default": Visibility.FOUNDER_ONLY, "description": "Continuous auto-capture: once a page is framed/steady it is captured and committed, then the camera keeps going for the next page. Opt-in toggle; manual capture is unchanged."},
    {"key": "advanced_document_preview", "name": "Documents — advanced preview", "default": Visibility.FOUNDER_ONLY, "description": "Image preview zoom controls (fit / actual size / +-) in the file viewer. UI-only."},
    {"key": "batch_scan_actions", "name": "File Inbox — batch actions", "default": Visibility.FOUNDER_ONLY, "description": "Move multiple selected inbox files to the Vault at once (optionally under a category). Uses existing create-document; originals become documents."},
    {"key": "document_page_edit", "name": "Documents — replace/add PDF pages", "default": Visibility.FOUNDER_ONLY, "description": "Replace a bad page or add a page in a PDF (lossless via pdf-lib); saved as a new version. Original retained. Experimental; founder-only."},
    # --- Application Pack Preparation -----------------------------------
    # Built on the existing bundle system. Master gate + per-tool keys so the
    # pack-preparation differentiators can be launched one at a time. Default
    # FOUNDER_ONLY so nothing changes for normal users until deliberately flipped.
    {"key": "application_pack_preparation", "name": "Application packs — preparation", "default": Visibility.FOUNDER_ONLY, "description": "Master gate for application-pack preparation features built on bundles."},
    {"key": "application_pack_templates", "name": "Application packs — templates", "default": Visibility.FOUNDER_ONLY, "description": "Start a bundle from a generic, editable checklist template (scholarship/visa/university/job/travel/renewal). Suggestions only — never presented as official; requirements always vary."},
    {"key": "application_pack_timeline", "name": "Application packs — activity timeline", "default": Visibility.FOUNDER_ONLY, "description": "Owner-only activity feed for a bundle (created, template applied, document attached/replaced/removed, status changed, exported). No file contents; never public."},
    {"key": "application_pack_safesend", "name": "Application packs — share via SafeSend", "default": Visibility.FOUNDER_ONLY, "description": "Shortcut from a pack into the SafeSend (Quick Share) draft with the pack preselected. No link is created until the user confirms inside SafeSend."},
    # --- Vault Organization Experience ----------------------------------
    # UI-only enhancements to the existing Vault. They reuse existing,
    # owner-scoped document endpoints (move category / set lifecycle / soft
    # delete / restore); no new write surface. Default FOUNDER_ONLY for a
    # controlled launch — the Vault behaves exactly as today when disabled.
    {"key": "vault_bulk_actions", "name": "Vault — bulk actions", "default": Visibility.FOUNDER_ONLY, "description": "Select multiple documents in the Vault to move to a category, archive, or move to Trash at once. Reuses existing per-document endpoints; destructive actions confirm first."},
    {"key": "vault_trash_undo", "name": "Vault — undo toast", "default": Visibility.FOUNDER_ONLY, "description": "Show an inline 'Undo' toast after moving a document to Trash or archiving it (single or bulk), reversing via the existing restore / lifecycle endpoints."},
    {"key": "vault_smart_views", "name": "Vault — Smart Views", "default": Visibility.FOUNDER_ONLY, "description": "A Smart Views panel on the Vault overview (Expiring soon, Needs review, Shared, In packs, Pinned, Archived, …) with real counts, linking into the pre-filtered documents list. State-based filtering only — no AI."},
    {"key": "vault_table_view", "name": "Vault — table view", "default": Visibility.FOUNDER_ONLY, "description": "A compact table view mode for the documents list (name/category/type/expiry/status) alongside the existing list and grid views. Horizontally scrollable on mobile."},
    # --- Customizable QR codes ------------------------------------------
    # UI-only QR appearance controls on the SafeSend link screen (custom
    # foreground/background colors + live scan-reliability warnings). The QR
    # payload, security model, and existing color presets/logo are unchanged;
    # this only gates the NEW custom-color pickers + warnings. FOUNDER_ONLY.
    {"key": "qr_customization", "name": "QR — custom colors + scan warnings", "default": Visibility.FOUNDER_ONLY, "description": "Custom foreground/background QR colors with live contrast + scan-reliability warnings on the SafeSend link screen. UI-only; the QR still encodes only the secure SafeSend URL and follows the same access rules."},
    # --- AI (Claude-powered document intelligence) ----------------------
    # KEY-GATED at the platform level: these only do anything when
    # ANTHROPIC_API_KEY is set (settings.AI_CONFIGURED). They default
    # FOUNDER_ONLY so nothing is exposed until a founder deliberately launches
    # each one — AND, with no key, AI calls degrade to a clear "not configured"
    # result. `ai_features` is the master gate for the whole AI surface; the
    # per-feature keys allow launching capabilities one at a time.
    {"key": "ai_features", "name": "AI — master gate", "default": Visibility.FOUNDER_ONLY, "description": "Master gate for all Claude-powered AI features. No effect unless ANTHROPIC_API_KEY is configured (AI degrades gracefully without a key)."},
    {"key": "ai_document_extraction", "name": "AI — document extraction", "default": Visibility.FOUNDER_ONLY, "description": "Use Claude to read a scanned/uploaded document and suggest structured fields (e.g. expiry date) for review. Suggestions only — never auto-saved without the user confirming."},
    {"key": "ai_document_qa", "name": "AI — ask your documents", "default": Visibility.FOUNDER_ONLY, "description": "Ask natural-language questions grounded in the user's own documents (e.g. 'when does my visa expire?'). Owner-scoped; answers cite the source document."},
    {"key": "ai_share_readiness", "name": "AI — share readiness", "default": Visibility.FOUNDER_ONLY, "description": "Claude reviews an application pack against its purpose and flags likely-rejection issues (missing items, expiring documents) before sharing. Assistive; deterministic facts shown regardless."},
    {"key": "ai_document_drafting", "name": "AI — drafting assistant", "default": Visibility.FOUNDER_ONLY, "description": "Draft letters/forms from the user's records. Drafts are editable suggestions; nothing is sent or saved automatically."},
    {"key": "ai_pack_copilot", "name": "AI — application pack copilot", "default": Visibility.FOUNDER_ONLY, "description": "For a goal (visa/scholarship/job/mortgage), build the requirement checklist, match it against the user's vault (have/missing), and flag documents expiring before the deadline. Suggestions only; never presented as official — requirements always vary and must be verified."},
    {"key": "ai_briefing", "name": "AI — proactive briefing", "default": Visibility.FOUNDER_ONLY, "description": "A prioritized 'what to do now' briefing across the vault. Statuses/dates are the real computed health; Claude prioritizes and phrases the suggested actions. Read-only suggestions; nothing is changed automatically."},
    {"key": "ai_chat", "name": "AI — conversational assistant", "default": Visibility.FOUNDER_ONLY, "description": "A chat assistant grounded in the user's documents that proposes confirm-gated actions (draft / pack / open document / briefing). The chat performs no writes or shares itself."},
    {"key": "ai_intake", "name": "AI — smart intake", "default": Visibility.FOUNDER_ONLY, "description": "Understand a newly-added file (summary + suggested fields) and propose confirm-gated next actions (create document / set reminder / add to pack / draft). Reuses extraction; performs no writes itself."},
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
