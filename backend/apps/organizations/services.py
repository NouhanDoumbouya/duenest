import re
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException, PermissionDenied

from .models import (
    CampaignTargetMember,
    DocumentCollectionCampaign,
    DocumentRequest,
    DocumentRequestSubmission,
    Organization,
    OrganizationActivity,
    OrganizationBundle,
    OrganizationDocument,
    OrganizationInvite,
    OrganizationMembership,
    OrganizationRequestTemplate,
    OrganizationSecureRoom,
    generate_org_token,
)


ADMIN_ROLES = {
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
}

EDITOR_ROLES = {
    OrganizationMembership.Role.OWNER,
    OrganizationMembership.Role.ADMIN,
    OrganizationMembership.Role.MEMBER,
}


class LastOwnerError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "last_owner"
    default_detail = "An organization must always have at least one active owner."


def active_membership(user, organization: Organization) -> OrganizationMembership | None:
    if not user or not user.is_authenticated:
        return None
    return (
        OrganizationMembership.objects.filter(
            organization=organization,
            user=user,
            status=OrganizationMembership.Status.ACTIVE,
        )
        .select_related("user", "organization")
        .first()
    )


def require_membership(user, organization: Organization) -> OrganizationMembership:
    membership = active_membership(user, organization)
    if membership is None:
        raise PermissionDenied("You are not an active member of this organization.")
    if organization.archived_at:
        raise PermissionDenied("This organization is archived.")
    membership.last_active_at = timezone.now()
    membership.save(update_fields=["last_active_at", "updated_at"])
    return membership


def require_role(
    user,
    organization: Organization,
    allowed_roles: set[str],
) -> OrganizationMembership:
    membership = require_membership(user, organization)
    if membership.role not in allowed_roles:
        raise PermissionDenied("Your organization role does not allow this action.")
    return membership


def is_admin(membership: OrganizationMembership) -> bool:
    return membership.role in ADMIN_ROLES


def is_editor(membership: OrganizationMembership) -> bool:
    return membership.role in EDITOR_ROLES


def active_owner_count(organization: Organization) -> int:
    return OrganizationMembership.objects.filter(
        organization=organization,
        role=OrganizationMembership.Role.OWNER,
        status=OrganizationMembership.Status.ACTIVE,
    ).count()


def ensure_not_last_owner(membership: OrganizationMembership) -> None:
    if (
        membership.role == OrganizationMembership.Role.OWNER
        and membership.status == OrganizationMembership.Status.ACTIVE
        and active_owner_count(membership.organization) <= 1
    ):
        raise LastOwnerError()


def log_activity(
    organization: Organization,
    action: str,
    safe_summary: str,
    *,
    actor=None,
    target_type: str = "",
    target_id: int | str = "",
    metadata: dict | None = None,
) -> OrganizationActivity:
    return OrganizationActivity.objects.create(
        organization=organization,
        actor=actor if getattr(actor, "is_authenticated", False) else None,
        action=action,
        target_type=target_type,
        target_id=str(target_id or ""),
        safe_summary=safe_summary[:255],
        metadata=metadata or {},
    )


def create_owner_membership(organization: Organization, user) -> OrganizationMembership:
    membership = OrganizationMembership.objects.create(
        organization=organization,
        user=user,
        role=OrganizationMembership.Role.OWNER,
        status=OrganizationMembership.Status.ACTIVE,
        joined_at=timezone.now(),
    )
    log_activity(
        organization,
        "organization_created",
        "Organization workspace created",
        actor=user,
        target_type="organization",
        target_id=organization.id,
    )
    return membership


EMAIL_RE = re.compile(r"[\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[A-Za-z]{2,}")


def parse_bulk_emails(raw: str) -> list[str]:
    seen: set[str] = set()
    emails: list[str] = []
    for match in EMAIL_RE.findall(raw or ""):
        email = match.strip().lower()
        if email and email not in seen:
            seen.add(email)
            emails.append(email)
    return emails


def invite_expiry(days: int = 7):
    return timezone.now() + timedelta(days=days)


def create_invite(
    organization: Organization,
    *,
    email: str,
    role: str,
    invited_by,
    expires_at=None,
) -> OrganizationInvite:
    invite = OrganizationInvite.objects.create(
        organization=organization,
        email=email,
        role=role,
        invited_by=invited_by,
        expires_at=expires_at or invite_expiry(),
    )
    log_activity(
        organization,
        "member_invited",
        f"Invited {invite.email}",
        actor=invited_by,
        target_type="invite",
        target_id=invite.id,
        metadata={"role": invite.role},
    )
    return invite


