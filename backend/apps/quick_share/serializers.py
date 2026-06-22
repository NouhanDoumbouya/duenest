"""
Quick Share serializers.

Three audiences, three exposure levels:
* Owner serializers may include the session token (the owner builds the QR from
  it) but never the access-code hash.
* Public / receiver serializers expose only selected files and safe sender info
  — never the token, hash, storage paths, or unrelated vault data.
"""

from __future__ import annotations

from rest_framework import serializers

from .models import QuickShareActivity, QuickShareClaim, QuickShareSession
from .services import session_files


# ---- Shared helpers --------------------------------------------------------


def _sender_display(user) -> str:
    full = (getattr(user, "get_full_name", lambda: "")() or "").strip()
    if full:
        return full
    email = getattr(user, "email", "") or ""
    return email.split("@")[0] if email else "A CertaNest user"


def _initials(name: str) -> str:
    parts = [p for p in name.replace("@", " ").split() if p]
    if not parts:
        return "DN"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()


def _file_payload(file, item=None) -> dict:
    # ``display_name`` is an optional per-file label and only applies to a direct
    # single-file item. Bundle/document items expand to many files, so each keeps
    # its own filename (their ``display_name`` labels the group, not the files).
    use_label = bool(item and item.file_id and item.display_name)
    return {
        "file_id": file.id,
        "name": item.display_name if use_label else file.original_filename,
        "source": file.document.title if file.document_id else "File Inbox",
        "file_size": file.file_size,
        "content_type": file.content_type,
        "is_previewable": file.is_previewable,
    }


# ---- Owner-facing ----------------------------------------------------------


class QuickShareCreateSerializer(serializers.Serializer):
    """Validates the create/update payload from the owner."""

    mode = serializers.ChoiceField(
        choices=QuickShareSession.Mode.choices,
        default=QuickShareSession.Mode.ACCOUNT_TO_ACCOUNT,
    )
    share_method = serializers.ChoiceField(
        choices=QuickShareSession.ShareMethod.choices,
        default=QuickShareSession.ShareMethod.QR,
    )
    title = serializers.CharField(max_length=255, required=False, allow_blank=True)
    purpose = serializers.CharField(max_length=255, required=False, allow_blank=True)
    recipient_label = serializers.CharField(
        max_length=255, required=False, allow_blank=True
    )
    permission = serializers.ChoiceField(
        choices=QuickShareSession.Permission.choices,
        default=QuickShareSession.Permission.VIEW_ONLY,
    )
    expires_at = serializers.DateTimeField()
    access_code_required = serializers.BooleanField(default=False)
    access_code = serializers.CharField(
        max_length=64, required=False, allow_blank=True, write_only=True
    )
    one_time = serializers.BooleanField(default=False)
    max_claims = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=1000
    )
    # Per-access caps (null = unlimited); preserve single-file link parity.
    max_views = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=100000
    )
    max_downloads = serializers.IntegerField(
        required=False, allow_null=True, min_value=1, max_value=100000
    )
    require_sender_approval = serializers.BooleanField(default=False)
    watermark_enabled = serializers.BooleanField(default=True)
    privacy_screen_enabled = serializers.BooleanField(default=False)
    # Tamper-evident, CertaNest-signed share (feature-flagged; enforced in the view).
    verified = serializers.BooleanField(default=False)
    # File ids to attach on creation (owner-owned; validated in the view).
    file_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )
    # Document ids to attach whole (owner-owned; each shares its current files).
    document_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )
    # Bundle ids to attach whole (owner-owned; each shares its current files).
    bundle_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )
    # Proof ids to attach (owner-owned; each shares the proof's linked file).
    proof_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )

    def validate_expires_at(self, value):
        from django.utils import timezone

        if value <= timezone.now():
            raise serializers.ValidationError("Expiry must be in the future.")
        return value

    def validate_access_code(self, value):
        # Reject weak owner-supplied codes at creation (SEC-001). Empty is fine
        # (a strong code is generated server-side).
        from apps.core.security import public_access

        code = (value or "").strip()
        if not code:
            return value
        ok, message = public_access.validate_access_code_strength(code)
        if not ok:
            raise serializers.ValidationError(message)
        return value


class QuickShareItemSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    file_id = serializers.IntegerField(source="file.id", allow_null=True)
    document_id = serializers.IntegerField(source="document.id", allow_null=True)
    display_name = serializers.CharField()
    order = serializers.IntegerField()


