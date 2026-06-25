"""
Audit Logs V1 — record security/document events so owners can see what happened
to their important documents.

Deterministic — no AI. Owner-scoped. Best-effort: a logging failure NEVER breaks
the user action it is recording. Privacy is the point of this module:

* No document contents, extracted text, private file URLs, raw storage keys, raw
  public tokens, passwords, or AI prompts/responses are ever stored.
* Network fingerprints (IP, user-agent) are stored ONLY as a salted SHA-256 hash
  (``settings.AUDIT_LOG_HASH_SALT``) — never in plaintext. ``country_code`` comes
  from a CDN edge header (no IP geolocation), so it is safe to keep.

Metadata is sanitized through :func:`safe_audit_metadata`, which drops any key
that looks sensitive and caps sizes.
"""

from __future__ import annotations

import hashlib
import logging

from django.conf import settings

from .models import AuditLogEntry

logger = logging.getLogger("duenest.audit")

_ActorType = AuditLogEntry.ActorType

# Metadata keys we refuse to persist (substring match, case-insensitive). Covers
# URLs, storage keys, tokens, secrets, raw network identifiers, and content.
_FORBIDDEN_KEY_PARTS = (
    "url", "token", "secret", "password", "passwd", "storage", "key", "path",
    "content", "text", "body", "prompt", "response", "ip_address", "ip", "useragent",
    "user_agent", "passport", "national_id", "ssn", "dek", "ciphertext", "nonce",
    "download", "preview", "signature", "cookie", "authorization", "bearer",
    "access_code", "email_body",
)
# Keys explicitly allowed even if they contain a forbidden substring (e.g.
# "status_to" is fine; "country" is fine). Exact-match allow-list.
_ALLOWED_KEYS = {
    "status", "status_from", "status_to", "result", "reason", "reason_category",
    "title", "name", "filename", "room_title", "request_title", "pack_title",
    "application_title", "due_date", "count", "page_count", "protection_type",
    "room_type", "item_type", "format", "saved_to_pack", "action", "severity",
    # B2B Bulk Reminder Emails V1 — explicit operational counts/labels.
    # ("recipient_count" is allow-listed because "recipient" contains "ip".)
    "reminder_type", "recipient_count", "sent_count", "skipped_count",
    "failed_count", "case_id", "org_id",
    # B2B Custom Fields and Statuses V1 — safe customization identifiers/labels.
    # ("field_key"/"status_key"/"changed_field_keys" are allow-listed because they
    # contain the substring "key"; they hold machine keys, never secret values.)
    "field_id", "field_key", "field_label", "field_type", "target",
    "status_id", "status_key", "status_label", "changed_field_keys",
    "person_id", "organization_id",
}

_MAX_STR = 255
_MAX_KEYS = 25


def safe_audit_metadata(metadata) -> dict:
    """Return a sanitized copy of ``metadata`` safe to persist.

    Drops anything that looks sensitive (URLs, tokens, storage keys, content,
    raw network identifiers), caps string lengths, and bounds the key count.
    Never raises.
    """
    if not isinstance(metadata, dict):
        return {}
    out: dict = {}
    for key, value in metadata.items():
        if len(out) >= _MAX_KEYS:
            break
        k = str(key)
        kl = k.lower()
        if kl not in _ALLOWED_KEYS and any(part in kl for part in _FORBIDDEN_KEY_PARTS):
            continue
        if isinstance(value, str):
            out[k] = value[:_MAX_STR]
        elif isinstance(value, (int, float, bool)) or value is None:
            out[k] = value
        elif isinstance(value, (list, tuple)):
            out[k] = [str(v)[:_MAX_STR] for v in list(value)[:20]]
        # dicts / unknown types are dropped (avoid nesting sensitive blobs)
    return out


def safe_object_label(obj) -> str:
    """A short, non-sensitive label for an object (title/name/filename only)."""
    if obj is None:
        return ""
    for attr in ("title", "requested_document_title", "name", "original_filename"):
        value = getattr(obj, attr, None)
        if value:
            return str(value)[:255]
    return ""


def hash_request_fingerprint(request) -> dict:
    """Return ``{ip_hash, user_agent_hash, country_code}`` from a request.

    IP and user-agent are salted-SHA-256 hashed (never stored raw). Returns empty
    strings when no request is available. Never raises.
    """
    result = {"ip_hash": "", "user_agent_hash": "", "country_code": ""}
    if request is None:
        return result
    try:
        from .services import client_ip

        salt = getattr(settings, "AUDIT_LOG_HASH_SALT", "") or ""
        ip = client_ip(request)
        if ip:
            result["ip_hash"] = _salted_hash(salt, ip)
        ua = (request.META.get("HTTP_USER_AGENT", "") or "")[:1000]
        if ua:
            result["user_agent_hash"] = _salted_hash(salt, ua)
        try:
            from apps.founder.services import country_from_request

            result["country_code"] = (country_from_request(request) or "")[:2]
        except Exception:  # noqa: BLE001
            pass
    except Exception:  # noqa: BLE001 — fingerprinting must never break logging
        return result
    return result


