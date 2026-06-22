"""User-owned onboarding, trust, demo, and account-control helpers."""

import hashlib
from datetime import timedelta

from django.core.files.base import ContentFile
from django.db.models import Q
from django.utils import timezone

from apps.documents.models import (
    Document,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentChecklist,
    DocumentChecklistItem,
    DocumentExportRequest,
    DocumentFile,
    DocumentFileShareLink,
    DocumentReminderRule,
    EmergencyAccessPack,
    ProofRecord,
)
from apps.documents.services import (
    ExportGenerationError,
    create_document_export,
    get_document_health,
)

from .models import AccountDeletionRequest, UserOnboardingState

DEMO_MARKER = "DUENEST_DEMO_DATA"

ONBOARDING_EVENT_FIELDS = {
    "first_document_created": "first_document_created_at",
    "first_file_uploaded": "first_file_uploaded_at",
    "first_expiry_date_added": "first_expiry_date_added_at",
    "first_reminder_created": "first_reminder_created_at",
    "first_share_link_created": "first_share_link_created_at",
    "first_checklist_created": "first_checklist_created_at",
    "checklist_completed": "checklist_completed_at",
}


def get_onboarding_state(user) -> UserOnboardingState:
    """Return the user's onboarding state, creating it on first use."""
    state, _ = UserOnboardingState.objects.get_or_create(user=user)
    return state


def mark_onboarding_event(user, event: str) -> None:
    """
    Mark a first-time onboarding event without breaking the calling feature.

    This helper is called from document flows, so it deliberately swallows
    unexpected failures rather than making core document actions fragile.
    """
    if not getattr(user, "is_authenticated", False):
        return
    field = ONBOARDING_EVENT_FIELDS.get(event)
    if field is None:
        return
    try:
        state = get_onboarding_state(user)
        if getattr(state, field) is None:
            setattr(state, field, timezone.now())
            state.save(update_fields=[field, "updated_at"])
    except Exception:
        return


def sync_onboarding_state_from_documents(user) -> UserOnboardingState:
    """Backfill progress timestamps from real owner-scoped document data."""
    state = get_onboarding_state(user)
    updates = []

    documents = Document.objects.filter(owner=user, is_trashed=False)
    first_document = documents.order_by("created_at").first()
    if first_document and state.first_document_created_at is None:
        state.first_document_created_at = first_document.created_at
        updates.append("first_document_created_at")

    first_file = (
        DocumentFile.objects.filter(
            document__owner=user,
            document__is_trashed=False,
            is_trashed=False,
        )
        .order_by("created_at")
        .first()
    )
    if first_file and state.first_file_uploaded_at is None:
        state.first_file_uploaded_at = first_file.created_at
        updates.append("first_file_uploaded_at")

    has_date_tracking = documents.filter(
        Q(expiry_date__isnull=False) | Q(renewal_date__isnull=False)
    ).exists()
    if has_date_tracking and state.first_expiry_date_added_at is None:
        state.first_expiry_date_added_at = timezone.now()
        updates.append("first_expiry_date_added_at")

    first_reminder = (
        DocumentReminderRule.objects.filter(owner=user)
        .exclude(document__is_trashed=True)
        .order_by("created_at")
        .first()
    )
    if first_reminder and state.first_reminder_created_at is None:
        state.first_reminder_created_at = first_reminder.created_at
        updates.append("first_reminder_created_at")

    first_share = (
        DocumentFileShareLink.objects.filter(owner=user)
        .exclude(document__is_trashed=True)
        .exclude(file__is_trashed=True)
        .order_by("created_at")
        .first()
    )
    if first_share and state.first_share_link_created_at is None:
        state.first_share_link_created_at = first_share.created_at
        updates.append("first_share_link_created_at")

    first_checklist = (
        DocumentChecklist.objects.filter(owner=user)
        .exclude(document__is_trashed=True)
        .order_by("created_at")
        .first()
    )
    if first_checklist and state.first_checklist_created_at is None:
        state.first_checklist_created_at = first_checklist.created_at
        updates.append("first_checklist_created_at")

    completed_checklist = (
        DocumentChecklist.objects.filter(
            owner=user,
            status=DocumentChecklist.Status.COMPLETED,
        )
        .exclude(document__is_trashed=True)
        .order_by("updated_at")
        .first()
    )
    if completed_checklist and state.checklist_completed_at is None:
        state.checklist_completed_at = completed_checklist.updated_at
        updates.append("checklist_completed_at")

    if updates:
        updates.append("updated_at")
        state.save(update_fields=updates)
    return state


