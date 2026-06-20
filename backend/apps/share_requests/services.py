"""
Fulfilment: turn a responder's per-item file selection into a delivered share.

The response is delivered through the existing Quick Share engine — a session owned
by the responder with a pre-accepted claim for the requester — so it lands in the
requester's "Shared with me" with no new delivery machinery.
"""

from __future__ import annotations

import logging

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.documents.models import DocumentFile
from apps.quick_share.models import (
    QuickShareClaim,
    QuickShareItem,
    QuickShareSession,
)

from .models import ShareRequest, ShareRequestResponse

logger = logging.getLogger(__name__)

# How long the delivered share stays openable by the requester.
RESPONSE_TTL_DAYS = 90


class FulfilmentError(Exception):
    """Raised with a user-facing message when a response can't be created."""


def _owned_file(file_id, responder) -> DocumentFile | None:
    """A live file the responder owns (vault document file or their inbox file)."""
    return (
        DocumentFile.objects.filter(id=file_id, is_trashed=False)
        .filter(
            Q(document__owner=responder, document__is_trashed=False)
            | Q(document__isnull=True, uploaded_by=responder)
        )
        .first()
    )


@transaction.atomic
def fulfil_request(request_obj: ShareRequest, responder, item_files: dict):
    """
    Build the delivered share for ``responder`` answering ``request_obj``.

    ``item_files`` maps ShareRequestItem id -> list of file ids. Every required item
    must receive at least one file the responder owns; unknown/foreign files are
    rejected. Returns the created ShareRequestResponse.
    """
    items = list(request_obj.items.all())

    # Resolve + validate each item's files (owner-scoped); enforce required items.
    resolved: list[tuple] = []  # (item, [DocumentFile])
    seen_file_ids: set[int] = set()
    for item in items:
        raw_ids = item_files.get(item.id) or item_files.get(str(item.id)) or []
        files = []
        for fid in raw_ids:
            file = _owned_file(fid, responder)
            if file is None:
                raise FulfilmentError(
                    "You can only attach your own files to a request."
                )
            files.append(file)
            seen_file_ids.add(file.id)
        if item.is_required and not files:
            raise FulfilmentError(f"“{item.label}” is required — please attach a file.")
        resolved.append((item, files))

    if not seen_file_ids:
        raise FulfilmentError("Attach at least one file to respond.")

    # Deliver through the Quick Share engine: a session owned by the responder.
    session = QuickShareSession.objects.create(
        owner=responder,
        mode=QuickShareSession.Mode.ACCOUNT_TO_ACCOUNT,
        permission=QuickShareSession.Permission.DOWNLOAD_ALLOWED,
        title=f"Response: {request_obj.title}"[:255],
        purpose="Share request response",
        expires_at=timezone.now() + timezone.timedelta(days=RESPONSE_TTL_DAYS),
        watermark_enabled=False,
    )
    order = 0
    summary = []
    for item, files in resolved:
        for file in files:
            QuickShareItem.objects.create(
                session=session,
                document=file.document,
                file=file,
                order=order,
            )
            order += 1
        summary.append(
            {
                "item_id": item.id,
                "label": item.label,
                "files": [f.original_filename for f in files],
            }
        )

    # Pre-accepted claim for the requester so it shows in their "Shared with me".
    requester = request_obj.owner
    now = timezone.now()
    QuickShareClaim.objects.create(
        session=session,
        receiver_user=requester,
        receiver_email=getattr(requester, "email", "") or "",
        status=QuickShareClaim.Status.ACCEPTED,
        approval=QuickShareClaim.Approval.NOT_REQUIRED,
        claimed_at=now,
        accepted_at=now,
    )

    response = ShareRequestResponse.objects.create(
        request=request_obj,
        responder=responder,
        session=session,
        summary=summary,
    )

    # The request stays OPEN so it can collect responses from more than one person
    # (e.g. the same link sent to several people); the owner closes it when done.
    _notify_requester(request_obj, responder)
    return response


def _notify_requester(request_obj: ShareRequest, responder) -> None:
    """Calm in-app notification to the requester. Never breaks the response flow."""
    try:
        from apps.notifications.services import (
            NotificationCandidate,
            create_notification,
            get_preferences,
            sanitize_metadata,
        )

        prefs = get_preferences(request_obj.owner)
        if not prefs.in_app_enabled:
            return
        name = (responder.get_full_name() or "").strip() or "Someone"
        candidate = NotificationCandidate(
            user=request_obj.owner,
            type="generic_reminder",
            title="Request fulfilled",
            message=f"{name} responded to “{request_obj.title}”. The files are in Shared with me.",
            severity="success",
            source_type="share_request",
            source_id=str(request_obj.id),
            action_url="/dashboard/shared-with-me",
            scheduled_for=timezone.now(),
            dedupe_key=f"share_request_response:{request_obj.id}:{responder.id}"[:255],
            metadata=sanitize_metadata({"channel": "share_request"}),
        )
        create_notification(candidate)
    except Exception:  # noqa: BLE001 — notifications must never break the flow
        logger.warning("Failed to notify requester of fulfilment", exc_info=True)
