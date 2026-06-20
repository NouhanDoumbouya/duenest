"""Provider email webhooks (Resend) + one-click unsubscribe.

The Resend webhook is signed with the Svix scheme; we verify the signature
manually (no extra dependency) before applying bounce / complaint / delivered /
opened events. The unsubscribe endpoint backs the ``List-Unsubscribe`` header.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time

from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .email_events import apply_provider_event, suppress_email
from .models import SuppressedEmail
from .unsubscribe import read_unsubscribe_token

logger = logging.getLogger(__name__)

_TOLERANCE_SECONDS = 60 * 5


def verify_svix_signature(secret: str, headers: dict, body: bytes) -> bool:
    """Verify a Svix-signed webhook (Resend). ``headers`` keys are lowercased.

    Signed content is ``{id}.{timestamp}.{body}``, HMAC-SHA256 with the
    base64-decoded secret (``whsec_`` prefix stripped), compared against each
    ``v1,<sig>`` entry in the signature header (constant-time).
    """
    msg_id = headers.get("svix-id") or headers.get("webhook-id")
    timestamp = headers.get("svix-timestamp") or headers.get("webhook-timestamp")
    signature = headers.get("svix-signature") or headers.get("webhook-signature")
    if not (secret and msg_id and timestamp and signature):
        return False
    try:
        if abs(time.time() - int(timestamp)) > _TOLERANCE_SECONDS:
            return False
    except (TypeError, ValueError):
        return False
    secret_b64 = secret.split("_", 1)[1] if secret.startswith("whsec_") else secret
    try:
        secret_bytes = base64.b64decode(secret_b64)
    except (ValueError, TypeError):
        return False
    signed = f"{msg_id}.{timestamp}.{body.decode('utf-8', 'replace')}".encode()
    expected = base64.b64encode(
        hmac.new(secret_bytes, signed, hashlib.sha256).digest()
    ).decode()
    for part in signature.split(" "):
        _, _, sig = part.partition(",")
        if sig and hmac.compare_digest(sig, expected):
            return True
    return False


@method_decorator(csrf_exempt, name="dispatch")
class ResendWebhookView(APIView):
    """Resend delivery webhook → suppression + EmailLog enrichment."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def post(self, request):
        secret = getattr(settings, "RESEND_WEBHOOK_SECRET", "")
        if not secret:
            return Response(
                {"detail": "Webhook not configured."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        headers = {k.lower(): v for k, v in request.headers.items()}
        if not verify_svix_signature(secret, headers, request.body):
            return Response(
                {"detail": "Invalid signature."}, status=status.HTTP_400_BAD_REQUEST
            )
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return Response(
                {"detail": "Bad payload."}, status=status.HTTP_400_BAD_REQUEST
            )

        event_type = payload.get("type", "")
        data = payload.get("data", {}) or {}
        recipients = data.get("to") or []
        if isinstance(recipients, str):
            recipients = [recipients]
        applied = [apply_provider_event(event_type, r) for r in recipients]
        return Response({"status": "ok", "applied": applied})


@method_decorator(csrf_exempt, name="dispatch")
class UnsubscribeView(APIView):
    """One-click unsubscribe (List-Unsubscribe). Adds a marketing-scope
    suppression so essential transactional mail still reaches the recipient."""

    permission_classes = [AllowAny]
    authentication_classes: list = []

    def get(self, request):
        return self._handle(request)

    def post(self, request):
        return self._handle(request)

    def _handle(self, request):
        token = request.query_params.get("token") or request.data.get("token")
        email = read_unsubscribe_token(token or "")
        if not email:
            return Response(
                {"detail": "This unsubscribe link is invalid or has expired."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        suppress_email(
            email,
            scope=SuppressedEmail.Scope.MARKETING,
            reason=SuppressedEmail.Reason.UNSUBSCRIBE,
        )
        return Response(
            {"detail": "You've been unsubscribed from non-essential DueNest emails."}
        )