class QuickShareClaimSummarySerializer(serializers.ModelSerializer):
    """Owner view of a single receiver claim (no sensitive data)."""

    receiver_name = serializers.SerializerMethodField()
    receiver_initials = serializers.SerializerMethodField()

    class Meta:
        model = QuickShareClaim
        fields = [
            "id",
            "receiver_name",
            "receiver_initials",
            "receiver_email",
            "status",
            "approval",
            "user_agent_summary",
            "claimed_at",
            "accepted_at",
            "declined_at",
            "last_accessed_at",
        ]

    def get_receiver_name(self, obj):
        if obj.receiver_user:
            return _sender_display(obj.receiver_user)
        return obj.receiver_email or "Recipient"

    def get_receiver_initials(self, obj):
        return _initials(self.get_receiver_name(obj))


class QuickShareSessionSerializer(serializers.ModelSerializer):
    """Owner-facing detail. Includes the token (owner builds the QR) — never the hash."""

    files = serializers.SerializerMethodField()
    claims = serializers.SerializerMethodField()
    claim_path = serializers.SerializerMethodField()
    dn_code = serializers.CharField(read_only=True)
    fallback_code = serializers.SerializerMethodField()
    download_allowed = serializers.BooleanField(read_only=True)
    save_copy_allowed = serializers.BooleanField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_revoked = serializers.BooleanField(read_only=True)
    short_id = serializers.CharField(read_only=True)
    file_count = serializers.SerializerMethodField()

    class Meta:
        model = QuickShareSession
        fields = [
            "id",
            "token",
            "claim_path",
            "dn_code",
            "fallback_code",
            "mode",
            "share_method",
            "title",
            "purpose",
            "recipient_label",
            "permission",
            "download_allowed",
            "save_copy_allowed",
            "status",
            "is_active",
            "is_expired",
            "is_revoked",
            "expires_at",
            "revoked_at",
            "access_code_required",
            "one_time",
            "max_claims",
            "claim_count",
            "max_views",
            "view_count",
            "max_downloads",
            "download_count",
            "limit_reached_at",
            "require_sender_approval",
            "watermark_enabled",
            "privacy_screen_enabled",
            "verified",
            "verified_at",
            "short_id",
            "file_count",
            "files",
            "claims",
            "created_at",
            "updated_at",
            "last_accessed_at",
        ]

    def get_files(self, obj):
        return [_file_payload(file, item) for item, file in session_files(obj)]

    def get_file_count(self, obj):
        return len(session_files(obj))

    def get_claims(self, obj):
        claims = obj.claims.exclude(
            status=QuickShareClaim.Status.PENDING,
            approval=QuickShareClaim.Approval.NOT_REQUIRED,
            accepted_at__isnull=True,
        ).order_by("-created_at")[:50]
        return QuickShareClaimSummarySerializer(claims, many=True).data

    def get_claim_path(self, obj):
        return f"/quick-share/{obj.token}"

    def get_fallback_code(self, obj):
        # Back-compat alias for ``dn_code``: the real, resolvable CertaNest code a
        # recipient types on the "Receive code" page. Independent of the secret
        # token (never derived from it).
        return obj.dn_code


