from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMultiAlternatives
from django.db import IntegrityError, transaction
from django.template.loader import render_to_string
from django.utils import timezone

from .models import Notification, NotificationPreference

logger = logging.getLogger("duenest.notifications")

SENSITIVE_METADATA_KEYS = {
    "access_code",
    "access_code_hash",
    "token",
    "share_token",
    "emergency_token",
    "file_path",
    "path",
    "ocr_text",
    "raw_text",
    "notes",
    "private_notes",
    "wrapped_dek",
    "kek",
    "dek",
    "password",
    "secret",
}


@dataclass(frozen=True)
class NotificationCandidate:
    user: object
    type: str
    title: str
    message: str
    severity: str
    source_type: str
    source_id: str
    action_url: str
    scheduled_for: datetime
    dedupe_key: str
    metadata: dict


def get_preferences(user) -> NotificationPreference:
    prefs, _ = NotificationPreference.objects.get_or_create(user=user)
    return prefs


def _tz_for_preferences(prefs: NotificationPreference) -> ZoneInfo:
    try:
        return ZoneInfo(prefs.timezone or "UTC")
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


def _local_today(user, now: datetime) -> tuple[date, ZoneInfo]:
    prefs = get_preferences(user)
    tzinfo = _tz_for_preferences(prefs)
    return now.astimezone(tzinfo).date(), tzinfo


def _scheduled_datetime(value: date, tzinfo: ZoneInfo) -> datetime:
    local = datetime.combine(value, time(hour=9), tzinfo=tzinfo)
    return local.astimezone(dt_timezone.utc)