def _setup_step(
    *,
    key: str,
    title: str,
    description: str,
    completed: bool,
    href: str,
    is_required: bool = True,
    metric: int | bool | None = None,
) -> dict:
    return {
        "key": key,
        "title": title,
        "description": description,
        "completed": completed,
        "status": "completed" if completed else "pending",
        "is_required": is_required,
        "href": href,
        "metric": metric,
    }


def build_document_setup_checklist(user) -> dict:
    """Compute the guided setup checklist from real owner-scoped data."""
    state = sync_onboarding_state_from_documents(user)
    documents = Document.objects.filter(owner=user, is_trashed=False)
    document_count = documents.count()
    file_count = DocumentFile.objects.filter(
        document__owner=user,
        document__is_trashed=False,
        is_trashed=False,
    ).count()
    has_date_tracking = documents.filter(
        Q(expiry_date__isnull=False) | Q(renewal_date__isnull=False)
    ).exists()
    attention_count = sum(
        1
        for document in documents.exclude(status=Document.Status.ARCHIVED)
        if get_document_health(document).needs_attention
    )
    reminder_count = (
        DocumentReminderRule.objects.filter(owner=user)
        .exclude(document__is_trashed=True)
        .count()
    )
    checklist_count = (
        DocumentChecklist.objects.filter(owner=user)
        .exclude(document__is_trashed=True)
        .count()
    )
    share_count = (
        DocumentFileShareLink.objects.filter(owner=user)
        .exclude(document__is_trashed=True)
        .exclude(file__is_trashed=True)
        .count()
    )

    metadata = state.metadata or {}
    attention_reviewed = bool(metadata.get("attention_reviewed_at")) or (
        document_count > 0 and attention_count == 0
    )
    trust_reviewed = bool(metadata.get("trust_center_reviewed_at"))

    steps = [
        _setup_step(
            key="create_first_document",
            title="Create your first document",
            description="Add one important record to start the vault.",
            completed=document_count > 0,
            href="/dashboard/documents/new",
            metric=document_count,
        ),
        _setup_step(
            key="upload_first_file",
            title="Upload your first file",
            description="Attach a PDF, image, or document file to a record.",
            completed=file_count > 0,
            href="/dashboard/documents",
            metric=file_count,
        ),
        _setup_step(
            key="add_expiry_or_renewal",
            title="Add an expiry or renewal date",
            description="Give CertaNest a date it can track before it becomes urgent.",
            completed=has_date_tracking,
            href="/dashboard/documents",
            metric=has_date_tracking,
        ),
        _setup_step(
            key="review_attention_needed",
            title="Review Attention Needed",
            description="Check the documents CertaNest has flagged for follow-up.",
            completed=attention_reviewed,
            href="/dashboard/documents?quick=needs_attention",
            metric=attention_count,
        ),
        _setup_step(
            key="create_reminder",
            title="Create a reminder rule",
            description="Set a reminder around an expiry or renewal date.",
            completed=reminder_count > 0,
            href="/dashboard/documents",
            metric=reminder_count,
        ),
        _setup_step(
            key="create_renewal_checklist",
            title="Create a renewal checklist",
            description="Break a renewal or application into clear steps.",
            completed=checklist_count > 0,
            href="/dashboard/documents",
            metric=checklist_count,
        ),
        _setup_step(
            key="try_secure_sharing",
            title="Try secure sharing",
            description="Create a time-limited link for a selected file.",
            completed=share_count > 0,
            href="/dashboard/documents",
            is_required=False,
            metric=share_count,
        ),
        _setup_step(
            key="review_trust_center",
            title="Review the Trust Center",
            description="See CertaNest's current security and privacy posture.",
            completed=trust_reviewed,
            href="/dashboard/trust",
            is_required=False,
            metric=trust_reviewed,
        ),
    ]

    current_assigned = False
    for step in steps:
        if step["completed"]:
            continue
        if step["is_required"] and not current_assigned:
            step["status"] = "current"
            current_assigned = True
        elif not step["is_required"]:
            step["status"] = "optional"

    required = [step for step in steps if step["is_required"]]
    required_completed = [step for step in required if step["completed"]]
    completed = [step for step in steps if step["completed"]]
    return {
        "is_complete": len(required_completed) == len(required),
        "percent": round((len(completed) / len(steps)) * 100) if steps else 0,
        "required_percent": round((len(required_completed) / len(required)) * 100),
        "completed_steps": len(completed),
        "total_steps": len(steps),
        "required_completed_steps": len(required_completed),
        "required_steps": len(required),
        "counts": {
            "documents": document_count,
            "files": file_count,
            "attention_needed": attention_count,
            "reminders": reminder_count,
            "checklists": checklist_count,
            "share_links": share_count,
        },
        "steps": steps,
    }


