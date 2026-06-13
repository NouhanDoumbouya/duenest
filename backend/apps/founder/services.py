"""Founder console service helpers.

The founder console should explain product health without exposing private
vault content. This module keeps those aggregate/query rules in one place.
"""

import logging
import secrets
import string
from datetime import timedelta
from typing import Any

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Exists, F, Max, Min, OuterRef, Q
from django.db.models.functions import TruncDate
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
from apps.documents.services import (
    LOW_CONFIDENCE_THRESHOLD,
    client_ip,
    compute_confidence,
    get_document_health,
)
from apps.users.models import AccountDeletionRequest, UserOnboardingState

from .models import (
    AppErrorLog,
    BetaUserProfile,
    FeatureCompletionItem,
    FeedbackItem,
    FounderAuditLog,
    InviteCode,
    InviteCodeUse,
    LaunchChecklistItem,
    ProductEvent,
    WaitlistEntry,
)


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


FEATURE_COMPLETION_DEFAULTS = [
    ("auth", "Auth", "Core", "ready", "critical", True, True, True, True, True),
    ("documents", "Documents", "Documents", "ready", "critical", True, True, True, True, True),
    ("files", "Files", "Documents", "ready", "critical", True, True, True, True, True),
    ("preview", "Preview", "Documents", "ready", "high", True, True, True, True, True),
    ("secure-sharing", "Secure Sharing", "Sharing", "ready", "high", True, True, True, True, True),
    ("attention-needed", "Attention Needed", "Documents", "ready", "high", True, True, True, True, True),
    ("reminders", "Reminders", "Documents", "ready", "high", True, True, True, True, True),
    ("bundles", "Bundles/Application Packs", "Packs", "ready", "high", True, True, True, True, True),
    ("trash-restore", "Trash/Restore", "Documents", "ready", "medium", True, True, True, True, True),
    ("emergency-access", "Emergency Access", "Sharing", "ready", "high", True, True, True, True, True),
    ("proof-submission", "Proof of Submission", "Documents", "ready", "medium", True, True, True, True, True),
    ("physical-location", "Physical Location", "Documents", "ready", "medium", True, True, True, True, True),
    ("export-backup", "Export/Backup", "Trust", "partial", "medium", True, True, True, True, False),
    ("trust-center", "Trust Center", "Trust", "ready", "medium", True, True, True, True, True),
    ("plan-limits", "Plan Limits", "Account", "ready", "medium", True, True, True, True, True),
    ("founder-console", "Founder Console", "Operations", "in_progress", "critical", True, True, False, False, False),
    ("private-beta", "Private Beta", "Operations", "in_progress", "high", True, True, False, False, False),
]

LAUNCH_CHECKLIST_DEFAULTS = [
    ("auth-ready", "Auth ready", "Authentication is stable and protected.", "critical"),
    ("upload-ready", "Upload ready", "File upload, validation, and storage flows work.", "critical"),
    ("preview-ready", "Preview ready", "Users can preview supported files safely.", "high"),
    ("sharing-ready", "Sharing ready", "Secure links, access codes, expiry, and revoke flows work.", "high"),
    ("trash-ready", "Trash ready", "Soft delete, restore, and permanent delete flows work.", "medium"),
    ("bundles-ready", "Bundles ready", "Application packs are usable for core workflows.", "high"),
    ("emergency-access-ready", "Emergency access ready", "Emergency packs expose only chosen records.", "high"),
    ("trust-center-ready", "Trust center ready", "Trust, security, and privacy pages are current.", "medium"),
    ("privacy-policy-ready", "Privacy policy ready", "Privacy policy is published and accurate.", "high"),
    ("terms-ready", "Terms ready", "Terms are published and accurate.", "high"),
    ("backup-strategy-ready", "Backup strategy ready", "Data export and operational backup story is clear.", "medium"),
    ("error-monitoring-ready", "Error monitoring ready", "Founder can see errors and failures.", "high"),
    ("demo-account-ready", "Demo account ready", "Demo account and sample journey are prepared.", "medium"),
    ("support-contact-ready", "Support contact ready", "Feedback and support paths are working.", "medium"),
    ("deployment-ready", "Deployment ready", "Production deploy settings are ready.", "critical"),
    ("founder-console-ready", "Founder console ready", "Founder Console V1 is private, useful, and polished.", "critical"),
]


class InviteCodeError(ValueError):
    """Raised when an invite code cannot be used for private-beta signup."""


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


