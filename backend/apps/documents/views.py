import hashlib
import secrets

from django.contrib.auth.hashers import check_password, make_password
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
    DocumentFile,
    DocumentFileActivity,
    DocumentFileShareLink,
    DocumentReminderRule,
)
from .serializers import (
    DocumentFileActivitySerializer,
    DocumentFileSerializer,
    DocumentFileShareLinkSerializer,
    DocumentFileUploadSerializer,
    DocumentReminderRuleSerializer,
    DocumentSerializer,
    PublicSharedFileSerializer,
    ShareLinkCreateSerializer,
)
from .services import attention_sort_key, get_document_health, log_activity, reminder_date_for_rule


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
        queryset = (
            Document.objects.filter(owner=self.request.user)
            .select_related("category")
            .annotate(file_count=Count("files", distinct=True))
        )
        if self.action != "list":
            return queryset

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
        serializer.save(owner=self.request.user)

    @action(detail=False, methods=["get"], url_path="attention-needed")
    def attention_needed(self, request):
        documents = list(self.get_queryset().exclude(status=Document.Status.ARCHIVED))
        items = [
            document
            for document in documents
            if get_document_health(document).needs_attention
        ]
        items.sort(key=attention_sort_key)
        serializer = self.get_serializer(items, many=True)
        return Response({"count": len(items), "items": serializer.data})


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
        return DocumentFile.objects.filter(
            document_id=self.kwargs["document_id"],
            document__owner=self.request.user,
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
        return Response(output.data, status=status.HTTP_201_CREATED)


class DocumentFileDetailView(_DocumentScopedMixin, generics.RetrieveDestroyAPIView):
    """GET file metadata; DELETE removes the record and the stored file."""

    serializer_class = DocumentFileSerializer

    def perform_destroy(self, instance):
        # Log before deletion (cascade also removes share links + activity rows,
        # so this entry mainly serves an at-the-moment audit need).
        log_activity(
            file=instance,
            action=DocumentFileActivity.Action.FILE_DELETED,
            actor_type=DocumentFileActivity.ActorType.OWNER,
            request=self.request,
        )
        # Best-effort removal of the stored blob, then the DB row.
        instance.file.delete(save=False)
        instance.delete()


class DocumentFileDownloadView(_DocumentScopedMixin, APIView):
    """Controlled download — streams the file only to the owning user."""

    def get(self, request, document_id, pk):
        instance = get_object_or_404(
            DocumentFile,
            pk=pk,
            document_id=document_id,
            document__owner=request.user,
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
        serializer.save(owner=self.request.user, document=self.get_document())


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


def _resolve_share_link(token):
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
        return None, Response(
            {
                "detail": "This shared link is no longer available. "
                "The sender has revoked access.",
                "state": "revoked",
            },
            status=status.HTTP_410_GONE,
        )
    if link.is_expired:
        return None, Response(
            {
                "detail": "This shared link has expired.",
                "state": "expired",
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
        link, err = _resolve_share_link(token)
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

        code_err = _check_access_code(link, request)
        if code_err:
            return code_err

        return Response(PublicSharedFileSerializer(link).data)


class PublicSharedFileVerifyCodeView(APIView):
    permission_classes = [AllowAny]

    def post(self, request, token):
        link, err = _resolve_share_link(token)
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
        return Response(
            {"detail": "Invalid access code.", "state": "wrong_code"},
            status=status.HTTP_400_BAD_REQUEST,
        )


class PublicSharedFilePreviewView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        link, err = _resolve_share_link(token)
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
        link, err = _resolve_share_link(token)
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
