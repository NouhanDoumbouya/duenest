"""
Custom Document Organization V1 — virtual, metadata-only document organization.

Folders / collections / (reused) tags / saved-and-smart views over the existing
``Document`` model. This NEVER changes a file's R2 object key, NEVER exposes a file
URL or token, and is NEVER used as access control — sharing stays governed by
SharingRoom / DocumentRequestLink. Deterministic — no AI, no AI credits.

Scope: every folder/collection/tag is scoped to exactly one of a personal owner
(``owner`` set, ``organization`` null) OR an organization (``organization`` set;
``owner`` = the org-owner user, matching the rest of the B2B portal). The view
layer resolves the scope + checks membership/role; this service validates that
objects belong to the scope and records audit events.
"""

from __future__ import annotations

from datetime import timedelta

from django.db import models
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.text import slugify

from apps.users import plans as user_plans

from .audit import record_audit_event
from .models import (
    Document,
    DocumentCollection,
    DocumentCollectionItem,
    DocumentFolder,
    DocumentTag,
)

_AUDIT_CATEGORY = "document"
EXPIRING_SOON_DAYS = 30
RECENT_DAYS = 14


class FolderError(ValueError):
    """An organization-flow error reported to the caller (mapped to a 400)."""


# ---- Limits -----------------------------------------------------------------

# Conservative per-plan caps (server-side; no Stripe). Tune in one place.
_PERSONAL_CAPS = {
    "free": {"folders": 20, "tags": 20, "collections": 5},
    "pro": {"folders": 500, "tags": 200, "collections": 100},
}
_ORG_CAPS = {
    "teams_beta": {"folders": 500, "tags": 200, "collections": 100},
    "teams": {"folders": 2000, "tags": 500, "collections": 500},
    "enterprise": {"folders": None, "tags": None, "collections": None},
}


def _personal_caps(user) -> dict:
    plan = user_plans.normalize_plan(getattr(user, "plan", "") or "")
    tier = "free" if plan == user_plans.PLAN_FREE else "pro"
    return _PERSONAL_CAPS[tier]


def _org_caps(organization) -> dict:
    from apps.organizations.portal_limits import _plan_for

    plan = _plan_for(organization)
    return _ORG_CAPS.get(plan, _ORG_CAPS["teams_beta"])


def _enforce_cap(owner, organization, resource: str, model):
    caps = _personal_caps(owner) if organization is None else _org_caps(organization)
    cap = caps.get(resource)
    if cap is None:
        return
    used = model.objects.filter(**_scope_kwargs(owner, organization)).count()
    if used >= cap:
        raise FolderError(
            f"You have reached the {resource} limit for this plan ({cap})."
        )


# ---- Scope helpers ----------------------------------------------------------


def _scope_kwargs(owner, organization) -> dict:
    if organization is not None:
        return {"organization": organization}
    return {"owner": owner, "organization__isnull": True}


def _scope_owner(owner, organization):
    """The user who OWNS the documents in this scope (personal: the user; org: the
    org-owner user)."""
    if organization is None:
        return owner
    from apps.organizations.portals import _org_owner_user

    return _org_owner_user(organization)


def _document_qs(owner, organization):
    doc_owner = _scope_owner(owner, organization)
    return Document.objects.filter(owner=doc_owner, is_trashed=False)


# ---- Folders ----------------------------------------------------------------


def create_folder(owner, organization, user, payload: dict) -> DocumentFolder:
    name = (payload.get("name") or "").strip()
    if not name:
        raise FolderError("A folder name is required.")
    _enforce_cap(owner, organization, "folders", DocumentFolder)
    parent = _resolve_folder(owner, organization, payload.get("parent"))
    folder = DocumentFolder.objects.create(
        owner=owner if organization is None else _scope_owner(owner, organization),
        organization=organization,
        parent=parent,
        name=name[:120],
        description=(payload.get("description") or "").strip()[:255],
        color=(payload.get("color") or "").strip()[:20],
        icon=(payload.get("icon") or "").strip()[:40],
        sort_order=_int(payload.get("sort_order")),
        folder_type=_choice(payload.get("folder_type"), DocumentFolder.FolderType,
                            DocumentFolder.FolderType.NORMAL),
        created_by=user,
    )
    _audit(owner, organization, user, "document_folder_created", obj=folder,
           metadata={"folder_id": folder.id, "folder_name": folder.name})
    return folder


