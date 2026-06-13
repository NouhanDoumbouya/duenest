"""Founder console service helpers.

The founder console should explain product health without exposing private
vault content. This module keeps those aggregate/query rules in one place.
"""

import logging
from datetime import timedelta
from typing import Any

from django.contrib.auth import get_user_model
from django.db.models import Count, Exists, Max, OuterRef, Q
from django.utils import timezone

from apps.documents.models import (
    Document,
    DocumentActivity,
    DocumentBundle,
    DocumentChecklist,
    DocumentChecklistTemplate,
    DocumentExportRequest,
    DocumentExtraction,
    DocumentFile,
    DocumentFileActivity,
    DocumentFileShareLink,
    DocumentReminderRule,
    EmergencyAccessPack,
    ProofRecord,
)
from apps.documents.services import client_ip, get_document_health
from apps.users.models import AccountDeletionRequest, UserOnboardingState

from .models import AppErrorLog, FeedbackItem, ProductEvent


logger = logging.getLogger(__name__)
User = get_user_model()

SENSITIVE_KEY_FRAGMENTS = {
    "password",
    "token",
    "secret",
    "access_code",
    "accesscode",
    "code",
    "authorization",
    "cookie",
    "raw_text",
    "ocr",
    "content",
    "file_path",
    "path_on_disk",
    "physical_location",
    "private_note",
    "notes",
}


def _is_sensitive_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    return any(fragment in normalized for fragment in SENSITIVE_KEY_FRAGMENTS)


def sanitize_metadata(value: Any, *, _depth: int = 0) -> Any:
    """
    Remove obvious secrets and private document content from event metadata.

    Analytics is intentionally lightweight. Complex or deeply nested data is
    collapsed rather than preserved, because founder metrics do not need it.
    """
    if _depth > 4:
        return "[omitted]"
    if isinstance(value, dict):
        cleaned = {}
        for key, item in value.items():
            key_text = str(key)[:80]
            cleaned[key_text] = (
                "[redacted]"
                if _is_sensitive_key(key_text)
                else sanitize_metadata(item, _depth=_depth + 1)
            )
        return cleaned
    if isinstance(value, list):
        return [sanitize_metadata(item, _depth=_depth + 1) for item in value[:25]]
    if isinstance(value, str):
        return value[:500]
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    return str(value)[:200]


def track_product_event(
    *,
    event_type: str,
    user=None,
    request=None,
    source: str = ProductEvent.Source.BACKEND,
    object_type: str = "",
    object_id: Any = "",
    status_code: int | None = None,
    metadata: dict | None = None,
) -> None:
    """Best-effort ProductEvent write; never break the calling workflow."""
    try:
        event_user = user
        if event_user is None and request is not None:
            candidate = getattr(request, "user", None)
            if getattr(candidate, "is_authenticated", False):
                event_user = candidate
        if event_user is not None and not getattr(event_user, "is_authenticated", True):
            event_user = None

        ProductEvent.objects.create(
            user=event_user,
            event_type=event_type,
            event_source=source,
            object_type=object_type[:80],
            object_id=str(object_id)[:80] if object_id not in {None, ""} else "",
            path=(request.path[:255] if request is not None else ""),
            method=(request.method[:12] if request is not None else ""),
            status_code=status_code,
            ip_address=client_ip(request) if request is not None else None,
            user_agent=(
                request.META.get("HTTP_USER_AGENT", "")[:1000]
                if request is not None
                else ""
            ),
            metadata=sanitize_metadata(metadata or {}),
        )
    except Exception:  # noqa: BLE001 - analytics must never break product flows
        logger.warning("Failed to record product event", exc_info=True)


def _since(days: int):
    return timezone.now() - timedelta(days=days)


def _today_start():
    now = timezone.now()
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _distinct_users(queryset, field: str) -> int:
    return (
        queryset.exclude(**{f"{field}__isnull": True})
        .values(field)
        .distinct()
        .count()
    )