def _safe_action_url(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    if not value.startswith("/") or value.startswith("//"):
        return "/dashboard"
    lowered = value.lower()
    if any(term in lowered for term in ("access_code", "token=", "grant=")):
        return "/dashboard"
    return value[:500]


def sanitize_metadata(value, *, _depth=0):
    if _depth > 4:
        return {}
    if isinstance(value, dict):
        clean = {}
        for key, item in value.items():
            key_text = str(key)
            if key_text.lower() in SENSITIVE_METADATA_KEYS:
                continue
            if isinstance(item, (str, int, float, bool)) or item is None:
                clean[key_text[:80]] = item
            elif isinstance(item, (dict, list)):
                clean[key_text[:80]] = sanitize_metadata(item, _depth=_depth + 1)
        return clean
    if isinstance(value, list):
        return [sanitize_metadata(item, _depth=_depth + 1) for item in value[:20]]
    return value if isinstance(value, (str, int, float, bool)) or value is None else ""


def _category_for_type(notification_type: str) -> str:
    if notification_type.startswith("document_"):
        return "document"
    if notification_type.startswith("subscription_"):
        return "subscription"
    if notification_type.startswith(("bundle_", "checklist_")):
        return "checklist_bundle"
    if notification_type.startswith("organization_"):
        return "organization"
    if notification_type.startswith(("emergency_",)):
        return "emergency"
    if notification_type in {
        Notification.Type.SECURITY_ALERT,
        Notification.Type.FAILED_LOGIN_WARNING,
    }:
        return "security"
    return "activity" if notification_type.endswith("_viewed") else "generic"


def _preference_allows(prefs: NotificationPreference, notification_type: str) -> bool:
    category = _category_for_type(notification_type)
    if category == "document":
        return prefs.document_reminders_enabled
    if category == "subscription":
        return prefs.subscription_reminders_enabled
    if category == "checklist_bundle":
        return prefs.checklist_bundle_reminders_enabled
    if category == "organization":
        return prefs.organization_reminders_enabled
    if category == "emergency":
        return prefs.emergency_reminders_enabled
    if category == "security":
        return True
    if category == "activity":
        return prefs.activity_notifications_enabled
    return True


def _lead_days(prefs: NotificationPreference, fallback=None) -> list[int]:
    fallback = fallback or [90, 30, 7, 1]
    raw = prefs.default_reminder_lead_days or fallback
    cleaned = []
    for item in raw:
        try:
            days = int(item)
        except (TypeError, ValueError):
            continue
        if 0 <= days <= 365 and days not in cleaned:
            cleaned.append(days)
    return cleaned or fallback


def _is_due(remind_on: date, today: date, *, target_date: date | None = None) -> bool:
    if remind_on > today:
        return False
    if target_date is not None and target_date < today:
        return False
    catchup_days = max(0, int(getattr(settings, "NOTIFICATION_REMINDER_CATCHUP_DAYS", 3)))
    return (today - remind_on).days <= catchup_days


def _candidate(
    *,
    user,
    notification_type: str,
    title: str,
    message: str,
    severity: str,
    source_type: str,
    source_id: int | str,
    action_url: str,
    scheduled_for: datetime,
    dedupe_key: str,
    metadata: dict | None = None,
) -> NotificationCandidate:
    return NotificationCandidate(
        user=user,
        type=notification_type,
        title=title[:255],
        message=message,
        severity=severity,
        source_type=source_type[:80],
        source_id=str(source_id or "")[:64],
        action_url=_safe_action_url(action_url),
        scheduled_for=scheduled_for,
        dedupe_key=dedupe_key[:255],
        metadata=sanitize_metadata(metadata or {}),
    )


def create_notification(candidate: NotificationCandidate) -> tuple[Notification, bool]:
    defaults = {
        "type": candidate.type,
        "title": candidate.title,
        "message": candidate.message,
        "severity": candidate.severity,
        "source_type": candidate.source_type,
        "source_id": candidate.source_id,
        "action_url": candidate.action_url,
        "scheduled_for": candidate.scheduled_for,
        "metadata": candidate.metadata,
    }
    try:
        with transaction.atomic():
            notification, created = Notification.objects.get_or_create(
                user=candidate.user,
                dedupe_key=candidate.dedupe_key,
                defaults=defaults,
            )
    except IntegrityError:
        notification = Notification.objects.get(dedupe_key=candidate.dedupe_key)
        created = False
    return notification, created


def _email_copy(notification: Notification) -> tuple[str, str]:
    kind = notification.type
    if kind in {
        Notification.Type.DOCUMENT_EXPIRY,
        Notification.Type.DOCUMENT_RENEWAL,
        Notification.Type.DOCUMENT_MISSING_FILE,
        Notification.Type.DOCUMENT_REVIEW_NEEDED,
    }:
        return (
            "Reminder: a document needs your attention",
            "DueNest noticed that one of your documents needs attention.",
        )
    if kind in {
        Notification.Type.SUBSCRIPTION_RENEWAL,
        Notification.Type.SUBSCRIPTION_CANCELLATION,
        Notification.Type.SUBSCRIPTION_TRIAL,
    }:
        return (
            "Reminder: review an upcoming subscription date",
            "One of your tracked subscriptions has an upcoming renewal or cancellation date.",
        )
    if kind in {
        Notification.Type.BUNDLE_DEADLINE,
        Notification.Type.BUNDLE_INCOMPLETE,
        Notification.Type.CHECKLIST_ITEM_DUE,
        Notification.Type.CHECKLIST_MISSING_FILE,
    }:
        return (
            "Reminder: an application or checklist item needs attention",
            "A tracked checklist or bundle has an upcoming deadline or missing requirement.",
        )
    if kind.startswith("organization_"):
        return (
            "Reminder: an organization task needs attention",
            "A shared organization workspace has a deadline or review task for you.",
        )
    if kind.startswith("emergency_"):
        return (
            "Reminder: review emergency access",
            "DueNest recommends reviewing your emergency access setup or an upcoming expiry.",
        )
    if kind in {Notification.Type.SECURITY_ALERT, Notification.Type.FAILED_LOGIN_WARNING}:
        return (
            "Security alert from DueNest",
            "DueNest recorded a security-related account event. Open DueNest to review it.",
        )
    return (
        "Reminder from DueNest",
        "DueNest found something that may need your attention.",
    )


def send_notification_email(notification: Notification) -> None:
    if not notification.user.email:
        raise ValueError("missing_recipient")
    subject, safe_message = _email_copy(notification)
    action_url = notification.action_url or "/dashboard/notifications"
    app_base = getattr(settings, "DUENEST_APP_BASE_URL", "http://localhost:3000").rstrip("/")
    context = {
        "subject": subject,
        "safe_message": safe_message,
        "due_date": notification.metadata.get("target_date")
        or notification.metadata.get("reminder_date")
        or "",
        "action_url": f"{app_base}{action_url}",
        "preferences_url": f"{app_base}/dashboard/notifications/settings",
    }
    text_body = render_to_string("emails/notification_reminder.txt", context)
    html_body = render_to_string("emails/notification_reminder.html", context)
    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[notification.user.email],
    )
    message.attach_alternative(html_body, "text/html")
    message.send(fail_silently=False)