def update_folder(folder, user, payload: dict) -> DocumentFolder:
    fields = []
    for attr, key, maxlen in (("name", "name", 120), ("description", "description", 255),
                              ("color", "color", 20), ("icon", "icon", 40)):
        if key in payload:
            setattr(folder, attr, (payload.get(key) or "").strip()[:maxlen])
            fields.append(attr)
    if "sort_order" in payload:
        folder.sort_order = _int(payload.get("sort_order"))
        fields.append("sort_order")
    if not folder.name.strip():
        raise FolderError("A folder name is required.")
    if "name" in payload:
        folder.normalized_name = slugify(folder.name)[:140]
        fields.append("normalized_name")
    if fields:
        fields.append("updated_at")
        folder.save(update_fields=fields)
    _audit(folder.owner, folder.organization, user, "document_folder_updated",
           obj=folder, metadata={"folder_id": folder.id, "folder_name": folder.name})
    return folder


def archive_folder(folder, user) -> DocumentFolder:
    if not folder.is_archived:
        folder.is_archived = True
        folder.save(update_fields=["is_archived", "updated_at"])
        _audit(folder.owner, folder.organization, user, "document_folder_archived",
               obj=folder, metadata={"folder_id": folder.id, "folder_name": folder.name})
    return folder


def move_folder(folder, new_parent, user) -> DocumentFolder:
    """Re-parent a folder. Same scope only; rejects cycles (a folder cannot become
    a descendant of itself). Never touches any file storage key."""
    if new_parent is not None:
        if (new_parent.owner_id != folder.owner_id
                or new_parent.organization_id != folder.organization_id):
            raise FolderError("The new parent must be in the same scope.")
        if new_parent.id == folder.id or _is_descendant(new_parent, folder):
            raise FolderError("A folder cannot be moved into itself or its descendants.")
    folder.parent = new_parent
    folder.save(update_fields=["parent", "updated_at"])
    _audit(folder.owner, folder.organization, user, "document_folder_moved",
           obj=folder, metadata={"folder_id": folder.id,
                                 "result": str(new_parent.id) if new_parent else "root"})
    return folder


def _is_descendant(candidate, ancestor) -> bool:
    """True if ``candidate`` is ``ancestor`` or below it in the tree."""
    node = candidate
    seen = set()
    while node is not None:
        if node.id in seen:
            break
        seen.add(node.id)
        if node.id == ancestor.id:
            return True
        node = node.parent
    return False


def assign_document_to_folder(document, folder, user) -> Document:
    """Set a document's primary folder (or clear it when ``folder`` is None).
    Validates same-scope ownership. METADATA ONLY — no storage key changes."""
    if folder is not None:
        if document.owner_id != folder.owner_id:
            raise FolderError("That document is not in this folder's scope.")
    document.primary_folder = folder
    document.save(update_fields=["primary_folder", "updated_at"])
    record_audit_event(
        document.owner, "document_moved_to_folder", _AUDIT_CATEGORY,
        actor_user=user if getattr(user, "is_authenticated", False) else None,
        obj=document, object_label=document.title,
        metadata=_org_meta(folder.organization if folder else None, {
            "document_id": document.id,
            "folder_id": folder.id if folder else "",
            "folder_name": folder.name if folder else "",
        }),
    )
    return document


# ---- Tags (reuses the existing DocumentTag model) ---------------------------


def create_tag(owner, organization, user, payload: dict) -> DocumentTag:
    name = (payload.get("name") or "").strip()
    if not name:
        raise FolderError("A tag name is required.")
    _enforce_cap(owner, organization, "tags", DocumentTag)
    slug = slugify(name)[:80]
    tag_owner = _scope_owner(owner, organization)
    existing = DocumentTag.objects.filter(
        owner=tag_owner, organization=organization, slug=slug
    ).first()
    if existing:
        return existing
    tag = DocumentTag.objects.create(
        owner=tag_owner, organization=organization, name=name[:60], slug=slug,
        color=(payload.get("color") or "").strip()[:20],
    )
    _audit(owner, organization, user, "document_tag_created", obj=tag,
           metadata={"tag_names": [tag.name]})
    return tag