def _salted_hash(salt: str, value: str) -> str:
    return hashlib.sha256(f"{salt}:{value}".encode("utf-8")).hexdigest()


def record_audit_event(
    owner,
    event_type: str,
    category: str,
    *,
    actor_user=None,
    actor_type: str | None = None,
    actor_label: str = "",
    obj=None,
    object_type: str = "",
    object_id=None,
    object_label: str | None = None,
    related_object=None,
    related_object_type: str = "",
    related_object_label: str = "",
    metadata: dict | None = None,
    request=None,
    severity: str = AuditLogEntry.Severity.INFO,
) -> AuditLogEntry | None:
    """
    Record one audit event for ``owner``. BEST-EFFORT: on any failure this logs a
    server-side warning and returns ``None`` — it never raises, so it can never
    break the action it is recording.
    """
    try:
        if owner is None:
            return None
        if actor_type is None:
            actor_type = (
                _ActorType.OWNER
                if (actor_user is not None and getattr(actor_user, "id", None) == owner.id)
                else (_ActorType.AUTHENTICATED_USER if actor_user is not None
                      else _ActorType.SYSTEM)
            )
        if obj is not None:
            object_type = object_type or obj.__class__.__name__
            object_id = object_id if object_id is not None else getattr(obj, "id", None)
            if object_label is None:
                object_label = safe_object_label(obj)
        if related_object is not None:
            related_object_type = related_object_type or related_object.__class__.__name__
            related_object_label = related_object_label or safe_object_label(related_object)

        fp = hash_request_fingerprint(request)
        return AuditLogEntry.objects.create(
            owner=owner,
            actor_user=actor_user,
            actor_type=actor_type,
            actor_label=(actor_label or "")[:80],
            event_type=event_type[:64],
            category=category,
            severity=severity,
            object_type=(object_type or "")[:60],
            object_id=str(object_id) if object_id is not None else "",
            object_label=(object_label or "")[:255],
            related_object_type=(related_object_type or "")[:60],
            related_object_id=str(getattr(related_object, "id", "") or "")[:64],
            related_object_label=(related_object_label or "")[:255],
            ip_hash=fp["ip_hash"],
            user_agent_hash=fp["user_agent_hash"],
            country_code=fp["country_code"],
            metadata=safe_audit_metadata(metadata or {}),
        )
    except Exception:  # noqa: BLE001 — audit logging must never break the caller
        logger.warning("audit_event_failed event_type=%s", event_type, exc_info=True)
        return None


def record_public_link_event(
    owner,
    event_type: str,
    category: str,
    *,
    obj=None,
    object_label: str | None = None,
    actor_label: str = "Public visitor",
    request=None,
    metadata: dict | None = None,
    severity: str = AuditLogEntry.Severity.INFO,
) -> AuditLogEntry | None:
    """Convenience wrapper for events performed by an anonymous public-token visitor
    (no authenticated user). Never raises."""
    return record_audit_event(
        owner, event_type, category,
        actor_user=None, actor_type=_ActorType.PUBLIC_LINK, actor_label=actor_label,
        obj=obj, object_label=object_label, request=request,
        metadata=metadata, severity=severity,
    )


def list_audit_logs_for_user(user, filters: dict | None = None):
    """Owner-scoped queryset with optional filters (category / event_type /
    severity / object_type / object_id / date_from / date_to / search)."""
    from django.utils.dateparse import parse_datetime

    filters = filters or {}
    qs = AuditLogEntry.objects.filter(owner=user)
    for field in ("category", "event_type", "severity", "object_type"):
        value = filters.get(field)
        if value:
            qs = qs.filter(**{field: value})
    if filters.get("object_id"):
        qs = qs.filter(object_id=str(filters["object_id"]))
    if filters.get("date_from"):
        dt = parse_datetime(str(filters["date_from"]))
        if dt:
            qs = qs.filter(created_at__gte=dt)
    if filters.get("date_to"):
        dt = parse_datetime(str(filters["date_to"]))
        if dt:
            qs = qs.filter(created_at__lte=dt)
    search = (filters.get("search") or "").strip()
    if search:
        from django.db.models import Q

        qs = qs.filter(
            Q(object_label__icontains=search)
            | Q(related_object_label__icontains=search)
            | Q(event_type__icontains=search)
        )
    return qs