def deliver_notification(notification: Notification, *, now=None) -> bool:
    now = now or timezone.now()
    prefs = get_preferences(notification.user)
    if not _preference_allows(prefs, notification.type):
        return False

    changed = False
    if prefs.in_app_enabled and notification.delivered_in_app_at is None:
        notification.delivered_in_app_at = now
        changed = True

    should_email = (
        prefs.email_enabled
        and notification.delivered_email_at is None
        and notification.email_attempts < 3
    )
    if notification.type in {
        Notification.Type.SECURITY_ALERT,
        Notification.Type.FAILED_LOGIN_WARNING,
    }:
        should_email = should_email and prefs.security_alerts_enabled

    email_failed = False
    if should_email:
        notification.email_attempts += 1
        try:
            send_notification_email(notification)
            notification.delivered_email_at = now
            notification.email_last_error = ""
            changed = True
        except Exception:  # noqa: BLE001 - safe status only, no body/details
            notification.email_last_error = "send_failed"
            email_failed = True
            changed = True
            logger.warning(
                "notification_email_failed notification_id=%s user_id=%s type=%s",
                notification.id,
                notification.user_id,
                notification.type,
            )

    if notification.status in {
        Notification.Status.PENDING,
        Notification.Status.FAILED,
    }:
        notification.status = (
            Notification.Status.FAILED if email_failed else Notification.Status.DELIVERED
        )
        changed = True

    if changed:
        notification.save(
            update_fields=[
                "delivered_in_app_at",
                "delivered_email_at",
                "email_attempts",
                "email_last_error",
                "status",
                "updated_at",
            ]
        )
    return changed


def _document_candidates(user, today: date, tzinfo: ZoneInfo):
    from apps.documents.models import Document, DocumentExtraction, DocumentReminderRule
    from apps.documents.services import reminder_date_for_rule

    prefs = get_preferences(user)
    if not prefs.document_reminders_enabled:
        return
    documents = Document.objects.filter(owner=user, is_trashed=False).exclude(
        status=Document.Status.ARCHIVED
    )
    rule_doc_ids = set(
        DocumentReminderRule.objects.filter(owner=user, is_enabled=True).values_list(
            "document_id", flat=True
        )
    )
    rules = (
        DocumentReminderRule.objects.filter(owner=user, is_enabled=True)
        .select_related("document")
        .filter(document__is_trashed=False)
        .exclude(document__status=Document.Status.ARCHIVED)
    )
    for rule in rules:
        remind_on = reminder_date_for_rule(rule)
        if remind_on is None:
            continue
        doc = rule.document
        target = (
            doc.renewal_date
            if rule.trigger_type == DocumentReminderRule.TriggerType.BEFORE_RENEWAL_DATE
            else doc.expiry_date
        )
        if not _is_due(remind_on, today, target_date=target):
            continue
        is_renewal = rule.trigger_type == DocumentReminderRule.TriggerType.BEFORE_RENEWAL_DATE
        ntype = Notification.Type.DOCUMENT_RENEWAL if is_renewal else Notification.Type.DOCUMENT_EXPIRY
        yield _candidate(
            user=user,
            notification_type=ntype,
            title=f"{doc.title} {'renewal date' if is_renewal else 'expiry'} is coming up",
            message="Open the document and plan the next step.",
            severity=Notification.Severity.URGENT if target == today else Notification.Severity.WARNING,
            source_type="document",
            source_id=doc.id,
            action_url=f"/dashboard/documents/{doc.id}?tab=renewal",
            scheduled_for=_scheduled_datetime(remind_on, tzinfo),
            dedupe_key=(
                f"{ntype}:{user.id}:{doc.id}:{rule.days_before}:{target}"
            ),
            metadata={
                "target_date": target.isoformat() if target else "",
                "reminder_date": remind_on.isoformat(),
                "lead_days": rule.days_before,
            },
        )

    for doc in documents.exclude(id__in=rule_doc_ids):
        for source, ntype in (
            (doc.expiry_date, Notification.Type.DOCUMENT_EXPIRY),
            (doc.renewal_date, Notification.Type.DOCUMENT_RENEWAL),
        ):
            if source is None:
                continue
            for days in _lead_days(prefs):
                remind_on = source - timedelta(days=days)
                if not _is_due(remind_on, today, target_date=source):
                    continue
                label = "renewal date" if ntype == Notification.Type.DOCUMENT_RENEWAL else "expiry"
                yield _candidate(
                    user=user,
                    notification_type=ntype,
                    title=f"{doc.title} {label} is coming up",
                    message="Open the document and plan the next step.",
                    severity=Notification.Severity.URGENT if source == today else Notification.Severity.WARNING,
                    source_type="document",
                    source_id=doc.id,
                    action_url=f"/dashboard/documents/{doc.id}?tab=renewal",
                    scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                    dedupe_key=f"{ntype}:{user.id}:{doc.id}:{days}:{source}",
                    metadata={
                        "target_date": source.isoformat(),
                        "reminder_date": remind_on.isoformat(),
                        "lead_days": days,
                    },
                )

    for doc in documents:
        if not doc.files.filter(is_trashed=False).exists():
            yield _candidate(
                user=user,
                notification_type=Notification.Type.DOCUMENT_MISSING_FILE,
                title=f"{doc.title} needs a file attached",
                message="Add a file so DueNest can keep the document record complete.",
                severity=Notification.Severity.INFO,
                source_type="document",
                source_id=doc.id,
                action_url=f"/dashboard/documents/{doc.id}",
                scheduled_for=_scheduled_datetime(today, tzinfo),
                dedupe_key=f"document_missing_file:{user.id}:{doc.id}",
                metadata={"target_date": today.isoformat()},
            )

    for extraction in DocumentExtraction.objects.select_related("document").filter(
        owner=user,
        extraction_status=DocumentExtraction.Status.NEEDS_REVIEW,
        reviewed_at__isnull=True,
        applied_at__isnull=True,
        document__is_trashed=False,
    ).exclude(document__status=Document.Status.ARCHIVED):
        yield _candidate(
            user=user,
            notification_type=Notification.Type.DOCUMENT_REVIEW_NEEDED,
            title=f"Review suggested details for {extraction.document.title}",
            message="A document detail extraction is waiting for your review.",
            severity=Notification.Severity.INFO,
            source_type="document_extraction",
            source_id=extraction.id,
            action_url=f"/dashboard/documents/{extraction.document_id}?tab=files",
            scheduled_for=extraction.created_at,
            dedupe_key=f"document_review_needed:{user.id}:{extraction.id}",
            metadata={"document_id": extraction.document_id},
        )