def assign_tags(document, tag_ids, user, *, organization=None) -> Document:
    """Replace a document's tag set (scoped). METADATA ONLY."""
    tags = list(DocumentTag.objects.filter(
        owner=document.owner, id__in=[t for t in (tag_ids or [])]
    ))
    document.tags.set(tags)
    record_audit_event(
        document.owner, "document_tags_updated", _AUDIT_CATEGORY,
        actor_user=user if getattr(user, "is_authenticated", False) else None,
        obj=document, object_label=document.title,
        metadata=_org_meta(organization, {
            "document_id": document.id, "tag_names": [t.name for t in tags][:20],
        }),
    )
    return document


# ---- Collections ------------------------------------------------------------


def create_collection(owner, organization, user, payload: dict) -> DocumentCollection:
    name = (payload.get("name") or "").strip()
    if not name:
        raise FolderError("A collection name is required.")
    _enforce_cap(owner, organization, "collections", DocumentCollection)
    collection_type = _choice(payload.get("collection_type"),
                              DocumentCollection.CollectionType,
                              DocumentCollection.CollectionType.MANUAL)
    collection = DocumentCollection.objects.create(
        owner=owner if organization is None else _scope_owner(owner, organization),
        organization=organization,
        name=name[:120],
        description=(payload.get("description") or "").strip()[:255],
        color=(payload.get("color") or "").strip()[:20],
        icon=(payload.get("icon") or "").strip()[:40],
        collection_type=collection_type,
        filter_config=sanitize_filter_config(payload.get("filter_config")),
        created_by=user,
    )
    _audit(owner, organization, user, "document_collection_created", obj=collection,
           metadata={"collection_id": collection.id, "collection_name": collection.name})
    return collection


def add_to_collection(collection, document, user) -> DocumentCollectionItem:
    if document.owner_id != _scope_owner(collection.owner, collection.organization).id:
        raise FolderError("That document is not in this collection's scope.")
    item, created = DocumentCollectionItem.objects.get_or_create(
        collection=collection, document=document, defaults={"added_by": user}
    )
    if created:
        _audit(collection.owner, collection.organization, user,
               "document_added_to_collection", obj=collection,
               metadata={"collection_id": collection.id, "document_id": document.id})
    return item


def remove_from_collection(collection, document, user) -> None:
    deleted, _ = DocumentCollectionItem.objects.filter(
        collection=collection, document=document
    ).delete()
    if deleted:
        _audit(collection.owner, collection.organization, user,
               "document_removed_from_collection", obj=collection,
               metadata={"collection_id": collection.id, "document_id": document.id})


# ---- Trees, contents, smart views -------------------------------------------


def build_folder_tree(owner, organization, *, include_archived=False) -> list[dict]:
    qs = DocumentFolder.objects.filter(**_scope_kwargs(owner, organization))
    if not include_archived:
        qs = qs.filter(is_archived=False)
    qs = qs.annotate(doc_count=Count("documents", filter=Q(documents__is_trashed=False)))
    by_parent: dict = {}
    for folder in qs:
        by_parent.setdefault(folder.parent_id, []).append(folder)

    def node(folder):
        payload = build_folder_payload(folder)
        payload["children"] = [node(c) for c in by_parent.get(folder.id, [])]
        return payload

    return [node(f) for f in by_parent.get(None, [])]


def build_folder_contents(folder, *, filters=None) -> dict:
    filters = filters or {}
    qs = Document.objects.filter(primary_folder=folder, is_trashed=False)
    qs = _apply_document_filters(qs, filters)
    return {
        "folder": build_folder_payload(folder),
        "breadcrumb": _breadcrumb(folder),
        "documents": [build_document_org_payload(d) for d in qs[:500]],
        "count": qs.count(),
    }


