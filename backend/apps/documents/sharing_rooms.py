"""
Sharing Rooms V1 — secure, owner-scoped workspaces around a pack / application /
emergency case.

A room bundles selected documents/files + Document Request Links behind ONE
unguessable public token, with expiry / revoke / archive controls and view/upload
permission toggles. Deterministic — **no AI, no AI credits**. A bridge toward
CertaNest Portals (NOT a full B2B portal: no staff roles, per-participant tokens,
or redaction/watermarking in V1).

Security: the public payload exposes ONLY the selected items + safe room metadata
— never the owner's vault, identity, private data, or raw storage URLs. Room files
are streamed through an authenticated proxy route (decrypt-in-memory); uploads are
collected through embedded Document Request Links (no second public upload system).
"""

from __future__ import annotations

from django.utils import timezone

from apps.users import plans as user_plans

from .models import (
    Document,
    DocumentBundle,
    DocumentFile,
    DocumentRequestLink,
    SharingRoom,
    SharingRoomItem,
    TrackedApplication,
)
from .plan_usage import enforce_plan_limit

_Status = SharingRoom.Status
_ItemType = SharingRoomItem.ItemType

# Public-resolve outcomes.
RESOLVE_OK = "ok"
RESOLVE_NOT_FOUND = "not_found"
RESOLVE_EXPIRED = "expired"
RESOLVE_REVOKED = "revoked"
RESOLVE_ARCHIVED = "archived"


class SharingRoomError(ValueError):
    """A room-flow error reported to the caller (mapped to a 400)."""


# ---- Create -----------------------------------------------------------------


def create_sharing_room(owner, payload: dict, *, enforce_limit: bool = True) -> SharingRoom:
    """Create an owner-scoped room + mint a public token. Validates linked
    pack/application ownership. Enforces the active-rooms plan limit. No AI.

    ``enforce_limit=False`` skips the personal per-user room limit — used by the
    B2B portal, which governs rooms by ORGANIZATION limits instead of the owner's
    personal plan (the personal default stays True for normal personal use)."""
    title = (payload.get("title") or "").strip()
    if not title:
        raise SharingRoomError("A room title is required.")

    bundle = _owned_or_none(DocumentBundle, owner, payload.get("linked_bundle"))
    application = _owned_or_none(TrackedApplication, owner, payload.get("linked_application"))
    if application is not None and bundle is None and application.linked_bundle_id:
        bundle = application.linked_bundle

    if enforce_limit:
        enforce_plan_limit(owner, user_plans.RESOURCE_SHARING_ROOMS)

    return SharingRoom.objects.create(
        owner=owner,
        title=title[:255],
        description=(payload.get("description") or "").strip(),
        room_type=_room_type(payload.get("room_type")),
        linked_bundle=bundle,
        linked_application=application,
        expires_at=_datetime(payload.get("expires_at")),
        allow_download=bool(payload.get("allow_download", True)),
        allow_upload=bool(payload.get("allow_upload", True)),
    )


def create_room_from_pack(bundle: DocumentBundle, owner, *, payload: dict | None = None,
                          enforce_limit: bool = True) -> SharingRoom:
    """Create a room linked to a pack and auto-add its attached files/documents +
    its missing requirements' Document Request Links (if any)."""
    if bundle.owner_id != owner.id:
        raise SharingRoomError("That pack is not yours.")
    payload = dict(payload or {})
    payload.setdefault("title", f"{bundle.title} Room")
    payload.setdefault("room_type", SharingRoom.RoomType.PACK)
    payload["linked_bundle"] = bundle.id
    room = create_sharing_room(owner, payload, enforce_limit=enforce_limit)
    _populate_from_bundle(room, bundle, owner)
    return room


def create_room_from_application(application: TrackedApplication, owner, *, payload: dict | None = None) -> SharingRoom:
    """Create a room linked to an application (and its pack, if any)."""
    if application.owner_id != owner.id:
        raise SharingRoomError("That application is not yours.")
    payload = dict(payload or {})
    payload.setdefault("title", f"{application.title} Room")
    payload.setdefault("room_type", SharingRoom.RoomType.APPLICATION)
    payload["linked_application"] = application.id
    room = create_sharing_room(owner, payload)
    if application.linked_bundle_id:
        _populate_from_bundle(room, application.linked_bundle, owner)
    return room