def _subscription_candidates(user, today: date, tzinfo: ZoneInfo):
    from apps.subscriptions.models import Subscription

    prefs = get_preferences(user)
    if not prefs.subscription_reminders_enabled:
        return
    subscriptions = (
        Subscription.objects.filter(owner=user, is_archived=False)
        .exclude(status=Subscription.Status.CANCELLED)
        .exclude(status=Subscription.Status.EXPIRED)
    )
    for sub in subscriptions:
        if sub.next_billing_date:
            days_values = sorted({int(sub.reminder_days_before or 7), 1}, reverse=True)
            ntype = (
                Notification.Type.SUBSCRIPTION_TRIAL
                if sub.status == Subscription.Status.TRIAL
                else Notification.Type.SUBSCRIPTION_RENEWAL
            )
            for days in days_values:
                remind_on = sub.next_billing_date - timedelta(days=days)
                if not _is_due(remind_on, today, target_date=sub.next_billing_date):
                    continue
                yield _candidate(
                    user=user,
                    notification_type=ntype,
                    title=f"{sub.name} {'trial ends' if ntype == Notification.Type.SUBSCRIPTION_TRIAL else 'renews'} soon",
                    message="Review this subscription before the upcoming date.",
                    severity=Notification.Severity.URGENT if sub.next_billing_date == today else Notification.Severity.WARNING,
                    source_type="subscription",
                    source_id=sub.id,
                    action_url=f"/dashboard/subscriptions/{sub.id}",
                    scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                    dedupe_key=f"{ntype}:{user.id}:{sub.id}:{days}:{sub.next_billing_date}",
                    metadata={
                        "target_date": sub.next_billing_date.isoformat(),
                        "reminder_date": remind_on.isoformat(),
                        "lead_days": days,
                        "auto_renew": sub.auto_renew,
                    },
                )
        if sub.cancellation_deadline:
            for days in (7, 1, 0):
                remind_on = sub.cancellation_deadline - timedelta(days=days)
                if not _is_due(remind_on, today, target_date=sub.cancellation_deadline):
                    continue
                yield _candidate(
                    user=user,
                    notification_type=Notification.Type.SUBSCRIPTION_CANCELLATION,
                    title=f"{sub.name} cancellation deadline is coming up",
                    message="Review whether you want to keep or cancel before renewal.",
                    severity=Notification.Severity.URGENT if sub.cancellation_deadline == today else Notification.Severity.WARNING,
                    source_type="subscription",
                    source_id=sub.id,
                    action_url=f"/dashboard/subscriptions/{sub.id}",
                    scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                    dedupe_key=(
                        f"{Notification.Type.SUBSCRIPTION_CANCELLATION}:"
                        f"{user.id}:{sub.id}:{days}:{sub.cancellation_deadline}"
                    ),
                    metadata={
                        "target_date": sub.cancellation_deadline.isoformat(),
                        "reminder_date": remind_on.isoformat(),
                        "lead_days": days,
                    },
                )