def mark_metadata_timestamp(user, key: str) -> UserOnboardingState:
    """Record a named metadata timestamp on the onboarding state."""
    state = get_onboarding_state(user)
    metadata = dict(state.metadata or {})
    metadata[key] = timezone.now().isoformat()
    state.metadata = metadata
    state.save(update_fields=["metadata", "updated_at"])
    return state


def build_security_summary() -> dict:
    """Return safe, public-to-the-user security capability metadata."""
    return {
        "status": "private_beta",
        "generated_at": timezone.now().isoformat(),
        "capabilities": [
            {
                "key": "owner_scoped_records",
                "label": "Owner-scoped records",
                "enabled": True,
                "detail": "Documents, files, reminders, bundles, checklists, exports, and packs are scoped to the signed-in account.",
            },
            {
                "key": "protected_document_files",
                "label": "Protected document files",
                "enabled": True,
                "detail": "Stored file paths are not exposed through normal API responses; files are served through authenticated endpoints.",
            },
            {
                "key": "controlled_sharing",
                "label": "Controlled sharing",
                "enabled": True,
                "detail": "Shared files can expire, be revoked, and optionally require an access code.",
            },
            {
                "key": "metadata_export",
                "label": "Structured data export",
                "enabled": True,
                "detail": "Users can request a secret-free structured export of their document metadata.",
            },
            {
                "key": "trash_restore",
                "label": "Recoverable deletion",
                "enabled": True,
                "detail": "Documents and files move through trash before permanent deletion.",
            },
            {
                "key": "account_deletion_request",
                "label": "Account deletion request",
                "enabled": True,
                "detail": "Deletion is tracked as a request and can be cancelled while still pending.",
            },
        ],
        "data_handling": {
            "raw_file_export_available": False,
            "third_party_ai_processing_enabled": False,
            "public_share_default": "off",
            "staff_access_policy": "No staff tooling for arbitrary document browsing is implemented in this beta.",
        },
        "limitations": [
            "This beta does not yet include full-file archive exports.",
            "Production should move refresh-token storage to a safer cookie strategy before broader launch.",
            "Security and legal pages are product drafts and should receive legal review before public launch.",
        ],
    }


def build_account_data_summary(user) -> dict:
    """Return owner-scoped counts for the account data controls page."""
    documents = Document.objects.filter(owner=user)
    active_documents = documents.filter(is_trashed=False)
    latest_deletion = AccountDeletionRequest.objects.filter(owner=user).first()
    latest_export = DocumentExportRequest.objects.filter(owner=user).first()

    return {
        "generated_at": timezone.now().isoformat(),
        "counts": {
            "documents": active_documents.count(),
            "trashed_documents": documents.filter(is_trashed=True).count(),
            "files": DocumentFile.objects.filter(
                document__owner=user,
                document__is_trashed=False,
                is_trashed=False,
            ).count(),
            "share_links": DocumentFileShareLink.objects.filter(owner=user).count(),
            "reminder_rules": DocumentReminderRule.objects.filter(owner=user).count(),
            "checklists": DocumentChecklist.objects.filter(owner=user).count(),
            "bundles": DocumentBundle.objects.filter(owner=user).count(),
            "proof_records": ProofRecord.objects.filter(owner=user).count(),
            "emergency_packs": EmergencyAccessPack.objects.filter(owner=user).count(),
            "export_requests": DocumentExportRequest.objects.filter(owner=user).count(),
        },
        "latest_export": (
            {
                "id": latest_export.id,
                "status": latest_export.status,
                "export_type": latest_export.export_type,
                "requested_at": latest_export.requested_at.isoformat(),
                "expires_at": (
                    latest_export.expires_at.isoformat()
                    if latest_export.expires_at
                    else None
                ),
            }
            if latest_export
            else None
        ),
        "active_deletion_request": (
            {
                "id": latest_deletion.id,
                "status": latest_deletion.status,
                "requested_at": latest_deletion.requested_at.isoformat(),
                "scheduled_for": (
                    latest_deletion.scheduled_for.isoformat()
                    if latest_deletion.scheduled_for
                    else None
                ),
                "can_cancel": latest_deletion.can_cancel,
            }
            if latest_deletion
            and latest_deletion.status
            in {
                AccountDeletionRequest.Status.REQUESTED,
                AccountDeletionRequest.Status.PROCESSING,
            }
            else None
        ),
    }