def accept_invite(invite: OrganizationInvite, user) -> OrganizationMembership:
    if invite.status == OrganizationInvite.Status.REVOKED:
        raise PermissionDenied("This invite has been revoked.")
    if invite.status == OrganizationInvite.Status.ACCEPTED:
        raise PermissionDenied("This invite has already been accepted.")
    if invite.is_expired:
        invite.status = OrganizationInvite.Status.EXPIRED
        invite.save(update_fields=["status", "updated_at"])
        raise PermissionDenied("This invite has expired.")
    user_email = (getattr(user, "email", "") or "").strip().lower()
    if invite.email and user_email and invite.email != user_email:
        raise PermissionDenied("This invite was sent to a different email address.")
    membership, _ = OrganizationMembership.objects.update_or_create(
        organization=invite.organization,
        user=user,
        defaults={
            "role": invite.role,
            "status": OrganizationMembership.Status.ACTIVE,
            "joined_at": timezone.now(),
        },
    )
    invite.status = OrganizationInvite.Status.ACCEPTED
    invite.accepted_by = user
    invite.accepted_at = timezone.now()
    invite.save(update_fields=["status", "accepted_by", "accepted_at", "updated_at"])
    log_activity(
        invite.organization,
        "invite_accepted",
        f"{user_email or 'A member'} accepted an invite",
        actor=user,
        target_type="membership",
        target_id=membership.id,
    )
    return membership


def days_until(value):
    if value is None:
        return None
    return (value - timezone.localdate()).days


def campaign_progress(campaign: DocumentCollectionCampaign) -> dict:
    targets = list(campaign.targets.all())
    total = len([target for target in targets if target.status != target.Status.EXCLUDED])
    if total == 0:
        return {
            "target_count": 0,
            "submitted_count": 0,
            "approved_count": 0,
            "overdue_count": 0,
            "completion_percent": 0,
        }
    submitted_statuses = {
        CampaignTargetMember.Status.SUBMITTED,
        CampaignTargetMember.Status.APPROVED,
    }
    submitted = sum(1 for target in targets if target.status in submitted_statuses)
    approved = sum(1 for target in targets if target.status == target.Status.APPROVED)
    overdue = sum(1 for target in targets if target.status == target.Status.OVERDUE)
    return {
        "target_count": total,
        "submitted_count": submitted,
        "approved_count": approved,
        "overdue_count": overdue,
        "completion_percent": round((submitted / total) * 100),
    }