def _checklist_bundle_candidates(user, today: date, tzinfo: ZoneInfo):
    from apps.documents.models import (
        DocumentBundle,
        DocumentBundleRequirement,
        DocumentChecklist,
        DocumentChecklistItem,
    )

    prefs = get_preferences(user)
    if not prefs.checklist_bundle_reminders_enabled:
        return
    active_bundle_statuses = {
        DocumentBundle.Status.DRAFT,
        DocumentBundle.Status.IN_PROGRESS,
        DocumentBundle.Status.READY,
        DocumentBundle.Status.SUBMITTED,
    }
    for bundle in DocumentBundle.objects.filter(
        owner=user, status__in=active_bundle_statuses, target_date__isnull=False
    ):
        for days in (30, 7, 1, 0):
            remind_on = bundle.target_date - timedelta(days=days)
            if not _is_due(remind_on, today, target_date=bundle.target_date):
                continue
            yield _candidate(
                user=user,
                notification_type=Notification.Type.BUNDLE_DEADLINE,
                title=f"{bundle.title} deadline is coming up",
                message="Review the bundle readiness and remaining requirements.",
                severity=Notification.Severity.URGENT if bundle.target_date == today else Notification.Severity.WARNING,
                source_type="bundle",
                source_id=bundle.id,
                action_url=f"/dashboard/bundles/{bundle.id}",
                scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                dedupe_key=f"bundle_deadline:{user.id}:{bundle.id}:{days}:{bundle.target_date}",
                metadata={
                    "target_date": bundle.target_date.isoformat(),
                    "reminder_date": remind_on.isoformat(),
                    "lead_days": days,
                    "readiness_score": bundle.readiness_score,
                },
            )
            if bundle.readiness_score < 100:
                yield _candidate(
                    user=user,
                    notification_type=Notification.Type.BUNDLE_INCOMPLETE,
                    title=f"{bundle.title} is not complete yet",
                    message="A tracked application pack still has open requirements.",
                    severity=Notification.Severity.WARNING,
                    source_type="bundle",
                    source_id=bundle.id,
                    action_url=f"/dashboard/bundles/{bundle.id}",
                    scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                    dedupe_key=f"bundle_incomplete:{user.id}:{bundle.id}:{days}:{bundle.target_date}",
                    metadata={
                        "target_date": bundle.target_date.isoformat(),
                        "reminder_date": remind_on.isoformat(),
                        "lead_days": days,
                    },
                )

    checklist_statuses = {
        DocumentChecklist.Status.NOT_STARTED,
        DocumentChecklist.Status.IN_PROGRESS,
    }
    for checklist in DocumentChecklist.objects.filter(
        owner=user, status__in=checklist_statuses, due_date__isnull=False
    ):
        for days in (7, 1, 0):
            remind_on = checklist.due_date - timedelta(days=days)
            if not _is_due(remind_on, today, target_date=checklist.due_date):
                continue
            yield _candidate(
                user=user,
                notification_type=Notification.Type.CHECKLIST_ITEM_DUE,
                title=f"{checklist.title} checklist is due soon",
                message="Review the checklist and complete remaining items.",
                severity=Notification.Severity.URGENT if checklist.due_date == today else Notification.Severity.WARNING,
                source_type="checklist",
                source_id=checklist.id,
                action_url=(
                    f"/dashboard/documents/{checklist.document_id}?tab=renewal"
                    if checklist.document_id
                    else "/dashboard/bundles"
                ),
                scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                dedupe_key=f"checklist_due:{user.id}:{checklist.id}:{days}:{checklist.due_date}",
                metadata={
                    "target_date": checklist.due_date.isoformat(),
                    "reminder_date": remind_on.isoformat(),
                    "lead_days": days,
                },
            )

    item_statuses = {
        DocumentChecklistItem.Status.PENDING,
        DocumentChecklistItem.Status.IN_PROGRESS,
    }
    for item in DocumentChecklistItem.objects.select_related("checklist").filter(
        owner=user, status__in=item_statuses, due_date__isnull=False
    ):
        for days in (3, 1, 0):
            remind_on = item.due_date - timedelta(days=days)
            if not _is_due(remind_on, today, target_date=item.due_date):
                continue
            notification_type = (
                Notification.Type.CHECKLIST_MISSING_FILE
                if item.is_required and item.linked_file_id is None
                else Notification.Type.CHECKLIST_ITEM_DUE
            )
            yield _candidate(
                user=user,
                notification_type=notification_type,
                title=f"{item.title} is due soon",
                message="A required checklist item still needs attention.",
                severity=Notification.Severity.URGENT if item.due_date == today else Notification.Severity.WARNING,
                source_type="checklist_item",
                source_id=item.id,
                action_url=(
                    f"/dashboard/documents/{item.checklist.document_id}?tab=renewal"
                    if item.checklist.document_id
                    else "/dashboard/bundles"
                ),
                scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                dedupe_key=f"{notification_type}:{user.id}:{item.id}:{days}:{item.due_date}",
                metadata={
                    "target_date": item.due_date.isoformat(),
                    "reminder_date": remind_on.isoformat(),
                    "lead_days": days,
                },
            )

    for requirement in DocumentBundleRequirement.objects.select_related("bundle").filter(
        owner=user,
        is_required=True,
        linked_file__isnull=True,
        due_date__isnull=False,
        status__in=[
            DocumentBundleRequirement.Status.MISSING,
            DocumentBundleRequirement.Status.ATTACHED,
        ],
    ):
        for days in (7, 1, 0):
            remind_on = requirement.due_date - timedelta(days=days)
            if not _is_due(remind_on, today, target_date=requirement.due_date):
                continue
            yield _candidate(
                user=user,
                notification_type=Notification.Type.CHECKLIST_MISSING_FILE,
                title=f"{requirement.title} is still missing",
                message="A required bundle item is still missing.",
                severity=Notification.Severity.WARNING,
                source_type="bundle_requirement",
                source_id=requirement.id,
                action_url=f"/dashboard/bundles/{requirement.bundle_id}",
                scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                dedupe_key=(
                    f"bundle_missing_file:{user.id}:{requirement.id}:"
                    f"{days}:{requirement.due_date}"
                ),
                metadata={
                    "target_date": requirement.due_date.isoformat(),
                    "reminder_date": remind_on.isoformat(),
                    "lead_days": days,
                },
            )


