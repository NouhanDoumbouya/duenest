import hashlib
import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Count, Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.utils.http import content_disposition_header
from rest_framework.decorators import action
from rest_framework import generics, status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Document,
    DocumentActivity,
    DocumentBundle,
    DocumentBundleRequirement,
    DocumentChecklist,
    DocumentChecklistItem,
    DocumentChecklistTemplate,
    DocumentExportRequest,
    DocumentExtraction,
    DocumentFile,
    DocumentFileActivity,
    DocumentFileShareLink,
    DocumentReminderRule,
    DocumentVersion,
    EmergencyAccessPack,
    EmergencyAccessPackItem,
    ProofRecord,
    generate_share_token,
)
from .serializers import (
    BundleReadinessSerializer,
    ChecklistFromTemplateSerializer,
    DocumentActivityEventSerializer,
    DocumentBundleRequirementSerializer,
    DocumentBundleSerializer,
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
    ExtractionApplySerializer,
    ProofRecordSerializer,
    PublicEmergencyPackSerializer,
    PublicSharedFileSerializer,
    ShareLinkCreateSerializer,
    TimelineEventSerializer,
)
from .services import (
    APPLICABLE_EXTRACTION_FIELDS,
    VERSIONED_FIELDS,
    ExportGenerationError,
    attention_sort_key,
    bundle_readiness,
    build_timeline,
    create_document_export,
    extract_file_details,
    get_document_health,
    log_activity,
    log_document_activity,
    record_document_version,
    reminder_date_for_rule,
    summarize_field_changes,
)


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
    try:
        opened_file = instance.file.open("rb")
    except (FileNotFoundError, ValueError):
        return Response(
            {"detail": "This file is no longer available."},
            status=status.HTTP_404_NOT_FOUND,
        )

    response = FileResponse(
        opened_file,
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
        queryset = (
            Document.objects.filter(owner=self.request.user)
            .select_related("category")
            .annotate(
                file_count=Count(
                    "files",
                    filter=Q(files__is_trashed=False),
                    distinct=True,
                )
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
            if category.isdigit():
                queryset = queryset.filter(category_id=int(category))
            else:
                queryset = queryset.filter(category__slug=category)
        if params.get("document_type"):
            queryset = queryset.filter(document_type__icontains=params["document_type"])
        if params.get("country"):
            queryset = queryset.filter(country__icontains=params["country"])
        if params.get("issuer"):
            queryset = queryset.filter(issuer__icontains=params["issuer"])

        expiry_from = parse_date(params.get("expiry_from", ""))
        if expiry_from:
            queryset = queryset.filter(expiry_date__gte=expiry_from)
        expiry_to = parse_date(params.get("expiry_to", ""))
        if expiry_to:
            queryset = queryset.filter(expiry_date__lte=expiry_to)

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
        return queryset.order_by(ordering)

    def _bool_param(self, name):
        value = self.request.query_params.get(name)
        if value is None:
            return None
        return value.lower() in {"1", "true", "yes", "on"}

    def _apply_health_filters(self, documents):
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

        filtered = []
        for document in documents:
            health = get_document_health(document)
            if computed_status and health.computed_status != computed_status:
                continue
            if has_file is not None and health.has_file != has_file:
                continue
            if missing_file is not None and health.missing_file != missing_file:
                continue
            if (
                missing_expiry_date is not None
                and health.missing_expiry_date != missing_expiry_date
            ):
                continue
            if needs_attention is not None and health.needs_attention != needs_attention:
                continue
            if expiring_within_days is not None and (
                health.days_until_expiry is None
                or health.days_until_expiry < 0
                or health.days_until_expiry > expiring_within_days
            ):
                continue
            filtered.append(document)
        return filtered

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())
        documents = self._apply_health_filters(list(queryset))
        page = self.paginate_queryset(documents)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(documents, many=True)
        return Response(serializer.data)

    def perform_create(self, serializer):
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
        documents = list(
            self.get_queryset()
            .filter(is_trashed=False)
            .exclude(status=Document.Status.ARCHIVED)
        )
        items = [
            document
            for document in documents
            if get_document_health(document).needs_attention
        ]
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

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        uploaded = serializer.validated_data["file"]

        checksum = _compute_checksum(uploaded)
        instance = DocumentFile.objects.create(
            document=document,
            uploaded_by=request.user,  # set from the session, not the client
            file=uploaded,
            original_filename=uploaded.name[:255],
            content_type=uploaded.content_type or "",
            file_size=uploaded.size,
            checksum=checksum,
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
    """A 6-digit numeric access code."""
    return f"{secrets.randbelow(1_000_000):06d}"


class DocumentFileShareLinkListCreateView(_FileScopedMixin, APIView):
    """GET lists a file's share links; POST creates a new one."""

    def get(self, request, document_id, file_id):
        file = self.get_file()
        links = file.share_links.all()
        return Response(DocumentFileShareLinkSerializer(links, many=True).data)

    def post(self, request, document_id, file_id):
        file = self.get_file()
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
        rule = serializer.save(owner=self.request.user, document=self.get_document())
        _mark_onboarding(self.request, "first_reminder_created")
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


def _check_access_code(link, request):
    """
    Return an error Response if a required access code is missing/wrong, else
    None. The code is read from the X-Access-Code header (never the URL).
    """
    if not link.access_code_required:
        return None
    code = request.headers.get("X-Access-Code", "").strip()
    if not code:
        return Response(
            {
                "detail": "This file is protected. Enter the access code "
                "provided by the sender.",
                "state": "requires_code",
                "access_code_required": True,
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    if not check_password(code, link.access_code_hash):
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
            {
                "detail": "That code does not match. Check the code and try again.",
                "state": "wrong_code",
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class PublicSharedFileMetadataView(APIView):
    permission_classes = [AllowAny]

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

        return Response(PublicSharedFileSerializer(link).data)


class PublicSharedFileVerifyCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, token):
        link, err = _resolve_share_link(token, request=request)
        if err:
            return err
        if not link.access_code_required:
            return Response({"detail": "Access code verified."})

        code = str(request.data.get("access_code", "")).strip()
        if code and check_password(code, link.access_code_hash):
            log_activity(
                file=link.file,
                action=DocumentFileActivity.Action.SHARE_CODE_VERIFIED,
                actor_type=DocumentFileActivity.ActorType.SHARED_VIEWER,
                request=request,
                share_link=link,
            )
            return Response({"detail": "Access code verified."})

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

    def get(self, request, token):
        link, err = _resolve_share_link(token, request=request)
        if err:
            return err
        code_err = _check_access_code(link, request)
        if code_err:
            return code_err
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
        return _inline_file_response(link.file)


class PublicSharedFileDownloadView(APIView):
    permission_classes = [AllowAny]

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
        log_activity(
            file=link.file,
            action=DocumentFileActivity.Action.SHARE_DOWNLOADED,
            actor_type=DocumentFileActivity.ActorType.SHARED_VIEWER,
            request=request,
            share_link=link,
        )
        instance = link.file
        return _file_response(instance, as_attachment=True)


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
        bundle = serializer.save(owner=self.request.user)
        _track_product_event(
            self.request,
            "bundle_created",
            object_type="document_bundle",
            object_id=bundle.id,
            metadata={"bundle_type": bundle.bundle_type},
        )


class DocumentBundleDetailView(
    _BundleScopedMixin, generics.RetrieveUpdateDestroyAPIView
):
    """GET/PATCH/DELETE one owner-scoped bundle."""

    lookup_url_kwarg = "bundle_id"


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
        requirement = serializer.save()
        requirement.bundle.recalculate_readiness()

    def perform_destroy(self, instance):
        bundle = instance.bundle
        instance.delete()
        bundle.recalculate_readiness()


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
            DocumentFile,
            pk=request.data.get("file"),
            document__owner=request.user,
            document__is_trashed=False,
            is_trashed=False,
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

    The foundation never sends files to a third-party service. When no reliable
    text can be obtained, the record is still created with a graceful
    ``needs_review`` status so the UI always has something to show.
    """

    def create(self, request, *args, **kwargs):
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
        # An optional access code may be supplied at creation.
        plain_code = (serializer.validated_data.pop("access_code", "") or "").strip()
        access_required = bool(
            serializer.validated_data.get("access_code_required")
        )
        pack = serializer.save(
            owner=self.request.user,
            access_code_hash=_emergency_pack_code(plain_code)
            if (access_required and plain_code)
            else "",
        )
        log_document_activity(
            owner=self.request.user,
            action=DocumentActivity.Action.EMERGENCY_PACK_CREATED,
            title="Emergency pack created",
            description=pack.title,
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
        extra = {}
        if access_required and plain_code:
            extra["access_code_hash"] = _emergency_pack_code(plain_code)
        elif not access_required:
            extra["access_code_hash"] = ""
        serializer.save(**extra)

    @action(detail=True, methods=["post"], url_path="items")
    def add_item(self, request, pack_id=None):
        pack = self.get_object()
        serializer = EmergencyAccessPackItemSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        item = serializer.save(owner=request.user, pack=pack)
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
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="enable")
    def enable(self, request, pack_id=None):
        """Activate a pack. Shareable packs get a token if they lack one."""
        pack = self.get_object()
        pack.status = EmergencyAccessPack.Status.ACTIVE
        pack.disabled_at = None
        if (
            pack.access_mode == EmergencyAccessPack.AccessMode.SHARE_LINK
            and not pack.token
        ):
            pack.token = generate_share_token()
        pack.save(update_fields=["status", "disabled_at", "token", "updated_at"])
        return Response(self.get_serializer(pack).data)

    @action(detail=True, methods=["post"], url_path="disable")
    def disable(self, request, pack_id=None):
        """Disable a pack — any public link stops working immediately."""
        pack = self.get_object()
        pack.status = EmergencyAccessPack.Status.DISABLED
        pack.disabled_at = timezone.now()
        pack.save(update_fields=["status", "disabled_at", "updated_at"])
        return Response(self.get_serializer(pack).data)

    @action(detail=True, methods=["post"], url_path="regenerate-link")
    def regenerate_link(self, request, pack_id=None):
        """Rotate the public token, invalidating the previous link."""
        pack = self.get_object()
        pack.token = generate_share_token()
        pack.save(update_fields=["token", "updated_at"])
        return Response(self.get_serializer(pack).data)


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
    code = request.headers.get("X-Access-Code", "").strip()
    if not code:
        return Response(
            {
                "detail": "This emergency pack is protected. Enter the access code.",
                "state": "requires_code",
                "access_code_required": True,
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    if not check_password(code, pack.access_code_hash):
        return Response(
            {"detail": "That code does not match.", "state": "wrong_code"},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class PublicEmergencyPackMetadataView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
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
        code_err = _check_pack_access_code(pack, request)
        if code_err:
            return code_err
        return Response(PublicEmergencyPackSerializer(pack).data)


class PublicEmergencyPackVerifyCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, token):
        pack, err = _resolve_emergency_pack(token)
        if err:
            return err
        if not pack.access_code_required:
            return Response({"detail": "Access code verified."})
        code = str(request.data.get("access_code", "")).strip()
        if code and check_password(code, pack.access_code_hash):
            return Response({"detail": "Access code verified."})
        return Response(
            {"detail": "Invalid access code.", "state": "wrong_code"},
            status=status.HTTP_400_BAD_REQUEST,
        )


class _PublicEmergencyItemMixin(APIView):
    permission_classes = [AllowAny]

    def resolve(self, request, token, item_id):
        pack, err = _resolve_emergency_pack(token)
        if err:
            return None, err
        code_err = _check_pack_access_code(pack, request)
        if code_err:
            return None, code_err
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
            )
        if item.file is None:
            return None, Response(
                {"detail": "This item has no file attached."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return item, None


class PublicEmergencyPackItemPreviewView(_PublicEmergencyItemMixin):
    def get(self, request, token, item_id):
        item, err = self.resolve(request, token, item_id)
        if err:
            return err
        if not item.file.is_previewable:
            return Response(
                {"detail": "Preview is not available for this file type."},
                status=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            )
        return _inline_file_response(item.file)


class PublicEmergencyPackItemDownloadView(_PublicEmergencyItemMixin):
    def get(self, request, token, item_id):
        item, err = self.resolve(request, token, item_id)
        if err:
            return err
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