def _active_users_since(since) -> int:
    ids = set(
        ProductEvent.objects.filter(
            user__isnull=False,
            created_at__gte=since,
        ).values_list("user_id", flat=True)
    )
    ids.update(
        User.objects.filter(last_login__gte=since).values_list("id", flat=True)
    )
    return len(ids)


def _event_label(event_type: str) -> str:
    try:
        return ProductEvent.EventType(event_type).label
    except ValueError:
        return event_type.replace("_", " ").title()


def _recent_activity_summary(days: int = 30, limit: int = 10) -> list[dict]:
    rows = (
        ProductEvent.objects.filter(created_at__gte=_since(days))
        .values("event_type")
        .annotate(count=Count("id"), last_seen_at=Max("created_at"))
        .order_by("-last_seen_at")[:limit]
    )
    return [
        {
            "event_type": row["event_type"],
            "label": _event_label(row["event_type"]),
            "count": row["count"],
            "last_seen_at": row["last_seen_at"],
        }
        for row in rows
    ]


def _attention_needed_count() -> int:
    documents = (
        Document.objects.filter(is_trashed=False)
        .exclude(status=Document.Status.ARCHIVED)
        .annotate(file_count=Count("files", filter=Q(files__is_trashed=False)))
    )
    return sum(
        1 for document in documents if get_document_health(document).needs_attention
    )


def build_founder_dashboard() -> dict:
    today = _today_start()
    since_7d = _since(7)
    since_30d = _since(30)

    open_feedback = FeedbackItem.objects.exclude(
        status__in=[FeedbackItem.Status.CLOSED, FeedbackItem.Status.REJECTED]
    )

    return {
        "total_users": User.objects.count(),
        "new_users_today": User.objects.filter(date_joined__gte=today).count(),
        "new_users_7d": User.objects.filter(date_joined__gte=since_7d).count(),
        "new_users_30d": User.objects.filter(date_joined__gte=since_30d).count(),
        "active_users_today": _active_users_since(today),
        "active_users_7d": _active_users_since(since_7d),
        "active_users_30d": _active_users_since(since_30d),
        "total_documents": Document.objects.filter(is_trashed=False).count(),
        "documents_created_7d": Document.objects.filter(
            is_trashed=False,
            created_at__gte=since_7d,
        ).count(),
        "total_files_uploaded": DocumentFile.objects.filter(is_trashed=False).count(),
        "files_uploaded_7d": DocumentFile.objects.filter(
            is_trashed=False,
            created_at__gte=since_7d,
        ).count(),
        "total_reminders": DocumentReminderRule.objects.count(),
        "reminders_created_7d": DocumentReminderRule.objects.filter(
            created_at__gte=since_7d
        ).count(),
        "total_share_links": DocumentFileShareLink.objects.count(),
        "share_links_created_7d": DocumentFileShareLink.objects.filter(
            created_at__gte=since_7d
        ).count(),
        "total_attention_needed_items": _attention_needed_count(),
        "total_checklists": DocumentChecklist.objects.count(),
        "total_bundles": DocumentBundle.objects.count(),
        "total_exports": DocumentExportRequest.objects.count(),
        "total_emergency_packs": EmergencyAccessPack.objects.count(),
        "total_feedback_items": FeedbackItem.objects.count(),
        "open_feedback_items": open_feedback.count(),
        "open_error_items": AppErrorLog.objects.filter(resolved=False).count(),
        "recent_activity_summary": _recent_activity_summary(),
    }