def request_account_data_export(user):
    """Create a full-vault metadata export through the shared export service."""
    return create_document_export(
        user,
        DocumentExportRequest.ExportType.FULL_VAULT_METADATA,
    )


def request_account_deletion(user, *, reason: str = "") -> tuple[AccountDeletionRequest, bool]:
    """
    Create or return the active deletion request for a user.

    Returns ``(request, created)``.
    """
    active = AccountDeletionRequest.objects.filter(
        owner=user,
        status__in=[
            AccountDeletionRequest.Status.REQUESTED,
            AccountDeletionRequest.Status.PROCESSING,
        ],
    ).first()
    if active is not None:
        return active, False

    deletion = AccountDeletionRequest.objects.create(
        owner=user,
        reason=reason[:2000],
        scheduled_for=timezone.now() + timedelta(days=30),
        metadata={"source": "account_data_controls"},
    )
    return deletion, True


def cancel_account_deletion(user) -> AccountDeletionRequest | None:
    """Cancel the user's active deletion request when it is still cancellable."""
    deletion = AccountDeletionRequest.objects.filter(
        owner=user,
        status=AccountDeletionRequest.Status.REQUESTED,
    ).first()
    if deletion is None:
        return None
    deletion.status = AccountDeletionRequest.Status.CANCELLED
    deletion.cancelled_at = timezone.now()
    deletion.save(update_fields=["status", "cancelled_at", "updated_at"])
    return deletion


def _demo_notes(label: str) -> str:
    return f"[Demo data: {DEMO_MARKER}] {label}"


def clear_document_demo_data(user) -> dict:
    """Remove only the current user's labeled demo records."""
    demo_documents = Document.objects.filter(
        owner=user,
        notes__contains=DEMO_MARKER,
    )
    file_count = 0
    for file in DocumentFile.objects.filter(document__in=demo_documents):
        file_count += 1
        try:
            file.file.delete(save=False)
        except Exception:
            pass

    document_count = demo_documents.count()
    demo_documents.delete()

    bundle_count, _ = DocumentBundle.objects.filter(
        owner=user,
        notes__contains=DEMO_MARKER,
    ).delete()
    proof_count, _ = ProofRecord.objects.filter(
        owner=user,
        notes__contains=DEMO_MARKER,
    ).delete()
    return {
        "documents_deleted": document_count,
        "files_deleted": file_count,
        "related_records_deleted": bundle_count + proof_count,
    }