# Whitelisted saved/smart-view filter keys (no raw SQL / tokens / URLs).
SMART_VIEW_FILTERS = (
    "document_type", "tag_id", "folder_id", "status", "lifecycle_status",
    "expiring_soon", "needs_review", "recently_uploaded", "unfiled",
    "uploaded_after", "uploaded_before", "due_after", "due_before",
)


def sanitize_filter_config(filter_config) -> dict:
    if not isinstance(filter_config, dict):
        return {}
    return {k: filter_config[k] for k in filter_config if k in SMART_VIEW_FILTERS}


def build_smart_view(owner, organization, filter_config) -> dict:
    cfg = sanitize_filter_config(filter_config)
    qs = _apply_document_filters(_document_qs(owner, organization), cfg)
    return {
        "filter_config": cfg,
        "documents": [build_document_org_payload(d) for d in qs[:500]],
        "count": qs.count(),
    }


def _apply_document_filters(qs, filters: dict):
    today = timezone.now().date()
    if filters.get("document_type"):
        qs = qs.filter(document_type__iexact=str(filters["document_type"]))
    if filters.get("status"):
        qs = qs.filter(status=filters["status"])
    if filters.get("lifecycle_status"):
        qs = qs.filter(lifecycle_status=filters["lifecycle_status"])
    if filters.get("tag_id"):
        qs = qs.filter(tags__id=filters["tag_id"])
    if filters.get("folder_id"):
        qs = qs.filter(primary_folder_id=filters["folder_id"])
    if _truthy(filters.get("unfiled")):
        qs = qs.filter(primary_folder__isnull=True)
    if _truthy(filters.get("expiring_soon")):
        soon = today + timedelta(days=EXPIRING_SOON_DAYS)
        qs = qs.filter(expiry_date__isnull=False, expiry_date__gte=today,
                       expiry_date__lte=soon)
    if _truthy(filters.get("recently_uploaded")):
        since = timezone.now() - timedelta(days=RECENT_DAYS)
        qs = qs.filter(created_at__gte=since)
    for key, lookup in (("uploaded_after", "created_at__date__gte"),
                        ("uploaded_before", "created_at__date__lte"),
                        ("due_after", "expiry_date__gte"),
                        ("due_before", "expiry_date__lte")):
        if filters.get(key):
            qs = qs.filter(**{lookup: filters[key]})
    return qs.distinct().order_by("-updated_at")


# ---- System / case / person / template folders ------------------------------

PERSONAL_SYSTEM_FOLDERS = ["Unfiled", "Protected copies"]
ORG_SYSTEM_FOLDERS = ["Unfiled", "Cases", "People", "Protected copies"]


def ensure_system_folders(owner, organization) -> dict:
    names = ORG_SYSTEM_FOLDERS if organization is not None else PERSONAL_SYSTEM_FOLDERS
    out = {}
    scope_owner = _scope_owner(owner, organization)
    for i, name in enumerate(names):
        folder, _ = DocumentFolder.objects.get_or_create(
            **_scope_kwargs(owner, organization),
            normalized_name=slugify(name)[:140],
            parent__isnull=True,
            defaults={"owner": scope_owner, "organization": organization,
                      "name": name, "folder_type": DocumentFolder.FolderType.SYSTEM,
                      "sort_order": i},
        )
        out[name] = folder
    return out


def _root_folder(organization, name):
    """Get-or-create a top-level org folder by name (e.g. 'People' / 'Cases')."""
    from apps.organizations.portals import _org_owner_user

    owner = _org_owner_user(organization)
    folder, _ = DocumentFolder.objects.get_or_create(
        organization=organization, normalized_name=slugify(name)[:140],
        parent__isnull=True,
        defaults={"owner": owner, "name": name,
                  "folder_type": DocumentFolder.FolderType.SYSTEM},
    )
    return folder


def ensure_person_folder(person, user=None) -> DocumentFolder:
    """Get-or-create the org folder for a portal person (under 'People')."""
    org = person.organization
    existing = DocumentFolder.objects.filter(
        organization=org, linked_person=person, is_archived=False
    ).first()
    if existing:
        return existing
    from apps.organizations.portals import _org_owner_user

    folder = DocumentFolder.objects.create(
        owner=_org_owner_user(org), organization=org, parent=_root_folder(org, "People"),
        name=person.full_name[:120], folder_type=DocumentFolder.FolderType.PERSON,
        linked_person=person, created_by=user,
    )
    _audit(folder.owner, org, user, "person_folder_created", obj=folder,
           metadata={"folder_id": folder.id, "person_id": person.id})
    return folder


