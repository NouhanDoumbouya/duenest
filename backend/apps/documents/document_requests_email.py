"""
Branded email for Document Request Links.

Sends the recipient a secure upload link via the shared ``send_branded_email``
path (suppression-aware, EmailLog-logged). The email carries ONLY the request
details + the public upload URL — never the owner's documents, never attachments,
never a private file URL. Sent only when the owner triggers it (create with
``send_email`` or the explicit send action) and a recipient email exists.
"""

from __future__ import annotations

from django.conf import settings


def send_document_request_email(request) -> bool:
    """Email the upload link to ``request.recipient_email``. Returns False if there
    is no recipient address. Never raises (send is fail-silent)."""
    if not request.recipient_email:
        return False

    base = (getattr(settings, "DUENEST_APP_BASE_URL", "") or "").rstrip("/")
    # Public recipient page route (distinct from the share_requests /request route).
    upload_url = f"{base}/document-request/{request.token}"
    preferences_url = f"{base}/dashboard/settings"
    from_name = (getattr(request.owner, "first_name", "") or "").strip() or "A CertaNest user"

    from common.email import send_branded_email

    return send_branded_email(
        subject="Document request from CertaNest",
        template="document_request_link",
        context={
            "from_name": from_name,
            "requested_document_title": request.requested_document_title,
            "instructions": request.instructions,
            "recipient_name": request.recipient_name,
            "recipient_message": request.recipient_message,
            "due_date": request.due_date.isoformat() if request.due_date else None,
            "expires_at": request.expires_at.isoformat() if request.expires_at else None,
            "upload_url": upload_url,
            "preferences_url": preferences_url,
        },
        to=request.recipient_email,
        email_type="document_request_link",
        category="transactional",
    )