def build_activation_funnel() -> dict:
    total_signups = User.objects.count()
    steps = [
        {
            "step_id": "signed_up",
            "label": "Signed up",
            "count": total_signups,
        },
        {
            "step_id": "created_first_document",
            "label": "Created first document",
            "count": _distinct_users(Document.objects.all(), "owner"),
        },
        {
            "step_id": "uploaded_first_file",
            "label": "Uploaded first file",
            "count": _distinct_users(DocumentFile.objects.all(), "document__owner"),
        },
        {
            "step_id": "added_expiry_or_renewal_date",
            "label": "Added expiry or renewal date",
            "count": _distinct_users(
                Document.objects.filter(
                    Q(expiry_date__isnull=False) | Q(renewal_date__isnull=False)
                ),
                "owner",
            ),
        },
        {
            "step_id": "viewed_attention_needed",
            "label": "Viewed smart status / Attention Needed",
            "count": _distinct_users(
                ProductEvent.objects.filter(
                    event_type=ProductEvent.EventType.ATTENTION_NEEDED_VIEWED
                ),
                "user",
            ),
        },
        {
            "step_id": "created_reminder",
            "label": "Created reminder",
            "count": _distinct_users(DocumentReminderRule.objects.all(), "owner"),
        },
        {
            "step_id": "created_checklist_or_bundle",
            "label": "Created checklist or bundle",
            "count": len(
                set(DocumentChecklist.objects.values_list("owner_id", flat=True))
                | set(DocumentBundle.objects.values_list("owner_id", flat=True))
            ),
        },
        {
            "step_id": "created_secure_share_link",
            "label": "Created secure share link",
            "count": _distinct_users(DocumentFileShareLink.objects.all(), "owner"),
            "optional": True,
        },
    ]

    previous = None
    for step in steps:
        count = step["count"]
        step["conversion_from_previous"] = (
            None if previous in {None, 0} else round((count / previous) * 100, 1)
        )
        step["conversion_from_signup"] = (
            None if total_signups == 0 else round((count / total_signups) * 100, 1)
        )
        previous = count
    return {"steps": steps}


def _feature_metric(
    *,
    feature_key: str,
    label: str,
    queryset,
    user_field: str,
    date_field: str = "created_at",
) -> dict:
    total_users = max(User.objects.count(), 1)
    users_count = _distinct_users(queryset, user_field)
    last_7d = queryset.filter(**{f"{date_field}__gte": _since(7)}).count()
    last_30d = queryset.filter(**{f"{date_field}__gte": _since(30)}).count()
    return {
        "feature_key": feature_key,
        "label": label,
        "users_count": users_count,
        "total_events_count": queryset.count(),
        "adoption_percent": round((users_count / total_users) * 100, 1),
        "last_7d_count": last_7d,
        "last_30d_count": last_30d,
    }