def build_summary(organization: Organization) -> dict:
    today = timezone.localdate()
    soon = today + timedelta(days=30)
    members = OrganizationMembership.objects.filter(
        organization=organization, status=OrganizationMembership.Status.ACTIVE
    )
    documents = OrganizationDocument.objects.filter(
        organization=organization, is_archived=False
    ).annotate(file_count=Count("files"))
    requests = DocumentRequest.objects.filter(organization=organization)
    campaigns = DocumentCollectionCampaign.objects.filter(organization=organization)
    bundles = OrganizationBundle.objects.filter(organization=organization)
    rooms = OrganizationSecureRoom.objects.filter(organization=organization)

    open_requests = requests.filter(status=DocumentRequest.Status.OPEN).count()
    overdue_requests = sum(1 for req in requests if req.is_overdue)
    approved_submissions = DocumentRequestSubmission.objects.filter(
        organization=organization, status=DocumentRequestSubmission.Status.APPROVED
    ).count()
    rejected_or_changes = DocumentRequestSubmission.objects.filter(
        organization=organization,
        status__in=[
            DocumentRequestSubmission.Status.REJECTED,
            DocumentRequestSubmission.Status.NEEDS_CHANGES,
        ],
    ).count()
    missing_files = sum(1 for doc in documents if doc.file_count == 0)
    expiring_soon = documents.filter(
        expiry_date__isnull=False, expiry_date__gte=today, expiry_date__lte=soon
    ).count()
    active_campaigns = campaigns.filter(
        status=DocumentCollectionCampaign.Status.ACTIVE
    ).prefetch_related("targets")
    campaign_progresses = [campaign_progress(c) for c in active_campaigns]
    campaign_completion = (
        round(
            sum(item["completion_percent"] for item in campaign_progresses)
            / len(campaign_progresses)
        )
        if campaign_progresses
        else 0
    )
    upcoming_deadlines = organization_deadline_events(organization, start=today, end=soon)
    readiness = readiness_snapshot(
        documents_count=documents.count(),
        missing_files=missing_files,
        expiring_soon=expiring_soon,
        open_requests=open_requests,
        overdue_requests=overdue_requests,
        active_campaigns=active_campaigns.count(),
        upcoming_deadlines=len(upcoming_deadlines),
    )
    recent_activity = OrganizationActivity.objects.filter(
        organization=organization
    ).select_related("actor")[:6]

    def actor_name(activity: OrganizationActivity) -> str:
        if not activity.actor:
            return ""
        return activity.actor.get_full_name() or activity.actor.get_username()

    return {
        "member_count": members.count(),
        "document_count": documents.count(),
        "missing_files_count": missing_files,
        "expiring_soon_count": expiring_soon,
        "open_requests_count": open_requests,
        "overdue_requests_count": overdue_requests,
        "approved_submissions_count": approved_submissions,
        "rejected_or_needs_changes_count": rejected_or_changes,
        "active_campaigns_count": active_campaigns.count(),
        "campaign_completion_percent": campaign_completion,
        "bundle_count": bundles.count(),
        "active_secure_rooms_count": rooms.filter(
            status=OrganizationSecureRoom.Status.ACTIVE
        ).count(),
        "upcoming_deadlines_count": len(upcoming_deadlines),
        "readiness": readiness,
        "recent_activity": [
            {
                "id": activity.id,
                "action": activity.action,
                "safe_summary": activity.safe_summary,
                "target_type": activity.target_type,
                "target_id": activity.target_id,
                "created_at": activity.created_at.isoformat(),
                "actor_name": actor_name(activity),
            }
            for activity in recent_activity
        ],
        "next_recommended_action": next_recommended_action(
            missing_files=missing_files,
            overdue_requests=overdue_requests,
            open_requests=open_requests,
            active_campaigns=active_campaigns.count(),
        ),
    }


def readiness_snapshot(
    *,
    documents_count: int,
    missing_files: int,
    expiring_soon: int,
    open_requests: int,
    overdue_requests: int,
    active_campaigns: int,
    upcoming_deadlines: int,
) -> dict:
    score = 100
    score -= min(overdue_requests * 18, 45)
    score -= min(missing_files * 6, 30)
    score -= min(expiring_soon * 5, 20)
    score -= min(open_requests * 3, 15)
    score -= min(upcoming_deadlines * 2, 10)
    score = max(score, 0)
    if overdue_requests >= 3 or score < 40:
        status_label = "critical"
    elif overdue_requests > 0 or score < 60:
        status_label = "at_risk"
    elif score < 80 or missing_files or open_requests:
        status_label = "needs_attention"
    else:
        status_label = "healthy"
    return {
        "score": score,
        "status": status_label,
        "reasons": [
            reason
            for reason in [
                f"{missing_files} documents missing files" if missing_files else "",
                f"{overdue_requests} overdue requests" if overdue_requests else "",
                f"{open_requests} open requests" if open_requests else "",
                f"{expiring_soon} documents expiring soon" if expiring_soon else "",
                f"{active_campaigns} active campaigns" if active_campaigns else "",
            ]
            if reason
        ],
    }


def next_recommended_action(
    *,
    missing_files: int,
    overdue_requests: int,
    open_requests: int,
    active_campaigns: int,
) -> str:
    if overdue_requests:
        return f"Follow up on {overdue_requests} overdue document requests."
    if missing_files:
        return f"Attach files for {missing_files} organization documents."
    if open_requests:
        return f"Review {open_requests} open document requests."
    if active_campaigns:
        return "Check active campaign progress and approve submitted files."
    return "Invite members or create a document request to start collaborating."