def log_founder_action(
    *,
    request,
    action: str,
    object_type: str = "",
    object_id: Any = "",
    metadata: dict | None = None,
) -> None:
    """Best-effort founder/admin audit entry; never expose sensitive metadata."""
    try:
        actor = getattr(request, "user", None)
        if not getattr(actor, "is_authenticated", False):
            actor = None
        FounderAuditLog.objects.create(
            actor=actor,
            action=action[:120],
            object_type=object_type[:80],
            object_id=str(object_id)[:80] if object_id not in {None, ""} else "",
            path=request.path[:255],
            method=request.method[:12],
            metadata=sanitize_metadata(metadata or {}),
        )
    except Exception:  # noqa: BLE001 - audit should not break founder workflows
        logger.warning("Failed to record founder audit log", exc_info=True)


def normalize_invite_code(value: str) -> str:
    """Normalize user-entered invite codes without preserving whitespace."""
    raw = (value or "").strip().upper()
    normalized = "".join(char for char in raw if char.isalnum() or char == "-")
    if not normalized:
        raise InviteCodeError("Invite code is required.")
    return normalized[:40]


def generate_invite_code() -> str:
    alphabet = string.ascii_uppercase.replace("O", "").replace("I", "") + "23456789"
    for _ in range(20):
        token = "".join(secrets.choice(alphabet) for _ in range(10))
        code = f"DN-{token[:5]}-{token[5:]}"
        if not InviteCode.objects.filter(code=code).exists():
            return code
    raise InviteCodeError("Unable to generate a unique invite code.")


def _invite_error_message(invite: InviteCode | None) -> str:
    if invite is None:
        return "Invite code is invalid or no longer available."
    if not invite.is_active:
        return "This invite code has been disabled."
    if invite.is_expired:
        return "This invite code has expired."
    if invite.remaining_uses <= 0:
        return "This invite code has already been fully used."
    return ""


def get_usable_invite_code(code: str) -> InviteCode:
    normalized = normalize_invite_code(code)
    invite = InviteCode.objects.filter(code=normalized).first()
    message = _invite_error_message(invite)
    if message:
        raise InviteCodeError(message)
    return invite


def send_waitlist_confirmation_email(entry: WaitlistEntry) -> None:
    """
    Placeholder email hook for future transactional email integration.

    DueNest does not have an email provider wired yet, so this intentionally
    logs only safe operational context and never blocks waitlist submission.
    """
    logger.info("Waitlist confirmation email deferred for entry %s", entry.id)


def send_invite_email(invite: InviteCode, entry: WaitlistEntry | None = None) -> None:
    """Placeholder invite email hook until a provider is configured."""
    logger.info(
        "Invite email deferred for invite %s waitlist_entry=%s",
        invite.id,
        entry.id if entry else None,
    )


def create_invite_code(
    *,
    label: str,
    created_by=None,
    request=None,
    waitlist_entry: WaitlistEntry | None = None,
    code: str = "",
    max_uses: int = 1,
    expires_at=None,
    is_active: bool = True,
    persona_target: str = "",
    notes: str = "",
) -> InviteCode:
    if not code:
        code = generate_invite_code()
    else:
        code = normalize_invite_code(code)
    if not label and waitlist_entry is not None:
        label = f"Invite for {waitlist_entry.full_name}"
    if not persona_target and waitlist_entry is not None:
        persona_target = waitlist_entry.persona

    invite = InviteCode.objects.create(
        code=code,
        label=label.strip() or "Private beta invite",
        created_by=created_by if getattr(created_by, "is_authenticated", False) else None,
        max_uses=max_uses,
        expires_at=expires_at,
        is_active=is_active,
        persona_target=persona_target,
        notes=notes,
    )

    if waitlist_entry is not None:
        waitlist_entry.status = WaitlistEntry.Status.INVITED
        waitlist_entry.invite_code = invite
        waitlist_entry.invited_by = invite.created_by
        waitlist_entry.invited_at = timezone.now()
        waitlist_entry.save(
            update_fields=[
                "status",
                "invite_code",
                "invited_by",
                "invited_at",
                "updated_at",
            ]
        )
        send_invite_email(invite, waitlist_entry)

    track_product_event(
        event_type=ProductEvent.EventType.INVITE_CREATED,
        user=invite.created_by,
        request=request,
        object_type="invite_code",
        object_id=invite.id,
        metadata={
            "persona_target": invite.persona_target,
            "has_waitlist_entry": waitlist_entry is not None,
        },
    )
    if request is not None:
        log_founder_action(
            request=request,
            action="founder_created_invite",
            object_type="invite_code",
            object_id=invite.id,
            metadata={
                "persona_target": invite.persona_target,
                "waitlist_entry_id": waitlist_entry.id if waitlist_entry else "",
            },
        )
    return invite