def build_feature_adoption() -> dict:
    features = [
        _feature_metric(
            feature_key="preview",
            label="File preview",
            queryset=DocumentFileActivity.objects.filter(
                action=DocumentFileActivity.Action.FILE_PREVIEWED
            ),
            user_field="owner",
        ),
        _feature_metric(
            feature_key="secure_sharing",
            label="Secure sharing",
            queryset=DocumentFileShareLink.objects.all(),
            user_field="owner",
        ),
        _feature_metric(
            feature_key="access_code_sharing",
            label="Access-code sharing",
            queryset=DocumentFileShareLink.objects.filter(access_code_required=True),
            user_field="owner",
        ),
        _feature_metric(
            feature_key="reminders",
            label="Reminder rules",
            queryset=DocumentReminderRule.objects.all(),
            user_field="owner",
        ),
        _feature_metric(
            feature_key="attention_needed",
            label="Attention Needed",
            queryset=ProductEvent.objects.filter(
                event_type=ProductEvent.EventType.ATTENTION_NEEDED_VIEWED
            ),
            user_field="user",
        ),
        _feature_metric(
            feature_key="checklists",
            label="Renewal checklists",
            queryset=DocumentChecklist.objects.all(),
            user_field="owner",
        ),
        _feature_metric(
            feature_key="bundles",
            label="Application bundles",
            queryset=DocumentBundle.objects.all(),
            user_field="owner",
        ),
        _feature_metric(
            feature_key="timeline",
            label="Timeline",
            queryset=ProductEvent.objects.filter(
                event_type=ProductEvent.EventType.TIMELINE_VIEWED
            ),
            user_field="user",
        ),
        _feature_metric(
            feature_key="extraction",
            label="Detail extraction",
            queryset=DocumentExtraction.objects.all(),
            user_field="owner",
        ),
        _feature_metric(
            feature_key="export",
            label="Metadata export",
            queryset=DocumentExportRequest.objects.all(),
            user_field="owner",
            date_field="requested_at",
        ),
        _feature_metric(
            feature_key="emergency_pack",
            label="Emergency access packs",
            queryset=EmergencyAccessPack.objects.all(),
            user_field="owner",
        ),
        _feature_metric(
            feature_key="proof_records",
            label="Proof records",
            queryset=ProofRecord.objects.all(),
            user_field="owner",
        ),
        _feature_metric(
            feature_key="trash_restore",
            label="Trash restore",
            queryset=DocumentActivity.objects.filter(
                action__in=[
                    DocumentActivity.Action.DOCUMENT_RESTORED,
                    DocumentActivity.Action.FILE_RESTORED,
                ]
            ),
            user_field="owner",
        ),
    ]
    by_key = {feature["feature_key"]: feature for feature in features}
    return {
        "preview_used_count": by_key["preview"]["users_count"],
        "secure_sharing_used_count": by_key["secure_sharing"]["users_count"],
        "access_code_sharing_used_count": by_key["access_code_sharing"]["users_count"],
        "reminders_used_count": by_key["reminders"]["users_count"],
        "attention_needed_used_count": by_key["attention_needed"]["users_count"],
        "checklists_used_count": by_key["checklists"]["users_count"],
        "bundles_used_count": by_key["bundles"]["users_count"],
        "timeline_used_count": by_key["timeline"]["users_count"],
        "extraction_used_count": by_key["extraction"]["users_count"],
        "export_used_count": by_key["export"]["users_count"],
        "emergency_pack_used_count": by_key["emergency_pack"]["users_count"],
        "proof_records_used_count": by_key["proof_records"]["users_count"],
        "trash_restore_used_count": by_key["trash_restore"]["users_count"],
        "features": features,
    }


def build_security_overview() -> dict:
    since_24h = timezone.now() - timedelta(hours=24)
    since_7d = _since(7)
    security_events = ProductEvent.objects.filter(
        event_type=ProductEvent.EventType.SECURITY_EVENT_RECORDED
    )
    wrong_codes = DocumentFileActivity.objects.filter(
        action=DocumentFileActivity.Action.SHARE_CODE_FAILED
    )
    high_download_accounts = (
        DocumentFileActivity.objects.filter(
            action__in=[
                DocumentFileActivity.Action.FILE_DOWNLOADED,
                DocumentFileActivity.Action.SHARE_DOWNLOADED,
            ],
            created_at__gte=since_24h,
        )
        .values("owner")
        .annotate(total=Count("id"))
        .filter(total__gte=20)
        .count()
    )
    recent = security_events.order_by("-created_at")[:10]
    return {
        "failed_login_attempts_24h": security_events.filter(
            created_at__gte=since_24h,
            metadata__event_kind="failed_login_attempt",
        ).count(),
        "wrong_share_code_attempts_24h": wrong_codes.filter(
            created_at__gte=since_24h
        ).count(),
        "expired_link_access_attempts_24h": security_events.filter(
            created_at__gte=since_24h,
            metadata__event_kind="expired_share_link_access",
        ).count(),
        "revoked_link_access_attempts_24h": security_events.filter(
            created_at__gte=since_24h,
            metadata__event_kind="revoked_share_link_access",
        ).count(),
        "suspicious_events_count_7d": security_events.filter(
            created_at__gte=since_7d
        ).count()
        + wrong_codes.filter(created_at__gte=since_7d).count(),
        "high_download_accounts_count": high_download_accounts,
        "recent_security_events": [
            {
                "id": event.id,
                "event_kind": event.metadata.get("event_kind", "security_event"),
                "label": event.metadata.get("label", "Security event"),
                "object_type": event.object_type,
                "country": event.country,
                "created_at": event.created_at,
            }
            for event in recent
        ],
    }