def _organization_candidates(user, today: date, tzinfo: ZoneInfo):
    from apps.organizations.models import (
        CampaignTargetMember,
        DocumentCollectionCampaign,
        DocumentRequest,
        DocumentRequestSubmission,
        OrganizationMembership,
    )
    from apps.organizations.services import ADMIN_ROLES

    prefs = get_preferences(user)
    if not prefs.organization_reminders_enabled:
        return
    memberships = list(
        OrganizationMembership.objects.select_related("organization").filter(
            user=user,
            status=OrganizationMembership.Status.ACTIVE,
            organization__archived_at__isnull=True,
        )
    )
    admin_org_ids = [m.organization_id for m in memberships if m.role in ADMIN_ROLES]
    member_ids = [m.id for m in memberships]

    requests = DocumentRequest.objects.filter(
        organization_id__in=[m.organization_id for m in memberships],
        deadline__isnull=False,
        status__in=[DocumentRequest.Status.OPEN, DocumentRequest.Status.NEEDS_CHANGES],
    )
    for request_obj in requests:
        is_assignee = request_obj.assigned_to_member_id in member_ids
        is_admin = request_obj.organization_id in admin_org_ids
        if not (is_assignee or is_admin):
            continue
        for days in (7, 1, 0):
            remind_on = request_obj.deadline - timedelta(days=days)
            if not _is_due(remind_on, today, target_date=request_obj.deadline):
                continue
            yield _candidate(
                user=user,
                notification_type=Notification.Type.ORGANIZATION_REQUEST_DUE,
                title=f"{request_obj.title} is due soon",
                message="An organization document request needs attention.",
                severity=Notification.Severity.URGENT if request_obj.deadline == today else Notification.Severity.WARNING,
                source_type="organization_request",
                source_id=request_obj.id,
                action_url=f"/dashboard/organizations/{request_obj.organization_id}",
                scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                dedupe_key=(
                    f"organization_request_due:{user.id}:{request_obj.id}:"
                    f"{days}:{request_obj.deadline}"
                ),
                metadata={
                    "target_date": request_obj.deadline.isoformat(),
                    "reminder_date": remind_on.isoformat(),
                    "lead_days": days,
                    "organization_id": request_obj.organization_id,
                },
            )

    for submission in DocumentRequestSubmission.objects.filter(
        organization_id__in=admin_org_ids,
        status=DocumentRequestSubmission.Status.SUBMITTED,
    ):
        created_local = submission.created_at.astimezone(tzinfo).date()
        if (today - created_local).days > max(0, getattr(settings, "NOTIFICATION_REMINDER_CATCHUP_DAYS", 3)):
            continue
        yield _candidate(
            user=user,
            notification_type=Notification.Type.ORGANIZATION_SUBMISSION_REVIEW,
            title="A submitted file needs review",
            message="An organization request submission is waiting for review.",
            severity=Notification.Severity.INFO,
            source_type="organization_submission",
            source_id=submission.id,
            action_url=f"/dashboard/organizations/{submission.organization_id}",
            scheduled_for=submission.created_at,
            dedupe_key=f"organization_submission_review:{user.id}:{submission.id}",
            metadata={"organization_id": submission.organization_id},
        )

    for campaign in DocumentCollectionCampaign.objects.filter(
        organization_id__in=admin_org_ids,
        status=DocumentCollectionCampaign.Status.ACTIVE,
        deadline__isnull=False,
    ):
        for days in (7, 1, 0):
            remind_on = campaign.deadline - timedelta(days=days)
            if not _is_due(remind_on, today, target_date=campaign.deadline):
                continue
            yield _candidate(
                user=user,
                notification_type=Notification.Type.ORGANIZATION_CAMPAIGN_DEADLINE,
                title=f"{campaign.title} campaign deadline is coming up",
                message="Review the campaign status and missing submissions.",
                severity=Notification.Severity.WARNING,
                source_type="organization_campaign",
                source_id=campaign.id,
                action_url=f"/dashboard/organizations/{campaign.organization_id}",
                scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                dedupe_key=(
                    f"organization_campaign_deadline:{user.id}:{campaign.id}:"
                    f"{days}:{campaign.deadline}"
                ),
                metadata={
                    "target_date": campaign.deadline.isoformat(),
                    "reminder_date": remind_on.isoformat(),
                    "lead_days": days,
                    "organization_id": campaign.organization_id,
                },
            )

    for target in CampaignTargetMember.objects.select_related("campaign", "member").filter(
        member_id__in=member_ids,
        status__in=[
            CampaignTargetMember.Status.PENDING,
            CampaignTargetMember.Status.PARTIALLY_SUBMITTED,
        ],
        campaign__status=DocumentCollectionCampaign.Status.ACTIVE,
        campaign__deadline__isnull=False,
    ):
        for days in (7, 1, 0):
            remind_on = target.campaign.deadline - timedelta(days=days)
            if not _is_due(remind_on, today, target_date=target.campaign.deadline):
                continue
            yield _candidate(
                user=user,
                notification_type=Notification.Type.ORGANIZATION_MEMBER_MISSING_DOCUMENT,
                title=f"{target.campaign.title} needs your documents",
                message="A campaign is waiting for your required documents.",
                severity=Notification.Severity.WARNING,
                source_type="campaign_target",
                source_id=target.id,
                action_url=f"/dashboard/organizations/{target.campaign.organization_id}",
                scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                dedupe_key=(
                    f"organization_member_missing_document:{user.id}:{target.id}:"
                    f"{days}:{target.campaign.deadline}"
                ),
                metadata={
                    "target_date": target.campaign.deadline.isoformat(),
                    "reminder_date": remind_on.isoformat(),
                    "lead_days": days,
                    "organization_id": target.campaign.organization_id,
                },
            )