def _beta_persona_from_waitlist(persona: str) -> str:
    if persona == WaitlistEntry.Persona.FAMILY_DOCUMENTS:
        return BetaUserProfile.Persona.FAMILY_USER
    values = {choice.value for choice in BetaUserProfile.Persona}
    return persona if persona in values else BetaUserProfile.Persona.OTHER


def consume_invite_code_for_signup(
    *,
    code: str,
    user,
    email: str,
    request=None,
    metadata: dict | None = None,
) -> InviteCodeUse:
    normalized = normalize_invite_code(code)
    email_value = (email or "").strip().lower()
    with transaction.atomic():
        invite = InviteCode.objects.select_for_update().filter(code=normalized).first()
        message = _invite_error_message(invite)
        if message:
            raise InviteCodeError(message)

        waitlist_entry = (
            WaitlistEntry.objects.select_for_update()
            .filter(
                email__iexact=email_value,
                status__in=[
                    WaitlistEntry.Status.PENDING,
                    WaitlistEntry.Status.INVITED,
                ],
            )
            .order_by("-created_at")
            .first()
        )

        use = InviteCodeUse.objects.create(
            invite_code=invite,
            user=user,
            waitlist_entry=waitlist_entry,
            email=email_value,
            metadata=sanitize_metadata(metadata or {}),
        )
        InviteCode.objects.filter(pk=invite.pk).update(
            used_count=F("used_count") + 1,
            updated_at=timezone.now(),
        )

        if waitlist_entry is not None:
            waitlist_entry.status = WaitlistEntry.Status.ACCEPTED
            waitlist_entry.accepted_user = user
            waitlist_entry.accepted_at = timezone.now()
            if waitlist_entry.invite_code_id is None:
                waitlist_entry.invite_code = invite
            waitlist_entry.save(
                update_fields=[
                    "status",
                    "accepted_user",
                    "accepted_at",
                    "invite_code",
                    "updated_at",
                ]
            )

        profile, _ = BetaUserProfile.objects.get_or_create(user=user)
        profile.invite_status = BetaUserProfile.InviteStatus.ACCEPTED
        if waitlist_entry is not None:
            profile.persona = _beta_persona_from_waitlist(waitlist_entry.persona)
            profile.invited_at = waitlist_entry.invited_at
        elif invite.persona_target:
            profile.persona = _beta_persona_from_waitlist(invite.persona_target)
        if profile.activated_at is None:
            profile.activated_at = timezone.now()
        profile.save(
            update_fields=[
                "invite_status",
                "persona",
                "invited_at",
                "activated_at",
                "updated_at",
            ]
        )

    track_product_event(
        event_type=ProductEvent.EventType.INVITE_USED,
        user=user,
        request=request,
        object_type="invite_code",
        object_id=invite.id,
        metadata={"persona_target": invite.persona_target},
    )
    track_product_event(
        event_type=ProductEvent.EventType.PRIVATE_BETA_SIGNUP_COMPLETED,
        user=user,
        request=request,
        object_type="user",
        object_id=user.id,
        metadata=metadata or {},
    )
    return use


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


def _range_config(range_key: str | None) -> tuple[str, int | None]:
    if range_key == "7d":
        return "7d", 7
    if range_key == "90d":
        return "90d", 90
    if range_key == "all":
        return "all", None
    return "30d", 30


def _range_since(days: int | None):
    return None if days is None else _since(days)


def _date_span(since, *, fallback_days: int = 30) -> list:
    today = timezone.localdate()
    if since is None:
        first_event = ProductEvent.objects.aggregate(value=Min("created_at"))["value"]
        first_user = User.objects.aggregate(value=Min("date_joined"))["value"]
        candidates = [value.date() for value in [first_event, first_user] if value]
        start = min(candidates) if candidates else today - timedelta(days=fallback_days - 1)
        # Keep all-time charts readable for early SaaS scale.
        if (today - start).days > 365:
            start = today - timedelta(days=364)
    else:
        start = since.date()
    days = max((today - start).days + 1, 1)
    return [start + timedelta(days=offset) for offset in range(days)]


