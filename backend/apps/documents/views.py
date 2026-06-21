import hashlib
import io
import logging
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.core import signing
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.db.models import (
    Case,
    CharField,
    Count,
    Exists,
    F,
    OuterRef,
    Q,
    Value,
    When,
)
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.http import content_disposition_header
from rest_framework.decorators import action
from rest_framework import generics, status, viewsets
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.features.flags import is_feature_enabled, require_feature_enabled

from .models import (
    Document,
    DocumentActivity,
    DocumentAppointment,
    DocumentBundle,
    DocumentCategory,
    DocumentBundleRequirement,
    DocumentChecklist,
    DocumentChecklistItem,
    DocumentChecklistTemplate,
    DocumentExportRequest,
    DocumentExtraction,
    DocumentFile,
    DocumentFileActivity,
    DocumentFileShareLink,
    DocumentPayment,
    DocumentReminderRule,
    DocumentRenewalEvent,
    DocumentTag,
    DocumentVersion,
    EmergencyAccessPack,
    EmergencyAccessPackItem,
    EmergencyActivityEvent,
    EmergencyTrustedContact,
    EmergencyUnlockRequest,
    ProofRecord,
    RoomActivity,
    ShareRoom,
    ShareRoomItem,
    generate_share_token,
)
from .serializers import (
    BundleReadinessSerializer,
    BundleExportRequestSerializer,
    ChecklistFromTemplateSerializer,
    DocumentActivityEventSerializer,
    DocumentAppointmentSerializer,
    DocumentBundleRequirementSerializer,
    DocumentBundleSerializer,
    DocumentCategorySerializer,
    DocumentPaymentSerializer,
    DocumentRenewalEventSerializer,
    DocumentTagSerializer,
    DocumentChecklistItemSerializer,
    DocumentChecklistSerializer,
    DocumentChecklistTemplateSerializer,
    DocumentExportRequestSerializer,
    DocumentExtractionSerializer,
    DocumentFileActivitySerializer,
    DocumentFileSerializer,
    DocumentFileShareLinkSerializer,
    DocumentFileUploadSerializer,
    DocumentReminderRuleSerializer,
    DocumentSerializer,
    DocumentVersionSerializer,
    EmergencyAccessPackItemSerializer,
    EmergencyAccessPackSerializer,
    EmergencyActivityEventSerializer,
    EmergencyTrustedContactSerializer,
    EmergencyUnlockRequestSerializer,
    ExtractionApplySerializer,
    ProofRecordSerializer,
    CalendarEventSerializer,
    PublicEmergencyPackSerializer,
    PublicUnlockRequestCreateSerializer,
    PublicShareRoomSerializer,
    PublicSharedFileSerializer,
    RoomActivitySerializer,
    ShareLinkCreateSerializer,
    ShareRoomCreateUpdateSerializer,
    ShareRoomItemCreateSerializer,
    ShareRoomSerializer,
    TimelineEventSerializer,
)
from apps.users import plans as user_plans

from .plan_usage import compute_plan_usage, enforce_plan_limit
from rest_framework.exceptions import (
    APIException,
    ValidationError as DRFValidationError,
)
from apps.core.security.encryption import DecryptionError
from apps.core.security import public_access
from apps.core.security import file_validation
from .file_encryption import encrypt_uploaded_file, read_plaintext
from .pack_templates import (
    get_pack_template,
    seed_bundle_requirements,
    serialize_pack_templates,
)
from .services import (
    APPLICABLE_EXTRACTION_FIELDS,
    EXPIRING_SOON_DAYS,
    VERSIONED_FIELDS,
    ExportGenerationError,
    attention_sort_key,
    build_health_overview,
    build_bundle_merged_pdf,
    build_bundle_zip,
    build_documents_zip,
    bundle_readiness,
    build_calendar_events,
    build_calendar_ics,
    calendar_events_summary,
    calendar_summary,
    collect_bundle_files,
    collect_room_files,
    build_room_zip,
    build_timeline,
    scan_missing,
    create_document_export,
    create_bundle_export,
    extract_file_details,
    get_document_health,
    log_activity,
    log_document_activity,
    log_emergency_event,
    log_room_activity,
    notify_pack_owner,
    record_document_version,
    reminder_date_for_rule,
    summarize_field_changes,
)

logger = logging.getLogger("duenest.documents")


def _mark_onboarding(request, event: str) -> None:
    """Best-effort onboarding progress marker for document workflows."""
    try:
        from apps.users.services import mark_onboarding_event

        mark_onboarding_event(request.user, event)
    except Exception:
        return


def _track_product_event(
    request,
    event_type: str,
    *,
    user=None,
    object_type: str = "",
    object_id: int | str = "",
    metadata: dict | None = None,
) -> None:
    """Best-effort product analytics marker for founder aggregates."""
    try:
        from apps.founder.services import track_product_event

        track_product_event(
            event_type=event_type,
            user=user or getattr(request, "user", None),
            request=request,
            object_type=object_type,
            object_id=object_id,
            metadata=metadata,
        )
    except Exception:
        return


def _compute_checksum(uploaded) -> str:
    """SHA-256 of the uploaded bytes; rewinds the stream so it can still save."""
    digest = hashlib.sha256()
    for chunk in uploaded.chunks():
        digest.update(chunk)
    uploaded.seek(0)
    return digest.hexdigest()


