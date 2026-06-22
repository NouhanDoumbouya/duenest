"""
Provider-neutral email configuration for CertaNest.

Operators choose a provider with ``EMAIL_PROVIDER`` and CertaNest maps it to
Django's email settings. Development works with no credentials (``console``).
For real delivery, ``smtp`` plus the well-known providers (Resend, Postmark,
SendGrid, Mailgun, SES) are supported over SMTP — no extra Python dependencies
and no paid credentials required to run locally.

Honesty rule: if a provider is selected but not fully configured,
``EMAIL_CONFIGURED`` is False. The delivery code then records email as
*not_configured* (skipped) instead of crashing or pretending it was sent.

``resolve_email_settings`` is a pure function (no Django imports) so it can be
unit-tested without touching live settings or any provider.
"""

from __future__ import annotations

from typing import Callable

Getter = Callable[[str, str], str]

_CONSOLE_BACKEND = "django.core.mail.backends.console.EmailBackend"
_SMTP_BACKEND = "django.core.mail.backends.smtp.EmailBackend"

# Stable SMTP host presets for providers whose SMTP endpoint + auth model are
# well-documented. Credentials are still read from env — never hardcoded.
_PRESETS = {
    "resend": {"host": "smtp.resend.com", "port": 587, "user": "resend"},
    "postmark": {"host": "smtp.postmarkapp.com", "port": 587},
    "sendgrid": {"host": "smtp.sendgrid.net", "port": 587, "user": "apikey"},
    "mailgun": {"host": "smtp.mailgun.org", "port": 587},
}


def _as_bool(value: str, default: bool) -> bool:
    if value is None or str(value).strip() == "":
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _as_int(value: str, default: int) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def resolve_email_settings(get: Getter) -> dict:
    """
    Return Django email settings derived from provider-neutral env vars.

    Keys returned: EMAIL_BACKEND, EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER,
    EMAIL_HOST_PASSWORD, EMAIL_USE_TLS, EMAIL_USE_SSL, EMAIL_PROVIDER,
    EMAIL_CONFIGURED.
    """
    provider = (get("EMAIL_PROVIDER", "console") or "console").strip().lower()

    # Generic SMTP fields, falling back to the legacy EMAIL_* names so existing
    # deployments keep working.
    smtp_host = get("SMTP_HOST", "") or get("EMAIL_HOST", "")
    smtp_port = get("SMTP_PORT", "") or get("EMAIL_PORT", "")
    smtp_user = get("SMTP_USERNAME", "") or get("EMAIL_HOST_USER", "")
    smtp_pass = get("SMTP_PASSWORD", "") or get("EMAIL_HOST_PASSWORD", "")
    smtp_tls = get("SMTP_USE_TLS", "") or get("EMAIL_USE_TLS", "")
    smtp_ssl = get("EMAIL_USE_SSL", "")

    base = {
        "EMAIL_PROVIDER": provider,
        "EMAIL_USE_SSL": _as_bool(smtp_ssl, False),
    }

    if provider == "console":
        # Console output is the intended local default; treat as "configured".
        return {
            **base,
            "EMAIL_BACKEND": _CONSOLE_BACKEND,
            "EMAIL_HOST": "",
            "EMAIL_PORT": _as_int(smtp_port, 587),
            "EMAIL_HOST_USER": "",
            "EMAIL_HOST_PASSWORD": "",
            "EMAIL_USE_TLS": _as_bool(smtp_tls, True),
            "EMAIL_CONFIGURED": True,
        }

    host = smtp_host
    port = _as_int(smtp_port, 587)
    user = smtp_user
    password = smtp_pass

    if provider in _PRESETS:
        preset = _PRESETS[provider]
        host = host or preset.get("host", "")
        port = _as_int(smtp_port, preset.get("port", 587))
        user = user or preset.get("user", "")
        # Provider API keys double as the SMTP password for these services.
        password = password or {
            "resend": get("RESEND_API_KEY", ""),
            "postmark": get("POSTMARK_SERVER_TOKEN", ""),
            "sendgrid": get("SENDGRID_API_KEY", ""),
            "mailgun": get("MAILGUN_API_KEY", ""),
        }.get(provider, "")
        if provider == "postmark" and not user:
            user = password  # Postmark uses the server token for both fields.
        if provider == "mailgun" and not user:
            domain = get("MAILGUN_DOMAIN", "")
            user = f"postmaster@{domain}" if domain else ""
    elif provider == "ses":
        region = get("AWS_SES_REGION", "")
        host = host or (f"email-smtp.{region}.amazonaws.com" if region else "")
        # SES uses dedicated SMTP credentials (not IAM keys) — read from SMTP_*.

    configured = bool(host and user and password)

    return {
        **base,
        "EMAIL_BACKEND": _SMTP_BACKEND,
        "EMAIL_HOST": host,
        "EMAIL_PORT": port,
        "EMAIL_HOST_USER": user,
        "EMAIL_HOST_PASSWORD": password,
        "EMAIL_USE_TLS": _as_bool(smtp_tls, True),
        "EMAIL_CONFIGURED": configured,
    }