def founder_user_queryset():
    onboarding = UserOnboardingState.objects.filter(
        user=OuterRef("pk"),
        has_completed_document_onboarding=True,
    )
    return User.objects.annotate(
        document_count=Count(
            "documents",
            filter=Q(documents__is_trashed=False),
            distinct=True,
        ),
        file_count=Count(
            "documents__files",
            filter=Q(documents__is_trashed=False, documents__files__is_trashed=False),
            distinct=True,
        ),
        reminder_count=Count("document_reminder_rules", distinct=True),
        checklist_count=Count("document_checklists", distinct=True),
        bundle_count=Count("document_bundles", distinct=True),
        share_link_count=Count("document_file_share_links", distinct=True),
        feedback_count=Count("feedback_items", distinct=True),
        onboarding_completed=Exists(onboarding),
    ).order_by("-date_joined")


def _safe_user_recent_activity(user) -> list[dict]:
    rows = (
        ProductEvent.objects.filter(user=user)
        .values("event_type")
        .annotate(count=Count("id"), last_seen_at=Max("created_at"))
        .order_by("-last_seen_at")[:10]
    )
    return [
        {
            "event_type": row["event_type"],
            "label": _event_label(row["event_type"]),
            "count": row["count"],
            "last_seen_at": row["last_seen_at"],
        }
        for row in rows
    ]


def build_founder_user_summary(user) -> dict:
    latest_deletion = AccountDeletionRequest.objects.filter(owner=user).first()
    try:
        onboarding_state = user.onboarding_state
    except UserOnboardingState.DoesNotExist:
        onboarding_state = None
    return {
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "date_joined": user.date_joined,
            "last_login": user.last_login,
            "is_staff": user.is_staff,
        },
        "onboarding": {
            "has_state": onboarding_state is not None,
            "has_completed_document_onboarding": bool(
                onboarding_state
                and onboarding_state.has_completed_document_onboarding
            ),
        },
        "counts": {
            "documents": Document.objects.filter(owner=user, is_trashed=False).count(),
            "files": DocumentFile.objects.filter(
                document__owner=user,
                document__is_trashed=False,
                is_trashed=False,
            ).count(),
            "reminders": DocumentReminderRule.objects.filter(owner=user).count(),
            "checklists": DocumentChecklist.objects.filter(owner=user).count(),
            "bundles": DocumentBundle.objects.filter(owner=user).count(),
            "share_links": DocumentFileShareLink.objects.filter(owner=user).count(),
            "exports": DocumentExportRequest.objects.filter(owner=user).count(),
            "feedback": FeedbackItem.objects.filter(user=user).count(),
            "emergency_packs": EmergencyAccessPack.objects.filter(owner=user).count(),
            "proof_records": ProofRecord.objects.filter(owner=user).count(),
        },
        "account_deletion_request": (
            {
                "id": latest_deletion.id,
                "status": latest_deletion.status,
                "requested_at": latest_deletion.requested_at,
                "scheduled_for": latest_deletion.scheduled_for,
            }
            if latest_deletion
            else None
        ),
        "plan": "private_beta",
        "safe_recent_activity_summary": _safe_user_recent_activity(user),
        "privacy_note": (
            "Founder support view intentionally excludes document titles, filenames, "
            "raw OCR text, private notes, physical locations, access codes, share "
            "tokens, and file paths."
        ),
    }


def active_checklist_templates():
    return DocumentChecklistTemplate.objects.prefetch_related("item_templates").order_by(
        "sort_order",
        "title",
    )