def _file_response(instance, *, as_attachment: bool):
    """
    Decrypt (for encrypted files) and stream a DocumentFile.

    Callers MUST have already verified authorization, ownership/scope, trash,
    and any share/emergency/room revoke-expiry-code checks before reaching here
    (permission-first decryption rule — see docs/ENCRYPTION.md).
    """
    try:
        plaintext = read_plaintext(instance)
    except (FileNotFoundError, ValueError):
        return Response(
            {"detail": "This file is no longer available."},
            status=status.HTTP_404_NOT_FOUND,
        )
    except DecryptionError:
        # No crypto detail to the user; no plaintext returned.
        return Response(
            {
                "detail": (
                    "We could not open this file securely. Please try again or "
                    "contact support."
                )
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    # Files are decrypted fully into memory before streaming (bounded by the
    # upload size cap — see docs/deployment/scale-ready-lean-foundation.md,
    # "File delivery memory strategy"). Warn when a download is large enough to
    # matter so the in-memory path is visible before it becomes a problem. Logs
    # size + id only — never the filename, path, or any content.
    warn_bytes = getattr(settings, "LARGE_FILE_DOWNLOAD_WARN_BYTES", 8 * 1024 * 1024)
    if warn_bytes and len(plaintext) >= warn_bytes:
        logger.warning(
            "large_file_download file_id=%s size_bytes=%s",
            getattr(instance, "pk", "?"),
            len(plaintext),
        )

    response = FileResponse(
        io.BytesIO(plaintext),
        as_attachment=as_attachment,
        filename=instance.original_filename,
    )
    if instance.content_type:
        response["Content-Type"] = instance.content_type
    return response


def _inline_file_response(instance):
    """Stream a file for inline preview (not as an attachment)."""
    response = _file_response(instance, as_attachment=False)
    if isinstance(response, Response):
        return response
    response["Content-Disposition"] = content_disposition_header(
        False, instance.original_filename
    )
    return response


class DocumentViewSet(viewsets.ModelViewSet):
    """
    CRUD for the authenticated user's documents.

    Every action is scoped to ``request.user``: the queryset only ever contains
    the caller's own documents, so retrieving, updating, or deleting another
    user's document naturally returns 404 (it is simply not in the queryset).
    """

    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Owner-scoped queryset — never expose other users' documents.
        # select_related avoids an extra query for each document's category.
        # file_count counts only NON-trashed files so health stays accurate.
        # is_shared_ext uses Exists (not a second Count) to avoid join-multiplied
        # counts; prefetch reminder rules + proof records so confidence scoring
        # doesn't trigger per-row queries. tags are prefetched for cards/detail.
        active_share = DocumentFileShareLink.objects.filter(
            document=OuterRef("pk"),
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        in_bundle = DocumentBundleRequirement.objects.filter(
            linked_document=OuterRef("pk")
        )
        in_emergency = EmergencyAccessPackItem.objects.filter(
            document=OuterRef("pk")
        )
        queryset = (
            Document.objects.filter(owner=self.request.user)
            .select_related("category")
            .prefetch_related("tags", "reminder_rules", "proof_records")
            .annotate(
                file_count=Count(
                    "files",
                    filter=Q(files__is_trashed=False),
                    distinct=True,
                ),
                is_shared_ext=Exists(active_share),
                in_bundle_anno=Exists(in_bundle),
                in_emergency_anno=Exists(in_emergency),
            )
        )
        # Non-list actions (retrieve/update/destroy/restore/permanent-delete)
        # operate on a single document and must be able to reach trashed ones.
        if self.action != "list":
            return queryset
        # Active list never includes trashed documents (see the trash actions).
        queryset = queryset.filter(is_trashed=False)

        params = self.request.query_params
        search = params.get("search", "").strip()
        if search:
            queryset = queryset.filter(
                Q(title__icontains=search)
                | Q(document_type__icontains=search)
                | Q(issuer__icontains=search)
                | Q(country__icontains=search)
                | Q(reference_number__icontains=search)
                | Q(notes__icontains=search)
            )

        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("category"):
            category = params["category"].strip()
            if category.lower() in {"none", "uncategorized"}:
                queryset = queryset.filter(category__isnull=True)
            elif category.isdigit():
                queryset = queryset.filter(category_id=int(category))
            else:
                queryset = queryset.filter(category__slug=category)
        if params.get("document_type"):
            queryset = queryset.filter(document_type__icontains=params["document_type"])
        if params.get("country"):
            queryset = queryset.filter(country__icontains=params["country"])
        if params.get("issuer"):
            queryset = queryset.filter(issuer__icontains=params["issuer"])
        if params.get("lifecycle_status"):
            queryset = queryset.filter(lifecycle_status=params["lifecycle_status"])
        # Filter by tag id or slug (owner-scoped tags only).
        tag = params.get("tag", "").strip()
        if tag:
            if tag.isdigit():
                queryset = queryset.filter(tags__id=int(tag))
            else:
                queryset = queryset.filter(tags__slug=tag)

        expiry_from = parse_date(params.get("expiry_from", ""))
        if expiry_from:
            queryset = queryset.filter(expiry_date__gte=expiry_from)
        expiry_to = parse_date(params.get("expiry_to", ""))
        if expiry_to:
            queryset = queryset.filter(expiry_date__lte=expiry_to)

        # DB-level filters over the usage annotations (avoid a Python pass).
        shared = self._bool_param("shared")
        if shared is not None:
            queryset = queryset.filter(is_shared_ext=shared)
        in_bundle = self._bool_param("in_bundle")
        if in_bundle is not None:
            queryset = queryset.filter(in_bundle_anno=in_bundle)
        pinned = self._bool_param("pinned")
        if pinned is not None:
            queryset = queryset.filter(is_pinned=pinned)

        ordering = params.get("ordering", "-created_at")
        allowed = {
            "expiry_date",
            "-expiry_date",
            "created_at",
            "-created_at",
            "updated_at",
            "-updated_at",
            "title",
            "-title",
        }
        if ordering not in allowed:
            ordering = "-created_at"
        # Pinned documents always float to the top, regardless of sort.
        return queryset.order_by("-is_pinned", ordering)

    def _bool_param(self, name):
        value = self.request.query_params.get(name)
        if value is None:
            return None
        return value.lower() in {"1", "true", "yes", "on"}

    # Computed-status values that mean "needs attention" (mirrors
    # services.get_document_health: everything except archived/active).
    _ATTENTION_STATES = (
        "expired",
        "renewal_due",
        "expiring_soon",
        "missing_file",
        "missing_expiry_date",
    )

    def _annotate_computed_status(self, queryset):
        """Annotate ``computed_status_db`` matching services.get_document_health.

        Expressing the health status in SQL lets the computed_status /
        needs_attention filters run in the database, so the list can be
        paginated with LIMIT/OFFSET instead of loading the whole vault into
        Python. The priority order here MUST match get_document_health exactly.
        """
        today = timezone.localdate()
        soon = today + timedelta(days=EXPIRING_SOON_DAYS)
        return queryset.annotate(
            computed_status_db=Case(
                When(status=Document.Status.ARCHIVED, then=Value("archived")),
                When(expiry_date__lt=today, then=Value("expired")),
                When(
                    Q(renewal_date__isnull=False) & Q(renewal_date__lte=today),
                    then=Value("renewal_due"),
                ),
                When(
                    Q(expiry_date__gte=today) & Q(expiry_date__lte=soon),
                    then=Value("expiring_soon"),
                ),
                When(file_count=0, then=Value("missing_file")),
                When(expiry_date__isnull=True, then=Value("missing_expiry_date")),
                default=Value("active"),
                output_field=CharField(),
            )
        )

    def _apply_db_health_filters(self, queryset):
        """Push the health/attention filters into the queryset (DB-level).

        Replaces the old Python pass over a fully-materialized vault. Behaviour
        is preserved: file presence uses the ``file_count`` annotation, expiry
        windows use date bounds, and computed_status/needs_attention use the
        ``computed_status_db`` annotation built above.
        """
        params = self.request.query_params
        computed_status = params.get("computed_status")
        has_file = self._bool_param("has_file")
        missing_file = self._bool_param("missing_file")
        missing_expiry_date = self._bool_param("missing_expiry_date")
        needs_attention = self._bool_param("needs_attention")
        expiring_within_days = params.get("expiring_within_days")
        try:
            expiring_within_days = (
                int(expiring_within_days)
                if expiring_within_days not in {None, ""}
                else None
            )
        except ValueError:
            expiring_within_days = None

        if has_file is not None:
            queryset = (
                queryset.filter(file_count__gt=0)
                if has_file
                else queryset.filter(file_count=0)
            )
        if missing_file is not None:
            queryset = (
                queryset.filter(file_count=0)
                if missing_file
                else queryset.filter(file_count__gt=0)
            )
        if missing_expiry_date is not None:
            queryset = queryset.filter(expiry_date__isnull=missing_expiry_date)
        if expiring_within_days is not None:
            today = timezone.localdate()
            queryset = queryset.filter(
                expiry_date__gte=today,
                expiry_date__lte=today + timedelta(days=expiring_within_days),
            )

        if computed_status or needs_attention is not None:
            queryset = self._annotate_computed_status(queryset)
            if computed_status:
                queryset = queryset.filter(computed_status_db=computed_status)
            if needs_attention is True:
                queryset = queryset.filter(
                    computed_status_db__in=self._ATTENTION_STATES
                )
            elif needs_attention is False:
                queryset = queryset.exclude(
                    computed_status_db__in=self._ATTENTION_STATES
                )
        return queryset

    def list(self, request, *args, **kwargs):
        # Apply health/attention filters at the DB level, then paginate the
        # QUERYSET directly (LIMIT/OFFSET). The whole vault is never loaded into
        # memory; the serializer computes health only for the returned page.
        queryset = self._apply_db_health_filters(
            self.filter_queryset(self.get_queryset())
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
        # Free-tier limit guard before anything is written.
        enforce_plan_limit(self.request.user, user_plans.RESOURCE_DOCUMENTS)
        # Owner comes from the authenticated request, not the request body.
        document = serializer.save(owner=self.request.user)
        record_document_version(
            document,
            version_type=DocumentVersion.VersionType.METADATA_SNAPSHOT,
            created_by=self.request.user,
            change_summary="Document created",
        )
        log_document_activity(
            owner=self.request.user,
            document=document,
            action=DocumentActivity.Action.DOCUMENT_CREATED,
            title="Document created",
            description=document.title,
        )
        _mark_onboarding(self.request, "first_document_created")
        _track_product_event(
            self.request,
            "document_created",
            object_type="document",
            object_id=document.id,
            metadata={
                "has_expiry_or_renewal": bool(
                    document.expiry_date or document.renewal_date
                )
            },
        )
        if document.expiry_date or document.renewal_date:
            _mark_onboarding(self.request, "first_expiry_date_added")
            _track_product_event(
                self.request,
                "expiry_date_added",
                object_type="document",
                object_id=document.id,
            )

    def update(self, request, *args, **kwargs):
        # Snapshot important fields before the change so we can record a version
        # and a human-readable summary of exactly what changed.
        instance = self.get_object()
        before = {f: getattr(instance, f) for f in VERSIONED_FIELDS}
        response = super().update(request, *args, **kwargs)
        instance.refresh_from_db()
        after = {f: getattr(instance, f) for f in VERSIONED_FIELDS}
        summary = summarize_field_changes(before, after)
        if summary:
            record_document_version(
                instance,
                version_type=DocumentVersion.VersionType.METADATA_SNAPSHOT,
                created_by=request.user,
                change_summary=summary,
            )
            log_document_activity(
                owner=request.user,
                document=instance,
                action=DocumentActivity.Action.DOCUMENT_UPDATED,
                title="Document updated",
                description=summary,
            )
        if instance.expiry_date or instance.renewal_date:
            _mark_onboarding(request, "first_expiry_date_added")
            _track_product_event(
                request,
                "expiry_date_added",
                object_type="document",
                object_id=instance.id,
            )
        return response

    def destroy(self, request, *args, **kwargs):
        # Standard DELETE soft-trashes the document (recoverable). Permanent
        # removal is a separate, explicit action.
        document = self.get_object()
        self._trash_document(document, request)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _trash_document(self, document, request, reason=""):
        if document.is_trashed:
            return
        document.is_trashed = True
        document.trashed_at = timezone.now()
        if reason:
            document.deletion_reason = reason[:255]
        document.save(update_fields=["is_trashed", "trashed_at", "deletion_reason"])
        log_document_activity(
            owner=request.user,
            document=document,
            action=DocumentActivity.Action.DOCUMENT_TRASHED,
            title="Moved to trash",
            description=document.title,
        )

    @action(detail=False, methods=["get"], url_path="attention-needed")
    def attention_needed(self, request):
        # Filter to attention items in the DB (mirrors get_document_health), so
        # only the small attention subset is loaded — not the whole vault. The
        # final urgency ordering stays in Python (attention_sort_key uses
        # day-precision health that is clearer expressed there).
        queryset = self._annotate_computed_status(
            self.get_queryset()
            .filter(is_trashed=False)
            .exclude(status=Document.Status.ARCHIVED)
            # Hide items the owner snoozed ("I've seen this") until the snooze ends.
            .exclude(attention_snoozed_until__gt=timezone.now())
        ).filter(computed_status_db__in=self._ATTENTION_STATES)
        items = list(queryset)
        items.sort(key=attention_sort_key)
        serializer = self.get_serializer(items, many=True)
        _track_product_event(
            request,
            "attention_needed_viewed",
            object_type="document_attention",
            metadata={"count": len(items)},
        )
        return Response({"count": len(items), "items": serializer.data})

    @action(detail=False, methods=["get"], url_path="trash")
    def trash_list(self, request):
        """List the user's trashed documents."""
        queryset = (
            Document.objects.filter(owner=request.user, is_trashed=True)
            .select_related("category")
            .annotate(
                file_count=Count(
                    "files", filter=Q(files__is_trashed=False), distinct=True
                )
            )
            .order_by("-trashed_at")
        )
        page = self.paginate_queryset(list(queryset))
        if page is not None:
            return self.get_paginated_response(
                self.get_serializer(page, many=True).data
            )
        return Response(self.get_serializer(queryset, many=True).data)

    @action(detail=True, methods=["post"], url_path="trash")
    def trash(self, request, pk=None):
        """Explicitly move a document to trash."""
        document = self.get_object()
        self._trash_document(
            document, request, reason=request.data.get("reason", "")
        )
        return Response(self.get_serializer(document).data)

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, pk=None):
        """Restore a trashed document back to active."""
        document = self.get_object()
        if document.is_trashed:
            document.is_trashed = False
            document.trashed_at = None
            document.deletion_reason = ""
            document.save(
                update_fields=["is_trashed", "trashed_at", "deletion_reason"]
            )
            log_document_activity(
                owner=request.user,
                document=document,
                action=DocumentActivity.Action.DOCUMENT_RESTORED,
                title="Restored from trash",
                description=document.title,
            )
            _track_product_event(
                request,
                "trash_restore_used",
                object_type="document",
                object_id=document.id,
                metadata={"target": "document"},
            )
        return Response(self.get_serializer(document).data)

    @action(detail=False, methods=["post"], url_path="bulk-action")
    def bulk_action(self, request):
        """
        Apply one action to many owner-owned documents in a single request:
        ``move_category`` ({category: id|null}), ``archive``, ``trash``, or
        ``add_tag`` ({tag: id}). Owner-scoped throughout; non-trashed only.
        Returns the number of documents affected. One request + one transaction
        replaces the per-document calls the client previously looped.
        """
        action_name = request.data.get("action")
        raw_ids = request.data.get("document_ids")
        if not isinstance(raw_ids, (list, tuple)) or not raw_ids:
            return Response(
                {"detail": "Select at least one document."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ids = []
        for value in raw_ids:
            try:
                ids.append(int(value))
            except (TypeError, ValueError):
                continue
        # get_queryset() is already owner-scoped and excludes trashed documents.
        documents = list(self.get_queryset().filter(id__in=ids))
        if not documents:
            return Response({"updated": 0})

        if action_name == "move_category":
            raw_category = request.data.get("category")
            category = None
            if raw_category not in (None, "", "none"):
                try:
                    category = DocumentCategory.objects.get(
                        Q(owner=request.user) | Q(owner__isnull=True),
                        id=int(raw_category),
                    )
                except (DocumentCategory.DoesNotExist, TypeError, ValueError):
                    return Response(
                        {"detail": "Category not found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
            with transaction.atomic():
                for doc in documents:
                    doc.category = category
                    doc.save(update_fields=["category", "updated_at"])
        elif action_name == "archive":
            with transaction.atomic():
                for doc in documents:
                    doc.lifecycle_status = Document.Lifecycle.ARCHIVED
                    doc.save(update_fields=["lifecycle_status", "updated_at"])
        elif action_name == "add_tag":
            try:
                tag = DocumentTag.objects.get(
                    id=int(request.data.get("tag")), owner=request.user
                )
            except (DocumentTag.DoesNotExist, TypeError, ValueError):
                return Response(
                    {"detail": "Tag not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            with transaction.atomic():
                for doc in documents:
                    doc.tags.add(tag)
        elif action_name == "trash":
            with transaction.atomic():
                for doc in documents:
                    self._trash_document(doc, request)
        else:
            return Response(
                {"detail": "Unknown bulk action."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        _track_product_event(
            request,
            "documents_bulk_action",
            object_type="document",
            metadata={"action": action_name, "count": len(documents)},
        )
        return Response({"updated": len(documents)})

    @action(detail=True, methods=["post"], url_path="snooze")
    def snooze(self, request, pk=None):
        """
        Hide this document from Life Radar / Attention until later (or clear the
        snooze). Body: {"days": <int>}; 0 or less clears it, capped at 365 days.
        Does not change the real expiry/renewal facts.
        """
        document = self.get_object()
        try:
            days = int(request.data.get("days", 7))
        except (TypeError, ValueError):
            days = 7
        if days <= 0:
            document.attention_snoozed_until = None
        else:
            document.attention_snoozed_until = timezone.now() + timedelta(
                days=min(days, 365)
            )
        document.save(update_fields=["attention_snoozed_until", "updated_at"])
        _track_product_event(
            request,
            "attention_snooze_used",
            object_type="document",
            object_id=document.id,
            metadata={"days": days},
        )
        return Response(self.get_serializer(document).data)

    @action(detail=True, methods=["delete"], url_path="permanent-delete")
    def permanent_delete(self, request, pk=None):
        """
        Permanently delete a document and its files/share links.

        Guarded: the document must already be in trash. Stored file blobs are
        removed best-effort before the rows are deleted.
        """
        document = self.get_object()
        if not document.is_trashed:
            return Response(
                {"detail": "Move the document to trash before deleting it permanently."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        for file in document.files.all():
            try:
                file.file.delete(save=False)
            except Exception:  # noqa: BLE001 — best-effort blob cleanup
                pass
        document.delete()  # cascades to files, share links, versions, activity
        return Response(status=status.HTTP_204_NO_CONTENT)


class _DocumentScopedMixin:
    """
    Shared scoping for nested file endpoints. Every file is reachable only
    through a parent document the caller owns, so other users' files are
    invisible (404), never 403.
    """

    permission_classes = [IsAuthenticated]

    def get_document(self):
        return get_object_or_404(
            Document, pk=self.kwargs["document_id"], owner=self.request.user
        )

    def get_queryset(self):
        # Active file lists exclude trashed files (see the file trash endpoints).
        self.get_document()
        return DocumentFile.objects.filter(
            document_id=self.kwargs["document_id"],
            document__owner=self.request.user,
            is_trashed=False,
        )


class DocumentFileListCreateView(_DocumentScopedMixin, generics.ListCreateAPIView):
    """GET lists a document's files; POST uploads a new one (multipart)."""

    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return DocumentFileUploadSerializer
        return DocumentFileSerializer

    def create(self, request, *args, **kwargs):
        document = self.get_document()  # 404 unless the caller owns it
        enforce_plan_limit(request.user, user_plans.RESOURCE_FILES)

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded = serializer.validated_data["file"]

        # uploaded_by comes from the session, not the client. Bytes are
        # encrypted at rest inside _create_document_file before persistence.
        instance = _create_document_file(
            uploaded=uploaded, user=request.user, document=document
        )

        output = DocumentFileSerializer(
            instance, context=self.get_serializer_context()
        )
        log_activity(
            file=instance,
            action=DocumentFileActivity.Action.FILE_UPLOADED,
            actor_type=DocumentFileActivity.ActorType.OWNER,
            request=request,
        )
        # Record a file-upload version so history shows when files arrived.
        record_document_version(
            document,
            version_type=DocumentVersion.VersionType.FILE_UPLOAD,
            created_by=request.user,
            file=instance,
            change_summary=f"Uploaded file “{instance.original_filename}”",
        )
        _mark_onboarding(request, "first_file_uploaded")
        _track_product_event(
            request,
            "file_uploaded",
            object_type="document_file",
            object_id=instance.id,
            metadata={
                "content_type": instance.content_type,
                "file_size": instance.file_size,
            },
        )
        return Response(output.data, status=status.HTTP_201_CREATED)


class DocumentFileDetailView(_DocumentScopedMixin, generics.RetrieveDestroyAPIView):
    """GET file metadata; DELETE soft-trashes the file (recoverable)."""

    serializer_class = DocumentFileSerializer

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        _trash_file(instance, request)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _trash_file(instance, request):
    """Soft-trash a file: hide it and cut off existing share-link access."""
    if instance.is_trashed:
        return
    instance.is_trashed = True
    instance.trashed_at = timezone.now()
    instance.save(update_fields=["is_trashed", "trashed_at"])
    log_activity(
        file=instance,
        action=DocumentFileActivity.Action.FILE_DELETED,
        actor_type=DocumentFileActivity.ActorType.OWNER,
        request=request,
    )
    if instance.document_id:
        log_document_activity(
            owner=request.user,
            document=instance.document,
            action=DocumentActivity.Action.FILE_TRASHED,
            title="File moved to trash",
            description=instance.original_filename,
            related_file=instance,
        )


class DocumentFileDownloadView(_DocumentScopedMixin, APIView):
    """Controlled download — streams the file only to the owning user."""

    def get(self, request, document_id, pk):
        instance = get_object_or_404(
            DocumentFile,
            pk=pk,
            document_id=document_id,
            document__owner=request.user,
            is_trashed=False,
        )
        log_activity(
            file=instance,
            action=DocumentFileActivity.Action.FILE_DOWNLOADED,
            actor_type=DocumentFileActivity.ActorType.OWNER,
            request=request,
        )
        return _file_response(instance, as_attachment=True)


class DocumentFilePreviewView(_DocumentScopedMixin, APIView):
    """Owner-only inline preview for PDF/JPEG/PNG files."""

    def get(self, request, document_id, pk):
        instance = get_object_or_404(
            DocumentFile,
            pk=pk,
            document_id=document_id,
            document__owner=request.user,
            is_trashed=False,
        )
        if not instance.is_previewable:
            return Response(
                {"detail": "Preview is not available for this file type."},
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            )
        log_activity(
            file=instance,
            action=DocumentFileActivity.Action.FILE_PREVIEWED,
            actor_type=DocumentFileActivity.ActorType.OWNER,
            request=request,
        )
        _track_product_event(
            request,
            "file_previewed",
            object_type="document_file",
            object_id=instance.id,
            metadata={"content_type": instance.content_type},
        )
        return _inline_file_response(instance)


def _owned_file_queryset(user, *, include_trashed=False, only_inbox=False):
    """Owner-scoped file queryset for both attached files and inbox files."""
    qs = DocumentFile.objects.select_related("document", "uploaded_by").filter(
        Q(document__owner=user) | Q(document__isnull=True, uploaded_by=user)
    )
    if only_inbox:
        qs = qs.filter(document__isnull=True)
    if not include_trashed:
        qs = qs.filter(is_trashed=False).filter(
            Q(document__isnull=True) | Q(document__is_trashed=False)
        )
    return qs


class UploadScanUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "Malware scanning is temporarily unavailable. Please try again."


def _scan_upload_or_raise(uploaded):
    """Run malware scanning on an upload (SEC-005). Fails closed in production
    when ``CLAMD_FAIL_CLOSED``; a clean/disabled scan is a no-op."""
    uploaded.seek(0)
    data = uploaded.read()
    uploaded.seek(0)
    try:
        file_validation.scan_file_for_malware(data)
    except file_validation.MalwareDetected as exc:
        raise DRFValidationError(exc.message)
    except file_validation.MalwareScanUnavailable as exc:
        raise UploadScanUnavailable(exc.message)


def _create_document_file(*, uploaded, user, document=None):
    """Create a DocumentFile, encrypting the bytes at rest before they are
    persisted. Never stores plaintext content."""
    _scan_upload_or_raise(uploaded)
    checksum = _compute_checksum(uploaded)
    instance = DocumentFile(
        document=document,
        uploaded_by=user,
        original_filename=uploaded.name[:255],
        content_type=uploaded.content_type or "",
        file_size=uploaded.size,
        checksum=checksum,
    )
    # Encrypt-then-store: attaches ciphertext + envelope metadata to instance.
    encrypt_uploaded_file(instance, uploaded)
    instance.save()
    return instance


class DocumentCategoryListView(generics.ListCreateAPIView):
    """
    List the categories available to the current user — the shared system
    vocabulary (owner is null) plus the user's own private categories — and let
    them create a new private category (POST). A user only ever sees system
    categories and their own; never another user's.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = DocumentCategorySerializer
    pagination_class = None

    def get_queryset(self):
        return DocumentCategory.objects.filter(
            Q(owner__isnull=True) | Q(owner=self.request.user)
        )

    def perform_create(self, serializer):
        # New categories are always private to the creating user.
        serializer.save(owner=self.request.user)


class DocumentCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    Rename / restyle / delete one of the user's **own** categories. System
    categories (owner is null) are never returned here, so they cannot be edited
    or deleted. Deleting a category leaves its documents (FK is SET_NULL).
    """

    permission_classes = [IsAuthenticated]
    serializer_class = DocumentCategorySerializer

    def get_queryset(self):
        return DocumentCategory.objects.filter(owner=self.request.user)


class FileInboxDuplicateCheckView(APIView):
    """
    Read-only duplicate signal before an accidental duplicate upload.

    Matches owner's own non-trashed files by the strongest available signal:
    checksum (exact contents) → name+size (possible) → name (weak). Returns the
    match level + reasons + a small summary of each match. Owner-scoped — never
    reveals other users' files, and never deletes/replaces anything.

    Backward compatible: callers passing only ``filename`` still get
    ``{exists, count}`` (name count); ``level``/``matches`` are additive.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        filename = (request.query_params.get("filename") or "").strip()
        checksum = (request.query_params.get("checksum") or "").strip().lower()
        size_raw = (request.query_params.get("size") or "").strip()
        try:
            size = int(size_raw) if size_raw else None
        except ValueError:
            size = None

        qs = _owned_file_queryset(request.user)
        name_count = (
            qs.filter(original_filename__iexact=filename).count() if filename else 0
        )

        matches: list[dict] = []
        seen: set[int] = set()

        def add(file, reasons):
            if file.id in seen:
                return
            seen.add(file.id)
            matches.append(
                {
                    "id": file.id,
                    "file_uuid": str(file.file_uuid),
                    "original_filename": file.original_filename,
                    "file_size": file.file_size,
                    "content_type": file.content_type,
                    "created_at": file.created_at.isoformat(),
                    "document_id": file.document_id,
                    "reasons": reasons,
                }
            )

        level = "none"
        if checksum:
            for f in qs.filter(checksum=checksum)[:10]:
                reasons = ["Same file contents"]
                if filename and f.original_filename.lower() == filename.lower():
                    reasons.append("Same name")
                add(f, reasons)
            if matches:
                level = "exact"
        if not matches and filename and size is not None:
            for f in qs.filter(original_filename__iexact=filename, file_size=size)[:10]:
                add(f, ["Same name", "Same size"])
            if matches:
                level = "possible"
        if not matches and filename:
            for f in qs.filter(original_filename__iexact=filename)[:10]:
                add(f, ["Same name"])
            if matches:
                level = "name"

        return Response(
            {
                "exists": name_count > 0 or bool(matches),
                "count": name_count,
                "level": level,
                "matches": matches[:5],
            }
        )


class FileInboxListCreateView(generics.ListCreateAPIView):
    """GET lists standalone files; POST uploads a file without creating a document."""

    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return DocumentFileUploadSerializer
        return DocumentFileSerializer

    def get_queryset(self):
        return _owned_file_queryset(self.request.user, only_inbox=True)

    def create(self, request, *args, **kwargs):
        enforce_plan_limit(request.user, user_plans.RESOURCE_FILES)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = _create_document_file(
            uploaded=serializer.validated_data["file"],
            user=request.user,
        )
        log_activity(
            file=instance,
            action=DocumentFileActivity.Action.FILE_UPLOADED,
            actor_type=DocumentFileActivity.ActorType.OWNER,
            request=request,
        )
        _mark_onboarding(request, "first_file_uploaded")
        _track_product_event(
            request,
            "file_uploaded",
            object_type="document_file",
            object_id=instance.id,
            metadata={
                "content_type": instance.content_type,
                "file_size": instance.file_size,
                "assignment_status": "inbox",
            },
        )
        return Response(
            DocumentFileSerializer(instance, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


class FileInboxDetailView(generics.RetrieveDestroyAPIView):
    """GET one inbox file; DELETE soft-trashes it."""

    permission_classes = [IsAuthenticated]
    serializer_class = DocumentFileSerializer

    def get_queryset(self):
        return _owned_file_queryset(self.request.user, only_inbox=True)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        _trash_file(instance, request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class FileInboxDownloadView(APIView):
    """Controlled download for standalone inbox files."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        instance = get_object_or_404(
            _owned_file_queryset(request.user, only_inbox=True),
            pk=pk,
        )
        log_activity(
            file=instance,
            action=DocumentFileActivity.Action.FILE_DOWNLOADED,
            actor_type=DocumentFileActivity.ActorType.OWNER,
            request=request,
        )
        return _file_response(instance, as_attachment=True)


class FileInboxPreviewView(APIView):
    """Owner-only inline preview for PDF/JPEG/PNG inbox files."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        instance = get_object_or_404(
            _owned_file_queryset(request.user, only_inbox=True),
            pk=pk,
        )
        if not instance.is_previewable:
            return Response(
                {"detail": "Preview is not available for this file type."},
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            )
        log_activity(
            file=instance,
            action=DocumentFileActivity.Action.FILE_PREVIEWED,
            actor_type=DocumentFileActivity.ActorType.OWNER,
            request=request,
        )
        _track_product_event(
            request,
            "file_previewed",
            object_type="document_file",
            object_id=instance.id,
            metadata={
                "content_type": instance.content_type,
                "assignment_status": "inbox",
            },
        )
        return _inline_file_response(instance)


class FileInboxTrashListView(generics.ListAPIView):
    """List trashed standalone inbox files."""

    permission_classes = [IsAuthenticated]
    serializer_class = DocumentFileSerializer

    def get_queryset(self):
        return _owned_file_queryset(
            self.request.user,
            include_trashed=True,
            only_inbox=True,
        ).filter(is_trashed=True)


class FileInboxRestoreView(APIView):
    """POST restores a trashed standalone inbox file."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        file = get_object_or_404(
            _owned_file_queryset(
                request.user,
                include_trashed=True,
                only_inbox=True,
            ),
            pk=pk,
        )
        if file.is_trashed:
            file.is_trashed = False
            file.trashed_at = None
            file.save(update_fields=["is_trashed", "trashed_at"])
            _track_product_event(
                request,
                "trash_restore_used",
                object_type="document_file",
                object_id=file.id,
                metadata={"target": "file_inbox"},
            )
        return Response(DocumentFileSerializer(file, context={"request": request}).data)


class FileInboxPermanentDeleteView(APIView):
    """DELETE permanently removes a trashed standalone inbox file."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        file = get_object_or_404(
            _owned_file_queryset(
                request.user,
                include_trashed=True,
                only_inbox=True,
            ),
            pk=pk,
        )
        if not file.is_trashed:
            return Response(
                {"detail": "Move the file to trash before deleting it permanently."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            file.file.delete(save=False)
        except Exception:  # noqa: BLE001 — best-effort blob cleanup
            pass
        file.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class FileInboxAttachDocumentView(APIView):
    """POST attaches an inbox file to an existing owner-owned document."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        file = get_object_or_404(
            _owned_file_queryset(request.user, only_inbox=True),
            pk=pk,
        )
        document = get_object_or_404(
            Document,
            pk=request.data.get("document"),
            owner=request.user,
            is_trashed=False,
        )
        file.document = document
        file.save(update_fields=["document", "updated_at"])
        log_document_activity(
            owner=request.user,
            document=document,
            action=DocumentActivity.Action.DOCUMENT_UPDATED,
            title="File attached from inbox",
            description=file.original_filename,
            related_file=file,
        )
        return Response(DocumentFileSerializer(file, context={"request": request}).data)


class FileInboxCreateDocumentView(APIView):
    """POST creates a document from an inbox file and attaches the file to it."""

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        file = get_object_or_404(
            _owned_file_queryset(request.user, only_inbox=True),
            pk=pk,
        )
        enforce_plan_limit(request.user, user_plans.RESOURCE_DOCUMENTS)
        title = (request.data.get("title") or "").strip()
        if not title:
            title = file.original_filename.rsplit(".", 1)[0] or file.original_filename
        # Optional metadata captured during the post-upload "what is this?" flow.
        category = None
        raw_category = request.data.get("category")
        if raw_category:
            try:
                category = DocumentCategory.objects.filter(
                    Q(owner__isnull=True) | Q(owner=request.user),
                    pk=int(raw_category),
                ).first()
            except (TypeError, ValueError):
                category = None
        reference_number = (request.data.get("reference_number") or "").strip()
        document = Document.objects.create(
            owner=request.user,
            title=title[:255],
            document_type=(request.data.get("document_type") or "").strip()[:100],
            notes=(request.data.get("notes") or "").strip(),
            category=category,
            country=(request.data.get("country") or "").strip()[:100],
            reference_number=reference_number[:255] or None,
            issue_date=parse_date((request.data.get("issue_date") or "").strip() or ""),
            expiry_date=parse_date((request.data.get("expiry_date") or "").strip() or ""),
        )
        file.document = document
        file.save(update_fields=["document", "updated_at"])
        record_document_version(
            document,
            version_type=DocumentVersion.VersionType.FILE_UPLOAD,
            created_by=request.user,
            file=file,
            change_summary=f"Created document from file “{file.original_filename}”",
        )
        _track_product_event(
            request,
            "document_created",
            object_type="document",
            object_id=document.id,
            metadata={"source": "file_inbox"},
        )
        return Response(
            {
                "document": DocumentSerializer(document, context={"request": request}).data,
                "file": DocumentFileSerializer(file, context={"request": request}).data,
            },
            status=status.HTTP_201_CREATED,
        )


# ---- Owner share-link management ------------------------------------------


class _FileScopedMixin:
    """Resolve a file owned by request.user, via its parent document."""

    permission_classes = [IsAuthenticated]

    def get_file(self):
        return get_object_or_404(
            DocumentFile,
            pk=self.kwargs["file_id"],
            document_id=self.kwargs["document_id"],
            document__owner=self.request.user,
            document__is_trashed=False,
            is_trashed=False,
        )


def _generate_access_code() -> str:
    """A strong, ambiguity-safe alphanumeric access code (SEC-001)."""
    return public_access.generate_strong_access_code()


class DocumentFileShareLinkListCreateView(_FileScopedMixin, APIView):
    """GET lists a file's share links; POST creates a new one."""

    def get(self, request, document_id, file_id):
        file = self.get_file()
        links = file.share_links.all()
        return Response(DocumentFileShareLinkSerializer(links, many=True).data)

    def post(self, request, document_id, file_id):
        file = self.get_file()
        enforce_plan_limit(request.user, user_plans.RESOURCE_SHARE_LINKS)
        serializer = ShareLinkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Resolve the (optional) access code, hashing it for storage only.
        plain_code = None
        access_code_hash = ""
        if data.get("access_code_required"):
            plain_code = (
                (data.get("access_code") or "").strip() or _generate_access_code()
            )
            access_code_hash = make_password(plain_code)

        link = DocumentFileShareLink.objects.create(
            owner=request.user,
            document=file.document,
            file=file,
            permission=data["permission"],
            expires_at=data["expires_at"],
            access_code_required=bool(data.get("access_code_required")),
            access_code_hash=access_code_hash,
            access_limit_type=data.get(
                "access_limit_type",
                DocumentFileShareLink.AccessLimitType.UNLIMITED,
            ),
            max_views=data.get("max_views"),
            max_downloads=data.get("max_downloads"),
            watermark_enabled=bool(data.get("watermark_enabled")),
            privacy_screen_enabled=bool(data.get("privacy_screen_enabled")),
            label=data.get("label", ""),
            recipient_email=data.get("recipient_email", ""),
            purpose=data.get("purpose", ""),
        )
        log_activity(
            file=file,
            action=DocumentFileActivity.Action.SHARE_CREATED,
            actor_type=DocumentFileActivity.ActorType.OWNER,
            request=request,
            share_link=link,
        )

        payload = DocumentFileShareLinkSerializer(link).data
        # The plaintext code is returned ONCE, only at creation.
        if plain_code is not None:
            payload["access_code"] = plain_code
        _mark_onboarding(request, "first_share_link_created")
        _track_product_event(
            request,
            "share_link_created",
            object_type="document_file_share_link",
            object_id=link.id,
            metadata={
                "permission": link.permission,
                "access_code_required": link.access_code_required,
            },
        )
        return Response(payload, status=status.HTTP_201_CREATED)


class DocumentFileShareLinkDetailView(_FileScopedMixin, APIView):
    """GET one share link; DELETE removes it."""

    def get_link(self):
        file = self.get_file()
        return get_object_or_404(
            DocumentFileShareLink, pk=self.kwargs["share_id"], file=file
        )

    def get(self, request, document_id, file_id, share_id):
        return Response(DocumentFileShareLinkSerializer(self.get_link()).data)

    def delete(self, request, document_id, file_id, share_id):
        self.get_link().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DocumentFileShareLinkRevokeView(_FileScopedMixin, APIView):
    """POST revokes a share link immediately."""

    def post(self, request, document_id, file_id, share_id):
        file = self.get_file()
        link = get_object_or_404(DocumentFileShareLink, pk=share_id, file=file)
        if not link.is_revoked:
            link.revoked_at = timezone.now()
            link.save(update_fields=["revoked_at"])
            log_activity(
                file=file,
                action=DocumentFileActivity.Action.SHARE_REVOKED,
                actor_type=DocumentFileActivity.ActorType.OWNER,
                request=request,
                share_link=link,
            )
        return Response(DocumentFileShareLinkSerializer(link).data)


class DocumentFileActivityView(_FileScopedMixin, APIView):
    """Owner-only activity log for a file."""

    def get(self, request, document_id, file_id):
        file = self.get_file()
        activities = file.activities.all()
        return Response(DocumentFileActivitySerializer(activities, many=True).data)


# ---- Owner reminder-rule management ---------------------------------------


class _ReminderRuleScopedMixin:
    """Resolve reminder rules through an owner-owned parent document."""

    permission_classes = [IsAuthenticated]
    serializer_class = DocumentReminderRuleSerializer

    def get_document(self):
        return get_object_or_404(
            Document, pk=self.kwargs["document_id"], owner=self.request.user
        )

    def get_queryset(self):
        return DocumentReminderRule.objects.filter(
            document_id=self.kwargs["document_id"],
            document__owner=self.request.user,
        ).select_related("document")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["document"] = self.get_document()
        return context


class DocumentReminderRuleListCreateView(
    _ReminderRuleScopedMixin, generics.ListCreateAPIView
):
    """GET lists reminder rules; POST creates one for the owner-owned document."""

    def perform_create(self, serializer):
        enforce_plan_limit(self.request.user, user_plans.RESOURCE_REMINDERS)
        rule = serializer.save(owner=self.request.user, document=self.get_document())
        _mark_onboarding(self.request, "first_reminder_created")
        log_document_activity(
            owner=self.request.user,
            document=rule.document,
            action=DocumentActivity.Action.REMINDER_ADDED,
            title="Reminder added",
            description=rule.document.title,
        )
        _track_product_event(
            self.request,
            "reminder_created",
            object_type="document_reminder_rule",
            object_id=rule.id,
            metadata={"trigger_type": rule.trigger_type},
        )


class DocumentReminderRuleDetailView(
    _ReminderRuleScopedMixin, generics.RetrieveUpdateDestroyAPIView
):
    """GET/PATCH/DELETE one owner-scoped reminder rule."""

    lookup_url_kwarg = "rule_id"


class UpcomingDocumentRemindersView(APIView):
    """Calculated upcoming reminders; no notifications are sent here."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        rows = []
        rules = (
            DocumentReminderRule.objects.filter(
                owner=request.user,
                is_enabled=True,
            )
            .exclude(document__is_trashed=True)
            .select_related("document")
            .annotate(file_count=Count("document__files", distinct=True))
        )
        for rule in rules:
            reminder_date = reminder_date_for_rule(rule)
            if reminder_date is None or reminder_date < today:
                continue
            rows.append((reminder_date, rule))
        rows.sort(key=lambda row: (row[0], row[1].document.title.lower()))
        serializer = DocumentReminderRuleSerializer(
            [rule for _, rule in rows],
            many=True,
        )
        return Response({"count": len(rows), "items": serializer.data})


# ---- Public share access ---------------------------------------------------


def _resolve_share_link(token, request=None):
    """
    Return (link, error_response). error_response is None when the link is
    usable. Invalid/expired/revoked never reveal whether the file exists beyond
    the link itself.
    """
    try:
        link = DocumentFileShareLink.objects.select_related(
            "file", "document"
        ).get(token=token)
    except DocumentFileShareLink.DoesNotExist:
        return None, Response(
            {"detail": "This shared link is invalid.", "state": "invalid"},
            status=status.HTTP_404_NOT_FOUND,
        )
    if link.is_revoked:
        _track_product_event(
            request,
            "security_event_recorded",
            user=link.owner,
            object_type="document_file_share_link",
            object_id=link.id,
            metadata={
                "event_kind": "revoked_share_link_access",
                "label": "Revoked share link access attempt",
            },
        )
        return None, Response(
            {
                "detail": "This shared link is no longer available. "
                "The sender has revoked access.",
                "state": "revoked",
            },
            status=status.HTTP_410_GONE,
        )
    if link.is_expired:
        _track_product_event(
            request,
            "security_event_recorded",
            user=link.owner,
            object_type="document_file_share_link",
            object_id=link.id,
            metadata={
                "event_kind": "expired_share_link_access",
                "label": "Expired share link access attempt",
            },
        )
        return None, Response(
            {
                "detail": "This shared link has expired.",
                "state": "expired",
            },
            status=status.HTTP_410_GONE,
        )
    # A trashed file (or trashed parent document) is no longer shareable, even
    # through a previously-issued link.
    if link.file.is_trashed or link.document.is_trashed:
        return None, Response(
            {
                "detail": "This shared file is no longer available.",
                "state": "unavailable",
            },
            status=status.HTTP_410_GONE,
        )
    return link, None


# Short-lived access grant issued after a viewer verifies the access code.
# This lets the viewer load the preview/download without the frontend storing or
# re-sending the raw code on every request. The grant is bound to a single share
# token and expires quickly. A grant for token A can never unlock token B.
SHARE_GRANT_SALT = "duenest.share.access-grant"
SHARE_GRANT_MAX_AGE = 60 * 30  # 30 minutes


def issue_share_grant(token: str) -> str:
    """Return a signed, time-stamped grant bound to ``token``."""
    return signing.TimestampSigner(salt=SHARE_GRANT_SALT).sign(token)


def share_grant_is_valid(token: str, grant: str) -> bool:
    """Whether ``grant`` is an unexpired grant issued for ``token``."""
    if not grant:
        return False
    try:
        value = signing.TimestampSigner(salt=SHARE_GRANT_SALT).unsign(
            grant, max_age=SHARE_GRANT_MAX_AGE
        )
    except signing.BadSignature:
        return False
    return secrets.compare_digest(value, token)


def _has_verified_grant(link, request) -> bool:
    """
    True when the request carries a valid access grant for this share link.

    The grant is read from the ``grant`` query param (preferred — it avoids a
    CORS preflight on cross-origin previews) or the ``X-Share-Grant`` header.
    """
    grant = request.query_params.get("grant") or request.headers.get(
        "X-Share-Grant", ""
    )
    return share_grant_is_valid(link.token, grant)


def _public_code_denied_response(result, *, requires_detail):
    """Build the safe 403/429 response for a failed public access-code check.

    Never reveals whether the underlying resource exists beyond the link itself.
    """
    if result.state == "locked":
        resp = Response(
            {"detail": public_access.locked_detail(), "state": "locked"},
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )
        if result.retry_after:
            resp["Retry-After"] = str(int(result.retry_after))
        return resp
    if result.state == "requires_code":
        return Response(
            {
                "detail": requires_detail,
                "state": "requires_code",
                "access_code_required": True,
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return Response(
        {
            "detail": "That code does not match. Check the code and try again.",
            "state": "wrong_code",
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def _check_access_code(link, request):
    """
    Return an error Response if a required access code is missing/wrong/locked,
    else None.

    Access is granted when EITHER a valid short-lived grant is presented (issued
    by the verify-code endpoint) OR the raw code is supplied in the
    ``X-Access-Code`` header. The code is never read from the URL. Repeated wrong
    codes lock this link for everyone (SEC-001).
    """
    if not link.access_code_required:
        return None
    if _has_verified_grant(link, request):
        return None
    result = public_access.check_public_access_code(
        kind="share",
        identifier=link.token,
        supplied_code=request.headers.get("X-Access-Code", ""),
        access_code_hash=link.access_code_hash,
        required=True,
    )
    if result.ok:
        return None
    if result.is_wrong_code:
        log_activity(
            file=link.file,
            action=DocumentFileActivity.Action.SHARE_CODE_FAILED,
            actor_type=DocumentFileActivity.ActorType.SHARED_VIEWER,
            request=request,
            share_link=link,
        )
        _track_product_event(
            request,
            "security_event_recorded",
            user=link.owner,
            object_type="document_file_share_link",
            object_id=link.id,
            metadata={
                "event_kind": "wrong_share_code_attempt",
                "label": "Wrong share access code attempt",
            },
        )
    return _public_code_denied_response(
        result,
        requires_detail="This file is protected. Enter the access code "
        "provided by the sender.",
    )


_LIMIT_REACHED_DETAIL = (
    "This secure link has already been used or reached its access limit."
)


def _check_link_usable(link, request):
    """Block a link whose view/access limit has already been reached."""
    if link.is_limit_reached:
        log_activity(
            file=link.file,
            action=DocumentFileActivity.Action.SHARE_BLOCKED_LIMIT_REACHED,
            actor_type=DocumentFileActivity.ActorType.SHARED_VIEWER,
            request=request,
            share_link=link,
        )
        return Response(
            {"detail": _LIMIT_REACHED_DETAIL, "state": "limit_reached"},
            status=status.HTTP_410_GONE,
        )
    return None


def _consume_share_view(link, request):
    """Atomically count one preview and stamp the limit if it is now reached."""
    if link.access_limit_type == DocumentFileShareLink.AccessLimitType.UNLIMITED:
        return
    DocumentFileShareLink.objects.filter(pk=link.pk).update(
        view_count=F("view_count") + 1
    )
    link.refresh_from_db(fields=["view_count"])
    if link.is_view_limit_reached and link.limit_reached_at is None:
        link.limit_reached_at = timezone.now()
        link.save(update_fields=["limit_reached_at"])
        log_activity(
            file=link.file,
            action=DocumentFileActivity.Action.SHARE_LIMIT_REACHED,
            actor_type=DocumentFileActivity.ActorType.SHARED_VIEWER,
            request=request,
            share_link=link,
        )


def _consume_share_download(link, request):
    """Atomically count one download and stamp the limit if it is now reached."""
    DocumentFileShareLink.objects.filter(pk=link.pk).update(
        download_count=F("download_count") + 1
    )
    link.refresh_from_db(fields=["download_count"])
    if (link.is_download_limit_reached or link.is_limit_reached) and (
        link.limit_reached_at is None
    ):
        link.limit_reached_at = timezone.now()
        link.save(update_fields=["limit_reached_at"])
        log_activity(
            file=link.file,
            action=DocumentFileActivity.Action.SHARE_LIMIT_REACHED,
            actor_type=DocumentFileActivity.ActorType.SHARED_VIEWER,
            request=request,
            share_link=link,
        )


class PublicSharedFileMetadataView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_access_code"

    def get(self, request, token):
        link, err = _resolve_share_link(token, request=request)
        if err:
            return err

        # The link was opened (record once, update last-accessed).
        link.last_accessed_at = timezone.now()
        link.save(update_fields=["last_accessed_at"])
        log_activity(
            file=link.file,
            action=DocumentFileActivity.Action.SHARE_OPENED,
            actor_type=DocumentFileActivity.ActorType.SHARED_VIEWER,
            request=request,
            share_link=link,
        )
        _track_product_event(
            request,
            "share_link_opened",
            user=link.owner,
            object_type="document_file_share_link",
            object_id=link.id,
            metadata={"access_code_required": link.access_code_required},
        )

        code_err = _check_access_code(link, request)
        if code_err:
            return code_err

        limit_err = _check_link_usable(link, request)
        if limit_err:
            return limit_err

        return Response(PublicSharedFileSerializer(link).data)


class PublicSharedFileVerifyCodeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "share_file_code"

    def post(self, request, token):
        link, err = _resolve_share_link(token, request=request)
        if err:
            return err
        if not link.access_code_required:
            return Response({"detail": "Access code verified."})

        result = public_access.check_public_access_code(
            kind="share",
            identifier=link.token,
            supplied_code=request.data.get("access_code", ""),
            access_code_hash=link.access_code_hash,
            required=True,
        )
        if result.ok:
            log_activity(
                file=link.file,
                action=DocumentFileActivity.Action.SHARE_CODE_VERIFIED,
                actor_type=DocumentFileActivity.ActorType.SHARED_VIEWER,
                request=request,
                share_link=link,
            )
            # Hand back a short-lived grant so the viewer can load the preview
            # and download without the browser re-sending the raw code.
            return Response(
                {
                    "detail": "Access code verified.",
                    "grant": issue_share_grant(link.token),
                    "grant_expires_in": SHARE_GRANT_MAX_AGE,
                }
            )

        if result.state == "locked":
            resp = Response(
                {"detail": public_access.locked_detail(), "state": "locked"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            if result.retry_after:
                resp["Retry-After"] = str(int(result.retry_after))
            return resp

        log_activity(
            file=link.file,
            action=DocumentFileActivity.Action.SHARE_CODE_FAILED,
            actor_type=DocumentFileActivity.ActorType.SHARED_VIEWER,
            request=request,
            share_link=link,
        )
        _track_product_event(
            request,
            "security_event_recorded",
            user=link.owner,
            object_type="document_file_share_link",
            object_id=link.id,
            metadata={
                "event_kind": "wrong_share_code_attempt",
                "label": "Wrong share access code attempt",
            },
        )
        return Response(
            {"detail": "Invalid access code.", "state": "wrong_code"},
            status=status.HTTP_400_BAD_REQUEST,
        )


class PublicSharedFilePreviewView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_access_code"

    def get(self, request, token):
        link, err = _resolve_share_link(token, request=request)
        if err:
            return err
        code_err = _check_access_code(link, request)
        if code_err:
            return code_err
        limit_err = _check_link_usable(link, request)
        if limit_err:
            return limit_err
        if not link.file.is_previewable:
            return Response(
                {
                    "detail": "Preview is not available for this file type.",
                    "state": "unsupported_preview",
                },
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            )
        log_activity(
            file=link.file,
            action=DocumentFileActivity.Action.SHARE_PREVIEWED,
            actor_type=DocumentFileActivity.ActorType.SHARED_VIEWER,
            request=request,
            share_link=link,
        )
        response = _inline_file_response(link.file)
        # A successful preview consumes one view (one-time / limited links).
        _consume_share_view(link, request)
        return response


class PublicSharedFileDownloadView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_access_code"

    def get(self, request, token):
        link, err = _resolve_share_link(token, request=request)
        if err:
            return err
        code_err = _check_access_code(link, request)
        if code_err:
            return code_err
        if not link.download_allowed:
            return Response(
                {
                    "detail": "The sender allowed preview only.",
                    "state": "download_not_allowed",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        limit_err = _check_link_usable(link, request)
        if limit_err:
            return limit_err
        if link.is_download_limit_reached:
            return Response(
                {"detail": _LIMIT_REACHED_DETAIL, "state": "limit_reached"},
                status=status.HTTP_410_GONE,
            )
        log_activity(
            file=link.file,
            action=DocumentFileActivity.Action.SHARE_DOWNLOADED,
            actor_type=DocumentFileActivity.ActorType.SHARED_VIEWER,
            request=request,
            share_link=link,
        )
        instance = link.file
        response = _file_response(instance, as_attachment=True)
        _consume_share_download(link, request)
        return response


# ---- Checklist templates (read-only, shared catalog) -----------------------


class ChecklistTemplateListView(generics.ListAPIView):
    """Active checklist templates (system + the user's own, if any later)."""

    serializer_class = DocumentChecklistTemplateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = DocumentChecklistTemplate.objects.filter(
            is_active=True
        ).prefetch_related("item_templates")
        params = self.request.query_params
        if params.get("document_type"):
            queryset = queryset.filter(
                document_type__icontains=params["document_type"]
            )
        if params.get("checklist_type"):
            queryset = queryset.filter(checklist_type=params["checklist_type"])
        return queryset


class ChecklistTemplateDetailView(generics.RetrieveAPIView):
    serializer_class = DocumentChecklistTemplateSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "template_id"

    def get_queryset(self):
        return DocumentChecklistTemplate.objects.filter(
            is_active=True
        ).prefetch_related("item_templates")


# ---- User checklists (nested under a document) -----------------------------


class _ChecklistScopedMixin:
    """Resolve checklists through an owner-owned parent document."""

    permission_classes = [IsAuthenticated]
    serializer_class = DocumentChecklistSerializer

    def get_document(self):
        return get_object_or_404(
            Document, pk=self.kwargs["document_id"], owner=self.request.user
        )

    def get_queryset(self):
        self.get_document()
        return (
            DocumentChecklist.objects.filter(
                document_id=self.kwargs["document_id"],
                owner=self.request.user,
            )
            .prefetch_related("items")
            .select_related("document", "bundle", "template")
        )


class DocumentChecklistListCreateView(
    _ChecklistScopedMixin, generics.ListCreateAPIView
):
    """GET lists a document's checklists; POST creates a blank one."""

    def perform_create(self, serializer):
        document = self.get_document()
        checklist = serializer.save(owner=self.request.user, document=document)
        _mark_onboarding(self.request, "first_checklist_created")
        _track_product_event(
            self.request,
            "checklist_created",
            object_type="document_checklist",
            object_id=checklist.id,
            metadata={"checklist_type": checklist.checklist_type},
        )


class DocumentChecklistFromTemplateView(_ChecklistScopedMixin, APIView):
    """POST creates a checklist (and its items) from a template."""

    def post(self, request, document_id):
        document = self.get_document()
        serializer = ChecklistFromTemplateSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        template = serializer.validated_data["template"]
        due_date = serializer.validated_data.get("due_date")
        bundle = serializer.validated_data.get("bundle")

        checklist = DocumentChecklist.objects.create(
            owner=request.user,
            document=document,
            bundle=bundle,
            template=template,
            title=serializer.validated_data.get("title") or template.title,
            description=template.description,
            checklist_type=template.checklist_type,
            due_date=due_date,
        )

        # Materialize template items into owner-owned checklist items.
        item_templates = template.item_templates.all()
        items = []
        for item_template in item_templates:
            item_due = None
            if (
                due_date is not None
                and item_template.suggested_due_offset_days is not None
            ):
                from datetime import timedelta

                item_due = due_date - timedelta(
                    days=item_template.suggested_due_offset_days
                )
            items.append(
                DocumentChecklistItem(
                    owner=request.user,
                    checklist=checklist,
                    title=item_template.title,
                    description=item_template.description,
                    is_required=item_template.is_required,
                    sort_order=item_template.sort_order,
                    due_date=item_due,
                )
            )
        DocumentChecklistItem.objects.bulk_create(items)
        checklist.recalculate_progress()

        output = DocumentChecklistSerializer(
            checklist, context=self.get_serializer_context()
        )
        _mark_onboarding(request, "first_checklist_created")
        _track_product_event(
            request,
            "checklist_created",
            object_type="document_checklist",
            object_id=checklist.id,
            metadata={
                "checklist_type": checklist.checklist_type,
                "from_template": True,
            },
        )
        return Response(output.data, status=status.HTTP_201_CREATED)

    def get_serializer_context(self):
        return {"request": self.request}


class DocumentChecklistDetailView(
    _ChecklistScopedMixin, generics.RetrieveUpdateDestroyAPIView
):
    """GET/PATCH/DELETE one owner-scoped checklist."""

    lookup_url_kwarg = "checklist_id"


class _ChecklistItemScopedMixin:
    """Resolve checklist items through an owner-owned checklist + document."""

    permission_classes = [IsAuthenticated]
    serializer_class = DocumentChecklistItemSerializer

    def get_checklist(self):
        return get_object_or_404(
            DocumentChecklist,
            pk=self.kwargs["checklist_id"],
            document_id=self.kwargs["document_id"],
            owner=self.request.user,
        )

    def get_queryset(self):
        return DocumentChecklistItem.objects.filter(
            checklist_id=self.kwargs["checklist_id"],
            checklist__document_id=self.kwargs["document_id"],
            owner=self.request.user,
        )


def _sync_item_completion(item):
    """Keep completed_at in step with the item's status."""
    if item.status == DocumentChecklistItem.Status.COMPLETED:
        if item.completed_at is None:
            item.completed_at = timezone.now()
    else:
        item.completed_at = None


class DocumentChecklistItemCreateView(
    _ChecklistItemScopedMixin, generics.CreateAPIView
):
    """POST adds an item to an owner-owned checklist."""

    def create(self, request, *args, **kwargs):
        checklist = self.get_checklist()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = serializer.save(owner=request.user, checklist=checklist)
        _sync_item_completion(item)
        item.save(update_fields=["completed_at"])
        checklist.recalculate_progress()
        return Response(
            self.get_serializer(item).data, status=status.HTTP_201_CREATED
        )


class DocumentChecklistItemDetailView(
    _ChecklistItemScopedMixin, generics.RetrieveUpdateDestroyAPIView
):
    """PATCH/DELETE one owner-scoped checklist item; recalculates progress."""

    lookup_url_kwarg = "item_id"

    def perform_update(self, serializer):
        item = serializer.save()
        _sync_item_completion(item)
        item.save(update_fields=["completed_at"])
        item.checklist.recalculate_progress()
        if item.checklist.status == DocumentChecklist.Status.COMPLETED:
            _mark_onboarding(self.request, "checklist_completed")
        if item.status == DocumentChecklistItem.Status.COMPLETED:
            _track_product_event(
                self.request,
                "checklist_item_completed",
                object_type="document_checklist_item",
                object_id=item.id,
                metadata={"checklist_id": item.checklist_id},
            )

    def perform_destroy(self, instance):
        checklist = instance.checklist
        instance.delete()
        checklist.recalculate_progress()


# ---- Application / renewal bundles ------------------------------------------


class _BundleScopedMixin:
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentBundleSerializer

    def get_queryset(self):
        return DocumentBundle.objects.filter(
            owner=self.request.user
        ).prefetch_related("requirements")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class DocumentBundleListCreateView(_BundleScopedMixin, generics.ListCreateAPIView):
    """GET lists the user's bundles; POST creates one."""

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("bundle_type"):
            queryset = queryset.filter(bundle_type=params["bundle_type"])
        return queryset

    def perform_create(self, serializer):
        enforce_plan_limit(self.request.user, user_plans.RESOURCE_BUNDLES)
        bundle = serializer.save(owner=self.request.user)
        _track_product_event(
            self.request,
            "bundle_created",
            object_type="document_bundle",
            object_id=bundle.id,
            metadata={"bundle_type": bundle.bundle_type},
        )
        log_document_activity(
            owner=self.request.user,
            action=DocumentActivity.Action.BUNDLE_CREATED,
            title="Pack created",
            description=bundle.title,
            related_bundle=bundle,
        )
        # Optional: seed a generic, editable checklist from a pack template. Only
        # honoured when the templates feature is available to this user; the
        # seeded requirements are real, fully-editable rows, never claimed as
        # official (see pack_templates.TEMPLATE_DISCLAIMER).
        template_key = self.request.data.get("template")
        if template_key and is_feature_enabled(
            "application_pack_templates", self.request.user
        ):
            template = get_pack_template(template_key)
            if template is not None:
                created = seed_bundle_requirements(bundle, template)
                if created:
                    # Keep the bundle type consistent with the chosen template.
                    if bundle.bundle_type != template.bundle_type:
                        bundle.bundle_type = template.bundle_type
                        bundle.save(update_fields=["bundle_type", "updated_at"])
                    bundle.recalculate_readiness()
                    log_document_activity(
                        owner=self.request.user,
                        action=DocumentActivity.Action.BUNDLE_TEMPLATE_APPLIED,
                        title="Template applied",
                        description=f"{template.label} — {created} suggested items",
                        related_bundle=bundle,
                        metadata={"template": template.key, "items": created},
                    )


class DocumentBundleDetailView(
    _BundleScopedMixin, generics.RetrieveUpdateDestroyAPIView
):
    """GET/PATCH/DELETE one owner-scoped bundle."""

    lookup_url_kwarg = "bundle_id"

    def perform_update(self, serializer):
        previous_status = serializer.instance.status
        bundle = serializer.save()
        if bundle.status != previous_status:
            log_document_activity(
                owner=self.request.user,
                action=DocumentActivity.Action.BUNDLE_STATUS_CHANGED,
                title="Pack status changed",
                description=bundle.get_status_display(),
                related_bundle=bundle,
                metadata={"from": previous_status, "to": bundle.status},
            )


class PackTemplatesView(APIView):
    """
    List the generic, editable application-pack templates used to seed a new
    bundle's checklist. Read-only and non-official (each carries a disclaimer).
    Gated by ``application_pack_templates`` so it stays hidden until launched.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        require_feature_enabled("application_pack_templates", request.user)
        return Response({"templates": serialize_pack_templates()})


class BundleActivityTimelineView(APIView):
    """
    Owner-only activity feed for one bundle (created, template applied, items
    added/removed/updated, documents attached, status changed, exported, shared).
    Never exposes file contents or raw IPs. Gated by ``application_pack_timeline``.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, bundle_id):
        require_feature_enabled("application_pack_timeline", request.user)
        bundle = get_object_or_404(
            DocumentBundle, pk=bundle_id, owner=request.user
        )
        events = [
            {
                "id": f"bundle:{activity.id}",
                "action": activity.action,
                "title": activity.title or activity.get_action_display(),
                "description": activity.description,
                "actor_type": activity.actor_type,
                "timestamp": activity.created_at,
                "related_file": activity.related_file_id,
                "related_share": None,
                "related_checklist": activity.related_checklist_id,
                "related_bundle": activity.related_bundle_id,
                "related_proof": activity.related_proof_id,
                "metadata": activity.metadata or {},
            }
            for activity in DocumentActivity.objects.filter(
                owner=request.user, related_bundle=bundle
            )
        ]
        events.sort(key=lambda e: e["timestamp"], reverse=True)
        serializer = DocumentActivityEventSerializer(events, many=True)
        return Response({"items": serializer.data})


class BundleShareReadinessView(APIView):
    """
    AI-assisted "is this pack ready to send?" check for one bundle. Returns the
    deterministic readiness facts always; when AI is configured + the
    ``ai_share_readiness`` flag is on, Claude adds a purpose-aware review. Never
    500s on an AI failure — it falls back to the deterministic report. Owner-only.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, bundle_id):
        bundle = get_object_or_404(
            DocumentBundle, pk=bundle_id, owner=request.user
        )
        from .ai_readiness import build_readiness_report

        return Response(build_readiness_report(bundle, user=request.user))


class DocumentBundleFilesView(APIView):
    """
    List every available file reachable from a bundle's requirements, plus the
    requirements still missing a usable file. Owner-scoped; exposes only safe
    file metadata (never internal storage paths). Feeds the bundle Files tab and
    the ZIP export summary.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, bundle_id):
        bundle = get_object_or_404(
            DocumentBundle, pk=bundle_id, owner=request.user
        )
        result = collect_bundle_files(bundle)

        files = []
        for entry in result.files:
            data = DocumentFileSerializer(
                entry.file, context={"request": request}
            ).data
            data.update(
                {
                    "requirement_id": entry.requirement_id,
                    "requirement_title": entry.requirement_title,
                    "document_title": entry.document_title,
                    "available": True,
                }
            )
            files.append(data)

        missing = [
            {
                "requirement_id": m.requirement_id,
                "requirement_title": m.requirement_title,
                "document_id": m.document_id,
                "document_title": m.document_title,
                "reason": m.reason,
            }
            for m in result.missing
        ]

        document_ids = {
            entry.document_id for entry in result.files if entry.document_id is not None
        }
        return Response(
            {
                "files": files,
                "missing_files": missing,
                "summary": {
                    "total_files": len(files),
                    "total_size": result.total_size,
                    "documents_count": len(document_ids),
                    "missing_count": len(missing),
                },
            }
        )


def _zip_response(spooled, filename, summary):
    """Stream a built ZIP back as an attachment with a safe summary header."""
    response = FileResponse(
        spooled,
        as_attachment=True,
        filename=filename,
        content_type="application/zip",
    )
    # Expose a small, non-sensitive summary so the client can confirm contents.
    response["X-Export-Files-Count"] = str(summary.get("files_count", 0))
    response["X-Export-Skipped-Count"] = str(summary.get("skipped_count", 0))
    return response


def _parse_file_ids(request):
    """Return a clean list of int file ids from the request body, or None."""
    raw = request.data.get("file_ids")
    if not isinstance(raw, (list, tuple)) or not raw:
        return None
    ids = []
    for value in raw:
        try:
            ids.append(int(value))
        except (TypeError, ValueError):
            continue
    return ids or None


class DocumentBundleExportFilesView(APIView):
    """POST → stream a ZIP of every available file in an owner-owned bundle."""

    permission_classes = [IsAuthenticated]

    def post(self, request, bundle_id):
        bundle = get_object_or_404(
            DocumentBundle, pk=bundle_id, owner=request.user
        )
        name = request.data.get("name") if isinstance(request.data, dict) else None
        spooled, filename, summary = build_bundle_zip(
            request.user, bundle, name=name
        )
        if summary["files_count"] == 0:
            spooled.close()
            return Response(
                {
                    "detail": "This bundle has no files to export yet.",
                    "state": "no_files",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        _track_product_event(
            request,
            "export_requested",
            object_type="document_bundle",
            object_id=bundle.id,
            metadata={"scope": "bundle_zip", "files": summary["files_count"]},
        )
        return _zip_response(spooled, filename, summary)


class DocumentBundleExportSelectedFilesView(APIView):
    """POST {file_ids:[…]} → stream a ZIP of the selected bundle files."""

    permission_classes = [IsAuthenticated]

    def post(self, request, bundle_id):
        bundle = get_object_or_404(
            DocumentBundle, pk=bundle_id, owner=request.user
        )
        file_ids = _parse_file_ids(request)
        if file_ids is None:
            return Response(
                {"detail": "Select at least one file to export."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        name = request.data.get("name") if isinstance(request.data, dict) else None
        spooled, filename, summary = build_bundle_zip(
            request.user, bundle, file_ids=file_ids, name=name
        )
        if summary["files_count"] == 0:
            spooled.close()
            return Response(
                {
                    "detail": "None of the selected files are available to export.",
                    "state": "no_files",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        _track_product_event(
            request,
            "export_requested",
            object_type="document_bundle",
            object_id=bundle.id,
            metadata={
                "scope": "bundle_zip_selected",
                "files": summary["files_count"],
            },
        )
        return _zip_response(spooled, filename, summary)


class DocumentBundleExportMergedPdfView(APIView):
    """
    POST → stream a single merged PDF of the pack's PDF files (in requirement
    order). Non-PDF files are reported as skipped, never silently dropped.
    Gated by the pack-preparation feature.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, bundle_id):
        require_feature_enabled("application_pack_preparation", request.user)
        bundle = get_object_or_404(
            DocumentBundle, pk=bundle_id, owner=request.user
        )
        name = request.data.get("name") if isinstance(request.data, dict) else None
        cover = bool(request.data.get("cover")) if isinstance(request.data, dict) else False
        spooled, filename, summary = build_bundle_merged_pdf(
            request.user, bundle, name=name, cover=cover
        )
        if summary["page_count"] == 0:
            spooled.close()
            return Response(
                {
                    "detail": (
                        "This pack has no PDF files to merge yet. Image files "
                        "can be exported in the ZIP."
                    ),
                    "state": "no_pdfs",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        _track_product_event(
            request,
            "export_requested",
            object_type="document_bundle",
            object_id=bundle.id,
            metadata={"scope": "bundle_merged_pdf", "files": summary["files_count"]},
        )
        response = FileResponse(
            spooled,
            as_attachment=True,
            filename=filename,
            content_type="application/pdf",
        )
        response["X-Export-Files-Count"] = str(summary.get("files_count", 0))
        response["X-Export-Skipped-Count"] = str(summary.get("skipped_count", 0))
        return response


class DocumentFilesExportSelectedView(APIView):
    """POST {file_ids:[…]} → stream a ZIP of selected owned document files."""

    permission_classes = [IsAuthenticated]

    def post(self, request):
        file_ids = _parse_file_ids(request)
        if file_ids is None:
            return Response(
                {"detail": "Select at least one file to export."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        spooled, filename, summary = build_documents_zip(request.user, file_ids)
        if summary["files_count"] == 0:
            spooled.close()
            return Response(
                {
                    "detail": "None of the selected files are available to export.",
                    "state": "no_files",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        _track_product_event(
            request,
            "export_requested",
            object_type="document_file",
            metadata={"scope": "documents_zip", "files": summary["files_count"]},
        )
        return _zip_response(spooled, filename, summary)


def _parse_id_list(request, key):
    """Return a clean list of int ids from ``request.data[key]``, or None."""
    raw = request.data.get(key) if isinstance(request.data, dict) else None
    if not isinstance(raw, (list, tuple)) or not raw:
        return None
    ids = []
    for value in raw:
        try:
            ids.append(int(value))
        except (TypeError, ValueError):
            continue
    return ids or None


class DocumentsBulkExportView(APIView):
    """
    POST {document_ids:[…]} → stream a ZIP of every available file across the
    selected owner-owned documents (Vault bulk export). Reuses build_documents_zip
    after resolving the documents' non-trashed files. Owner-scoped throughout.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        doc_ids = _parse_id_list(request, "document_ids")
        if doc_ids is None:
            return Response(
                {"detail": "Select at least one document to export."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        file_ids = list(
            DocumentFile.objects.filter(
                document__owner=request.user,
                document__is_trashed=False,
                document_id__in=doc_ids,
                is_trashed=False,
            ).values_list("id", flat=True)
        )
        if not file_ids:
            return Response(
                {
                    "detail": "None of the selected documents have a file to export.",
                    "state": "no_files",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        spooled, filename, summary = build_documents_zip(request.user, file_ids)
        if summary["files_count"] == 0:
            spooled.close()
            return Response(
                {
                    "detail": "None of the selected documents have a file to export.",
                    "state": "no_files",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        _track_product_event(
            request,
            "export_requested",
            object_type="document",
            metadata={
                "scope": "documents_bulk_zip",
                "files": summary["files_count"],
            },
        )
        return _zip_response(spooled, filename, summary)


class BundleAddDocumentsView(APIView):
    """
    POST {document_ids:[…]} → add each owner-owned document to a bundle as a new,
    already-attached requirement. Additive only (never alters or removes existing
    requirements), so no references are broken. Recomputes readiness and logs a
    per-document activity event.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, bundle_id):
        bundle = get_object_or_404(
            DocumentBundle, pk=bundle_id, owner=request.user
        )
        doc_ids = _parse_id_list(request, "document_ids")
        if doc_ids is None:
            return Response(
                {"detail": "Select at least one document to add."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        documents = list(
            Document.objects.filter(
                owner=request.user, is_trashed=False, id__in=doc_ids
            )
        )
        sort_base = bundle.requirements.count()
        created = 0
        for offset, doc in enumerate(documents):
            DocumentBundleRequirement.objects.create(
                owner=request.user,
                bundle=bundle,
                title=doc.title,
                requirement_type=DocumentBundleRequirement.RequirementType.DOCUMENT,
                linked_document=doc,
                status=DocumentBundleRequirement.Status.ATTACHED,
                sort_order=sort_base + offset,
            )
            created += 1
            log_document_activity(
                owner=request.user,
                document=doc,
                action=DocumentActivity.Action.ADDED_TO_BUNDLE,
                title="Added to a bundle",
                description=bundle.title,
                related_bundle=bundle,
            )
        if created:
            bundle.recalculate_readiness()
        return Response(
            {"created": created, "bundle_id": bundle.id},
            status=status.HTTP_201_CREATED,
        )


class _BundleRequirementScopedMixin:
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentBundleRequirementSerializer

    def get_bundle(self):
        return get_object_or_404(
            DocumentBundle, pk=self.kwargs["bundle_id"], owner=self.request.user
        )

    def get_queryset(self):
        self.get_bundle()
        return DocumentBundleRequirement.objects.filter(
            bundle_id=self.kwargs["bundle_id"],
            owner=self.request.user,
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class DocumentBundleRequirementCreateView(
    _BundleRequirementScopedMixin, generics.CreateAPIView
):
    """POST adds a requirement to an owner-owned bundle."""

    def create(self, request, *args, **kwargs):
        bundle = self.get_bundle()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        requirement = serializer.save(owner=request.user, bundle=bundle)
        bundle.recalculate_readiness()
        log_document_activity(
            owner=request.user,
            action=DocumentActivity.Action.BUNDLE_REQUIREMENT_ADDED,
            title="Checklist item added",
            description=requirement.title,
            related_bundle=bundle,
        )
        return Response(
            self.get_serializer(requirement).data,
            status=status.HTTP_201_CREATED,
        )


class DocumentBundleRequirementDetailView(
    _BundleRequirementScopedMixin, generics.RetrieveUpdateDestroyAPIView
):
    """PATCH/DELETE one owner-scoped requirement; recalculates readiness."""

    lookup_url_kwarg = "requirement_id"

    def perform_update(self, serializer):
        previous_status = serializer.instance.status
        requirement = serializer.save()
        requirement.bundle.recalculate_readiness()
        if requirement.status != previous_status:
            log_document_activity(
                owner=self.request.user,
                action=DocumentActivity.Action.BUNDLE_REQUIREMENT_STATUS_CHANGED,
                title=requirement.title,
                description=requirement.get_status_display(),
                related_bundle=requirement.bundle,
                metadata={"from": previous_status, "to": requirement.status},
            )

    def perform_destroy(self, instance):
        bundle = instance.bundle
        title = instance.title
        instance.delete()
        bundle.recalculate_readiness()
        log_document_activity(
            owner=self.request.user,
            action=DocumentActivity.Action.BUNDLE_REQUIREMENT_REMOVED,
            title="Checklist item removed",
            description=title,
            related_bundle=bundle,
        )


class _RequirementActionMixin(_BundleRequirementScopedMixin):
    """Shared resolution for link-document / link-file actions."""

    def get_requirement(self):
        return get_object_or_404(
            DocumentBundleRequirement,
            pk=self.kwargs["requirement_id"],
            bundle_id=self.kwargs["bundle_id"],
            owner=self.request.user,
        )


class BundleRequirementLinkDocumentView(_RequirementActionMixin, APIView):
    """POST links an owner-owned document to a requirement (marks attached)."""

    def post(self, request, bundle_id, requirement_id):
        requirement = self.get_requirement()
        document = get_object_or_404(
            Document,
            pk=request.data.get("document"),
            owner=request.user,
            is_trashed=False,
        )
        requirement.linked_document = document
        if requirement.status == DocumentBundleRequirement.Status.MISSING:
            requirement.status = DocumentBundleRequirement.Status.ATTACHED
        requirement.save(
            update_fields=["linked_document", "status", "updated_at"]
        )
        requirement.bundle.recalculate_readiness()
        log_document_activity(
            owner=request.user,
            document=document,
            action=DocumentActivity.Action.ADDED_TO_BUNDLE,
            title="Added to a bundle",
            description=requirement.bundle.title,
            related_bundle=requirement.bundle,
        )
        return Response(
            DocumentBundleRequirementSerializer(
                requirement, context={"request": request}
            ).data
        )


class BundleRequirementLinkFileView(_RequirementActionMixin, APIView):
    """POST links an owner-owned file to a requirement (marks attached)."""

    def post(self, request, bundle_id, requirement_id):
        requirement = self.get_requirement()
        file = get_object_or_404(
            DocumentFile.objects.filter(is_trashed=False).filter(
                Q(document__owner=request.user, document__is_trashed=False)
                | Q(document__isnull=True, uploaded_by=request.user)
            ),
            pk=request.data.get("file"),
        )
        requirement.linked_file = file
        if requirement.linked_document_id is None:
            requirement.linked_document = file.document
        if requirement.status == DocumentBundleRequirement.Status.MISSING:
            requirement.status = DocumentBundleRequirement.Status.ATTACHED
        requirement.save(
            update_fields=[
                "linked_file",
                "linked_document",
                "status",
                "updated_at",
            ]
        )
        requirement.bundle.recalculate_readiness()
        log_document_activity(
            owner=request.user,
            document=file.document,
            action=DocumentActivity.Action.ADDED_TO_BUNDLE,
            title="Added to a bundle",
            description=requirement.bundle.title,
            related_bundle=requirement.bundle,
            related_file=file,
        )
        return Response(
            DocumentBundleRequirementSerializer(
                requirement, context={"request": request}
            ).data
        )


class BundleReadinessView(APIView):
    """GET a fresh readiness breakdown for an owner-owned bundle."""

    permission_classes = [IsAuthenticated]

    def get(self, request, bundle_id):
        bundle = get_object_or_404(
            DocumentBundle, pk=bundle_id, owner=request.user
        )
        readiness = bundle_readiness(bundle)
        # Keep the cached score fresh on read, too.
        if bundle.readiness_score != readiness.score:
            bundle.readiness_score = readiness.score
            bundle.save(update_fields=["readiness_score", "updated_at"])
        return Response(BundleReadinessSerializer(readiness).data)


# ---- Timeline ---------------------------------------------------------------


class DocumentTimelineView(APIView):
    """Aggregated, owner-scoped timeline of document + bundle events."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        params = request.query_params
        start_date = parse_date(params.get("start_date", ""))
        end_date = parse_date(params.get("end_date", ""))
        event_type = params.get("event_type") or None

        def _int(name):
            value = params.get(name)
            if value and value.isdigit():
                return int(value)
            return None

        events = build_timeline(
            request.user,
            start_date=start_date,
            end_date=end_date,
            event_type=event_type,
            document_id=_int("document_id"),
            bundle_id=_int("bundle_id"),
        )
        _track_product_event(
            request,
            "timeline_viewed",
            object_type="document_timeline",
            metadata={"event_type": event_type or "all", "count": len(events)},
        )
        serializer = TimelineEventSerializer(events, many=True)
        return Response({"count": len(events), "items": serializer.data})


# ---- OCR-assisted extraction (foundation) -----------------------------------


class _ExtractionScopedMixin:
    """Resolve extractions through an owner-owned file + document."""

    permission_classes = [IsAuthenticated]
    serializer_class = DocumentExtractionSerializer

    def get_file(self):
        return get_object_or_404(
            DocumentFile,
            pk=self.kwargs["file_id"],
            document_id=self.kwargs["document_id"],
            document__owner=self.request.user,
        )

    def get_queryset(self):
        return DocumentExtraction.objects.filter(
            file_id=self.kwargs["file_id"],
            document_id=self.kwargs["document_id"],
            owner=self.request.user,
        )


class DocumentExtractionListCreateView(
    _ExtractionScopedMixin, generics.ListCreateAPIView
):
    """
    GET lists a file's extractions; POST runs a new extraction attempt.

    The local foundation never sends files to a third-party service. (When the
    opt-in, key-gated AI assist is enabled, the extracted *text* — not the file —
    may be sent to Claude for better field suggestions; see
    ``apps.documents.ai_extract``.) When no reliable text can be obtained, the
    record is still created with a graceful ``needs_review`` status so the UI
    always has something to show.
    """

    def create(self, request, *args, **kwargs):
        require_feature_enabled("ocr", request.user)
        file = self.get_file()
        result = extract_file_details(file)
        extraction = DocumentExtraction.objects.create(
            owner=request.user,
            document=file.document,
            file=file,
            extraction_status=result.status,
            raw_text=result.raw_text,
            extracted_fields=result.extracted_fields,
            confidence_score=result.confidence_score,
            provider=result.provider,
            error_message=result.error_message,
        )
        _track_product_event(
            request,
            "extraction_requested",
            object_type="document_extraction",
            object_id=extraction.id,
            metadata={
                "provider": extraction.provider,
                "status": extraction.extraction_status,
            },
        )
        return Response(
            self.get_serializer(extraction).data,
            status=status.HTTP_201_CREATED,
        )


class DocumentExtractionDetailView(
    _ExtractionScopedMixin, generics.RetrieveUpdateAPIView
):
    """
    GET one extraction; PATCH stages reviewed fields before applying.

    Only ``extracted_fields`` is writable here (validated against the known set)
    and saving marks the extraction reviewed. Applying to the document is a
    separate, explicit step.
    """

    lookup_url_kwarg = "extraction_id"
    http_method_names = ["get", "patch", "head", "options"]

    def perform_update(self, serializer):
        serializer.save(
            reviewed_at=timezone.now(),
            extraction_status=DocumentExtraction.Status.NEEDS_REVIEW,
        )


class DocumentExtractionApplyView(_ExtractionScopedMixin, APIView):
    """
    POST applies selected reviewed fields onto the owner's document.

    The document is only ever changed here, never automatically during
    extraction, and only the explicitly chosen fields are written.
    """

    def post(self, request, document_id, file_id, extraction_id):
        extraction = get_object_or_404(
            DocumentExtraction,
            pk=extraction_id,
            file_id=file_id,
            document_id=document_id,
            owner=request.user,
        )
        serializer = ExtractionApplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        chosen = serializer.validated_data["fields"]

        document = extraction.document
        updated = []
        for field_name in chosen:
            if field_name not in APPLICABLE_EXTRACTION_FIELDS:
                continue
            if field_name not in extraction.extracted_fields:
                continue
            value = extraction.extracted_fields[field_name]
            setattr(document, field_name, value)
            updated.append(field_name)

        if updated:
            # Validate cross-field date rules before persisting.
            try:
                document.full_clean(validate_unique=False)
            except DjangoValidationError as exc:
                return Response(
                    exc.message_dict, status=status.HTTP_400_BAD_REQUEST
                )
            document.save(update_fields=[*updated, "updated_at"])
            # Record a version so applied extraction changes are recoverable.
            record_document_version(
                document,
                version_type=DocumentVersion.VersionType.EXTRACTION_APPLIED,
                created_by=request.user,
                change_summary="Applied extracted details: " + ", ".join(updated),
            )
            log_document_activity(
                owner=request.user,
                document=document,
                action=DocumentActivity.Action.EXTRACTION_APPLIED,
                title="Extracted details applied",
                description=", ".join(updated),
            )
            if "expiry_date" in updated or "renewal_date" in updated:
                _mark_onboarding(request, "first_expiry_date_added")
                _track_product_event(
                    request,
                    "expiry_date_added",
                    object_type="document",
                    object_id=document.id,
                    metadata={"source": "extraction_apply"},
                )

        extraction.applied_at = timezone.now()
        extraction.extraction_status = DocumentExtraction.Status.COMPLETED
        extraction.save(update_fields=["applied_at", "extraction_status", "updated_at"])

        return Response(
            {
                "applied_fields": updated,
                "extraction": DocumentExtractionSerializer(
                    extraction, context={"request": request}
                ).data,
                "document": DocumentSerializer(
                    document, context={"request": request}
                ).data,
            }
        )


# ===========================================================================
# Document Vault Maturity views
# ===========================================================================


# ---- File trash / restore (nested under a document) ------------------------


class _OwnedFileMixin:
    """Resolve a file owned by request.user, including trashed ones."""

    permission_classes = [IsAuthenticated]

    def get_owned_file(self, *, include_trashed=True):
        qs = DocumentFile.objects.filter(
            pk=self.kwargs["file_id"],
            document_id=self.kwargs["document_id"],
            document__owner=self.request.user,
        )
        if not include_trashed:
            qs = qs.filter(is_trashed=False)
        return get_object_or_404(qs)


class DocumentFileTrashListView(_DocumentScopedMixin, generics.ListAPIView):
    """List a document's trashed files."""

    serializer_class = DocumentFileSerializer

    def get_queryset(self):
        self.get_document()
        return DocumentFile.objects.filter(
            document_id=self.kwargs["document_id"],
            document__owner=self.request.user,
            is_trashed=True,
        )


class DocumentFileTrashView(_OwnedFileMixin, APIView):
    """POST soft-trashes a file."""

    def post(self, request, document_id, file_id):
        file = self.get_owned_file()
        _trash_file(file, request)
        return Response(
            DocumentFileSerializer(file, context={"request": request}).data
        )


class DocumentFileRestoreView(_OwnedFileMixin, APIView):
    """POST restores a trashed file back to active."""

    def post(self, request, document_id, file_id):
        file = self.get_owned_file()
        if file.is_trashed:
            file.is_trashed = False
            file.trashed_at = None
            file.save(update_fields=["is_trashed", "trashed_at"])
            if file.document_id:
                log_document_activity(
                    owner=request.user,
                    document=file.document,
                    action=DocumentActivity.Action.FILE_RESTORED,
                    title="File restored",
                    description=file.original_filename,
                    related_file=file,
                )
            _track_product_event(
                request,
                "trash_restore_used",
                object_type="document_file",
                object_id=file.id,
                metadata={"target": "file"},
            )
        return Response(
            DocumentFileSerializer(file, context={"request": request}).data
        )


class DocumentFilePermanentDeleteView(_OwnedFileMixin, APIView):
    """DELETE permanently removes a trashed file and its share links."""

    def delete(self, request, document_id, file_id):
        file = self.get_owned_file()
        if not file.is_trashed:
            return Response(
                {"detail": "Move the file to trash before deleting it permanently."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            file.file.delete(save=False)
        except Exception:  # noqa: BLE001 — best-effort blob cleanup
            pass
        file.delete()  # cascades to share links + file activity
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---- File versioning -------------------------------------------------------


class DocumentFileCreateVersionView(_DocumentScopedMixin, APIView):
    """
    POST uploads a replacement file and records a file-replacement version.

    Limitation: this stores the new file as a fresh ``DocumentFile`` and records
    a version pointing at it. Old file blobs are retained (not a destructive
    rollback chain) — see the file-versioning note in the docs.
    """

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, document_id, file_id):
        require_feature_enabled("document_versioning", request.user)
        document = self.get_document()
        previous = get_object_or_404(
            DocumentFile, pk=file_id, document=document, is_trashed=False
        )
        serializer = DocumentFileUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded = serializer.validated_data["file"]

        checksum = _compute_checksum(uploaded)
        instance = DocumentFile.objects.create(
            document=document,
            uploaded_by=request.user,
            file=uploaded,
            original_filename=uploaded.name[:255],
            content_type=uploaded.content_type or "",
            file_size=uploaded.size,
            checksum=checksum,
        )
        record_document_version(
            document,
            version_type=DocumentVersion.VersionType.FILE_REPLACEMENT,
            created_by=request.user,
            file=instance,
            change_summary=(
                f"Replaced “{previous.original_filename}” with "
                f"“{instance.original_filename}”"
            ),
            metadata={"previous_file_id": previous.id},
        )
        log_activity(
            file=instance,
            action=DocumentFileActivity.Action.FILE_UPLOADED,
            actor_type=DocumentFileActivity.ActorType.OWNER,
            request=request,
        )
        return Response(
            DocumentFileSerializer(instance, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )


# ---- Document version history ----------------------------------------------


class _DocumentVersionScopedMixin:
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentVersionSerializer

    def get_document(self):
        return get_object_or_404(
            Document, pk=self.kwargs["document_id"], owner=self.request.user
        )

    def get_queryset(self):
        self.get_document()
        return DocumentVersion.objects.filter(
            document_id=self.kwargs["document_id"],
            owner=self.request.user,
        ).select_related("created_by")


class DocumentVersionListView(_DocumentVersionScopedMixin, generics.ListAPIView):
    """List a document's version history (newest first)."""


class DocumentVersionDetailView(
    _DocumentVersionScopedMixin, generics.RetrieveAPIView
):
    lookup_url_kwarg = "version_id"


class DocumentVersionRestoreMetadataView(_DocumentVersionScopedMixin, APIView):
    """
    POST restores a previous version's METADATA onto the document.

    Only metadata is restored (title, type, issuer, dates, notes, etc.). Files
    are never rolled back here. A new version is recorded so the restore itself
    is part of the history and is reversible.
    """

    def post(self, request, document_id, version_id):
        require_feature_enabled("document_versioning", request.user)
        document = self.get_document()
        version = get_object_or_404(
            DocumentVersion, pk=version_id, document=document, owner=request.user
        )
        document.title = version.title_snapshot
        document.document_type = version.document_type_snapshot
        document.issuer = version.issuer_snapshot
        document.country = version.country_snapshot
        document.reference_number = version.reference_number_snapshot or None
        document.issue_date = version.issue_date_snapshot
        document.expiry_date = version.expiry_date_snapshot
        document.renewal_date = version.renewal_date_snapshot
        document.notes = version.notes_snapshot
        try:
            document.full_clean(validate_unique=False)
        except DjangoValidationError as exc:
            return Response(exc.message_dict, status=status.HTTP_400_BAD_REQUEST)
        document.save()
        record_document_version(
            document,
            version_type=DocumentVersion.VersionType.MANUAL_UPDATE,
            created_by=request.user,
            change_summary=f"Restored metadata from version {version.version_number}",
        )
        log_document_activity(
            owner=request.user,
            document=document,
            action=DocumentActivity.Action.DOCUMENT_VERSION_RESTORED,
            title="Version restored",
            description=f"Restored metadata from version {version.version_number}",
        )
        return Response(
            DocumentSerializer(document, context={"request": request}).data
        )


# ---- Export & backup -------------------------------------------------------

class DocumentExportListCreateView(generics.ListCreateAPIView):
    """GET lists the user's exports; POST requests (and generates) a new one."""

    permission_classes = [IsAuthenticated]
    serializer_class = DocumentExportRequestSerializer

    def get_queryset(self):
        return DocumentExportRequest.objects.filter(owner=self.request.user)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        export_type = serializer.validated_data["export_type"]

        # Generated synchronously (metadata only; small payloads). A future
        # branch can move heavy/full-archive exports to a background worker.
        try:
            export = create_document_export(request.user, export_type)
        except ExportGenerationError:
            return Response(
                {"detail": "Export generation failed."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        _track_product_event(
            request,
            "export_requested",
            object_type="document_export",
            object_id=export.id,
            metadata={"export_type": export.export_type},
        )

        return Response(
            DocumentExportRequestSerializer(
                export, context={"request": request}
            ).data,
            status=status.HTTP_201_CREATED,
        )


class DocumentExportDetailView(generics.RetrieveAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentExportRequestSerializer
    lookup_url_kwarg = "export_id"

    def get_queryset(self):
        return DocumentExportRequest.objects.filter(owner=self.request.user)


class DocumentExportDownloadView(APIView):
    """Owner-only, expiring download of a generated export file."""

    permission_classes = [IsAuthenticated]

    def get(self, request, export_id):
        export = get_object_or_404(
            DocumentExportRequest, pk=export_id, owner=request.user
        )
        if export.status != DocumentExportRequest.Status.COMPLETED or not export.file:
            return Response(
                {"detail": "This export is not ready."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if export.is_expired:
            return Response(
                {"detail": "This export has expired. Please request a new one."},
                status=status.HTTP_410_GONE,
            )
        try:
            opened = export.file.open("rb")
        except (FileNotFoundError, ValueError):
            return Response(
                {"detail": "This export is no longer available."},
                status=status.HTTP_404_NOT_FOUND,
            )
        filename = (
            "duenest-export.csv"
            if export.export_type == DocumentExportRequest.ExportType.DOCUMENTS_CSV
            else "duenest-export.json"
        )
        return FileResponse(opened, as_attachment=True, filename=filename)


class BundleExportListCreateView(generics.ListCreateAPIView):
    """GET/POST metadata exports for one owner-owned bundle."""

    permission_classes = [IsAuthenticated]
    serializer_class = BundleExportRequestSerializer

    def get_bundle(self):
        return get_object_or_404(
            DocumentBundle, pk=self.kwargs["bundle_id"], owner=self.request.user
        )

    def get_queryset(self):
        bundle = self.get_bundle()
        return DocumentExportRequest.objects.filter(
            owner=self.request.user,
            metadata__scope="bundle",
            metadata__bundle_id=bundle.id,
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["bundle_id"] = self.kwargs.get("bundle_id")
        return context

    def create(self, request, *args, **kwargs):
        bundle = self.get_bundle()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        export_type = serializer.validated_data["export_type"]

        try:
            export = create_bundle_export(request.user, bundle, export_type)
        except ExportGenerationError:
            return Response(
                {"detail": "Bundle export generation failed."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        _track_product_event(
            request,
            "export_requested",
            object_type="document_export",
            object_id=export.id,
            metadata={
                "export_type": export.export_type,
                "scope": "bundle",
                "bundle_id": bundle.id,
            },
        )
        log_document_activity(
            owner=request.user,
            action=DocumentActivity.Action.BUNDLE_EXPORTED,
            title="Pack exported",
            description=export.get_export_type_display(),
            related_bundle=bundle,
            metadata={"export_type": export.export_type},
        )

        return Response(
            BundleExportRequestSerializer(
                export,
                context={"request": request, "bundle_id": bundle.id},
            ).data,
            status=status.HTTP_201_CREATED,
        )


class BundleExportDetailView(generics.RetrieveAPIView):
    """Retrieve metadata for one bundle-scoped export request."""

    permission_classes = [IsAuthenticated]
    serializer_class = BundleExportRequestSerializer
    lookup_url_kwarg = "export_id"

    def get_bundle(self):
        return get_object_or_404(
            DocumentBundle, pk=self.kwargs["bundle_id"], owner=self.request.user
        )

    def get_queryset(self):
        bundle = self.get_bundle()
        return DocumentExportRequest.objects.filter(
            owner=self.request.user,
            metadata__scope="bundle",
            metadata__bundle_id=bundle.id,
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["bundle_id"] = self.kwargs.get("bundle_id")
        return context


class BundleExportDownloadView(APIView):
    """Owner-only, expiring download of one bundle-scoped export file."""

    permission_classes = [IsAuthenticated]

    def get(self, request, bundle_id, export_id):
        bundle = get_object_or_404(DocumentBundle, pk=bundle_id, owner=request.user)
        export = get_object_or_404(
            DocumentExportRequest,
            pk=export_id,
            owner=request.user,
            metadata__scope="bundle",
            metadata__bundle_id=bundle.id,
        )
        if export.status != DocumentExportRequest.Status.COMPLETED or not export.file:
            return Response(
                {"detail": "This export is not ready."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if export.is_expired:
            return Response(
                {"detail": "This export has expired. Please request a new one."},
                status=status.HTTP_410_GONE,
            )
        try:
            opened = export.file.open("rb")
        except (FileNotFoundError, ValueError):
            return Response(
                {"detail": "This export is no longer available."},
                status=status.HTTP_404_NOT_FOUND,
            )
        filename = (
            f"duenest-bundle-{bundle.id}-requirements.csv"
            if export.export_type
            == DocumentExportRequest.ExportType.BUNDLE_REQUIREMENTS_CSV
            else f"duenest-bundle-{bundle.id}-metadata.json"
        )
        return FileResponse(opened, as_attachment=True, filename=filename)


# ---- Emergency access packs (owner) ----------------------------------------


def _emergency_pack_code(plain: str) -> str:
    return make_password(plain)


class EmergencyPackViewSet(viewsets.ModelViewSet):
    """Owner CRUD + lifecycle actions for emergency access packs."""

    serializer_class = EmergencyAccessPackSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "pack_id"

    def get_queryset(self):
        return EmergencyAccessPack.objects.filter(
            owner=self.request.user
        ).prefetch_related("items__document", "items__file")

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    def perform_create(self, serializer):
        require_feature_enabled("emergency_access", self.request.user)
        enforce_plan_limit(self.request.user, user_plans.RESOURCE_EMERGENCY_PACKS)
        # An optional access code may be supplied at creation.
        plain_code = (serializer.validated_data.pop("access_code", "") or "").strip()
        access_required = bool(
            serializer.validated_data.get("access_code_required")
        )
        # New packs default to the recommended DELAYED unlock rule unless the
        # caller explicitly chose another mode. (The model default stays
        # INSTANT_CODE to preserve behaviour for legacy/direct-ORM rows.)
        save_kwargs = {
            "owner": self.request.user,
            "access_code_hash": _emergency_pack_code(plain_code)
            if (access_required and plain_code)
            else "",
        }
        if "unlock_mode" not in serializer.validated_data:
            save_kwargs["unlock_mode"] = EmergencyAccessPack.UnlockMode.DELAYED
        pack = serializer.save(**save_kwargs)
        log_document_activity(
            owner=self.request.user,
            action=DocumentActivity.Action.EMERGENCY_PACK_CREATED,
            title="Emergency pack created",
            description=pack.title,
        )
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.SETUP_CREATED,
            actor_label="Owner",
            description=f"Created “{pack.title}”.",
        )
        _track_product_event(
            self.request,
            "emergency_pack_created",
            object_type="emergency_access_pack",
            object_id=pack.id,
            metadata={"access_mode": pack.access_mode},
        )

    def perform_update(self, serializer):
        plain_code = (serializer.validated_data.pop("access_code", "") or "").strip()
        access_required = serializer.validated_data.get(
            "access_code_required",
            getattr(serializer.instance, "access_code_required", False),
        )
        previous_mode = serializer.instance.unlock_mode
        extra = {}
        if access_required and plain_code:
            extra["access_code_hash"] = _emergency_pack_code(plain_code)
        elif not access_required:
            extra["access_code_hash"] = ""
        pack = serializer.save(**extra)
        if pack.unlock_mode != previous_mode:
            log_emergency_event(
                pack=pack,
                event_type=EmergencyActivityEvent.EventType.UNLOCK_MODE_CHANGED,
                actor_label="Owner",
                description=f"Unlock rule changed to {pack.get_unlock_mode_display()}.",
                metadata={"unlock_mode": pack.unlock_mode},
            )

    @action(detail=True, methods=["post"], url_path="items")
    def add_item(self, request, pack_id=None):
        pack = self.get_object()
        serializer = EmergencyAccessPackItemSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        item = serializer.save(owner=request.user, pack=pack)
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.DOCUMENTS_CHANGED,
            actor_label="Owner",
            description=f"Added “{item.document.title}” to the emergency pack.",
        )
        return Response(
            EmergencyAccessPackItemSerializer(item, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["delete"],
        url_path=r"items/(?P<item_id>[^/.]+)",
    )
    def remove_item(self, request, pack_id=None, item_id=None):
        pack = self.get_object()
        item = get_object_or_404(
            EmergencyAccessPackItem, pk=item_id, pack=pack, owner=request.user
        )
        title = item.document.title
        item.delete()
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.DOCUMENTS_CHANGED,
            actor_label="Owner",
            description=f"Removed “{title}” from the emergency pack.",
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="enable")
    def enable(self, request, pack_id=None):
        """Activate a pack. Shareable packs get a token if they lack one."""
        pack = self.get_object()
        pack.status = EmergencyAccessPack.Status.ACTIVE
        pack.disabled_at = None
        new_token = False
        if (
            pack.access_mode == EmergencyAccessPack.AccessMode.SHARE_LINK
            and not pack.token
        ):
            pack.token = generate_share_token()
            new_token = True
        pack.save(update_fields=["status", "disabled_at", "token", "updated_at"])
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.SETUP_ENABLED,
            actor_label="Owner",
            description="Emergency access activated.",
        )
        if new_token:
            log_emergency_event(
                pack=pack,
                event_type=EmergencyActivityEvent.EventType.QR_GENERATED,
                actor_label="Owner",
                description="Emergency QR / link generated.",
            )
        return Response(self.get_serializer(pack).data)

    @action(detail=True, methods=["post"], url_path="disable")
    def disable(self, request, pack_id=None):
        """Disable a pack — any public link stops working immediately."""
        pack = self.get_object()
        pack.status = EmergencyAccessPack.Status.DISABLED
        pack.disabled_at = timezone.now()
        pack.save(update_fields=["status", "disabled_at", "updated_at"])
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.SETUP_DISABLED,
            actor_label="Owner",
            description="Emergency access disabled.",
        )
        return Response(self.get_serializer(pack).data)

    @action(detail=True, methods=["post"], url_path="regenerate-link")
    def regenerate_link(self, request, pack_id=None):
        """Rotate the public token, invalidating the previous link."""
        pack = self.get_object()
        pack.token = generate_share_token()
        pack.save(update_fields=["token", "updated_at"])
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.QR_REGENERATED,
            actor_label="Owner",
            description="Emergency QR regenerated — previous cards/links no longer work.",
        )
        return Response(self.get_serializer(pack).data)

    @action(detail=True, methods=["post"], url_path="review")
    def review(self, request, pack_id=None):
        """Mark the pack as freshly reviewed by the owner."""
        pack = self.get_object()
        pack.last_reviewed_at = timezone.now()
        pack.save(update_fields=["last_reviewed_at", "updated_at"])
        return Response(self.get_serializer(pack).data)

    # ---- Trusted contacts --------------------------------------------------

    @action(detail=True, methods=["get", "post"], url_path="contacts")
    def contacts(self, request, pack_id=None):
        pack = self.get_object()
        if request.method == "GET":
            qs = pack.trusted_contacts.all()
            return Response(EmergencyTrustedContactSerializer(qs, many=True).data)
        serializer = EmergencyTrustedContactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        contact = serializer.save(owner=request.user, pack=pack)
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.CONTACT_ADDED,
            actor_label="Owner",
            description=f"Added trusted contact {contact.name}.",
        )
        return Response(
            EmergencyTrustedContactSerializer(contact).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"contacts/(?P<contact_id>[^/.]+)",
    )
    def contact_detail(self, request, pack_id=None, contact_id=None):
        pack = self.get_object()
        contact = get_object_or_404(
            EmergencyTrustedContact, pk=contact_id, pack=pack, owner=request.user
        )
        if request.method == "DELETE":
            name = contact.name
            contact.delete()
            log_emergency_event(
                pack=pack,
                event_type=EmergencyActivityEvent.EventType.CONTACT_REMOVED,
                actor_label="Owner",
                description=f"Removed trusted contact {name}.",
            )
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = EmergencyTrustedContactSerializer(
            contact, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    # ---- Emergency location ------------------------------------------------

    @action(detail=True, methods=["post"], url_path="location")
    def location(self, request, pack_id=None):
        """
        Update the optional emergency location. Location is off by default and is
        only ever revealed to a trusted person after the unlock rules grant
        access. This is not live tracking — the owner sets a last-known location.
        """
        pack = self.get_object()
        data = request.data or {}
        was_enabled = pack.location_enabled
        if "location_enabled" in data:
            pack.location_enabled = bool(data.get("location_enabled"))
        if data.get("location_precision") in (
            EmergencyAccessPack.LocationPrecision.APPROXIMATE,
            EmergencyAccessPack.LocationPrecision.PRECISE,
        ):
            pack.location_precision = data["location_precision"]
        location_changed = False
        if "label" in data or "lat" in data or "lng" in data:
            label = str(data.get("label", "")).strip()[:160]
            lat = data.get("lat")
            lng = data.get("lng")
            pack.last_known_location = {
                "label": label,
                "lat": lat if isinstance(lat, (int, float)) else None,
                "lng": lng if isinstance(lng, (int, float)) else None,
            }
            pack.last_known_location_at = timezone.now()
            location_changed = True
        pack.save(
            update_fields=[
                "location_enabled",
                "location_precision",
                "last_known_location",
                "last_known_location_at",
                "updated_at",
            ]
        )
        if pack.location_enabled != was_enabled:
            log_emergency_event(
                pack=pack,
                event_type=EmergencyActivityEvent.EventType.LOCATION_TOGGLED,
                actor_label="Owner",
                description=(
                    "Emergency location turned on."
                    if pack.location_enabled
                    else "Emergency location turned off."
                ),
            )
        # Background ("auto") refreshes from the owner's open page would otherwise
        # write a LOCATION_UPDATED row on every tick; the `auto` flag suppresses
        # the activity entry so only deliberate, manual updates are logged.
        is_auto = bool(data.get("auto"))
        if location_changed and not is_auto:
            log_emergency_event(
                pack=pack,
                event_type=EmergencyActivityEvent.EventType.LOCATION_UPDATED,
                actor_label="Owner",
                description="Last known location updated.",
            )
        return Response(self.get_serializer(pack).data)

    # ---- Safety check-in ("dead man's switch") -----------------------------

    @action(detail=True, methods=["post"], url_path="checkin/arm")
    def checkin_arm(self, request, pack_id=None):
        """
        Arm the safety check-in. The owner must then check in by the deadline or
        the escalation fires (trusted contacts are alerted server-side, so it
        works even if their phone is off). Requires at least one trusted contact
        with an email so the alert can reach someone.
        """
        require_feature_enabled("emergency_checkin", request.user)
        pack = self.get_object()
        data = request.data or {}

        try:
            interval = int(data.get("interval_minutes"))
        except (TypeError, ValueError):
            return Response(
                {"detail": "interval_minutes is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        lo = EmergencyAccessPack.CHECKIN_MIN_MINUTES
        hi = EmergencyAccessPack.CHECKIN_MAX_MINUTES
        if interval < lo or interval > hi:
            return Response(
                {"detail": f"Choose a check-in time between {lo} and {hi} minutes."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not pack.trusted_contacts.exclude(email="").exists():
            return Response(
                {"detail": "Add at least one trusted contact with an email first."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        message = str(data.get("message", "")).strip()[:2000]
        reveal_location = bool(data.get("reveal_location", True))
        pack.checkin_armed = True
        pack.checkin_interval_minutes = interval
        pack.checkin_due_at = timezone.now() + timedelta(minutes=interval)
        pack.checkin_nudge_sent = False
        pack.checkin_message = message
        pack.checkin_reveal_location = reveal_location
        pack.checkin_triggered_at = None
        pack.save(
            update_fields=[
                "checkin_armed",
                "checkin_interval_minutes",
                "checkin_due_at",
                "checkin_nudge_sent",
                "checkin_message",
                "checkin_reveal_location",
                "checkin_triggered_at",
                "updated_at",
            ]
        )
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.CHECKIN_ARMED,
            actor_label="Owner",
            description=f"Safety check-in armed for {interval} minutes.",
        )
        return Response(self.get_serializer(pack).data)

    @action(detail=True, methods=["post"], url_path="checkin/extend")
    def checkin_extend(self, request, pack_id=None):
        """Push the deadline out by the original interval (or a provided one).
        Only valid while armed — this is the owner saying "still going"."""
        require_feature_enabled("emergency_checkin", request.user)
        pack = self.get_object()
        if not pack.checkin_armed:
            return Response(
                {"detail": "No check-in is currently armed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        data = request.data or {}
        interval = pack.checkin_interval_minutes or EmergencyAccessPack.CHECKIN_MIN_MINUTES
        raw = data.get("interval_minutes")
        if raw is not None:
            try:
                interval = int(raw)
            except (TypeError, ValueError):
                return Response(
                    {"detail": "interval_minutes must be a number."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            lo = EmergencyAccessPack.CHECKIN_MIN_MINUTES
            hi = EmergencyAccessPack.CHECKIN_MAX_MINUTES
            if interval < lo or interval > hi:
                return Response(
                    {"detail": f"Choose a check-in time between {lo} and {hi} minutes."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        pack.checkin_interval_minutes = interval
        pack.checkin_due_at = timezone.now() + timedelta(minutes=interval)
        pack.checkin_nudge_sent = False
        pack.save(
            update_fields=[
                "checkin_interval_minutes",
                "checkin_due_at",
                "checkin_nudge_sent",
                "updated_at",
            ]
        )
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.CHECKIN_EXTENDED,
            actor_label="Owner",
            description=f"Safety check-in extended by {interval} minutes.",
        )
        return Response(self.get_serializer(pack).data)

    @action(detail=True, methods=["post"], url_path="checkin/cancel")
    def checkin_cancel(self, request, pack_id=None):
        """Disarm the check-in ("I'm safe") without firing anything."""
        require_feature_enabled("emergency_checkin", request.user)
        pack = self.get_object()
        was_armed = pack.checkin_armed
        pack.checkin_armed = False
        pack.checkin_due_at = None
        pack.checkin_nudge_sent = False
        pack.save(
            update_fields=[
                "checkin_armed",
                "checkin_due_at",
                "checkin_nudge_sent",
                "updated_at",
            ]
        )
        if was_armed:
            log_emergency_event(
                pack=pack,
                event_type=EmergencyActivityEvent.EventType.CHECKIN_CANCELED,
                actor_label="Owner",
                description="Safety check-in canceled — owner is safe.",
            )
        return Response(self.get_serializer(pack).data)

    # ---- Activity + unlock requests (owner side) ---------------------------

    @action(detail=True, methods=["get"], url_path="activity")
    def activity(self, request, pack_id=None):
        pack = self.get_object()
        events = pack.activity_events.all()[:100]
        return Response(EmergencyActivityEventSerializer(events, many=True).data)

    @action(detail=True, methods=["get"], url_path="unlock-requests")
    def unlock_requests(self, request, pack_id=None):
        pack = self.get_object()
        # Settle any countdowns that have elapsed before listing.
        for req in pack.unlock_requests.filter(
            status=EmergencyUnlockRequest.Status.COUNTDOWN
        ):
            if req.settle_due_countdown():
                req.save(update_fields=["status", "updated_at"])
        requests = pack.unlock_requests.all()[:100]
        return Response(EmergencyUnlockRequestSerializer(requests, many=True).data)

    @action(
        detail=True,
        methods=["post"],
        url_path=r"unlock-requests/(?P<req_id>[^/.]+)/approve",
    )
    def approve_request(self, request, pack_id=None, req_id=None):
        pack = self.get_object()
        req = get_object_or_404(EmergencyUnlockRequest, pk=req_id, pack=pack)
        if req.status in (
            EmergencyUnlockRequest.Status.PENDING,
            EmergencyUnlockRequest.Status.COUNTDOWN,
        ):
            req.status = EmergencyUnlockRequest.Status.UNLOCKED
            req.decided_at = timezone.now()
            if pack.access_duration_minutes:
                req.access_expires_at = timezone.now() + timezone.timedelta(
                    minutes=pack.access_duration_minutes
                )
            req.save(
                update_fields=[
                    "status",
                    "decided_at",
                    "access_expires_at",
                    "updated_at",
                ]
            )
            log_emergency_event(
                pack=pack,
                event_type=EmergencyActivityEvent.EventType.ACCESS_APPROVED,
                actor_label="Owner",
                description=f"Approved access for {req.requester_name}.",
            )
        return Response(EmergencyUnlockRequestSerializer(req).data)

    @action(
        detail=True,
        methods=["post"],
        url_path=r"unlock-requests/(?P<req_id>[^/.]+)/deny",
    )
    def deny_request(self, request, pack_id=None, req_id=None):
        pack = self.get_object()
        req = get_object_or_404(EmergencyUnlockRequest, pk=req_id, pack=pack)
        if req.status in (
            EmergencyUnlockRequest.Status.PENDING,
            EmergencyUnlockRequest.Status.COUNTDOWN,
            EmergencyUnlockRequest.Status.UNLOCKED,
        ):
            req.status = EmergencyUnlockRequest.Status.DENIED
            req.decided_at = timezone.now()
            req.save(update_fields=["status", "decided_at", "updated_at"])
            log_emergency_event(
                pack=pack,
                event_type=EmergencyActivityEvent.EventType.ACCESS_DENIED,
                actor_label="Owner",
                description=f"Denied access for {req.requester_name}.",
            )
        return Response(EmergencyUnlockRequestSerializer(req).data)

    @action(
        detail=True,
        methods=["post"],
        url_path=r"unlock-requests/(?P<req_id>[^/.]+)/revoke",
    )
    def revoke_request(self, request, pack_id=None, req_id=None):
        pack = self.get_object()
        req = get_object_or_404(EmergencyUnlockRequest, pk=req_id, pack=pack)
        req.status = EmergencyUnlockRequest.Status.REVOKED
        req.decided_at = timezone.now()
        req.save(update_fields=["status", "decided_at", "updated_at"])
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.ACCESS_REVOKED,
            actor_label="Owner",
            description=f"Revoked access for {req.requester_name}.",
        )
        return Response(EmergencyUnlockRequestSerializer(req).data)


# ---- Emergency access packs (public, token-gated) --------------------------


def _resolve_emergency_pack(token):
    """Return (pack, error_response). Only active, unexpired packs are usable."""
    try:
        pack = EmergencyAccessPack.objects.get(token=token)
    except EmergencyAccessPack.DoesNotExist:
        return None, Response(
            {"detail": "This emergency link is invalid.", "state": "invalid"},
            status=status.HTTP_404_NOT_FOUND,
        )
    if not pack.is_shareable_now:
        return None, Response(
            {
                "detail": "This emergency link is no longer available.",
                "state": "unavailable",
            },
            status=status.HTTP_410_GONE,
        )
    return pack, None


def _check_pack_access_code(pack, request):
    if not pack.access_code_required:
        return None
    result = public_access.check_public_access_code(
        kind="emergency",
        identifier=pack.token,
        supplied_code=request.headers.get("X-Access-Code", ""),
        access_code_hash=pack.access_code_hash,
        required=True,
    )
    if result.ok:
        return None
    if result.is_wrong_code:
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.WRONG_CODE,
            actor_label="Shared viewer",
            description="Wrong access code at emergency pack.",
        )
    return _public_code_denied_response(
        result,
        requires_detail="This emergency pack is protected. Enter the access code.",
    )


def _resolve_open_unlock_request(pack, request):
    """
    Resolve the requester's unlock request from the X-Request-Token header (or a
    ``request_token`` query/body value). Settles an elapsed delayed countdown to
    UNLOCKED. Returns the request instance (any status) or None.
    """
    token = (
        request.headers.get("X-Request-Token", "")
        or request.query_params.get("request_token", "")
        or (request.data.get("request_token", "") if hasattr(request, "data") else "")
    ).strip()
    if not token:
        return None
    try:
        req = pack.unlock_requests.get(request_token=token)
    except EmergencyUnlockRequest.DoesNotExist:
        return None
    if req.settle_due_countdown():
        req.save(update_fields=["status", "updated_at"])
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.ACCESS_UNLOCKED,
            actor_label=req.requester_name,
            description="Delayed unlock opened automatically.",
        )
        notify_pack_owner(
            pack=pack,
            notification_type="emergency_unlock",
            title="Emergency access opened",
            message=f"Emergency access for “{pack.title}” has opened.",
            severity="warning",
            dedupe_suffix=f"req{req.id}",
        )
    return req


def _public_pack_payload(pack, *, include_items, unlock_request=None):
    data = PublicEmergencyPackSerializer(
        pack, context={"include_items": include_items}
    ).data
    if unlock_request is not None:
        data["request"] = {
            "status": unlock_request.status,
            "unlock_at": (
                unlock_request.unlock_at.isoformat()
                if unlock_request.unlock_at
                else None
            ),
        }
    if include_items and pack.location_enabled and pack.last_known_location:
        # Record that the (already-permitted) viewer was shown the location.
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.LOCATION_REVEALED,
            actor_label=(
                unlock_request.requester_name if unlock_request else "Shared viewer"
            ),
            description="Emergency location revealed after unlock.",
        )
    return data


class PublicEmergencyPackMetadataView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_access_code"

    def get(self, request, token):
        require_feature_enabled("emergency_public_viewer")
        pack, err = _resolve_emergency_pack(token)
        if err:
            return err
        pack.last_accessed_at = timezone.now()
        pack.save(update_fields=["last_accessed_at"])
        log_document_activity(
            owner=pack.owner,
            action=DocumentActivity.Action.EMERGENCY_PACK_OPENED,
            actor_type="shared_viewer",
            title="Emergency pack opened",
            description=pack.title,
        )
        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.QR_SCANNED,
            actor_label="Shared viewer",
            description="Emergency link opened.",
        )

        if pack.requires_unlock_request:
            # Items are never shown until an unlock request is open. The access
            # code (if any) is checked when the request is submitted, not here, so
            # the gate page itself leaks nothing.
            req = _resolve_open_unlock_request(pack, request)
            include = bool(req and req.is_open)
            return Response(
                _public_pack_payload(pack, include_items=include, unlock_request=req)
            )

        # Instant / legacy share links: code-gate, then expose items directly.
        code_err = _check_pack_access_code(pack, request)
        if code_err:
            return code_err
        return Response(_public_pack_payload(pack, include_items=True))


class PublicEmergencyUnlockRequestCreateView(APIView):
    """Start an emergency unlock request from the public link."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "emergency_code"

    def post(self, request, token):
        require_feature_enabled("emergency_public_viewer")
        pack, err = _resolve_emergency_pack(token)
        if err:
            return err

        # Access code (if required) is verified at request time.
        if pack.access_code_required:
            result = public_access.check_public_access_code(
                kind="emergency",
                identifier=pack.token,
                supplied_code=request.data.get("access_code", ""),
                access_code_hash=pack.access_code_hash,
                required=True,
            )
            if not result.ok:
                if result.is_wrong_code:
                    log_emergency_event(
                        pack=pack,
                        event_type=EmergencyActivityEvent.EventType.WRONG_CODE,
                        actor_label="Shared viewer",
                        description="Wrong access code at emergency request.",
                    )
                    notify_pack_owner(
                        pack=pack,
                        notification_type="security_alert",
                        title="Wrong emergency code attempt",
                        message=f"Someone entered a wrong code for “{pack.title}”.",
                        severity="security",
                        dedupe_suffix=timezone.now().strftime("%Y%m%d%H%M"),
                    )
                return _public_code_denied_response(
                    result,
                    requires_detail="This emergency pack is protected. "
                    "Enter the access code.",
                )

        serializer = PublicUnlockRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        vd = serializer.validated_data

        if not pack.requires_unlock_request:
            # Instant-with-code (or legacy) packs open immediately once the code
            # checks out — no request row is needed.
            return Response({"state": "open"})

        req = EmergencyUnlockRequest(
            pack=pack,
            request_token=generate_share_token(),
            requester_name=vd["requester_name"],
            relationship=vd.get("relationship", ""),
            reason=vd.get("reason", ""),
            contact_info=vd.get("contact_info", ""),
        )
        if pack.unlock_mode == EmergencyAccessPack.UnlockMode.DELAYED:
            req.status = EmergencyUnlockRequest.Status.COUNTDOWN
            req.unlock_at = timezone.now() + timezone.timedelta(
                hours=pack.unlock_delay_hours
            )
        else:  # owner_approval
            req.status = EmergencyUnlockRequest.Status.PENDING
        req.save()

        log_emergency_event(
            pack=pack,
            event_type=EmergencyActivityEvent.EventType.REQUEST_SUBMITTED,
            actor_label=req.requester_name,
            description=f"{req.requester_name} requested emergency access.",
        )
        if req.status == EmergencyUnlockRequest.Status.COUNTDOWN:
            log_emergency_event(
                pack=pack,
                event_type=EmergencyActivityEvent.EventType.COUNTDOWN_STARTED,
                actor_label=req.requester_name,
                description=f"Delayed unlock counting down ({pack.unlock_delay_hours}h).",
            )
        notify_pack_owner(
            pack=pack,
            notification_type="emergency_request",
            title="Emergency access requested",
            message=(
                f"{req.requester_name} requested access to “{pack.title}”."
                + (
                    f" It will unlock in {pack.unlock_delay_hours}h unless you deny it."
                    if req.status == EmergencyUnlockRequest.Status.COUNTDOWN
                    else " Approve or deny it from your dashboard."
                )
            ),
            severity="urgent",
            dedupe_suffix=f"req{req.id}",
        )
        return Response(
            {
                "request_token": req.request_token,
                "status": req.status,
                "unlock_at": req.unlock_at.isoformat() if req.unlock_at else None,
            },
            status=status.HTTP_201_CREATED,
        )


class PublicEmergencyUnlockRequestStatusView(APIView):
    """Poll the status of an unlock request (and read items once unlocked)."""

    permission_classes = [AllowAny]

    def get(self, request, token, request_token):
        pack, err = _resolve_emergency_pack(token)
        if err:
            return err
        try:
            req = pack.unlock_requests.get(request_token=request_token)
        except EmergencyUnlockRequest.DoesNotExist:
            return Response(
                {"detail": "This request was not found.", "state": "invalid"},
                status=status.HTTP_404_NOT_FOUND,
            )
        if req.settle_due_countdown():
            req.save(update_fields=["status", "updated_at"])
        payload = _public_pack_payload(
            pack, include_items=req.is_open, unlock_request=req
        )
        return Response(payload)


class PublicEmergencyPackVerifyCodeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "emergency_code"

    def post(self, request, token):
        pack, err = _resolve_emergency_pack(token)
        if err:
            return err
        if not pack.access_code_required:
            return Response({"detail": "Access code verified."})
        result = public_access.check_public_access_code(
            kind="emergency",
            identifier=pack.token,
            supplied_code=request.data.get("access_code", ""),
            access_code_hash=pack.access_code_hash,
            required=True,
        )
        if result.ok:
            return Response({"detail": "Access code verified."})
        if result.state == "locked":
            resp = Response(
                {"detail": public_access.locked_detail(), "state": "locked"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            if result.retry_after:
                resp["Retry-After"] = str(int(result.retry_after))
            return resp
        return Response(
            {"detail": "Invalid access code.", "state": "wrong_code"},
            status=status.HTTP_400_BAD_REQUEST,
        )


class _PublicEmergencyItemMixin(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_access_code"

    def resolve(self, request, token, item_id):
        pack, err = _resolve_emergency_pack(token)
        if err:
            return None, err, None
        unlock_request = None
        if pack.requires_unlock_request:
            # Documents are only served once the unlock rules have opened access.
            unlock_request = _resolve_open_unlock_request(pack, request)
            if not (unlock_request and unlock_request.is_open):
                return None, Response(
                    {
                        "detail": "Emergency access has not been unlocked yet.",
                        "state": "locked",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                ), None
        else:
            code_err = _check_pack_access_code(pack, request)
            if code_err:
                return None, code_err, None
        item = get_object_or_404(
            EmergencyAccessPackItem.objects.select_related("document", "file"),
            pk=item_id,
            pack=pack,
        )
        # Never serve a trashed document/file, even via a valid pack.
        if item.document.is_trashed or (item.file and item.file.is_trashed):
            return None, Response(
                {"detail": "This item is no longer available.", "state": "unavailable"},
                status=status.HTTP_410_GONE,
            ), None
        if item.file is None:
            return None, Response(
                {"detail": "This item has no file attached."},
                status=status.HTTP_404_NOT_FOUND,
            ), None
        return item, None, unlock_request


class PublicEmergencyPackItemPreviewView(_PublicEmergencyItemMixin):
    def get(self, request, token, item_id):
        item, err, unlock_request = self.resolve(request, token, item_id)
        if err:
            return err
        if not item.file.is_previewable:
            return Response(
                {"detail": "Preview is not available for this file type."},
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            )
        log_emergency_event(
            pack=item.pack,
            event_type=EmergencyActivityEvent.EventType.DOCUMENT_VIEWED,
            actor_label=(
                unlock_request.requester_name if unlock_request else "Shared viewer"
            ),
            description=f"Viewed “{item.document.title}”.",
        )
        return _inline_file_response(item.file)


class PublicEmergencyPackItemDownloadView(_PublicEmergencyItemMixin):
    def get(self, request, token, item_id):
        item, err, unlock_request = self.resolve(request, token, item_id)
        if err:
            return err
        if not item.pack.allow_downloads:
            return Response(
                {
                    "detail": "Downloads are turned off for this emergency access.",
                    "state": "downloads_disabled",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        log_emergency_event(
            pack=item.pack,
            event_type=EmergencyActivityEvent.EventType.DOCUMENT_DOWNLOADED,
            actor_label=(
                unlock_request.requester_name if unlock_request else "Shared viewer"
            ),
            description=f"Downloaded “{item.document.title}”.",
        )
        notify_pack_owner(
            pack=item.pack,
            notification_type="emergency_viewed",
            title="Emergency document downloaded",
            message=f"A document in “{item.pack.title}” was downloaded.",
            severity="warning",
            dedupe_suffix=f"dl{item.id}:{timezone.now().strftime('%Y%m%d%H')}",
        )
        return _file_response(item.file, as_attachment=True)


# ---- Proof-of-submission records -------------------------------------------


class ProofRecordViewSet(viewsets.ModelViewSet):
    """Owner CRUD for proof records."""

    serializer_class = ProofRecordSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "proof_id"

    def get_queryset(self):
        queryset = ProofRecord.objects.filter(owner=self.request.user)
        params = self.request.query_params
        if params.get("document"):
            queryset = queryset.filter(document_id=params["document"])
        if params.get("bundle"):
            queryset = queryset.filter(bundle_id=params["bundle"])
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    def perform_create(self, serializer):
        proof = serializer.save(owner=self.request.user)
        log_document_activity(
            owner=self.request.user,
            document=proof.document,
            action=DocumentActivity.Action.PROOF_SAVED,
            title="Proof saved",
            description=proof.title,
            related_proof=proof,
            related_bundle=proof.bundle,
        )
        _track_product_event(
            self.request,
            "proof_record_created",
            object_type="proof_record",
            object_id=proof.id,
            metadata={"proof_type": proof.proof_type},
        )


class DocumentProofRecordListView(generics.ListAPIView):
    """Proof records for one owner-owned document."""

    permission_classes = [IsAuthenticated]
    serializer_class = ProofRecordSerializer

    def get_queryset(self):
        get_object_or_404(
            Document, pk=self.kwargs["document_id"], owner=self.request.user
        )
        return ProofRecord.objects.filter(
            owner=self.request.user, document_id=self.kwargs["document_id"]
        )


class BundleProofRecordListView(generics.ListAPIView):
    """Proof records for one owner-owned bundle."""

    permission_classes = [IsAuthenticated]
    serializer_class = ProofRecordSerializer

    def get_queryset(self):
        get_object_or_404(
            DocumentBundle, pk=self.kwargs["bundle_id"], owner=self.request.user
        )
        return ProofRecord.objects.filter(
            owner=self.request.user, bundle_id=self.kwargs["bundle_id"]
        )


# ---- Unified document activity timeline ------------------------------------

# File/share actions worth surfacing in the user-facing timeline, mapped to a
# friendly title. Noisy/duplicate technical events are intentionally excluded.
_FILE_ACTIVITY_TITLES = {
    "file_uploaded": "File uploaded",
    "file_previewed": "File previewed",
    "file_downloaded": "File downloaded",
    "share_created": "Share link created",
    "share_opened": "Share link opened",
    "share_previewed": "Shared file previewed",
    "share_downloaded": "Shared file downloaded",
    "share_revoked": "Share link revoked",
}


class DocumentActivityTimelineView(APIView):
    """
    Owner-only, human-readable activity timeline for one document.

    Merges document-level activity (created/updated/trashed/checklist/proof/…)
    with the lower-level file/share activity log. Raw IP addresses are never
    exposed here.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, document_id):
        document = get_object_or_404(
            Document, pk=document_id, owner=request.user
        )

        events = []
        for activity in document.activities.all():
            events.append(
                {
                    "id": f"doc:{activity.id}",
                    "action": activity.action,
                    "title": activity.title or activity.get_action_display(),
                    "description": activity.description,
                    "actor_type": activity.actor_type,
                    "timestamp": activity.created_at,
                    "related_file": activity.related_file_id,
                    "related_share": None,
                    "related_checklist": activity.related_checklist_id,
                    "related_bundle": activity.related_bundle_id,
                    "related_proof": activity.related_proof_id,
                    "metadata": activity.metadata or {},
                }
            )
        for fa in document.file_activities.all():
            if fa.action not in _FILE_ACTIVITY_TITLES:
                continue
            events.append(
                {
                    "id": f"file:{fa.id}",
                    "action": fa.action,
                    "title": _FILE_ACTIVITY_TITLES[fa.action],
                    "description": "",
                    "actor_type": fa.actor_type,
                    "timestamp": fa.created_at,
                    "related_file": fa.file_id,
                    "related_share": fa.share_link_id,
                    "related_checklist": None,
                    "related_bundle": None,
                    "related_proof": None,
                    "metadata": {},
                }
            )

        events.sort(key=lambda e: e["timestamp"], reverse=True)
        serializer = DocumentActivityEventSerializer(events, many=True)
        return Response({"count": len(events), "items": serializer.data})


class PlanUsageView(APIView):
    """
    Read-only plan + usage snapshot for the authenticated user.

    Returns the user's plan, per-resource usage (used/limit/remaining), and
    storage usage so the UI can render a usage card, plan badge, and an upgrade
    prompt. Ownership is enforced — counts are scoped to ``request.user`` only.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(compute_plan_usage(request.user))


# ---- Intelligence polish: tags, history, appointments, payments, scanners --


class DocumentTagViewSet(viewsets.ModelViewSet):
    """CRUD for the authenticated user's private tags."""

    serializer_class = DocumentTagSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "tag_id"

    def get_queryset(self):
        return (
            DocumentTag.objects.filter(owner=self.request.user)
            .annotate(
                document_count=Count(
                    "documents",
                    filter=Q(documents__is_trashed=False),
                    distinct=True,
                )
            )
            .order_by("name")
        )

    def perform_create(self, serializer):
        tag = serializer.save(owner=self.request.user)
        return tag

    def create(self, request, *args, **kwargs):
        # Friendly handling of the per-owner unique slug constraint.
        try:
            return super().create(request, *args, **kwargs)
        except IntegrityError:
            return Response(
                {"detail": "You already have a tag with that name."},
                status=status.HTTP_400_BAD_REQUEST,
            )


class _DocumentOwnedMixin:
    """Resolve a document the caller owns (404 otherwise)."""

    permission_classes = [IsAuthenticated]

    def get_document(self):
        return get_object_or_404(
            Document, pk=self.kwargs["document_id"], owner=self.request.user
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context


class DocumentRenewalEventListCreateView(
    _DocumentOwnedMixin, generics.ListCreateAPIView
):
    """List/create renewal-history events for one owner-owned document."""

    serializer_class = DocumentRenewalEventSerializer

    def get_queryset(self):
        self.get_document()
        return DocumentRenewalEvent.objects.filter(
            owner=self.request.user, document_id=self.kwargs["document_id"]
        )

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user, document=self.get_document())


class DocumentRenewalEventDetailView(
    _DocumentOwnedMixin, generics.RetrieveUpdateDestroyAPIView
):
    """Retrieve/update/delete one renewal event."""

    serializer_class = DocumentRenewalEventSerializer
    lookup_url_kwarg = "event_id"

    def get_queryset(self):
        self.get_document()
        return DocumentRenewalEvent.objects.filter(
            owner=self.request.user, document_id=self.kwargs["document_id"]
        )


class DocumentAppointmentViewSet(viewsets.ModelViewSet):
    """CRUD for appointments, optionally filtered by document or bundle."""

    serializer_class = DocumentAppointmentSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "appointment_id"

    def get_queryset(self):
        queryset = DocumentAppointment.objects.filter(owner=self.request.user)
        params = self.request.query_params
        if params.get("document"):
            queryset = queryset.filter(document_id=params["document"])
        if params.get("bundle"):
            queryset = queryset.filter(bundle_id=params["bundle"])
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class DocumentPaymentViewSet(viewsets.ModelViewSet):
    """CRUD for renewal/application costs, filterable by document or bundle."""

    serializer_class = DocumentPaymentSerializer
    permission_classes = [IsAuthenticated]
    lookup_url_kwarg = "payment_id"

    def get_queryset(self):
        queryset = DocumentPayment.objects.filter(owner=self.request.user)
        params = self.request.query_params
        if params.get("document"):
            queryset = queryset.filter(document_id=params["document"])
        if params.get("bundle"):
            queryset = queryset.filter(bundle_id=params["bundle"])
        if params.get("payment_status"):
            queryset = queryset.filter(payment_status=params["payment_status"])
        return queryset

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["request"] = self.request
        return context

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class DocumentMissingScanView(APIView):
    """Owner-scoped summary of missing/risky items across the vault."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(scan_missing(request.user))


class DocumentHealthOverviewView(APIView):
    """Owner-scoped grouped health sections for the documents dashboard."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(build_health_overview(request.user))


# ---- Secure rooms (owner) --------------------------------------------------


class ShareRoomListCreateView(APIView):
    """GET lists the user's rooms; POST creates one."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rooms = (
            ShareRoom.objects.filter(owner=request.user)
            .prefetch_related("items")
            .all()
        )
        return Response(ShareRoomSerializer(rooms, many=True).data)

    def post(self, request):
        enforce_plan_limit(request.user, user_plans.RESOURCE_SHARE_LINKS)
        serializer = ShareRoomCreateUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        plain_code = None
        access_code_hash = ""
        if data.get("access_code_required"):
            plain_code = (
                (data.pop("access_code", "") or "").strip()
                or f"{secrets.randbelow(1_000_000):06d}"
            )
            access_code_hash = make_password(plain_code)
        data.pop("access_code", None)

        room = ShareRoom.objects.create(
            owner=request.user,
            access_code_hash=access_code_hash,
            **data,
        )
        log_room_activity(
            room=room,
            action=RoomActivity.Action.ROOM_CREATED,
            actor_type=RoomActivity.ActorType.OWNER,
            request=request,
        )
        _track_product_event(
            request,
            "share_room_created",
            object_type="share_room",
            object_id=room.id,
            metadata={"permission": room.permission},
        )
        payload = ShareRoomSerializer(room).data
        if plain_code is not None:
            payload["access_code"] = plain_code
        return Response(payload, status=status.HTTP_201_CREATED)


class _OwnedRoomMixin:
    permission_classes = [IsAuthenticated]

    def get_room(self):
        return get_object_or_404(
            ShareRoom, pk=self.kwargs["room_id"], owner=self.request.user
        )


class ShareRoomDetailView(_OwnedRoomMixin, APIView):
    """GET/PATCH/DELETE one owner-scoped room."""

    def get(self, request, room_id):
        return Response(ShareRoomSerializer(self.get_room()).data)

    def patch(self, request, room_id):
        room = self.get_room()
        serializer = ShareRoomCreateUpdateSerializer(
            room, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        plain_code = None
        if "access_code" in data:
            code = (data.pop("access_code", "") or "").strip()
            if data.get("access_code_required", room.access_code_required) and code:
                room.access_code_hash = make_password(code)
                plain_code = code
        serializer.save()
        if plain_code is not None:
            room.save(update_fields=["access_code_hash"])
        payload = ShareRoomSerializer(room).data
        if plain_code is not None:
            payload["access_code"] = plain_code
        return Response(payload)

    def delete(self, request, room_id):
        self.get_room().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ShareRoomItemsView(_OwnedRoomMixin, APIView):
    """POST adds one owner-owned document/file/proof to the room."""

    def post(self, request, room_id):
        room = self.get_room()
        serializer = ShareRoomItemCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        document = file = proof = None
        if data.get("document"):
            document = get_object_or_404(
                Document, pk=data["document"], owner=request.user
            )
        elif data.get("file"):
            file = get_object_or_404(
                _owned_file_queryset(request.user),
                pk=data["file"],
            )
        elif data.get("proof"):
            proof = get_object_or_404(
                ProofRecord, pk=data["proof"], owner=request.user
            )

        item = ShareRoomItem.objects.create(
            room=room,
            document=document,
            file=file,
            proof=proof,
            sort_order=data.get("sort_order", 0),
        )
        room.save(update_fields=["updated_at"])
        return Response(
            ShareRoomSerializer(room).data, status=status.HTTP_201_CREATED
        )


class ShareRoomItemDeleteView(_OwnedRoomMixin, APIView):
    """DELETE removes one item from the room."""

    def delete(self, request, room_id, item_id):
        room = self.get_room()
        item = get_object_or_404(ShareRoomItem, pk=item_id, room=room)
        item.delete()
        room.save(update_fields=["updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class ShareRoomRevokeView(_OwnedRoomMixin, APIView):
    """POST revokes a room immediately."""

    def post(self, request, room_id):
        room = self.get_room()
        if not room.is_revoked:
            room.revoked_at = timezone.now()
            room.save(update_fields=["revoked_at"])
            log_room_activity(
                room=room,
                action=RoomActivity.Action.ROOM_REVOKED,
                actor_type=RoomActivity.ActorType.OWNER,
                request=request,
            )
        return Response(ShareRoomSerializer(room).data)


class ShareRoomActivityView(_OwnedRoomMixin, APIView):
    """GET the owner-only activity trail for a room."""

    def get(self, request, room_id):
        room = self.get_room()
        activity = room.activities.all()[:100]
        return Response(RoomActivitySerializer(activity, many=True).data)


# ---- Secure rooms (public, token-gated) ------------------------------------


def _resolve_room(token, request=None):
    """Return (room, error_response). error_response is None when usable."""
    try:
        room = ShareRoom.objects.get(token=token)
    except ShareRoom.DoesNotExist:
        return None, Response(
            {"detail": "This room is invalid.", "state": "invalid"},
            status=status.HTTP_404_NOT_FOUND,
        )
    if room.is_revoked:
        return None, Response(
            {
                "detail": "This room is no longer available. The owner revoked access.",
                "state": "revoked",
            },
            status=status.HTTP_410_GONE,
        )
    if room.is_expired:
        return None, Response(
            {"detail": "This room has expired.", "state": "expired"},
            status=status.HTTP_410_GONE,
        )
    return room, None


def _check_room_code(room, request):
    if not room.access_code_required:
        return None
    grant = request.query_params.get("grant") or request.headers.get(
        "X-Share-Grant", ""
    )
    if share_grant_is_valid(room.token, grant):
        return None
    result = public_access.check_public_access_code(
        kind="room",
        identifier=room.token,
        supplied_code=request.headers.get("X-Access-Code", ""),
        access_code_hash=room.access_code_hash,
        required=True,
    )
    if result.ok:
        return None
    if result.is_wrong_code:
        log_room_activity(
            room=room,
            action=RoomActivity.Action.ROOM_CODE_FAILED,
            actor_type=RoomActivity.ActorType.SHARED_VIEWER,
            request=request,
        )
    return _public_code_denied_response(
        result,
        requires_detail="This room is protected. Enter the access code "
        "provided by the sender.",
    )


def _check_room_usable(room, request):
    if room.is_limit_reached:
        log_room_activity(
            room=room,
            action=RoomActivity.Action.ROOM_BLOCKED_LIMIT_REACHED,
            actor_type=RoomActivity.ActorType.SHARED_VIEWER,
            request=request,
        )
        return Response(
            {"detail": _LIMIT_REACHED_DETAIL, "state": "limit_reached"},
            status=status.HTTP_410_GONE,
        )
    return None


def _consume_room_view(room, request):
    if room.access_limit_type == ShareRoom.AccessLimitType.UNLIMITED:
        return
    ShareRoom.objects.filter(pk=room.pk).update(view_count=F("view_count") + 1)
    room.refresh_from_db(fields=["view_count"])
    if room.is_view_limit_reached and room.limit_reached_at is None:
        room.limit_reached_at = timezone.now()
        room.save(update_fields=["limit_reached_at"])
        log_room_activity(
            room=room,
            action=RoomActivity.Action.ROOM_LIMIT_REACHED,
            actor_type=RoomActivity.ActorType.SHARED_VIEWER,
            request=request,
        )


def _consume_room_download(room, request):
    ShareRoom.objects.filter(pk=room.pk).update(
        download_count=F("download_count") + 1
    )
    room.refresh_from_db(fields=["download_count"])
    if (room.is_download_limit_reached or room.is_limit_reached) and (
        room.limit_reached_at is None
    ):
        room.limit_reached_at = timezone.now()
        room.save(update_fields=["limit_reached_at"])
        log_room_activity(
            room=room,
            action=RoomActivity.Action.ROOM_LIMIT_REACHED,
            actor_type=RoomActivity.ActorType.SHARED_VIEWER,
            request=request,
        )


def _resolve_room_file(room, file_id):
    """Return a DocumentFile only if it is exposed by this room, else None."""
    entries = collect_room_files(room).files
    for entry in entries:
        if entry.file.id == int(file_id):
            return entry.file
    return None


class PublicShareRoomMetadataView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_access_code"

    def get(self, request, token):
        room, err = _resolve_room(token, request=request)
        if err:
            return err
        room.last_accessed_at = timezone.now()
        room.save(update_fields=["last_accessed_at"])
        log_room_activity(
            room=room,
            action=RoomActivity.Action.ROOM_OPENED,
            actor_type=RoomActivity.ActorType.SHARED_VIEWER,
            request=request,
        )
        code_err = _check_room_code(room, request)
        if code_err:
            return code_err
        limit_err = _check_room_usable(room, request)
        if limit_err:
            return limit_err
        files = collect_room_files(room).files
        return Response(
            PublicShareRoomSerializer(room, context={"room_files": files}).data
        )


class PublicShareRoomVerifyCodeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "room_code"

    def post(self, request, token):
        room, err = _resolve_room(token, request=request)
        if err:
            return err
        if not room.access_code_required:
            return Response({"detail": "Access code verified."})
        result = public_access.check_public_access_code(
            kind="room",
            identifier=room.token,
            supplied_code=request.data.get("access_code", ""),
            access_code_hash=room.access_code_hash,
            required=True,
        )
        if result.ok:
            log_room_activity(
                room=room,
                action=RoomActivity.Action.ROOM_CODE_VERIFIED,
                actor_type=RoomActivity.ActorType.SHARED_VIEWER,
                request=request,
            )
            return Response(
                {
                    "detail": "Access code verified.",
                    "grant": issue_share_grant(room.token),
                    "grant_expires_in": SHARE_GRANT_MAX_AGE,
                }
            )
        if result.state == "locked":
            resp = Response(
                {"detail": public_access.locked_detail(), "state": "locked"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            if result.retry_after:
                resp["Retry-After"] = str(int(result.retry_after))
            return resp
        log_room_activity(
            room=room,
            action=RoomActivity.Action.ROOM_CODE_FAILED,
            actor_type=RoomActivity.ActorType.SHARED_VIEWER,
            request=request,
        )
        return Response(
            {"detail": "Invalid access code.", "state": "wrong_code"},
            status=status.HTTP_400_BAD_REQUEST,
        )


class _PublicRoomFileMixin(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_access_code"

    def resolve(self, request, token, file_id):
        room, err = _resolve_room(token, request=request)
        if err:
            return None, None, err
        code_err = _check_room_code(room, request)
        if code_err:
            return None, None, code_err
        limit_err = _check_room_usable(room, request)
        if limit_err:
            return None, None, limit_err
        file = _resolve_room_file(room, file_id)
        if file is None:
            return None, None, Response(
                {"detail": "This file is not part of this room.", "state": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return room, file, None


class PublicShareRoomFilePreviewView(_PublicRoomFileMixin):
    def get(self, request, token, file_id):
        room, file, err = self.resolve(request, token, file_id)
        if err:
            return err
        if not file.is_previewable:
            return Response(
                {
                    "detail": "Preview is not available for this file type.",
                    "state": "unsupported_preview",
                },
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            )
        log_room_activity(
            room=room,
            action=RoomActivity.Action.ROOM_PREVIEWED,
            actor_type=RoomActivity.ActorType.SHARED_VIEWER,
            request=request,
            metadata={"file_id": file.id},
        )
        response = _inline_file_response(file)
        _consume_room_view(room, request)
        return response


class PublicShareRoomFileDownloadView(_PublicRoomFileMixin):
    def get(self, request, token, file_id):
        room, file, err = self.resolve(request, token, file_id)
        if err:
            return err
        if not room.download_allowed:
            return Response(
                {
                    "detail": "This room is view-only. Downloading is disabled "
                    "by the owner.",
                    "state": "download_not_allowed",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if room.is_download_limit_reached:
            return Response(
                {"detail": _LIMIT_REACHED_DETAIL, "state": "limit_reached"},
                status=status.HTTP_410_GONE,
            )
        log_room_activity(
            room=room,
            action=RoomActivity.Action.ROOM_DOWNLOADED,
            actor_type=RoomActivity.ActorType.SHARED_VIEWER,
            request=request,
            metadata={"file_id": file.id},
        )
        response = _file_response(file, as_attachment=True)
        _consume_room_download(room, request)
        return response


class PublicShareRoomZipView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_access_code"

    def get(self, request, token):
        room, err = _resolve_room(token, request=request)
        if err:
            return err
        code_err = _check_room_code(room, request)
        if code_err:
            return code_err
        limit_err = _check_room_usable(room, request)
        if limit_err:
            return limit_err
        if not room.download_allowed:
            return Response(
                {
                    "detail": "This room is view-only. Downloading is disabled "
                    "by the owner.",
                    "state": "download_not_allowed",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if room.is_download_limit_reached:
            return Response(
                {"detail": _LIMIT_REACHED_DETAIL, "state": "limit_reached"},
                status=status.HTTP_410_GONE,
            )
        spooled, filename, summary = build_room_zip(room)
        if summary["files_count"] == 0:
            spooled.close()
            return Response(
                {"detail": "This room has no files to download.", "state": "no_files"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        log_room_activity(
            room=room,
            action=RoomActivity.Action.ROOM_DOWNLOADED,
            actor_type=RoomActivity.ActorType.SHARED_VIEWER,
            request=request,
            metadata={"scope": "room_zip", "files": summary["files_count"]},
        )
        _consume_room_download(room, request)
        return _zip_response(spooled, filename, summary)


# ---- Calendar V1 -----------------------------------------------------------


def _parse_calendar_filters(request):
    """Shared parsing of start/end/type/urgency/search query params."""
    params = request.query_params
    start = parse_date(params.get("start", "")) if params.get("start") else None
    end = parse_date(params.get("end", "")) if params.get("end") else None
    types = (
        {t.strip() for t in params.get("type", "").split(",") if t.strip()}
        or None
    )
    urgencies = (
        {u.strip() for u in params.get("urgency", "").split(",") if u.strip()}
        or None
    )
    search = params.get("search") or None
    return start, end, types, urgencies, search


class CalendarEventsView(APIView):
    """Owner-scoped aggregated calendar events + a per-response summary."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        start, end, types, urgencies, search = _parse_calendar_filters(request)
        events = build_calendar_events(
            request.user,
            start_date=start,
            end_date=end,
            types=types,
            urgencies=urgencies,
            search=search,
        )
        return Response(
            {
                "events": CalendarEventSerializer(events, many=True).data,
                "summary": calendar_events_summary(events),
            }
        )


class CalendarSummaryView(APIView):
    """Owner-scoped high-level calendar summary (counts + next key dates)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(calendar_summary(request.user))


class CalendarIcsExportView(APIView):
    """One-way .ics export of the owner's calendar (no tokens/codes/paths)."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        start, end, types, urgencies, search = _parse_calendar_filters(request)
        events = build_calendar_events(
            request.user,
            start_date=start,
            end_date=end,
            types=types,
            urgencies=urgencies,
            search=search,
        )
        ics = build_calendar_ics(events)
        response = HttpResponse(ics, content_type="text/calendar; charset=utf-8")
        response["Content-Disposition"] = (
            'attachment; filename="duenest-calendar.ics"'
        )
        return response


class DocumentQAView(APIView):
    """
    "Ask your documents" — grounded natural-language Q&A over the owner's vault.

    POST ``{"question": "..."}`` → Claude answers using ONLY the asking user's own
    documents and cites the ones it used. Owner-scoped; the model never sees
    another user's data.

    Gated three ways: the ``ai_features`` master gate AND ``ai_document_qa`` flags
    (503 when either is off), plus platform configuration — if no
    ``ANTHROPIC_API_KEY`` is set the call returns ``200`` with
    ``{"available": false, "reason": "not_configured"}`` so the UI can explain it
    rather than erroring. Per-user rate limited to bound model cost.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_qa"

    def post(self, request):
        require_feature_enabled("ai_features", request.user)
        require_feature_enabled("ai_document_qa", request.user)

        from apps.ai.privacy import ai_consented
        if not ai_consented(request.user):
            return Response(
                {"available": False, "reason": "consent_required"},
                status=status.HTTP_200_OK,
            )

        question = (request.data.get("question") or "").strip()
        if not question:
            return Response(
                {"detail": "A question is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .ai_qa import answer_question

        result = answer_question(request.user, question)
        _track_product_event(
            request,
            "document_qa_asked",
            object_type="document_qa",
            metadata={
                "available": result.get("available"),
                "reason": result.get("reason"),
                "answered": result.get("answered"),
                "document_count": result.get("document_count"),
            },
        )
        return Response(result, status=status.HTTP_200_OK)


class DocumentDraftView(APIView):
    """
    AI drafting assistant — write a letter/email from the owner's records.

    POST ``{"instructions": "...", "document_ids": [..], "tone": "formal"}`` →
    Claude returns a ``{subject, body}`` draft, optionally grounded in the named
    documents (owner-scoped). The draft is a **suggestion only** — nothing is
    saved to the vault and nothing is sent.

    Gated like the other AI features: the ``ai_features`` master gate AND
    ``ai_document_drafting`` flags (503 when off), plus platform configuration —
    if no key is set the call returns ``200`` with ``{"available": false,
    "reason": "not_configured"}``. Per-user rate limited to bound cost.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_draft"

    def post(self, request):
        require_feature_enabled("ai_features", request.user)
        require_feature_enabled("ai_document_drafting", request.user)

        from apps.ai.privacy import ai_consented
        if not ai_consented(request.user):
            return Response(
                {"available": False, "reason": "consent_required"},
                status=status.HTTP_200_OK,
            )

        instructions = (request.data.get("instructions") or "").strip()
        if not instructions:
            return Response(
                {"detail": "Instructions are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        document_ids = request.data.get("document_ids") or []
        if not isinstance(document_ids, list):
            document_ids = []
        clean_ids: list[int] = []
        for raw in document_ids[:50]:
            try:
                clean_ids.append(int(raw))
            except (TypeError, ValueError):
                continue
        tone = (request.data.get("tone") or "").strip().lower()

        from .ai_draft import draft

        result = draft(
            request.user,
            instructions=instructions,
            document_ids=clean_ids,
            tone=tone,
        )
        _track_product_event(
            request,
            "document_draft_created",
            object_type="document_draft",
            metadata={
                "available": result.get("available"),
                "reason": result.get("reason"),
                "grounded_on": len(result.get("used_document_ids") or []),
            },
        )
        return Response(result, status=status.HTTP_200_OK)


class PackCopilotView(APIView):
    """
    Application Pack Copilot — goal → personalized document gap analysis.

    POST ``{"goal": "UK Skilled Worker visa", "deadline": "2026-09-01"}`` → for
    the goal, Claude returns the typical requirements, matches each against the
    owner's vault (have/missing/unclear, citing documents), and flags matched
    documents that expire on/before the deadline (computed from real stored
    dates, not the model). **Suggestions only and never official** — requirements
    vary and must be verified with the official source.

    Gated by ``ai_features`` + ``ai_pack_copilot`` (503 when off) and platform
    configuration (no key → ``200 {available:false, reason:"not_configured"}``).
    Owner-scoped; per-user rate limited.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_pack_copilot"

    def post(self, request):
        require_feature_enabled("ai_features", request.user)
        require_feature_enabled("ai_pack_copilot", request.user)

        from apps.ai.privacy import ai_consented
        if not ai_consented(request.user):
            return Response(
                {"available": False, "reason": "consent_required"},
                status=status.HTTP_200_OK,
            )

        goal = (request.data.get("goal") or "").strip()
        if not goal:
            return Response(
                {"detail": "A goal is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .ai_pack_copilot import analyze

        result = analyze(
            request.user, goal=goal, deadline=request.data.get("deadline")
        )
        _track_product_event(
            request,
            "pack_copilot_analyzed",
            object_type="pack_copilot",
            metadata={
                "available": result.get("available"),
                "reason": result.get("reason"),
                "requirements": len(result.get("requirements") or []),
                "have_count": result.get("have_count"),
                "missing_count": result.get("missing_count"),
            },
        )
        return Response(result, status=status.HTTP_200_OK)


class PackCopilotCreateBundleView(APIView):
    """
    Turn a Pack Copilot analysis into a real DueNest bundle (one tap).

    POST ``{"goal", "deadline"?, "requirements": [{name, description,
    document_ids}]}`` → creates a draft application bundle with one requirement
    per item, matched owned documents linked (ATTACHED) and the rest MISSING.
    Pure CRUD (no model call); document links are re-validated server-side
    against the owner's vault. Gated by ``ai_features`` + ``ai_pack_copilot``.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        require_feature_enabled("ai_features", request.user)
        require_feature_enabled("ai_pack_copilot", request.user)

        goal = (request.data.get("goal") or "").strip()
        if not goal:
            return Response(
                {"detail": "A goal is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        requirements = request.data.get("requirements")
        if not isinstance(requirements, list):
            requirements = []

        from .ai_pack_copilot import create_bundle_from_copilot

        bundle = create_bundle_from_copilot(
            request.user,
            goal=goal,
            deadline=request.data.get("deadline"),
            requirements=requirements,
        )
        _track_product_event(
            request,
            "pack_copilot_bundle_created",
            object_type="document_bundle",
            object_id=bundle.id,
            metadata={"requirements": bundle.requirements.count()},
        )
        return Response(
            {
                "bundle_id": bundle.id,
                "title": bundle.title,
                "readiness_score": bundle.readiness_score,
            },
            status=status.HTTP_201_CREATED,
        )


class AiBriefingView(APIView):
    """
    Proactive Autopilot — an AI "what to do now" briefing across the vault.

    POST → returns a prioritized briefing built from the user's real document
    health (Python computes the statuses/dates; Claude prioritizes and phrases
    the suggested actions). Read-only: nothing is changed. When nothing needs
    attention it returns a positive, empty briefing without calling the model.

    Gated by ``ai_features`` + ``ai_briefing`` (503 when off) and platform config
    (no key → ``200 {available:false, reason:"not_configured"}``). Owner-scoped;
    per-user rate limited.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_briefing"

    def post(self, request):
        require_feature_enabled("ai_features", request.user)
        require_feature_enabled("ai_briefing", request.user)

        from apps.ai.privacy import ai_consented
        if not ai_consented(request.user):
            return Response(
                {"available": False, "reason": "consent_required"},
                status=status.HTTP_200_OK,
            )

        from .ai_briefing import build_briefing

        result = build_briefing(request.user)
        _track_product_event(
            request,
            "ai_briefing_generated",
            object_type="ai_briefing",
            metadata={
                "available": result.get("available"),
                "reason": result.get("reason"),
                "items": len(result.get("items") or []),
                "attention_count": result.get("attention_count"),
            },
        )
        return Response(result, status=status.HTTP_200_OK)


class AiChatView(APIView):
    """
    Conversational assistant — chat grounded in the user's vault.

    POST ``{"message": "...", "history": [{role, content}]}`` → a reply plus
    **confirm-gated action suggestions** (draft / pack / open_document /
    briefing) the UI renders as buttons into existing flows. The endpoint
    performs no writes or shares itself.

    Gated by ``ai_features`` + ``ai_chat`` (503 when off) and platform config
    (no key → ``200 {available:false, reason:"not_configured"}``). Owner-scoped;
    per-user rate limited.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_chat"

    def post(self, request):
        require_feature_enabled("ai_features", request.user)
        require_feature_enabled("ai_chat", request.user)

        from apps.ai.privacy import ai_consented
        if not ai_consented(request.user):
            return Response(
                {"available": False, "reason": "consent_required"},
                status=status.HTTP_200_OK,
            )

        message = (request.data.get("message") or "").strip()
        if not message:
            return Response(
                {"detail": "A message is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        history = request.data.get("history")
        if not isinstance(history, list):
            history = []

        from .ai_chat import chat

        result = chat(request.user, message=message, history=history)
        _track_product_event(
            request,
            "ai_chat_message",
            object_type="ai_chat",
            metadata={
                "available": result.get("available"),
                "reason": result.get("reason"),
                "actions": len(result.get("actions") or []),
            },
        )
        return Response(result, status=status.HTTP_200_OK)


class FileIntakeView(APIView):
    """
    Smart Intake — understand an owned file and propose next actions.

    POST ``/api/v1/files/<id>/intake/`` → a one-line summary, the suggested
    fields (reused from extraction), and **confirm-gated** next-action
    suggestions (create_document / set_reminder / add_to_pack / draft). The
    endpoint performs no writes; the user confirms any action in its flow.

    Owner-scoped; gated by ``ai_features`` + ``ai_intake`` (503 when off) and
    platform config (no key → ``200 {available:false}``). Per-user rate limited.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "ai_intake"

    def post(self, request, pk):
        require_feature_enabled("ai_features", request.user)
        require_feature_enabled("ai_intake", request.user)

        from apps.ai.privacy import ai_consented
        if not ai_consented(request.user):
            return Response(
                {"available": False, "reason": "consent_required"},
                status=status.HTTP_200_OK,
            )

        file = get_object_or_404(_owned_file_queryset(request.user), pk=pk)

        from .ai_intake import suggest_intake

        result = suggest_intake(request.user, file)
        _track_product_event(
            request,
            "file_intake_suggested",
            object_type="document_file",
            object_id=file.id,
            metadata={
                "available": result.get("available"),
                "reason": result.get("reason"),
                "suggestions": len(result.get("suggestions") or []),
            },
        )
        return Response(result, status=status.HTTP_200_OK)


class DocumentFileFillSignView(APIView):
    """
    Fill & Sign — prepare a filled/signed **copy** of an owned PDF file.

    POST ``/api/v1/files/<id>/fill-sign/`` with an ``annotations`` overlay spec.
    The original is never modified; a new encrypted DocumentFile is produced and
    a PreparedDocument + DocumentSignatureRecord audit row are created. PDF only.

    Owner-scoped; gated by the ``fill_sign`` feature flag (premium-gateable; the
    flag defaults to enabled). This prepares a signed copy — it is not a legal
    certification of signature validity.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        require_feature_enabled("fill_sign", request.user)
        source = get_object_or_404(_owned_file_queryset(request.user), pk=pk)

        from .serializers import FillSignRequestSerializer, PreparedDocumentSerializer

        ser = FillSignRequestSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        from .fill_sign import FillSignError, prepare_signed_copy

        try:
            prepared, _record = prepare_signed_copy(
                user=request.user,
                source_file=source,
                annotations=ser.validated_data["annotations"],
                signer_name=ser.validated_data.get("signer_name", ""),
                signer_email=ser.validated_data.get("signer_email", ""),
                signature_method=ser.validated_data.get("signature_method", "none"),
            )
        except FillSignError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            PreparedDocumentSerializer(prepared).data,
            status=status.HTTP_201_CREATED,
        )


class PreparedDocumentListView(generics.ListAPIView):
    """
    List the current user's prepared (filled/signed) copies and their audit
    records. Optional filters: ``?original_file=<id>`` or ``?document=<id>`` to
    show signed copies for a specific file/document (e.g. on a document detail).
    """

    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_serializer_class(self):
        from .serializers import PreparedDocumentSerializer

        return PreparedDocumentSerializer

    def get_queryset(self):
        from .models import PreparedDocument

        qs = (
            PreparedDocument.objects.filter(owner=self.request.user)
            .select_related("prepared_file", "original_file")
            .prefetch_related("signature_records")
        )
        original_file = self.request.query_params.get("original_file")
        if original_file:
            qs = qs.filter(original_file_id=original_file)
        document = self.request.query_params.get("document")
        if document:
            qs = qs.filter(document_id=document)
        return qs