def _count_by_date(queryset, date_field: str, dates: list) -> list[dict]:
    rows = (
        queryset.annotate(day=TruncDate(date_field))
        .values("day")
        .annotate(count=Count("id"))
    )
    counts = {row["day"]: row["count"] for row in rows}
    return [
        {"date": day.isoformat(), "count": counts.get(day, 0)}
        for day in dates
    ]


def _distinct_user_count_by_date(queryset, date_field: str, dates: list) -> list[dict]:
    rows = (
        queryset.exclude(user__isnull=True)
        .annotate(day=TruncDate(date_field))
        .values("day")
        .annotate(count=Count("user", distinct=True))
    )
    counts = {row["day"]: row["count"] for row in rows}
    return [
        {"date": day.isoformat(), "count": counts.get(day, 0)}
        for day in dates
    ]


def _apply_since(queryset, field: str, since):
    return queryset if since is None else queryset.filter(**{f"{field}__gte": since})


def ensure_feature_completion_defaults() -> None:
    existing = set(FeatureCompletionItem.objects.values_list("key", flat=True))
    items = []
    for index, default in enumerate(FEATURE_COMPLETION_DEFAULTS, start=1):
        (
            key,
            name,
            module,
            status,
            priority,
            backend_done,
            frontend_done,
            tests_done,
            docs_done,
            polished,
        ) = default
        if key in existing:
            continue
        items.append(
            FeatureCompletionItem(
                key=key,
                feature_name=name,
                module=module,
                status=status,
                priority=priority,
                backend_done=backend_done,
                frontend_done=frontend_done,
                tests_done=tests_done,
                docs_done=docs_done,
                polished=polished,
                sort_order=index,
            )
        )
    FeatureCompletionItem.objects.bulk_create(items, ignore_conflicts=True)


def ensure_launch_checklist_defaults() -> None:
    existing = set(LaunchChecklistItem.objects.values_list("key", flat=True))
    items = []
    for index, (key, label, description, priority) in enumerate(
        LAUNCH_CHECKLIST_DEFAULTS,
        start=1,
    ):
        if key in existing:
            continue
        items.append(
            LaunchChecklistItem(
                key=key,
                label=label,
                description=description,
                priority=priority,
                sort_order=index,
            )
        )
    LaunchChecklistItem.objects.bulk_create(items, ignore_conflicts=True)


def ensure_beta_profiles_for_users() -> None:
    profiled_ids = set(BetaUserProfile.objects.values_list("user_id", flat=True))
    profiles = [
        BetaUserProfile(user=user)
        for user in User.objects.exclude(id__in=profiled_ids).only("id")
    ]
    BetaUserProfile.objects.bulk_create(profiles, ignore_conflicts=True)


def launch_readiness_summary() -> dict:
    ensure_launch_checklist_defaults()
    total = LaunchChecklistItem.objects.count()
    complete = LaunchChecklistItem.objects.filter(is_complete=True).count()
    percent = 0 if total == 0 else round((complete / total) * 100)
    return {
        "total": total,
        "complete": complete,
        "percent": percent,
    }


def build_private_beta_metrics() -> dict:
    waitlist = WaitlistEntry.objects.all()
    invites = InviteCode.objects.all()
    now = timezone.now()
    invited_or_accepted = waitlist.filter(
        status__in=[WaitlistEntry.Status.INVITED, WaitlistEntry.Status.ACCEPTED]
    ).count()
    accepted = waitlist.filter(status=WaitlistEntry.Status.ACCEPTED).count()
    conversion = (
        0 if invited_or_accepted == 0 else round((accepted / invited_or_accepted) * 100)
    )
    persona_rows = (
        waitlist.values("persona")
        .annotate(count=Count("id"))
        .order_by("persona")
    )
    return {
        "total_waitlist_entries": waitlist.count(),
        "pending_waitlist_entries": waitlist.filter(
            status=WaitlistEntry.Status.PENDING
        ).count(),
        "invited_waitlist_entries": waitlist.filter(
            status=WaitlistEntry.Status.INVITED
        ).count(),
        "accepted_waitlist_entries": accepted,
        "rejected_waitlist_entries": waitlist.filter(
            status=WaitlistEntry.Status.REJECTED
        ).count(),
        "waitlist_by_persona": [
            {
                "key": row["persona"],
                "label": WaitlistEntry.Persona(row["persona"]).label,
                "count": row["count"],
            }
            for row in persona_rows
        ],
        "active_invite_codes": invites.filter(is_active=True)
        .filter(Q(expires_at__isnull=True) | Q(expires_at__gt=now))
        .filter(used_count__lt=F("max_uses"))
        .count(),
        "expired_invite_codes": invites.filter(
            expires_at__isnull=False,
            expires_at__lte=now,
        ).count(),
        "disabled_invite_codes": invites.filter(is_active=False).count(),
        "used_invite_codes": invites.filter(used_count__gt=0).count(),
        "total_invite_uses": InviteCodeUse.objects.count(),
        "invite_conversion_percent": conversion,
        "recent_waitlist_entries": [
            {
                "id": entry.id,
                "full_name": entry.full_name,
                "email": entry.email,
                "persona": entry.persona,
                "status": entry.status,
                "country": entry.country,
                "created_at": entry.created_at,
            }
            for entry in waitlist.order_by("-created_at")[:8]
        ],
    }


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