def ensure_case_folder(case, user=None) -> DocumentFolder:
    """Get-or-create the org folder for a portal case. Placement follows the org's
    structure preference (by_person → under the person folder; by_case → under
    'Cases'/case_type)."""
    org = case.organization
    existing = DocumentFolder.objects.filter(
        organization=org, linked_case=case, is_archived=False
    ).first()
    if existing:
        return existing
    pref = get_structure_preference(org)
    from apps.organizations.portals import _org_owner_user

    if pref.structure_mode == pref.StructureMode.BY_CASE:
        parent = _subfolder(_root_folder(org, "Cases"), case.get_case_type_display(), org)
    elif pref.default_root_folder_id and pref.structure_mode == pref.StructureMode.CUSTOM:
        parent = pref.default_root_folder
    else:  # by_person (default)
        parent = ensure_person_folder(case.person, user) if case.person_id else _root_folder(org, "Cases")
    folder = DocumentFolder.objects.create(
        owner=_org_owner_user(org), organization=org, parent=parent,
        name=case.title[:120], folder_type=DocumentFolder.FolderType.CASE,
        linked_case=case, linked_person=case.person, created_by=user,
    )
    _audit(folder.owner, org, user, "case_folder_created", obj=folder,
           metadata={"folder_id": folder.id, "case_id": case.id})
    ensure_template_folders(case, folder, user)
    return folder


def _subfolder(parent, name, organization):
    from apps.organizations.portals import _org_owner_user

    folder, _ = DocumentFolder.objects.get_or_create(
        organization=organization, parent=parent, normalized_name=slugify(name)[:140],
        defaults={"owner": _org_owner_user(organization), "name": name,
                  "folder_type": DocumentFolder.FolderType.SYSTEM},
    )
    return folder


def ensure_template_folders(case, case_folder, user=None) -> list[DocumentFolder]:
    """Seed the case folder with the template's folder blueprint subfolders, if the
    case was created from a template that has one."""
    from .models import OrganizationTemplateFolderBlueprint

    blueprints = []
    # Find a template linked through the case's pack title match is unreliable; V1
    # blueprints are applied when a template_id is passed explicitly elsewhere.
    tmpl_id = getattr(case, "_template_id", None)
    if tmpl_id:
        blueprints = list(OrganizationTemplateFolderBlueprint.objects.filter(
            template_id=tmpl_id).order_by("sort_order"))
    out = []
    for bp in blueprints:
        out.append(_subfolder(case_folder, bp.name, case.organization))
    return out


# ---- Auto-filing ------------------------------------------------------------


def auto_file_document_for_case_upload(case_request, user=None) -> Document | None:
    """Opt-in: when an org enables ``auto_file_accepted_uploads``, materialize the
    accepted upload as a vault Document (owned by the org owner) and file it into
    the case folder. Best-effort — never raises, never blocks the review-accept
    flow. Returns the filed Document or None."""
    try:
        case = case_request.case
        org = case.organization
        pref = get_structure_preference(org)
        if not pref.auto_file_accepted_uploads:
            return None
        link = case_request.document_request
        if link is None or link.uploaded_file_id is None:
            return None
        from .document_requests import save_request_file_to_vault

        document = save_request_file_to_vault(link)  # owner = org owner; enforces doc limit
        folder = ensure_case_folder(case, user)
        document.primary_folder = folder
        document.save(update_fields=["primary_folder", "updated_at"])
        record_audit_event(
            document.owner, "document_auto_filed", _AUDIT_CATEGORY,
            actor_user=user if getattr(user, "is_authenticated", False) else None,
            obj=document, object_label=document.title,
            metadata=_org_meta(org, {"document_id": document.id, "folder_id": folder.id,
                                     "case_id": case.id, "result": "filed"}),
        )
        return document
    except Exception:  # noqa: BLE001 — auto-filing must never break accept
        return None


