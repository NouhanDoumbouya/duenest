"""
Custom Document Organization V1 — PERSONAL endpoints (authenticated, owner-scoped).

All routes live under ``/api/v1/documents/...`` and operate on the requesting
user's own scope (``owner = request.user``, ``organization = None``). Organization
folder endpoints live in ``apps.organizations.portal_views`` (org-scoped, role-
gated). Folders are virtual metadata — these endpoints never expose a file URL,
storage key, or token, and never change a file's R2 object key.
"""

from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import folders
from .models import Document, DocumentCollection, DocumentFolder, DocumentTag


class _PersonalScope(APIView):
    permission_classes = [IsAuthenticated]

    @property
    def scope(self):
        return (self.request.user, None)  # (owner, organization)

    def get_folder(self, request, folder_id):
        return get_object_or_404(
            DocumentFolder, pk=folder_id, owner=request.user, organization__isnull=True
        )

    def get_document(self, request, document_id):
        return get_object_or_404(
            Document, pk=document_id, owner=request.user, is_trashed=False
        )

    def get_collection(self, request, collection_id):
        return get_object_or_404(
            DocumentCollection, pk=collection_id, owner=request.user,
            organization__isnull=True,
        )


class FoldersView(_PersonalScope):
    def get(self, request):
        include_archived = request.query_params.get("include_archived") == "true"
        tree = folders.build_folder_tree(request.user, None, include_archived=include_archived)
        return Response({"folders": tree})

    def post(self, request):
        try:
            folder = folders.create_folder(request.user, None, request.user, request.data)
        except folders.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders.build_folder_payload(folder), status=status.HTTP_201_CREATED)


class FolderDetailView(_PersonalScope):
    def get(self, request, folder_id):
        return Response(folders.build_folder_payload(self.get_folder(request, folder_id)))

    def patch(self, request, folder_id):
        try:
            folder = folders.update_folder(self.get_folder(request, folder_id),
                                           request.user, request.data)
        except folders.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders.build_folder_payload(folder))


class FolderArchiveView(_PersonalScope):
    def post(self, request, folder_id):
        folder = folders.archive_folder(self.get_folder(request, folder_id), request.user)
        return Response(folders.build_folder_payload(folder))


class FolderMoveView(_PersonalScope):
    def post(self, request, folder_id):
        folder = self.get_folder(request, folder_id)
        new_parent = None
        if request.data.get("parent_id"):
            new_parent = self.get_folder(request, request.data["parent_id"])
        try:
            folders.move_folder(folder, new_parent, request.user)
        except folders.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders.build_folder_payload(folder))


class FolderContentsView(_PersonalScope):
    def get(self, request, folder_id):
        folder = self.get_folder(request, folder_id)
        return Response(folders.build_folder_contents(folder, filters=request.query_params))


class DocumentMoveToFolderView(_PersonalScope):
    def post(self, request, document_id):
        document = self.get_document(request, document_id)
        folder = None
        if request.data.get("folder_id"):
            folder = self.get_folder(request, request.data["folder_id"])
        try:
            folders.assign_document_to_folder(document, folder, request.user)
        except folders.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders.build_document_org_payload(document))


class TagsView(_PersonalScope):
    def get(self, request):
        qs = DocumentTag.objects.filter(owner=request.user, organization__isnull=True)
        return Response({"tags": [folders.build_tag_payload(t) for t in qs]})

    def post(self, request):
        try:
            tag = folders.create_tag(request.user, None, request.user, request.data)
        except folders.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders.build_tag_payload(tag), status=status.HTTP_201_CREATED)


class DocumentTagsView(_PersonalScope):
    def post(self, request, document_id):
        document = self.get_document(request, document_id)
        folders.assign_tags(document, request.data.get("tag_ids"), request.user)
        return Response(folders.build_document_org_payload(document))


class CollectionsView(_PersonalScope):
    def get(self, request):
        qs = DocumentCollection.objects.filter(owner=request.user, organization__isnull=True)
        ctype = request.query_params.get("collection_type")
        if ctype:
            qs = qs.filter(collection_type=ctype)
        return Response({"collections": [folders.build_collection_payload(c) for c in qs]})

    def post(self, request):
        try:
            collection = folders.create_collection(request.user, None, request.user, request.data)
        except folders.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders.build_collection_payload(collection),
                        status=status.HTTP_201_CREATED)


class CollectionItemsView(_PersonalScope):
    def get(self, request, collection_id):
        collection = self.get_collection(request, collection_id)
        if collection.collection_type == DocumentCollection.CollectionType.SAVED_VIEW:
            return Response(folders.build_smart_view(request.user, None, collection.filter_config))
        docs = Document.objects.filter(
            collection_items__collection=collection, is_trashed=False
        ).distinct()
        return Response({"documents": [folders.build_document_org_payload(d) for d in docs[:500]],
                         "count": docs.count()})

    def post(self, request, collection_id):
        collection = self.get_collection(request, collection_id)
        document = self.get_document(request, request.data.get("document_id"))
        if request.data.get("remove"):
            folders.remove_from_collection(collection, document, request.user)
            return Response({"removed": True})
        try:
            folders.add_to_collection(collection, document, request.user)
        except folders.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"added": True}, status=status.HTTP_201_CREATED)


class SavedViewsView(_PersonalScope):
    """Saved/smart views are collections of type ``saved_view``."""

    def get(self, request):
        qs = DocumentCollection.objects.filter(
            owner=request.user, organization__isnull=True,
            collection_type=DocumentCollection.CollectionType.SAVED_VIEW,
        )
        return Response({"saved_views": [folders.build_collection_payload(c) for c in qs]})

    def post(self, request):
        data = dict(request.data)
        data["collection_type"] = "saved_view"
        try:
            collection = folders.create_collection(request.user, None, request.user, data)
        except folders.FolderError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(folders.build_collection_payload(collection),
                        status=status.HTTP_201_CREATED)


class SmartViewResolveView(_PersonalScope):
    """POST a filter_config (or GET with query params) → matching documents."""

    def get(self, request):
        return Response(folders.build_smart_view(request.user, None, request.query_params))

    def post(self, request):
        return Response(folders.build_smart_view(request.user, None, request.data))
