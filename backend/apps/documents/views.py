import hashlib

from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Document, DocumentFile
from .serializers import (
    DocumentFileSerializer,
    DocumentFileUploadSerializer,
    DocumentSerializer,
)


def _compute_checksum(uploaded) -> str:
    """SHA-256 of the uploaded bytes; rewinds the stream so it can still save."""
    digest = hashlib.sha256()
    for chunk in uploaded.chunks():
        digest.update(chunk)
    uploaded.seek(0)
    return digest.hexdigest()


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
        return Document.objects.filter(owner=self.request.user).select_related(
            "category"
        )

    def perform_create(self, serializer):
        # Owner comes from the authenticated request, not the request body.
        serializer.save(owner=self.request.user)


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
        return Response(output.data, status=status.HTTP_201_CREATED)


class DocumentFileDetailView(_DocumentScopedMixin, generics.RetrieveDestroyAPIView):
    """GET file metadata; DELETE removes the record and the stored file."""

    serializer_class = DocumentFileSerializer

    def perform_destroy(self, instance):
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
        response = FileResponse(
            instance.file.open("rb"),
            as_attachment=True,
            filename=instance.original_filename,
        )
        if instance.content_type:
            response["Content-Type"] = instance.content_type
        return response
