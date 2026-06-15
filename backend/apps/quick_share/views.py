"""
Quick Share QR views.

Endpoint groups:
* Owner (authenticated): create / list / detail / revoke / approve / deny / activity.
* Claim (token-gated): metadata, verify-code, accept, decline, file preview /
  download / save-copy.
* Shared with me (authenticated receiver): list / detail / remove.

Every file access re-validates the session state, the access code, the claim
(for account-to-account), and the permission — never trusting the client.
"""

from __future__ import annotations

import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.features.flags import require_feature_enabled
from apps.documents.models import Document, DocumentBundle, DocumentFile
from apps.documents.plan_usage import enforce_plan_limit
from apps.documents.services import collect_bundle_files
from apps.users import plans as user_plans

from .models import (
    QuickShareActivity,
    QuickShareClaim,
    QuickShareItem,
    QuickShareSession,
    normalize_dn_code,
)
from .serializers import (
    QuickShareActivitySerializer,
    QuickShareClaimSummarySerializer,
    QuickShareCreateSerializer,
    QuickShareListItemSerializer,
    QuickShareSessionSerializer,
    SharedWithMeSerializer,
    build_public_payload,
)
from .services import (
    accept_claim,
    approve_claim,
    attachment_file_response,
    decline_claim,
    deny_claim,
    get_or_create_receiver_claim,
    inline_file_response,
    log_activity,
    resolve_session,
    resolve_session_file,
    save_copy_to_vault,
    summarize_user_agent,
)


def _state_response(state) -> Response:
    return Response(
        {"detail": state.detail, "state": state.state},
        status=state.http_status or status.HTTP_400_BAD_REQUEST,
    )


# ---- Owner endpoints -------------------------------------------------------


class QuickShareSessionListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = QuickShareSession.objects.filter(
            owner=request.user
        ).prefetch_related("items")
        return Response(
            QuickShareListItemSerializer(sessions, many=True).data
        )

    def post(self, request):
        require_feature_enabled("quick_share", request.user)
        enforce_plan_limit(request.user, user_plans.RESOURCE_SHARE_LINKS)
        serializer = QuickShareCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        file_ids = data.pop("file_ids", []) or []
        bundle_ids = data.pop("bundle_ids", []) or []
        plain_code = data.pop("access_code", "") or ""
        access_code_required = data.get("access_code_required", False)

        access_code_hash = ""
        if access_code_required:
            plain_code = (plain_code or "").strip() or f"{secrets.randbelow(1_000_000):06d}"
            access_code_hash = make_password(plain_code)
        else:
            plain_code = ""

        session = QuickShareSession.objects.create(
            owner=request.user,
            access_code_hash=access_code_hash,
            **data,
        )

        # Attach selected files — each must be owned by the requester.
        created_any = False
        for order, file_id in enumerate(file_ids):
            file = (
                DocumentFile.objects.filter(id=file_id, is_trashed=False)
                .filter(
                    Q(document__owner=request.user, document__is_trashed=False)
                    | Q(document__isnull=True, uploaded_by=request.user)
                )
                .first()
            )
            if file is None:
                continue
            QuickShareItem.objects.create(
                session=session,
                document=file.document,
                file=file,
                order=order,
            )
            created_any = True

        # Attach whole bundles — each must be owned by the requester and must
        # currently expose at least one available file.
        base_order = len(file_ids)
        for offset, bundle_id in enumerate(bundle_ids):
            bundle = DocumentBundle.objects.filter(
                id=bundle_id, owner=request.user
            ).first()
            if bundle is None:
                continue
            if not collect_bundle_files(bundle).files:
                continue
            QuickShareItem.objects.create(
                session=session,
                bundle=bundle,
                display_name=bundle.title,
                order=base_order + offset,
            )
            created_any = True

        if not created_any:
            session.delete()
            return Response(
                {
                    "detail": "Select at least one of your own files or a bundle "
                    "with files to share.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        log_activity(
            session=session,
            action=QuickShareActivity.Action.SESSION_CREATED,
            actor_type=QuickShareActivity.ActorType.OWNER,
            actor=request.user,
            summary="Quick Share created.",
            metadata={"permission": session.permission, "mode": session.mode},
        )

        payload = QuickShareSessionSerializer(session).data
        if access_code_required:
            payload["access_code"] = plain_code
        return Response(payload, status=status.HTTP_201_CREATED)


class _OwnedSessionMixin:
    permission_classes = [IsAuthenticated]

    def get_session(self):
        return get_object_or_404(
            QuickShareSession, pk=self.kwargs["session_id"], owner=self.request.user
        )


class QuickShareSessionDetailView(_OwnedSessionMixin, APIView):
    def get(self, request, session_id):
        return Response(QuickShareSessionSerializer(self.get_session()).data)

    def delete(self, request, session_id):
        self.get_session().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class QuickShareSessionRevokeView(_OwnedSessionMixin, APIView):
    def post(self, request, session_id):
        session = self.get_session()
        if not session.is_revoked:
            session.revoked_at = timezone.now()
            session.status = QuickShareSession.Status.REVOKED
            session.save(update_fields=["revoked_at", "status", "updated_at"])
            log_activity(
                session=session,
                action=QuickShareActivity.Action.SESSION_REVOKED,
                actor_type=QuickShareActivity.ActorType.OWNER,
                actor=request.user,
                summary="Quick Share revoked.",
            )
        return Response(QuickShareSessionSerializer(session).data)


class QuickShareSessionExtendView(_OwnedSessionMixin, APIView):
    """Owner extends (or re-opens) a share by moving its expiry into the future."""

    def post(self, request, session_id):
        session = self.get_session()
        if session.is_revoked:
            return Response(
                {
                    "detail": "This Quick Share was revoked and cannot be extended. "
                    "Create a new share instead.",
                    "state": "revoked",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if session.is_consumed:
            return Response(
                {
                    "detail": "This one-time Quick Share has already been used and "
                    "cannot be extended.",
                    "state": "consumed",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        raw = request.data.get("expires_at")
        new_expiry = parse_datetime(raw) if isinstance(raw, str) else None
        if new_expiry is None:
            return Response(
                {"detail": "Provide a valid new expiry time."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if timezone.is_naive(new_expiry):
            new_expiry = timezone.make_aware(new_expiry)
        if new_expiry <= timezone.now():
            return Response(
                {"detail": "New expiry must be in the future."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session.expires_at = new_expiry
        session.save(update_fields=["expires_at", "updated_at"])
        log_activity(
            session=session,
            action=QuickShareActivity.Action.SESSION_EXTENDED,
            actor_type=QuickShareActivity.ActorType.OWNER,
            actor=request.user,
            summary="Quick Share expiry extended.",
            metadata={"expires_at": new_expiry.isoformat()},
        )
        return Response(QuickShareSessionSerializer(session).data)


class QuickShareApproveClaimView(_OwnedSessionMixin, APIView):
    def post(self, request, session_id):
        session = self.get_session()
        claim = get_object_or_404(
            QuickShareClaim, pk=request.data.get("claim_id"), session=session
        )
        claim, state = approve_claim(session, claim)
        if state is not None:
            return _state_response(state)
        return Response(QuickShareClaimSummarySerializer(claim).data)


class QuickShareDenyClaimView(_OwnedSessionMixin, APIView):
    def post(self, request, session_id):
        session = self.get_session()
        claim = get_object_or_404(
            QuickShareClaim, pk=request.data.get("claim_id"), session=session
        )
        claim = deny_claim(session, claim)
        return Response(QuickShareClaimSummarySerializer(claim).data)


class QuickShareActivityView(_OwnedSessionMixin, APIView):
    def get(self, request, session_id):
        session = self.get_session()
        activity = session.activities.all()[:100]
        return Response(QuickShareActivitySerializer(activity, many=True).data)


# ---- Claim (token-gated) ---------------------------------------------------


def _share_grant_header(request) -> str:
    return request.headers.get("X-Access-Code-Grant", "").strip()


def _check_access_code(session, request, *, log=True):
    """Return None when access is permitted, else an error Response."""
    if not session.access_code_required:
        return None
    code = request.headers.get("X-Access-Code", "").strip()
    if not code:
        return Response(
            {
                "detail": "This Quick Share is protected. Enter the access code "
                "from the sender.",
                "state": "requires_code",
                "access_code_required": True,
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    if not check_password(code, session.access_code_hash):
        if log:
            log_activity(
                session=session,
                action=QuickShareActivity.Action.ACCESS_CODE_FAILED,
                actor_type=QuickShareActivity.ActorType.RECEIVER,
                summary="Access code attempt failed.",
            )
        return Response(
            {
                "detail": "That code does not match. Check the code and try again.",
                "state": "wrong_code",
            },
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


class QuickShareReceiveCodeView(APIView):
    """
    Resolve a typed DueNest code to its share (the "Receive code" flow).

    The recipient enters the short code the sender gave them; on success we hand
    back the session token + claim path so the normal, fully-guarded claim flow
    takes over (login, access code, accept, permissions are all re-checked there).
    Rate-limited to make code enumeration infeasible.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "quick_share_receive"

    def post(self, request):
        require_feature_enabled("quick_share_code")
        code = normalize_dn_code(request.data.get("code") or "")
        if not code:
            return Response(
                {
                    "detail": "Enter the DueNest code from the sender, e.g. DN-4KQ7-PXMR.",
                    "state": "invalid",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        session = QuickShareSession.objects.filter(dn_code=code).first()
        if session is None:
            return Response(
                {
                    "detail": "We couldn't find a share for that code. "
                    "Check the code and try again.",
                    "state": "not_found",
                },
                status=status.HTTP_404_NOT_FOUND,
            )
        _, state = resolve_session(session.token)
        if not state.ok:
            return _state_response(state)
        return Response(
            {
                "ok": True,
                "token": session.token,
                "claim_path": f"/quick-share/{session.token}",
                "mode": session.mode,
            }
        )


class QuickShareClaimMetadataView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, token):
        require_feature_enabled("quick_share_public_viewer")
        session, state = resolve_session(token)
        if not state.ok:
            return _state_response(state)

        code_err = _check_access_code(session, request, log=False)
        if code_err:
            return code_err

        session.last_accessed_at = timezone.now()
        session.save(update_fields=["last_accessed_at"])

        claim = None
        viewer = request.user if request.user.is_authenticated else None
        is_account_mode = session.mode == QuickShareSession.Mode.ACCOUNT_TO_ACCOUNT

        if is_account_mode and viewer and viewer.id != session.owner_id:
            claim, _ = get_or_create_receiver_claim(session, viewer, request)
            claim.last_accessed_at = timezone.now()
            claim.save(update_fields=["last_accessed_at", "updated_at"])

        log_activity(
            session=session,
            action=QuickShareActivity.Action.QR_VIEWED,
            actor_type=(
                QuickShareActivity.ActorType.OWNER
                if viewer and viewer.id == session.owner_id
                else QuickShareActivity.ActorType.RECEIVER
            ),
            actor=viewer,
            summary="Quick Share opened.",
        )

        payload = build_public_payload(session, claim=claim, viewer=viewer)
        payload["requires_login"] = is_account_mode and viewer is None
        return Response(payload)


class QuickShareVerifyCodeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "quick_share_code"

    def post(self, request, token):
        session, state = resolve_session(token)
        if not state.ok:
            return _state_response(state)
        if not session.access_code_required:
            return Response({"ok": True})
        code = (request.data.get("access_code") or "").strip()
        if not code or not check_password(code, session.access_code_hash):
            log_activity(
                session=session,
                action=QuickShareActivity.Action.ACCESS_CODE_FAILED,
                actor_type=QuickShareActivity.ActorType.RECEIVER,
                summary="Access code attempt failed.",
            )
            return Response(
                {
                    "detail": "That code does not match. Check the code and try again.",
                    "state": "wrong_code",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        log_activity(
            session=session,
            action=QuickShareActivity.Action.ACCESS_CODE_VERIFIED,
            actor_type=QuickShareActivity.ActorType.RECEIVER,
            summary="Access code verified.",
        )
        return Response({"ok": True})


class QuickShareAcceptView(APIView):
    """Account-to-account: the logged-in receiver accepts the share."""

    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        session, state = resolve_session(token)
        if not state.ok:
            return _state_response(state)
        if session.mode != QuickShareSession.Mode.ACCOUNT_TO_ACCOUNT:
            return Response(
                {"detail": "This share does not require acceptance.", "state": "public"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if request.user.id == session.owner_id:
            return Response(
                {"detail": "You cannot accept your own Quick Share."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        code_err = _check_access_code(session, request)
        if code_err:
            return code_err

        claim, _ = get_or_create_receiver_claim(session, request.user, request)
        claim, err = accept_claim(session, claim, request)
        if err is not None:
            return _state_response(err)
        return Response(SharedWithMeSerializer(claim).data)


class QuickShareDeclineView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, token):
        session, state = resolve_session(token)
        if not state.ok:
            return _state_response(state)
        claim, _ = get_or_create_receiver_claim(session, request.user, request)
        claim = decline_claim(session, claim)
        return Response({"ok": True, "status": claim.status})


class _ClaimFileAccessMixin(APIView):
    permission_classes = [AllowAny]

    def authorize(self, request, token, file_id):
        """Return (session, file, error_response). error is None when allowed."""
        session, state = resolve_session(token)
        if not state.ok:
            return None, None, _state_response(state)

        code_err = _check_access_code(session, request)
        if code_err:
            return None, None, code_err

        # Account-to-account requires an accepted claim by the logged-in receiver.
        if session.mode == QuickShareSession.Mode.ACCOUNT_TO_ACCOUNT:
            if not request.user.is_authenticated:
                return None, None, Response(
                    {"detail": "Sign in to open this share.", "state": "requires_login"},
                    status=status.HTTP_401_UNAUTHORIZED,
                )
            if request.user.id == session.owner_id:
                pass  # owner may preview their own share (view-as-recipient)
            else:
                claim = QuickShareClaim.objects.filter(
                    session=session, receiver_user=request.user
                ).first()
                if claim is None or not claim.is_active_for_receiver:
                    return None, None, Response(
                        {
                            "detail": "You need to accept this share first.",
                            "state": "not_accepted",
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )

        file = resolve_session_file(session, file_id)
        if file is None:
            return None, None, Response(
                {"detail": "This file is not part of this share.", "state": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return session, file, None


class QuickShareFilePreviewView(_ClaimFileAccessMixin):
    def get(self, request, token, file_id):
        session, file, err = self.authorize(request, token, file_id)
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
        response = inline_file_response(file)
        if response is None:
            return Response(
                {"detail": "This file is no longer available.", "state": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        log_activity(
            session=session,
            action=QuickShareActivity.Action.FILE_PREVIEWED,
            actor_type=QuickShareActivity.ActorType.RECEIVER,
            actor=request.user if request.user.is_authenticated else None,
            summary="File previewed.",
            metadata={"file_id": file.id},
        )
        return response


class QuickShareFileDownloadView(_ClaimFileAccessMixin):
    def get(self, request, token, file_id):
        session, file, err = self.authorize(request, token, file_id)
        if err:
            return err
        # View-only enforcement happens here, server-side — never on the client.
        if not session.download_allowed:
            return Response(
                {
                    "detail": "This share is view-only. Download disabled by the sender.",
                    "state": "download_not_allowed",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        response = attachment_file_response(file)
        if response is None:
            return Response(
                {"detail": "This file is no longer available.", "state": "not_found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        log_activity(
            session=session,
            action=QuickShareActivity.Action.FILE_DOWNLOADED,
            actor_type=QuickShareActivity.ActorType.RECEIVER,
            actor=request.user if request.user.is_authenticated else None,
            summary="File downloaded.",
            metadata={"file_id": file.id},
        )
        return response


class QuickShareSaveCopyView(_ClaimFileAccessMixin):
    """Save a shared file into the receiver's own vault (only when allowed)."""

    permission_classes = [IsAuthenticated]

    def post(self, request, token, file_id):
        session, file, err = self.authorize(request, token, file_id)
        if err:
            return err
        if not session.save_copy_allowed:
            return Response(
                {
                    "detail": "Saving a copy is not enabled for this share.",
                    "state": "save_copy_not_allowed",
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if request.user.id == session.owner_id:
            return Response(
                {"detail": "You already own this file."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target_document_id = request.data.get("target_document_id")
        document, new_file = save_copy_to_vault(
            session, request.user, file, target_document_id=target_document_id
        )
        return Response(
            {
                "ok": True,
                "document_id": document.id,
                "file_id": new_file.id,
                "detail": "Saved to your vault.",
            },
            status=status.HTTP_201_CREATED,
        )


# ---- Shared with me --------------------------------------------------------


class SharedWithMeListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        claims = (
            QuickShareClaim.objects.filter(
                receiver_user=request.user, removed_by_receiver=False
            )
            .exclude(status=QuickShareClaim.Status.DECLINED)
            .select_related("session", "session__owner")
            .order_by("-created_at")
        )
        return Response(SharedWithMeSerializer(claims, many=True).data)


class SharedWithMeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, claim_id):
        claim = get_object_or_404(
            QuickShareClaim, pk=claim_id, receiver_user=request.user
        )
        data = SharedWithMeSerializer(claim).data
        data["files"] = build_public_payload(claim.session, claim=claim)["files"]
        return Response(data)


class SharedWithMeRemoveView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, claim_id):
        claim = get_object_or_404(
            QuickShareClaim, pk=claim_id, receiver_user=request.user
        )
        claim.removed_by_receiver = True
        claim.save(update_fields=["removed_by_receiver", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
