"""One-click unsubscribe tokens + URL building.

Non-essential mail (``lifecycle`` / ``marketing``) carries a ``List-Unsubscribe``
header pointing at a signed, per-recipient link. Following it adds a
``marketing``-scope :class:`SuppressedEmail`, so the recipient stops receiving
non-essential mail while still getting essential transactional mail (password
reset, verification, receipts). Tokens are signed (tamper-proof) and expiring.
"""

from __future__ import annotations

from django.conf import settings
from django.core import signing

_SALT = "duenest-email-unsubscribe"
# Generous lifetime — an unsubscribe link in an old email should still work.
MAX_AGE_SECONDS = 60 * 60 * 24 * 365  # 1 year


def make_unsubscribe_token(email: str) -> str:
    return signing.dumps({"email": email}, salt=_SALT)


def read_unsubscribe_token(token: str) -> str | None:
    """Return the email for a valid, unexpired token, else None."""
    try:
        data = signing.loads(token, salt=_SALT, max_age=MAX_AGE_SECONDS)
    except (signing.BadSignature, signing.SignatureExpired):
        return None
    email = data.get("email") if isinstance(data, dict) else None
    return email or None


def build_unsubscribe_url(email: str) -> str:
    """Absolute API URL that one-click unsubscribes ``email``."""
    base = getattr(settings, "BACKEND_PUBLIC_URL", "http://localhost:8000")
    token = make_unsubscribe_token(email)
    return f"{base.rstrip('/')}/api/v1/email/unsubscribe/?token={token}"