class QuickShareListItemSerializer(serializers.ModelSerializer):
    """Compact owner list row."""

    download_allowed = serializers.BooleanField(read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    is_revoked = serializers.BooleanField(read_only=True)
    short_id = serializers.CharField(read_only=True)
    dn_code = serializers.CharField(read_only=True)
    claim_path = serializers.SerializerMethodField()
    file_count = serializers.SerializerMethodField()

    class Meta:
        model = QuickShareSession
        fields = [
            "id",
            "mode",
            "share_method",
            "title",
            "purpose",
            "recipient_label",
            "permission",
            "download_allowed",
            "status",
            "is_active",
            "is_expired",
            "is_revoked",
            "expires_at",
            "claim_count",
            "access_code_required",
            "short_id",
            "dn_code",
            "claim_path",
            "file_count",
            "created_at",
            "last_accessed_at",
        ]

    def get_claim_path(self, obj):
        return f"/quick-share/{obj.token}"

    def get_file_count(self, obj):
        # Count the files actually exposed (bundle/document items expand to
        # multiple files), so the list never under- or over-states a share.
        return len(session_files(obj))


class QuickShareActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = QuickShareActivity
        fields = ["id", "action", "actor_type", "safe_summary", "metadata", "created_at"]


# ---- Public / receiver-facing ----------------------------------------------


class QuickSharePublicSerializer(serializers.Serializer):
    """Safe metadata for a receiver/public viewer. No token, no hash, no paths."""

    mode = serializers.CharField()
    title = serializers.CharField()
    purpose = serializers.CharField()
    recipient_label = serializers.CharField()
    permission = serializers.CharField()
    download_allowed = serializers.BooleanField()
    save_copy_allowed = serializers.BooleanField()
    watermark_enabled = serializers.BooleanField()
    privacy_screen_enabled = serializers.BooleanField()
    verified = serializers.BooleanField()
    watermark_text = serializers.CharField()
    require_sender_approval = serializers.BooleanField()
    access_code_required = serializers.BooleanField()
    short_id = serializers.CharField()
    expires_at = serializers.DateTimeField()
    sender_name = serializers.CharField()
    sender_initials = serializers.CharField()
    file_count = serializers.IntegerField()
    files = serializers.ListField()
    # Receiver-only context (account-to-account):
    claim_status = serializers.CharField(required=False, allow_null=True)
    claim_approval = serializers.CharField(required=False, allow_null=True)
    claim_id = serializers.IntegerField(required=False, allow_null=True)
    viewer_is_owner = serializers.BooleanField(required=False)


def build_public_payload(session, *, claim=None, viewer=None) -> dict:
    files = [_file_payload(file, item) for item, file in session_files(session)]
    return {
        "mode": session.mode,
        "title": session.title or "Shared files",
        "purpose": session.purpose,
        "recipient_label": session.recipient_label,
        "permission": session.permission,
        "download_allowed": session.download_allowed,
        "save_copy_allowed": session.save_copy_allowed,
        "watermark_enabled": session.watermark_enabled,
        "privacy_screen_enabled": session.privacy_screen_enabled,
        "verified": session.verified,
        "watermark_text": session.watermark_text,
        "require_sender_approval": session.require_sender_approval,
        "access_code_required": session.access_code_required,
        "short_id": session.short_id,
        "expires_at": session.expires_at,
        "sender_name": _sender_display(session.owner),
        "sender_initials": _initials(_sender_display(session.owner)),
        "file_count": len(files),
        "files": files,
        "claim_status": claim.status if claim else None,
        "claim_approval": claim.approval if claim else None,
        "claim_id": claim.id if claim else None,
        "viewer_is_owner": bool(viewer and viewer.id == session.owner_id),
    }


class SharedWithMeSerializer(serializers.ModelSerializer):
    """A receiver's view of an accepted share in 'Shared with me'."""

    session_title = serializers.SerializerMethodField()
    purpose = serializers.SerializerMethodField()
    sender_name = serializers.SerializerMethodField()
    sender_initials = serializers.SerializerMethodField()
    permission = serializers.SerializerMethodField()
    download_allowed = serializers.SerializerMethodField()
    save_copy_allowed = serializers.SerializerMethodField()
    expires_at = serializers.SerializerMethodField()
    token = serializers.SerializerMethodField()
    file_count = serializers.SerializerMethodField()
    is_active = serializers.SerializerMethodField()
    session_state = serializers.SerializerMethodField()

    class Meta:
        model = QuickShareClaim
        fields = [
            "id",
            "session_title",
            "purpose",
            "sender_name",
            "sender_initials",
            "permission",
            "download_allowed",
            "save_copy_allowed",
            "expires_at",
            "token",
            "file_count",
            "status",
            "approval",
            "is_active",
            "session_state",
            "accepted_at",
            "last_accessed_at",
        ]

    def get_session_title(self, obj):
        return obj.session.title or "Shared files"

    def get_purpose(self, obj):
        return obj.session.purpose

    def get_sender_name(self, obj):
        return _sender_display(obj.session.owner)

    def get_sender_initials(self, obj):
        return _initials(_sender_display(obj.session.owner))

    def get_permission(self, obj):
        return obj.session.permission

    def get_download_allowed(self, obj):
        return obj.session.download_allowed

    def get_save_copy_allowed(self, obj):
        return obj.session.save_copy_allowed

    def get_expires_at(self, obj):
        return obj.session.expires_at

    def get_token(self, obj):
        # The receiver already accepted; the token lets them reopen the claim
        # page. Access is still fully re-validated server-side on every request.
        return obj.session.token

    def get_file_count(self, obj):
        return len(session_files(obj.session))

    def get_is_active(self, obj):
        return obj.is_active_for_receiver

    def get_session_state(self, obj):
        s = obj.session
        if s.is_revoked:
            return "revoked"
        if s.is_expired:
            return "expired"
        if obj.status == QuickShareClaim.Status.DECLINED:
            return "declined"
        if obj.approval == QuickShareClaim.Approval.PENDING:
            return "awaiting_approval"
        if obj.approval == QuickShareClaim.Approval.DENIED:
            return "denied"
        return "active"