def _populate_from_bundle(room: SharingRoom, bundle: DocumentBundle, owner) -> None:
    """Add a pack's already-attached files/documents as room items (owner-scoped)."""
    sort = room.items.count()
    seen_files: set[int] = set()
    for req in bundle.requirements.all():
        if req.linked_file_id and req.linked_file_id not in seen_files:
            f = req.linked_file
            if f and f.uploaded_by_id == owner.id and not f.is_trashed:
                SharingRoomItem.objects.create(
                    room=room, item_type=_ItemType.FILE, file=f,
                    title=req.title[:255], sort_order=sort,
                )
                seen_files.add(req.linked_file_id)
                sort += 1
        elif req.linked_document_id:
            d = req.linked_document
            if d and d.owner_id == owner.id and not d.is_trashed:
                SharingRoomItem.objects.create(
                    room=room, item_type=_ItemType.DOCUMENT, document=d,
                    title=req.title[:255] or d.title[:255], sort_order=sort,
                )
                sort += 1


# ---- Items ------------------------------------------------------------------


def add_room_item(room: SharingRoom, owner, payload: dict) -> SharingRoomItem:
    """
    Add ONE owner-owned target to the room: a Document, a DocumentFile, or a
    Document Request Link. Validates ownership of the target. No AI.
    """
    item_type = (payload.get("item_type") or "").strip()
    title = (payload.get("title") or "").strip()[:255]
    note = (payload.get("note") or "").strip()[:500]
    sort = room.items.count()

    if item_type == _ItemType.DOCUMENT:
        doc = _owned_or_error(Document, owner, payload.get("document"), field="owner")
        return SharingRoomItem.objects.create(
            room=room, item_type=item_type, document=doc,
            title=title or doc.title[:255], note=note, sort_order=sort,
        )
    if item_type == _ItemType.FILE:
        f = _owned_file(owner, payload.get("file"))
        return SharingRoomItem.objects.create(
            room=room, item_type=item_type, file=f,
            title=title or f.original_filename[:255], note=note, sort_order=sort,
        )
    if item_type == _ItemType.REQUEST:
        link = _owned_or_error(DocumentRequestLink, owner, payload.get("request_link"), field="owner")
        return SharingRoomItem.objects.create(
            room=room, item_type=item_type, request_link=link,
            title=title or link.requested_document_title[:255], note=note, sort_order=sort,
        )
    raise SharingRoomError("item_type must be one of: document, file, request.")


def add_document_request_to_room(room: SharingRoom, request_link: DocumentRequestLink, owner) -> SharingRoomItem:
    """Add an existing owner-owned Document Request Link to the room."""
    if request_link.owner_id != owner.id:
        raise SharingRoomError("That document request is not yours.")
    return SharingRoomItem.objects.create(
        room=room, item_type=_ItemType.REQUEST, request_link=request_link,
        title=request_link.requested_document_title[:255],
        sort_order=room.items.count(),
    )


def remove_room_item(room: SharingRoom, owner, item_id) -> None:
    item = room.items.filter(pk=item_id).first()
    if item is None:
        raise SharingRoomError("That item is not in this room.")
    item.delete()


# ---- Lifecycle --------------------------------------------------------------


def revoke_sharing_room(room: SharingRoom, owner) -> SharingRoom:
    if room.status not in (_Status.REVOKED, _Status.ARCHIVED):
        room.status = _Status.REVOKED
        room.revoked_at = timezone.now()
        room.save(update_fields=["status", "revoked_at", "updated_at"])
    return room


def archive_sharing_room(room: SharingRoom, owner) -> SharingRoom:
    if room.status != _Status.ARCHIVED:
        room.status = _Status.ARCHIVED
        room.save(update_fields=["status", "updated_at"])
    return room


def expire_sharing_rooms(now=None) -> int:
    """Deterministic sweep: mark past-expiry active rooms as expired."""
    now = now or timezone.now()
    return SharingRoom.objects.filter(
        status=_Status.ACTIVE, expires_at__isnull=False, expires_at__lte=now
    ).update(status=_Status.EXPIRED, updated_at=now)


# ---- Public resolve + open --------------------------------------------------


def resolve_sharing_room_token(token: str):
    """Resolve a public token to ``(room, state)``. Never raises."""
    if not token:
        return None, RESOLVE_NOT_FOUND
    room = SharingRoom.objects.filter(token=token).first()
    if room is None:
        return None, RESOLVE_NOT_FOUND
    if room.status == _Status.REVOKED:
        return room, RESOLVE_REVOKED
    if room.status == _Status.ARCHIVED:
        return room, RESOLVE_NOT_FOUND
    if room.is_expired or room.status == _Status.EXPIRED:
        return room, RESOLVE_EXPIRED
    return room, RESOLVE_OK


def mark_room_opened(room: SharingRoom) -> None:
    now = timezone.now()
    if room.opened_at is None:
        room.opened_at = now
    room.last_opened_at = now
    room.open_count = (room.open_count or 0) + 1
    room.save(update_fields=["opened_at", "last_opened_at", "open_count", "updated_at"])