def _sharing_candidates(user, today: date, tzinfo: ZoneInfo):
    from apps.documents.models import DocumentFileShareLink, ShareRoom
    from apps.quick_share.models import QuickShareSession

    for link in DocumentFileShareLink.objects.filter(
        owner=user, revoked_at__isnull=True, expires_at__isnull=False
    ).select_related("file"):
        expire_date = link.expires_at.astimezone(tzinfo).date()
        for days in (7, 1, 0):
            remind_on = expire_date - timedelta(days=days)
            if not _is_due(remind_on, today, target_date=expire_date):
                continue
            yield _candidate(
                user=user,
                notification_type=Notification.Type.SHARE_EXPIRING,
                title="A file share link expires soon",
                message="Review active share links and revoke anything no longer needed.",
                severity=Notification.Severity.INFO,
                source_type="document_file_share_link",
                source_id=link.id,
                action_url=f"/dashboard/documents/{link.document_id}?tab=sharing",
                scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                dedupe_key=f"share_expiring:{user.id}:{link.id}:{days}:{expire_date}",
                metadata={
                    "target_date": expire_date.isoformat(),
                    "reminder_date": remind_on.isoformat(),
                    "lead_days": days,
                },
            )

    for room in ShareRoom.objects.filter(owner=user, revoked_at__isnull=True):
        if room.expires_at is None:
            continue
        expire_date = room.expires_at.astimezone(tzinfo).date()
        for days in (7, 1, 0):
            remind_on = expire_date - timedelta(days=days)
            if not _is_due(remind_on, today, target_date=expire_date):
                continue
            yield _candidate(
                user=user,
                notification_type=Notification.Type.ROOM_EXPIRING,
                title=f"{room.title} room expires soon",
                message="Review the secure room before it expires.",
                severity=Notification.Severity.INFO,
                source_type="share_room",
                source_id=room.id,
                action_url=f"/dashboard/share-rooms/{room.id}",
                scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                dedupe_key=f"room_expiring:{user.id}:{room.id}:{days}:{expire_date}",
                metadata={
                    "target_date": expire_date.isoformat(),
                    "reminder_date": remind_on.isoformat(),
                    "lead_days": days,
                },
            )

    for session in QuickShareSession.objects.filter(
        owner=user,
        status__in=[
            QuickShareSession.Status.ACTIVE,
            QuickShareSession.Status.CLAIMED,
            QuickShareSession.Status.ACCEPTED,
        ],
        revoked_at__isnull=True,
    ):
        expire_date = session.expires_at.astimezone(tzinfo).date()
        for days in (7, 1, 0):
            remind_on = expire_date - timedelta(days=days)
            if not _is_due(remind_on, today, target_date=expire_date):
                continue
            yield _candidate(
                user=user,
                notification_type=Notification.Type.SHARE_EXPIRING,
                title="A Quick Share session expires soon",
                message="Review the session if the recipient still needs access.",
                severity=Notification.Severity.INFO,
                source_type="quick_share_session",
                source_id=session.id,
                action_url=f"/dashboard/quick-share/{session.id}",
                scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                dedupe_key=f"quick_share_expiring:{user.id}:{session.id}:{days}:{expire_date}",
                metadata={
                    "target_date": expire_date.isoformat(),
                    "reminder_date": remind_on.isoformat(),
                    "lead_days": days,
                },
            )