def build_founder_dashboard(range_key: str | None = None) -> dict:
    selected_range, range_days = _range_config(range_key)
    today = _today_start()
    since_7d = _since(7)
    since_30d = _since(30)
    since_range = _range_since(range_days)

    open_feedback = FeedbackItem.objects.exclude(
        status__in=[FeedbackItem.Status.CLOSED, FeedbackItem.Status.REJECTED]
    )
    beta = beta_user_summary()
    security_events = ProductEvent.objects.filter(
        event_type=ProductEvent.EventType.SECURITY_EVENT_RECORDED
    )
    launch = launch_readiness_summary()
    completion = feature_completion_summary()
    private_beta = build_private_beta_metrics()

    return {
        "range_key": selected_range,
        "range_days": range_days,
        "total_users": User.objects.count(),
        "new_users_today": User.objects.filter(date_joined__gte=today).count(),
        "new_users_7d": User.objects.filter(date_joined__gte=since_7d).count(),
        "new_users_30d": User.objects.filter(date_joined__gte=since_30d).count(),
        "new_users_in_range": _apply_since(
            User.objects.all(), "date_joined", since_range
        ).count(),
        "active_users_today": _active_users_since(today),
        "active_users_7d": _active_users_since(since_7d),
        "active_users_30d": _active_users_since(since_30d),
        "active_users_in_range": (
            User.objects.count()
            if since_range is None
            else _active_users_since(since_range)
        ),
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
        "security_events_count": security_events.count(),
        "security_events_in_range": _apply_since(
            security_events,
            "created_at",
            since_range,
        ).count(),
        "beta_users": beta["beta_users"],
        "active_beta_users": beta["active_beta_users"],
        "total_waitlist_entries": private_beta["total_waitlist_entries"],
        "pending_waitlist_entries": private_beta["pending_waitlist_entries"],
        "accepted_waitlist_entries": private_beta["accepted_waitlist_entries"],
        "active_invite_codes": private_beta["active_invite_codes"],
        "invite_conversion_percent": private_beta["invite_conversion_percent"],
        "launch_readiness_percent": launch["percent"],
        "feature_completion_percent": completion["percent"],
        "recent_activity_summary": _recent_activity_summary(),
    }


def _attention_breakdown() -> list[dict]:
    counts = {
        "expired": 0,
        "expiring_soon": 0,
        "missing_file": 0,
        "missing_expiry_date": 0,
        "renewal_due": 0,
        "low_confidence": 0,
    }
    documents = (
        Document.objects.filter(is_trashed=False)
        .exclude(status=Document.Status.ARCHIVED)
        .annotate(file_count=Count("files", filter=Q(files__is_trashed=False)))
    )
    for document in documents:
        health = get_document_health(document)
        if health.computed_status in counts:
            counts[health.computed_status] += 1
        if compute_confidence(document, health=health).score < LOW_CONFIDENCE_THRESHOLD:
            counts["low_confidence"] += 1
    labels = {
        "expired": "Expired",
        "expiring_soon": "Expiring soon",
        "missing_file": "Missing file",
        "missing_expiry_date": "Missing expiry date",
        "renewal_due": "Renewal due",
        "low_confidence": "Low confidence",
    }
    return [
        {"key": key, "label": labels[key], "count": value}
        for key, value in counts.items()
    ]