# ---- Structure preference ---------------------------------------------------


def get_structure_preference(organization):
    from .models import OrganizationDocumentStructurePreference

    pref, _ = OrganizationDocumentStructurePreference.objects.get_or_create(
        organization=organization
    )
    return pref


def update_structure_preference(organization, user, payload: dict):
    pref = get_structure_preference(organization)
    if "structure_mode" in payload:
        pref.structure_mode = _choice(
            payload.get("structure_mode"), pref.StructureMode, pref.structure_mode)
    for attr in ("auto_create_case_folder", "auto_create_person_folder",
                 "auto_file_accepted_uploads"):
        if attr in payload:
            setattr(pref, attr, _truthy(payload.get(attr)))
    if "default_root_folder_id" in payload:
        folder = DocumentFolder.objects.filter(
            organization=organization, pk=payload.get("default_root_folder_id")
        ).first()
        pref.default_root_folder = folder
    pref.updated_by = user
    pref.save()
    _audit(_scope_owner(None, organization), organization, user,
           "organization_document_structure_updated", obj=pref,
           metadata={"result": pref.structure_mode})
    return pref


# ---- Payloads ---------------------------------------------------------------


def build_folder_payload(folder) -> dict:
    return {
        "id": folder.id,
        "name": folder.name,
        "parent_id": folder.parent_id,
        "description": folder.description,
        "color": folder.color,
        "icon": folder.icon,
        "sort_order": folder.sort_order,
        "folder_type": folder.folder_type,
        "linked_case_id": folder.linked_case_id,
        "linked_person_id": folder.linked_person_id,
        "is_archived": folder.is_archived,
        "document_count": getattr(folder, "doc_count", None),
        "created_at": folder.created_at.isoformat(),
        "updated_at": folder.updated_at.isoformat(),
    }


def build_tag_payload(tag) -> dict:
    return {"id": tag.id, "name": tag.name, "slug": tag.slug, "color": tag.color}


def build_collection_payload(collection) -> dict:
    return {
        "id": collection.id,
        "name": collection.name,
        "description": collection.description,
        "color": collection.color,
        "icon": collection.icon,
        "collection_type": collection.collection_type,
        "filter_config": collection.filter_config or {},
        "item_count": collection.items.count(),
        "created_at": collection.created_at.isoformat(),
    }


def build_document_org_payload(document) -> dict:
    """A SAFE document summary for folder/collection/view listings. NEVER includes a
    file URL, storage key, or document content."""
    return {
        "id": document.id,
        "title": document.title,
        "document_type": document.document_type,
        "status": document.status,
        "primary_folder_id": document.primary_folder_id,
        "expiry_date": document.expiry_date.isoformat() if document.expiry_date else None,
        "tags": [t.name for t in document.tags.all()[:20]],
        "updated_at": document.updated_at.isoformat(),
    }


# ---- Resolution helpers -----------------------------------------------------


def _resolve_folder(owner, organization, folder_id):
    if not folder_id:
        return None
    folder = DocumentFolder.objects.filter(
        **_scope_kwargs(owner, organization), pk=folder_id
    ).first()
    if folder is None:
        raise FolderError("Parent folder not found in this scope.")
    return folder


def _breadcrumb(folder) -> list[dict]:
    chain = []
    node = folder
    seen = set()
    while node is not None and node.id not in seen:
        seen.add(node.id)
        chain.append({"id": node.id, "name": node.name})
        node = node.parent
    return list(reversed(chain))


def _audit(owner, organization, user, event_type, *, obj=None, metadata=None):
    record_audit_event(
        owner, event_type, _AUDIT_CATEGORY,
        actor_user=user if getattr(user, "is_authenticated", False) else None,
        obj=obj, metadata=_org_meta(organization, metadata or {}),
    )


def _org_meta(organization, metadata: dict) -> dict:
    meta = dict(metadata)
    if organization is not None:
        meta["organization_id"] = organization.id
    return meta


def _choice(value, choices_cls, default):
    value = (value or "").strip().lower()
    return value if value in choices_cls.values else default


def _int(value) -> int:
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def _truthy(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")