def _emergency_candidates(user, today: date, tzinfo: ZoneInfo):
    from apps.documents.models import EmergencyAccessPack

    prefs = get_preferences(user)
    if not prefs.emergency_reminders_enabled:
        return
    for pack in EmergencyAccessPack.objects.filter(owner=user):
        if pack.status == EmergencyAccessPack.Status.ACTIVE and pack.expires_at:
            expire_date = pack.expires_at.astimezone(tzinfo).date()
            for days in (7, 1, 0):
                remind_on = expire_date - timedelta(days=days)
                if not _is_due(remind_on, today, target_date=expire_date):
                    continue
                yield _candidate(
                    user=user,
                    notification_type=Notification.Type.EMERGENCY_EXPIRING,
                    title=f"{pack.title} emergency access expires soon",
                    message="Review emergency access before the link expires.",
                    severity=Notification.Severity.WARNING,
                    source_type="emergency_pack",
                    source_id=pack.id,
                    action_url=f"/dashboard/emergency/{pack.id}",
                    scheduled_for=_scheduled_datetime(remind_on, tzinfo),
                    dedupe_key=f"emergency_expiring:{user.id}:{pack.id}:{days}:{expire_date}",
                    metadata={
                        "target_date": expire_date.isoformat(),
                        "reminder_date": remind_on.isoformat(),
                        "lead_days": days,
                    },
                )

        reviewed_raw = (pack.metadata or {}).get("last_reviewed_at")
        reviewed_at = None
        if reviewed_raw:
            try:
                reviewed_at = datetime.fromisoformat(str(reviewed_raw)).date()
            except ValueError:
                reviewed_at = None
        if reviewed_at is None:
            reviewed_at = pack.updated_at.astimezone(tzinfo).date()
        review_due = reviewed_at + timedelta(days=90)
        if review_due <= today and (today - review_due).days <= 7:
            yield _candidate(
                user=user,
                notification_type=Notification.Type.EMERGENCY_REVIEW,
                title=f"Review {pack.title} emergency access",
                message="Make sure the selected items and details are still correct.",
                severity=Notification.Severity.WARNING,
                source_type="emergency_pack",
                source_id=pack.id,
                action_url=f"/dashboard/emergency/{pack.id}",
                scheduled_for=_scheduled_datetime(review_due, tzinfo),
                dedupe_key=f"emergency_review:{user.id}:{pack.id}:{review_due}",
                metadata={"target_date": review_due.isoformat()},
            )


def iter_due_candidates(user, now: datetime):
    today, tzinfo = _local_today(user, now)
    yield from _document_candidates(user, today, tzinfo) or []
    yield from _subscription_candidates(user, today, tzinfo) or []
    yield from _checklist_bundle_candidates(user, today, tzinfo) or []
    yield from _organization_candidates(user, today, tzinfo) or []
    yield from _sharing_candidates(user, today, tzinfo) or []
    yield from _emergency_candidates(user, today, tzinfo) or []


def process_due_notifications(
    *,
    now: datetime | None = None,
    dry_run: bool = False,
    limit: int = 100,
    user_id: int | None = None,
    type_filter: str = "",
) -> dict:
    now = now or timezone.now()
    if timezone.is_naive(now):
        now = timezone.make_aware(now, timezone.get_current_timezone())
    limit = max(1, int(limit or 100))

    users = get_user_model().objects.filter(is_active=True).order_by("id")
    if user_id:
        users = users.filter(id=user_id)

    summary = {
        "evaluated": 0,
        "created": 0,
        "existing": 0,
        "delivered": 0,
        "skipped_preferences": 0,
        "dry_run": dry_run,
    }

    for user in users:
        prefs = get_preferences(user)
        for candidate in iter_due_candidates(user, now):
            if type_filter and candidate.type != type_filter:
                continue
            if summary["evaluated"] >= limit:
                return summary
            summary["evaluated"] += 1
            if not _preference_allows(prefs, candidate.type):
                summary["skipped_preferences"] += 1
                continue
            if dry_run:
                continue
            notification, created = create_notification(candidate)
            summary["created" if created else "existing"] += 1
            if deliver_notification(notification, now=now):
                summary["delivered"] += 1
    logger.info(
        "notifications_processed evaluated=%s created=%s existing=%s delivered=%s dry_run=%s",
        summary["evaluated"],
        summary["created"],
        summary["existing"],
        summary["delivered"],
        dry_run,
    )
    return summary