def create_document_demo_data(user) -> dict:
    """
    Create owner-scoped, clearly labeled fake data for the document module.

    Existing demo data is cleared first so the endpoint is idempotent.
    """
    clear_document_demo_data(user)
    today = timezone.localdate()

    passport = Document.objects.create(
        owner=user,
        title="[Demo] Passport renewal",
        document_type="passport",
        issuer="Demo Passport Office",
        country="Demo Country",
        reference_number="DEMO-PASS-001",
        issue_date=today - timedelta(days=365 * 4),
        expiry_date=today + timedelta(days=82),
        renewal_date=today + timedelta(days=45),
        notes=_demo_notes("Fake passport renewal example."),
    )
    visa = Document.objects.create(
        owner=user,
        title="[Demo] Student visa",
        document_type="visa",
        issuer="Demo Immigration Office",
        country="Demo Country",
        reference_number="DEMO-VISA-002",
        expiry_date=today + timedelta(days=25),
        renewal_date=today + timedelta(days=10),
        notes=_demo_notes("Fake visa deadline example."),
    )
    insurance = Document.objects.create(
        owner=user,
        title="[Demo] Travel insurance policy",
        document_type="insurance",
        issuer="Demo Insurance Co.",
        country="Demo Country",
        reference_number="DEMO-INS-003",
        expiry_date=today + timedelta(days=210),
        renewal_date=today + timedelta(days=180),
        notes=_demo_notes("Fake insurance policy example."),
    )

    file_bytes = b"%PDF-1.4\n% CertaNest demo file only\n"
    demo_file = DocumentFile.objects.create(
        document=passport,
        uploaded_by=user,
        file=ContentFile(file_bytes, name="duenest-demo-passport.pdf"),
        original_filename="[Demo] Passport scan.pdf",
        content_type="application/pdf",
        file_size=len(file_bytes),
        checksum=hashlib.sha256(file_bytes).hexdigest(),
    )

    DocumentReminderRule.objects.create(
        owner=user,
        document=passport,
        trigger_type=DocumentReminderRule.TriggerType.BEFORE_RENEWAL_DATE,
        days_before=14,
    )
    DocumentReminderRule.objects.create(
        owner=user,
        document=visa,
        trigger_type=DocumentReminderRule.TriggerType.BEFORE_EXPIRY,
        days_before=7,
    )

    checklist = DocumentChecklist.objects.create(
        owner=user,
        document=passport,
        title="[Demo] Passport renewal checklist",
        description=_demo_notes("Fake checklist for previewing renewal prep."),
        checklist_type=DocumentChecklist.ChecklistType.RENEWAL,
        due_date=today + timedelta(days=45),
    )
    DocumentChecklistItem.objects.bulk_create(
        [
            DocumentChecklistItem(
                owner=user,
                checklist=checklist,
                title="Confirm renewal requirements",
                status=DocumentChecklistItem.Status.COMPLETED,
                completed_at=timezone.now(),
                sort_order=1,
            ),
            DocumentChecklistItem(
                owner=user,
                checklist=checklist,
                title="Prepare passport photo",
                due_date=today + timedelta(days=12),
                sort_order=2,
            ),
            DocumentChecklistItem(
                owner=user,
                checklist=checklist,
                title="Book renewal appointment",
                due_date=today + timedelta(days=18),
                sort_order=3,
            ),
        ]
    )
    checklist.recalculate_progress()

    bundle = DocumentBundle.objects.create(
        owner=user,
        title="[Demo] Visa application pack",
        description="Fake pack showing how documents can be grouped.",
        bundle_type=DocumentBundle.BundleType.APPLICATION,
        target_date=today + timedelta(days=30),
        country="Demo Country",
        authority_or_provider="Demo Embassy",
        notes=_demo_notes("Fake application bundle."),
    )
    DocumentBundleRequirement.objects.bulk_create(
        [
            DocumentBundleRequirement(
                owner=user,
                bundle=bundle,
                title="Passport",
                linked_document=passport,
                linked_file=demo_file,
                status=DocumentBundleRequirement.Status.ATTACHED,
                sort_order=1,
            ),
            DocumentBundleRequirement(
                owner=user,
                bundle=bundle,
                title="Visa document",
                linked_document=visa,
                status=DocumentBundleRequirement.Status.ATTACHED,
                sort_order=2,
            ),
            DocumentBundleRequirement(
                owner=user,
                bundle=bundle,
                title="Insurance proof",
                linked_document=insurance,
                status=DocumentBundleRequirement.Status.MISSING,
                due_date=today + timedelta(days=20),
                sort_order=3,
            ),
        ]
    )
    bundle.recalculate_readiness()

    DocumentFileShareLink.objects.create(
        owner=user,
        document=passport,
        file=demo_file,
        permission=DocumentFileShareLink.Permission.VIEW_ONLY,
        expires_at=timezone.now() + timedelta(days=7),
        label="[Demo] Share with adviser",
        purpose=_demo_notes("Fake secure-sharing example."),
    )

    mark_onboarding_event(user, "first_document_created")
    mark_onboarding_event(user, "first_file_uploaded")
    mark_onboarding_event(user, "first_expiry_date_added")
    mark_onboarding_event(user, "first_reminder_created")
    mark_onboarding_event(user, "first_checklist_created")
    mark_onboarding_event(user, "first_share_link_created")

    return {
        "created": True,
        "demo_marker": DEMO_MARKER,
        "documents": [passport.id, visa.id, insurance.id],
        "file": demo_file.id,
        "bundle": bundle.id,
        "checklist": checklist.id,
    }


__all__ = [
    "ExportGenerationError",
    "build_account_data_summary",
    "build_document_setup_checklist",
    "build_security_summary",
    "cancel_account_deletion",
    "clear_document_demo_data",
    "create_document_demo_data",
    "get_onboarding_state",
    "mark_metadata_timestamp",
    "mark_onboarding_event",
    "request_account_data_export",
    "request_account_deletion",
    "sync_onboarding_state_from_documents",
]