def build_founder_analytics(range_key: str | None = None) -> dict:
    selected_range, range_days = _range_config(range_key)
    since = _range_since(range_days)
    dates = _date_span(since)

    users = _apply_since(User.objects.all(), "date_joined", since)
    documents = _apply_since(
        Document.objects.filter(is_trashed=False),
        "created_at",
        since,
    )
    files = _apply_since(
        DocumentFile.objects.filter(is_trashed=False),
        "created_at",
        since,
    )
    errors = _apply_since(AppErrorLog.objects.all(), "created_at", since)
    security_events = _apply_since(
        ProductEvent.objects.filter(
            event_type=ProductEvent.EventType.SECURITY_EVENT_RECORDED
        ),
        "created_at",
        since,
    )

    feedback_categories = (
        _apply_since(FeedbackItem.objects.all(), "created_at", since)
        .values("category")
        .annotate(count=Count("id"))
        .order_by("category")
    )

    return {
        "range_key": selected_range,
        "range_days": range_days,
        "series": {
            "user_growth": _count_by_date(users, "date_joined", dates),
            "active_users": _distinct_user_count_by_date(
                _apply_since(ProductEvent.objects.all(), "created_at", since),
                "created_at",
                dates,
            ),
            "documents_created": _count_by_date(documents, "created_at", dates),
            "files_uploaded": _count_by_date(files, "created_at", dates),
            "errors": _count_by_date(errors, "created_at", dates),
            "security_events": _count_by_date(security_events, "created_at", dates),
        },
        "attention_breakdown": _attention_breakdown(),
        "feedback_categories": [
            {
                "key": row["category"],
                "label": FeedbackItem.Category(row["category"]).label,
                "count": row["count"],
            }
            for row in feedback_categories
        ],
        "failure_breakdown": [
            {
                "key": row["error_type"] or "unknown",
                "label": row["error_type"] or "Unknown",
                "count": row["count"],
            }
            for row in errors.values("error_type")
            .annotate(count=Count("id"))
            .order_by("-count")[:12]
        ],
        "privacy_note": (
            "Founder analytics use aggregate product events and metadata. They "
            "do not include document contents, file previews, private notes, "
            "access codes, share tokens, or raw OCR text."
        ),
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


def feature_completion_summary() -> dict:
    ensure_feature_completion_defaults()
    total = FeatureCompletionItem.objects.count()
    ready = FeatureCompletionItem.objects.filter(
        backend_done=True,
        frontend_done=True,
        tests_done=True,
        docs_done=True,
        polished=True,
    ).count()
    return {
        "total": total,
        "ready": ready,
        "percent": 0 if total == 0 else round((ready / total) * 100),
    }


def beta_user_summary() -> dict:
    ensure_beta_profiles_for_users()
    beta_profiles = BetaUserProfile.objects.exclude(
        invite_status=BetaUserProfile.InviteStatus.NOT_INVITED
    )
    active_profiles = beta_profiles.filter(
        invite_status__in=[
            BetaUserProfile.InviteStatus.ACCEPTED,
            BetaUserProfile.InviteStatus.ACTIVE,
        ]
    )
    return {
        "total_profiles": BetaUserProfile.objects.count(),
        "beta_users": beta_profiles.count(),
        "active_beta_users": active_profiles.count(),
    }


def build_country_activity(range_key: str | None = None) -> dict:
    selected_range, range_days = _range_config(range_key)
    since = _range_since(range_days)
    queryset = _apply_since(ProductEvent.objects.all(), "created_at", since).exclude(
        country=""
    )
    rows = (
        queryset.values("country")
        .annotate(
            active_users=Count("user", distinct=True),
            new_signups=Count(
                "id",
                filter=Q(event_type=ProductEvent.EventType.USER_SIGNED_UP),
            ),
            documents_created=Count(
                "id",
                filter=Q(event_type=ProductEvent.EventType.DOCUMENT_CREATED),
            ),
            share_access=Count(
                "id",
                filter=Q(event_type=ProductEvent.EventType.SHARE_LINK_OPENED),
            ),
            security_events=Count(
                "id",
                filter=Q(event_type=ProductEvent.EventType.SECURITY_EVENT_RECORDED),
            ),
            total_events=Count("id"),
            last_seen_at=Max("created_at"),
        )
        .order_by("-total_events", "country")[:100]
    )
    return {
        "range_key": selected_range,
        "range_days": range_days,
        "countries": list(rows),
        "privacy_note": (
            "Country activity is aggregated from approximate product-event "
            "metadata. DueNest does not use GPS, street-level location, or raw "
            "IP addresses in this founder view."
        ),
    }


def active_checklist_templates():
    return DocumentChecklistTemplate.objects.prefetch_related("item_templates").order_by(
        "sort_order",
        "title",
    )