# ---- Payloads ---------------------------------------------------------------


def build_public_sharing_room_payload(room: SharingRoom) -> dict:
    """
    Recipient-facing payload: safe room metadata + ONLY the selected items. No
    owner identity/email, no raw file URLs. File items carry a file_id used by the
    public proxy route (preview/download) — never a storage URL. Request items
    carry the request link's own public token so the page can route uploads to the
    existing Document Request page.
    """
    documents = []
    requests = []
    for item in room.items.select_related("document", "file", "request_link").all():
        if item.item_type == _ItemType.FILE and item.file and not item.file.is_trashed:
            documents.append(_public_file_entry(item, item.file))
        elif item.item_type == _ItemType.DOCUMENT and item.document and not item.document.is_trashed:
            # Expose the document's live files (proxied), not the document record.
            for f in item.document.files.filter(is_trashed=False):
                documents.append(_public_file_entry(item, f))
        elif item.item_type == _ItemType.REQUEST and item.request_link:
            link = item.request_link
            requests.append({
                "title": (item.title or link.requested_document_title),
                "instructions": link.instructions,
                "status": link.status,
                "can_upload": link.can_upload and room.allow_upload,
                "upload_token": link.token if room.allow_upload else None,
            })

    return {
        "title": room.title,
        "description": room.description,
        "room_type": room.room_type,
        "status": room.status,
        "allow_download": room.allow_download,
        "allow_upload": room.allow_upload,
        "expires_at": room.expires_at.isoformat() if room.expires_at else None,
        "from_name": _owner_display_name(room.owner),
        "app_name": "CertaNest",
        # Linked-context labels only — never ids/owner data.
        "context": _safe_context(room),
        "documents": documents,
        "requests": requests,
    }


def _public_file_entry(item: SharingRoomItem, f: DocumentFile) -> dict:
    return {
        "file_id": f.id,
        "name": f.original_filename,
        "content_type": f.content_type,
        "file_size": f.file_size,
        "is_previewable": f.is_previewable,
        "label": item.title or f.original_filename,
    }


def _safe_context(room: SharingRoom) -> dict:
    ctx = {}
    if room.linked_bundle_id:
        ctx["pack_title"] = room.linked_bundle.title
    if room.linked_application_id:
        ctx["application_title"] = room.linked_application.title
    return ctx


def public_room_file(room: SharingRoom, file_id) -> DocumentFile | None:
    """Return a DocumentFile ONLY if it is exposed by this room (owner-scoped),
    else None. Used by the public proxy route — permission-first."""
    ids = set()
    for item in room.items.select_related("document", "file").all():
        if item.item_type == _ItemType.FILE and item.file_id:
            ids.add(item.file_id)
        elif item.item_type == _ItemType.DOCUMENT and item.document_id:
            ids.update(
                item.document.files.filter(is_trashed=False).values_list("id", flat=True)
            )
    try:
        file_id = int(file_id)
    except (TypeError, ValueError):
        return None
    if file_id not in ids:
        return None
    return DocumentFile.objects.filter(pk=file_id, is_trashed=False).first()


# ---- Helpers ----------------------------------------------------------------


def _owned_or_none(model, owner, pk):
    if not pk:
        return None
    obj = model.objects.filter(owner=owner, pk=pk).first()
    if obj is None:
        raise SharingRoomError(f"The linked {model.__name__} was not found or is not yours.")
    return obj


def _owned_or_error(model, owner, pk, *, field="owner"):
    if not pk:
        raise SharingRoomError(f"A {model.__name__} id is required.")
    obj = model.objects.filter(**{field: owner}, pk=pk).first()
    if obj is None:
        raise SharingRoomError(f"That {model.__name__} was not found or is not yours.")
    return obj


def _owned_file(owner, pk) -> DocumentFile:
    if not pk:
        raise SharingRoomError("A file id is required.")
    from django.db.models import Q

    f = DocumentFile.objects.filter(
        Q(document__owner=owner) | Q(document__isnull=True, uploaded_by=owner),
        pk=pk, is_trashed=False,
    ).first()
    if f is None:
        raise SharingRoomError("That file was not found or is not yours.")
    return f


def _owner_display_name(owner) -> str:
    name = (getattr(owner, "first_name", "") or "").strip()
    return name or "A CertaNest user"


def _room_type(value) -> str:
    value = (value or "").strip().lower()
    return value if value in SharingRoom.RoomType.values else SharingRoom.RoomType.GENERAL


def _datetime(value):
    if not value:
        return None
    from django.utils.dateparse import parse_datetime

    parsed = parse_datetime(str(value))
    if parsed is not None and timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed
