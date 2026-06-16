"""
Password reset and email verification (SEC-007).

Password reset uses Django's built-in :data:`default_token_generator`, which
produces **single-use, time-limited** tokens (a token is invalidated as soon as
the password — and thus the hash it is derived from — changes). The request
endpoint always returns a generic success so it cannot be used to enumerate which
emails have accounts.

Email verification uses a signed, time-limited token (``TimestampSigner``) that
carries the user id + email; confirming marks the account verified. Google
accounts are created already verified.

Emails are sent through Django's configured ``EMAIL_BACKEND`` (console in dev) —
never faked. Tokens are never logged.
"""

from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.core import signing
from django.core.mail import send_mail
from django.utils import timezone
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

User = get_user_model()

_VERIFY_SALT = "duenest.email.verify"


# ---- Password reset --------------------------------------------------------

def _frontend_base() -> str:
    return getattr(settings, "FRONTEND_APP_URL", "http://localhost:3000").rstrip("/")


def send_password_reset_email(user) -> None:
    """Send a single-use, time-limited reset link. No-op for accounts without a
    usable password (e.g. Google-only) so we never imply one exists."""
    if not user.has_usable_password():
        return
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    link = f"{_frontend_base()}/reset-password?uid={uid}&token={token}"
    send_mail(
        subject="Reset your DueNest password",
        message=(
            "We received a request to reset your DueNest password.\n\n"
            f"Reset it here: {link}\n\n"
            "If you didn't request this, you can safely ignore this email."
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        recipient_list=[user.email],
        fail_silently=True,
    )


def request_password_reset(email: str) -> None:
    """Look up the user and send a reset email if appropriate. Never reveals
    whether the email exists (caller always returns a generic response)."""
    email = (email or "").strip()
    if not email:
        return
    user = User.objects.filter(email__iexact=email).first()
    if user is not None and user.is_active:
        send_password_reset_email(user)


def confirm_password_reset(uid: str, token: str, new_password: str):
    """Validate the uid/token and set the new password. Returns the user on
    success or None on any failure. The token is single-use (invalidated once
    the password changes)."""
    try:
        user_pk = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=user_pk)
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        return None
    if not default_token_generator.check_token(user, token):
        return None
    user.set_password(new_password)
    user.save(update_fields=["password"])
    return user


# ---- Email verification ----------------------------------------------------

def _verify_max_age() -> int:
    hours = int(getattr(settings, "EMAIL_VERIFICATION_TOKEN_HOURS", 48))
    return hours * 3600


def mark_email_verified(user) -> None:
    if not user.email_verified:
        user.email_verified = True
        user.email_verified_at = timezone.now()
        user.save(update_fields=["email_verified", "email_verified_at"])


def make_email_verification_token(user) -> str:
    return signing.TimestampSigner(salt=_VERIFY_SALT).sign(
        f"{user.pk}:{(user.email or '').lower()}"
    )


def send_email_verification(user) -> None:
    if user.email_verified:
        return
    token = make_email_verification_token(user)
    link = f"{_frontend_base()}/verify-email?token={token}"
    send_mail(
        subject="Verify your DueNest email",
        message=(
            "Confirm your email to finish setting up DueNest.\n\n"
            f"Verify here: {link}\n\n"
            "If you didn't create a DueNest account, you can ignore this email."
        ),
        from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
        recipient_list=[user.email],
        fail_silently=True,
    )


def confirm_email_verification(token: str):
    """Validate a verification token and mark the account verified. Returns the
    user on success or None. Re-verifying an already-verified account is a safe
    no-op."""
    try:
        value = signing.TimestampSigner(salt=_VERIFY_SALT).unsign(
            token, max_age=_verify_max_age()
        )
    except signing.BadSignature:
        return None
    try:
        pk_str, email = value.split(":", 1)
        user = User.objects.get(pk=pk_str)
    except (ValueError, User.DoesNotExist):
        return None
    if (user.email or "").lower() != email:
        return None
    mark_email_verified(user)
    return user