def organization_deadline_events(
    organization: Organization, *, start=None, end=None
) -> list[dict]:
    events: list[dict] = []

    def include(when):
        if when is None:
            return False
        if start and when < start:
            return False
        if end and when > end:
            return False
        return True

    for doc in OrganizationDocument.objects.filter(
        organization=organization, is_archived=False
    ):
        if include(doc.expiry_date):
            events.append(
                {
                    "id": f"org-document-expiry-{doc.id}",
                    "event_type": "organization_document_expiry",
                    "title": f"{doc.title} expires",
                    "date": doc.expiry_date.isoformat(),
                    "resource_type": "organization_document",
                    "resource_id": doc.id,
                    "urgency": _urgency(doc.expiry_date),
                }
            )
        if include(doc.renewal_date):
            events.append(
                {
                    "id": f"org-document-renewal-{doc.id}",
                    "event_type": "organization_document_renewal",
                    "title": f"{doc.title} renewal",
                    "date": doc.renewal_date.isoformat(),
                    "resource_type": "organization_document",
                    "resource_id": doc.id,
                    "urgency": _urgency(doc.renewal_date),
                }
            )
    for req in DocumentRequest.objects.filter(organization=organization):
        if include(req.deadline):
            events.append(
                {
                    "id": f"org-request-{req.id}",
                    "event_type": "organization_request_deadline",
                    "title": f"{req.title} due",
                    "date": req.deadline.isoformat(),
                    "resource_type": "document_request",
                    "resource_id": req.id,
                    "urgency": _urgency(req.deadline),
                }
            )
    for campaign in DocumentCollectionCampaign.objects.filter(organization=organization):
        if include(campaign.deadline):
            events.append(
                {
                    "id": f"org-campaign-{campaign.id}",
                    "event_type": "organization_campaign_deadline",
                    "title": f"{campaign.title} campaign deadline",
                    "date": campaign.deadline.isoformat(),
                    "resource_type": "campaign",
                    "resource_id": campaign.id,
                    "urgency": _urgency(campaign.deadline),
                }
            )
    for bundle in OrganizationBundle.objects.filter(organization=organization):
        if include(bundle.target_date):
            events.append(
                {
                    "id": f"org-bundle-{bundle.id}",
                    "event_type": "organization_bundle_deadline",
                    "title": f"{bundle.title} bundle target",
                    "date": bundle.target_date.isoformat(),
                    "resource_type": "bundle",
                    "resource_id": bundle.id,
                    "urgency": _urgency(bundle.target_date),
                }
            )
    for room in OrganizationSecureRoom.objects.filter(organization=organization):
        if include(room.expires_at.date() if room.expires_at else None):
            expiry_date = room.expires_at.date()
            events.append(
                {
                    "id": f"org-secure-room-{room.id}",
                    "event_type": "organization_secure_room_expiry",
                    "title": f"{room.title} secure room expires",
                    "date": expiry_date.isoformat(),
                    "resource_type": "organization_secure_room",
                    "resource_id": room.id,
                    "urgency": _urgency(expiry_date),
                }
            )
    events.sort(key=lambda item: (item["date"], item["title"].lower()))
    return events


def _urgency(when) -> str:
    days = days_until(when)
    if days is None:
        return "normal"
    if days < 0:
        return "overdue"
    if days <= 7:
        return "soon"
    if days <= 30:
        return "upcoming"
    return "normal"


SYSTEM_REQUEST_TEMPLATES = [
    ("Passport copy", "Upload a clear passport copy.", "identity", "PDF/JPG/PNG"),
    ("Student ID", "Upload a current student identification card.", "identity", "PDF/JPG/PNG"),
    ("National ID", "Upload a clear national ID copy.", "identity", "PDF/JPG/PNG"),
    ("CV/Resume", "Upload your latest CV or resume.", "application", "PDF/DOCX"),
    ("Transcript", "Upload your latest academic transcript.", "education", "PDF"),
    ("Proof of payment", "Upload proof of payment or receipt.", "finance", "PDF/JPG/PNG"),
    ("Recommendation letter", "Upload a signed recommendation letter.", "application", "PDF"),
    ("Signed consent form", "Upload the completed consent form.", "forms", "PDF/JPG/PNG"),
]


def seed_system_templates() -> int:
    created = 0
    for name, description, category, file_type in SYSTEM_REQUEST_TEMPLATES:
        _, was_created = OrganizationRequestTemplate.objects.get_or_create(
            organization=None,
            name=name,
            is_system=True,
            defaults={
                "description": description,
                "category": category,
                "required_file_type": file_type,
            },
        )
        if was_created:
            created += 1
    return created


def ensure_public_upload_token(request_obj: DocumentRequest) -> DocumentRequest:
    if not request_obj.public_upload_token:
        request_obj.public_upload_token = generate_org_token()
    if not request_obj.public_upload_expires_at:
        request_obj.public_upload_expires_at = timezone.now() + timedelta(days=14)
    request_obj.save(
        update_fields=["public_upload_token", "public_upload_expires_at", "updated_at"]
    )
    return request_obj
