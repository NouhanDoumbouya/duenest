from datetime import timedelta
from pathlib import Path

import dj_database_url
from corsheaders.defaults import default_headers as cors_default_headers
import sys

from decouple import Csv, config

from apps.ai.config import resolve_ai_settings
from apps.ai.embeddings import resolve_embeddings_settings
from apps.notifications.email_config import resolve_email_settings
from config.storage import build_storages

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config("DJANGO_SECRET_KEY", 
                    default="unsafe-dev-secret-key-change-me-for-local-development-only")

DEBUG = config("DJANGO_DEBUG", default=False, cast=bool)

# OAuth client id used to verify Google ID tokens at POST /api/v1/auth/google/.
# Keep this out of source control; set it via the environment / .env file.
GOOGLE_OAUTH_CLIENT_ID = config("GOOGLE_OAUTH_CLIENT_ID", default="")

# Controls whether new account creation requires a valid invite code.
# Existing users can still log in when private beta mode is enabled.
PRIVATE_BETA_ENABLED = config("PRIVATE_BETA_ENABLED", default=False, cast=bool)

# ---- Verifiable Shares signing key -----------------------------------------
# Ed25519 private key (PEM) used to sign tamper-evident share manifests. Only the
# PUBLIC key is ever exposed (at /api/v1/verify/key/). Keep the private key out of
# source control; set SHARE_SIGNING_PRIVATE_KEY in the environment for any shared
# or production deployment. When unset, the app generates an ephemeral dev key on
# first use and logs a warning — verification works locally but signatures will not
# persist across restarts, which is fine for development only.
SHARE_SIGNING_PRIVATE_KEY = config("SHARE_SIGNING_PRIVATE_KEY", default="")

# ---- Founder/admin console access (SEC-009) --------------------------------
# Founder tools (CRM, analytics, bulk export, manual billing grants) are NOT
# granted to every staff account. Superusers always qualify; other staff must be
# on this explicit allowlist. FOUNDER_ALLOW_ALL_STAFF is a dev-only convenience.
FOUNDER_EMAILS = config("FOUNDER_EMAILS", default="", cast=Csv())
FOUNDER_ALLOW_ALL_STAFF = config(
    "FOUNDER_ALLOW_ALL_STAFF", default=False, cast=bool
)

# ---- Billing (CertaNest's own monetization) ----------------------------------
# Provider-aware. "manual" works fully offline for local dev/tests; "stripe"
# uses the Stripe API and requires the keys below. Secrets never reach the
# frontend — only STRIPE_PUBLISHABLE_KEY is safe to expose.
BILLING_PROVIDER = config("BILLING_PROVIDER", default="manual")
BILLING_TEST_MODE = config("BILLING_TEST_MODE", default=True, cast=bool)
# The manual provider accepts UNSIGNED webhook payloads and activates plans with
# no real payment — it is a local-dev/test convenience only. It must never be the
# active provider in production. This flag (default False) gates it; production
# fails closed unless it is explicitly enabled (which it never should be).
BILLING_ALLOW_MANUAL_PROVIDER = config(
    "BILLING_ALLOW_MANUAL_PROVIDER", default=False, cast=bool
)
STRIPE_SECRET_KEY = config("STRIPE_SECRET_KEY", default="")
STRIPE_PUBLISHABLE_KEY = config("STRIPE_PUBLISHABLE_KEY", default="")
STRIPE_WEBHOOK_SECRET = config("STRIPE_WEBHOOK_SECRET", default="")
STRIPE_PRICE_PRO_MONTHLY = config("STRIPE_PRICE_PRO_MONTHLY", default="")
STRIPE_PRICE_PRO_YEARLY = config("STRIPE_PRICE_PRO_YEARLY", default="")
STRIPE_PRICE_FAMILY_MONTHLY = config("STRIPE_PRICE_FAMILY_MONTHLY", default="")
STRIPE_PRICE_FAMILY_YEARLY = config("STRIPE_PRICE_FAMILY_YEARLY", default="")
STRIPE_PRICE_ORG_SEAT_MONTHLY = config("STRIPE_PRICE_ORG_SEAT_MONTHLY", default="")
STRIPE_PRICE_ORG_SEAT_YEARLY = config("STRIPE_PRICE_ORG_SEAT_YEARLY", default="")
# Where the provider returns the user after checkout (frontend origin + paths).
BILLING_SUCCESS_URL = config(
    "BILLING_SUCCESS_URL",
    default="http://localhost:3000/dashboard/settings/billing?checkout=success",
)
BILLING_CANCEL_URL = config(
    "BILLING_CANCEL_URL",
    default="http://localhost:3000/dashboard/settings/billing?checkout=cancelled",
)
BILLING_PORTAL_RETURN_URL = config(
    "BILLING_PORTAL_RETURN_URL",
    default="http://localhost:3000/dashboard/settings/billing",
)
# Grace period (days) after a failed payment before access is downgraded.
BILLING_GRACE_PERIOD_DAYS = config(
    "BILLING_GRACE_PERIOD_DAYS", default=7, cast=int
)

ALLOWED_HOSTS = config(
    "DJANGO_ALLOWED_HOSTS",
    default="localhost,127.0.0.1",
    cast=lambda value: [host.strip() for host in value.split(",") if host.strip()],
)

DJANGO_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
]

THIRD_PARTY_APPS = [
    "rest_framework",
    "corsheaders",
    "rest_framework_simplejwt.token_blacklist",
]

LOCAL_APPS = [
    "apps.core.apps.CoreConfig",
    "apps.users.apps.UsersConfig",
    "apps.documents.apps.DocumentsConfig",
    "apps.subscriptions.apps.SubscriptionsConfig",
    "apps.organizations.apps.OrganizationsConfig",
    "apps.founder.apps.FounderConfig",
    "apps.quick_share.apps.QuickShareConfig",
    "apps.share_requests.apps.ShareRequestsConfig",
    "apps.notifications.apps.NotificationsConfig",
    "apps.features.apps.FeaturesConfig",
    "apps.billing.apps.BillingConfig",
    "apps.ai.apps.AiConfig",
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Adds CSP/Permissions-Policy/COOP (production) and always protects public
    # token routes with noindex / no-referrer / no-store.
    "apps.core.middleware.SecurityHeadersMiddleware",
]

# Baseline security-header switches. Off in dev (production.py turns them on)
# so local development is never blocked by CSP. Public-token-route headers in
# the middleware apply regardless of this flag.
SECURITY_HEADERS_ENABLED = config(
    "DJANGO_SECURITY_HEADERS_ENABLED", default=False, cast=bool
)
CSP_CONNECT_EXTRA = config("DJANGO_CSP_CONNECT_SRC", default="", cast=Csv())

# Baseline cookie hardening (production tightens Secure flags).
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# ---------------------------------------------------------------------------
# Cookie-based JWT auth (see apps/users/cookie_auth.py, docs/AUTH.md).
# Access/refresh tokens are carried in HttpOnly cookies. The CSRF cookie is
# readable by JS (double-submit) so the SPA can echo it as X-CSRFToken on unsafe
# requests. Same-site deployment is assumed; set AUTH_COOKIE_SAMESITE=None +
# AUTH_COOKIE_SECURE=True for cross-site, plus matching CSRF_COOKIE_SAMESITE.
# ---------------------------------------------------------------------------
AUTH_ACCESS_COOKIE_NAME = config("AUTH_ACCESS_COOKIE_NAME", default="duenest_access")
AUTH_REFRESH_COOKIE_NAME = config("AUTH_REFRESH_COOKIE_NAME", default="duenest_refresh")
AUTH_COOKIE_SECURE = config("AUTH_COOKIE_SECURE", default=False, cast=bool)
AUTH_COOKIE_SAMESITE = config("AUTH_COOKIE_SAMESITE", default="Lax")
AUTH_COOKIE_DOMAIN = config("AUTH_COOKIE_DOMAIN", default="")
AUTH_COOKIE_PATH = config("AUTH_COOKIE_PATH", default="/")

CSRF_COOKIE_NAME = config("AUTH_CSRF_COOKIE_NAME", default="duenest_csrftoken")
CSRF_COOKIE_HTTPONLY = False  # SPA must read it to send X-CSRFToken
CSRF_COOKIE_SECURE = config("AUTH_COOKIE_SECURE", default=False, cast=bool)
if AUTH_COOKIE_DOMAIN:
    CSRF_COOKIE_DOMAIN = AUTH_COOKIE_DOMAIN

# Cookie auth requires credentialed CORS (never with allow-all origins).
CORS_ALLOW_CREDENTIALS = config("DJANGO_CORS_ALLOW_CREDENTIALS", default=True, cast=bool)

# Allow the custom headers used by the public share/room flow in addition to
# the django-cors-headers defaults. The grant is normally passed as a query
# param (no preflight), but the raw-code header path must work cross-origin too.
CORS_ALLOW_HEADERS = (
    *cors_default_headers,
    "x-access-code",
    "x-share-grant",
)

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": dj_database_url.config(
        default=config("DATABASE_URL", default=f"sqlite:///{BASE_DIR / 'db.sqlite3'}"),
        conn_max_age=600,
    )
}

AUTH_USER_MODEL = "users.User"

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]

LANGUAGE_CODE = "en-us"

TIME_ZONE = "UTC"

USE_I18N = True

USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Local development media (uploaded document files). Files are served only
# through authenticated, ownership-checked API endpoints — never as public
# static media — so private documents are not exposed by URL.
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# ---------------------------------------------------------------------------
# Object storage (provider-neutral; see docs/DEPLOYMENT.md).
#
# Defaults to local filesystem so dev/tests need no configuration and no extra
# dependencies. Set STORAGE_BACKEND=s3 (plus the other STORAGE_* vars) to use
# any S3-compatible provider — Cloudflare R2, Railway buckets, AWS S3, etc.
# Uploaded files are app-encrypted before reaching storage and streamed back
# through authenticated views; object-storage URLs are never used for delivery.
# ---------------------------------------------------------------------------
STORAGES = build_storages(lambda key, default="": config(key, default=default))

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# How long trashed documents/files are kept before the `purge_expired_trash`
# management command permanently removes them. Powers the "days until permanent
# deletion" countdown shown in Trash. Set to 0 to disable auto-purge.
TRASH_RETENTION_DAYS = config("TRASH_RETENTION_DAYS", default=30, cast=int)

# Email/reminder delivery (see docs/EMAIL_REMINDERS.md). Provider-neutral:
# EMAIL_PROVIDER selects console (dev default), smtp, or a known provider
# (resend/postmark/sendgrid/mailgun/ses) over SMTP — no paid credentials are
# needed to run locally. If a provider is selected but not fully configured,
# EMAIL_CONFIGURED is False and delivery is recorded as not_configured (skipped)
# rather than crashing or pretending the email was sent.
_email = resolve_email_settings(lambda key, default="": config(key, default=default))
EMAIL_PROVIDER = _email["EMAIL_PROVIDER"]
EMAIL_BACKEND = _email["EMAIL_BACKEND"]
EMAIL_HOST = _email["EMAIL_HOST"]
EMAIL_PORT = _email["EMAIL_PORT"]
EMAIL_HOST_USER = _email["EMAIL_HOST_USER"]
EMAIL_HOST_PASSWORD = _email["EMAIL_HOST_PASSWORD"]
EMAIL_USE_TLS = _email["EMAIL_USE_TLS"]
EMAIL_USE_SSL = _email["EMAIL_USE_SSL"]
EMAIL_CONFIGURED = _email["EMAIL_CONFIGURED"]
EMAIL_TIMEOUT = config("EMAIL_TIMEOUT", default=10, cast=int)

DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="CertaNest <noreply@localhost>")
SERVER_EMAIL = config("SERVER_EMAIL", default=DEFAULT_FROM_EMAIL)
SUPPORT_EMAIL = config("SUPPORT_EMAIL", default="support@certanest.com")
# Optional dedicated sender for branded billing emails (trial/payment/cancel
# notifications). Falls back to DEFAULT_FROM_EMAIL when unset. Stripe's own
# receipts/invoices are unaffected — these are CertaNest product notifications.
BILLING_FROM_EMAIL = config("BILLING_FROM_EMAIL", default="")

# ---------------------------------------------------------------------------
# AI (Claude / document intelligence) — KEY-GATED, built dark by default.
# Set ANTHROPIC_API_KEY to activate; with no key AI_CONFIGURED is False and
# every AI feature degrades to a clear "not configured" result (apps.ai.client)
# instead of crashing. The per-feature flags in apps.features still control
# who sees each AI feature once a key is present. See apps/ai/config.py.
# ---------------------------------------------------------------------------
_ai = resolve_ai_settings(lambda key, default="": config(key, default=default))
AI_PROVIDER = _ai["AI_PROVIDER"]
ANTHROPIC_API_KEY = _ai["ANTHROPIC_API_KEY"]
AI_MODEL = _ai["AI_MODEL"]
AI_MAX_TOKENS = _ai["AI_MAX_TOKENS"]
AI_CONFIGURED = _ai["AI_CONFIGURED"]

# Embeddings (content-level RAG retrieval) — separate optional key (Voyage AI).
# With no VOYAGE_API_KEY, EMBEDDINGS_CONFIGURED is False and retrieval stays
# lexical (keyword) — see apps/ai/embeddings.py and apps/documents/ai_qa.py.
_embeddings = resolve_embeddings_settings(lambda key, default="": config(key, default=default))
EMBEDDINGS_PROVIDER = _embeddings["EMBEDDINGS_PROVIDER"]
VOYAGE_API_KEY = _embeddings["VOYAGE_API_KEY"]
EMBEDDINGS_MODEL = _embeddings["EMBEDDINGS_MODEL"]
EMBEDDINGS_CONFIGURED = _embeddings["EMBEDDINGS_CONFIGURED"]

# Resend delivery webhook (bounce/complaint/delivered/opened). Svix-signed; the
# secret (``whsec_...``) is verified before any event is applied. Empty disables
# the endpoint (503) so a misconfigured deploy can't accept unsigned events.
RESEND_WEBHOOK_SECRET = config("RESEND_WEBHOOK_SECRET", default="")

# Public URLs. FRONTEND_APP_URL is the canonical name; DUENEST_APP_BASE_URL is
# kept as a backward-compatible alias (used in existing email link building).
# FRONTEND_URL is also accepted because it's the key the production deploy
# (Railway) already sets and the one CORS/CSRF origins are derived from, so the
# same value drives transactional email links (e.g. the password reset link).
# First non-empty wins; falls back to localhost for local development.
def _first_env(*keys, default=""):
    for key in keys:
        value = config(key, default="").strip()
        if value:
            return value
    return default


DUENEST_APP_BASE_URL = _first_env(
    "FRONTEND_APP_URL",
    "FRONTEND_URL",
    "DUENEST_APP_BASE_URL",
    default="http://localhost:3000",
)
FRONTEND_APP_URL = DUENEST_APP_BASE_URL
BACKEND_PUBLIC_URL = config("BACKEND_PUBLIC_URL", default="http://localhost:8000")

NOTIFICATION_REMINDER_CATCHUP_DAYS = config(
    "NOTIFICATION_REMINDER_CATCHUP_DAYS", default=3, cast=int
)

# Web Push (PWA) — VAPID keys. Empty by default: push is fully disabled until a
# key pair is supplied (no prompts, no delivery). Generate with:
#   python -m py_vapid --gen   (or any VAPID key generator)
# Keep the private key in the environment only — never commit it.
VAPID_PUBLIC_KEY = config("VAPID_PUBLIC_KEY", default="")
VAPID_PRIVATE_KEY = config("VAPID_PRIVATE_KEY", default="")
# mailto: or https: contact, required by the Web Push spec for VAPID.
VAPID_SUBJECT = config("VAPID_SUBJECT", default=f"mailto:{SUPPORT_EMAIL}")

_IS_RUNNING_TESTS = "test" in sys.argv


def _throttle_rate(rate):
    """Avoid cross-test pollution from DRF's shared anonymous throttle cache."""
    return "1000/min" if _IS_RUNNING_TESTS else rate

# ---------------------------------------------------------------------------
# Application-level file/field encryption (see docs/ENCRYPTION.md).
#
# Key Encryption Keys (KEKs) are loaded ONLY from the environment and are never
# stored in the database, logged, or committed. The active version wraps new
# per-file/per-field data keys; historical versions must stay configured while
# any record still references them.
# ---------------------------------------------------------------------------
DUENEST_ACTIVE_KEK_VERSION = config("DUENEST_ACTIVE_KEK_VERSION", default="")

# Collect DUENEST_KEK_<VERSION>_B64 values into {version: base64_string}. The
# raw base64 is decoded/validated lazily by apps.core.security.key_provider so a
# malformed key fails closed at use rather than silently.
DUENEST_KEKS = {}
for _kek_suffix in ("V1", "V2", "V3", "V4", "V5"):
    _kek_value = config(f"DUENEST_KEK_{_kek_suffix}_B64", default="")
    if _kek_value:
        DUENEST_KEKS[_kek_suffix.lower()] = _kek_value

# Secure password hashing. Django's default PBKDF2 is kept as the primary
# hasher (no extra dependency). Argon2 is the recommended future upgrade once
# `argon2-cffi` is installed and supported by the deployment environment; see
# docs/ENCRYPTION.md. Never store or reversibly encrypt passwords.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        # Cookie-first JWT auth (HttpOnly cookies); transparently falls back to
        # the Authorization: Bearer header for API/test clients. CSRF is enforced
        # only on the cookie path. See apps/users/cookie_auth.py.
        "apps.users.cookie_auth.CookieJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardResultsSetPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_THROTTLE_RATES": {
        "waitlist": _throttle_rate("5/hour"),
        "invite_validate": _throttle_rate("20/hour"),
        # Quick Share public access-code attempts (anti brute-force).
        "quick_share_code": _throttle_rate("10/min"),
        # Quick Share "Receive code" lookups (anti code-enumeration).
        "quick_share_receive": _throttle_rate("10/min"),
        # Recipient "request more time" pings (anti-spam to the owner).
        "quick_share_extension_request": _throttle_rate("5/min"),
        # Auth + public access-code brute-force protection.
        "login": _throttle_rate("10/min"),
        "register": _throttle_rate("10/hour"),
        # Password reset + email verification (anti enumeration / spam) — SEC-007.
        "password_reset": _throttle_rate("5/hour"),
        "password_reset_confirm": _throttle_rate("10/hour"),
        "email_verification": _throttle_rate("10/hour"),
        "share_file_code": _throttle_rate("10/min"),
        "emergency_code": _throttle_rate("10/min"),
        "room_code": _throttle_rate("10/min"),
        "feedback": _throttle_rate("20/hour"),
        # Promo-code validation attempts (anti brute-force / enumeration).
        "billing_promo": _throttle_rate("20/min"),
        # Client UI analytics events (anti-flood; high enough for normal use).
        "client_events": _throttle_rate("120/min"),
        # Anonymous client error-log submissions (anti log-flooding) — SEC-008.
        "client_error": _throttle_rate("30/min"),
        # Document scanner uploads (per authenticated user) — anti spam/abuse.
        "scanner_upload": _throttle_rate("30/min"),
        # Public access-code-bearing routes (metadata/preview/download/item).
        # Generous enough for legitimate multi-file viewing; the real brute-force
        # control is the per-resource lockout (apps.core.security.public_access).
        "public_access_code": _throttle_rate("60/min"),
        # Public organization document-request uploads (anti abuse / DoS).
        "public_document_upload": _throttle_rate("10/hour"),
        # AI "ask your documents" Q&A (per authenticated user) — bounds model cost.
        "ai_qa": _throttle_rate("20/min"),
        # AI drafting assistant (per authenticated user) — bounds model cost.
        "ai_draft": _throttle_rate("20/min"),
        # AI application pack copilot (per authenticated user) — bounds model cost.
        "ai_pack_copilot": _throttle_rate("15/min"),
        # AI proactive briefing (per authenticated user) — bounds model cost.
        "ai_briefing": _throttle_rate("10/min"),
        # AI conversational assistant (per authenticated user) — bounds model cost.
        "ai_chat": _throttle_rate("30/min"),
        # AI smart intake (per authenticated user) — bounds model cost.
        "ai_intake": _throttle_rate("15/min"),
    },
}

# ---------------------------------------------------------------------------
# Public access-code hardening (SEC-001). Repeated wrong codes for a single
# share link / emergency pack / secure room lock THAT resource (for everyone,
# not just one IP). Tunable per environment; state is cache-backed.
# ---------------------------------------------------------------------------
PUBLIC_ACCESS_CODE_MAX_ATTEMPTS = config(
    "PUBLIC_ACCESS_CODE_MAX_ATTEMPTS", default=8, cast=int
)
PUBLIC_ACCESS_CODE_LOCKOUT_MINUTES = config(
    "PUBLIC_ACCESS_CODE_LOCKOUT_MINUTES", default=15, cast=int
)
PUBLIC_ACCESS_CODE_BACKOFF_ENABLED = config(
    "PUBLIC_ACCESS_CODE_BACKOFF_ENABLED", default=True, cast=bool
)
# Minimum length enforced for owner-supplied access codes (generated codes are
# always stronger). Legacy codes are never re-validated, so they keep working.
PUBLIC_ACCESS_CODE_MIN_LENGTH = config(
    "PUBLIC_ACCESS_CODE_MIN_LENGTH", default=6, cast=int
)

# ---------------------------------------------------------------------------
# Public organization document-request uploads (SEC-003).
# ---------------------------------------------------------------------------
PUBLIC_DOCUMENT_REQUEST_MAX_SUBMISSIONS = config(
    "PUBLIC_DOCUMENT_REQUEST_MAX_SUBMISSIONS", default=20, cast=int
)
PUBLIC_DOCUMENT_REQUEST_MAX_TOTAL_MB = config(
    "PUBLIC_DOCUMENT_REQUEST_MAX_TOTAL_MB", default=50, cast=int
)

# Logging with a redaction filter so an accidental log of a token/code/key/
# header is scrubbed before it is written. Code should still avoid logging
# sensitive data; this is a defensive safety net.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "redact_sensitive": {
            "()": "apps.core.logging.SensitiveDataFilter",
        },
    },
    "formatters": {
        "standard": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
            "filters": ["redact_sensitive"],
        },
    },
    "root": {
        "handlers": ["console"],
        "level": config("DJANGO_LOG_LEVEL", default="INFO"),
    },
}

# ---------------------------------------------------------------------------
# Document scanner (camera capture -> PDF upload). See docs/DOCUMENT_SCANNER.md.
#
# Scanned PDFs flow through the SAME encrypted DocumentFile pipeline as normal
# uploads; these settings only gate the dedicated scanner upload entrypoint
# (validation limits, optional malware scanning, optional OCR).
# ---------------------------------------------------------------------------
SCANNER_MAX_UPLOAD_MB = config("SCANNER_MAX_UPLOAD_MB", default=15, cast=int)

# MIME types accepted by the scanner endpoint. The scanner produces PDFs in the
# browser; images are allowed as a fallback for direct import.
SCANNER_ALLOWED_MIME_TYPES = [
    t.strip()
    for t in config(
        "SCANNER_ALLOWED_MIME_TYPES",
        default="application/pdf,image/jpeg,image/png",
    ).split(",")
    if t.strip()
]

# OCR runs synchronously after storage and is best-effort: failures never block
# the upload unless SCANNER_OCR_REQUIRED is true. Heavy/large files are skipped.
SCANNER_OCR_ENABLED = config("SCANNER_OCR_ENABLED", default=True, cast=bool)
SCANNER_OCR_REQUIRED = config("SCANNER_OCR_REQUIRED", default=False, cast=bool)
SCANNER_OCR_TIMEOUT_SECONDS = config(
    "SCANNER_OCR_TIMEOUT_SECONDS", default=20, cast=int
)
SCANNER_OCR_MAX_PAGES = config("SCANNER_OCR_MAX_PAGES", default=10, cast=int)

# ClamAV malware scanning via the `clamd` client. Disabled by default for local
# dev; when enabled, CLAMD_FAIL_CLOSED decides whether a scanner/daemon error
# rejects the upload (recommended in production) or allows it through.
CLAMD_ENABLED = config("CLAMD_ENABLED", default=False, cast=bool)
CLAMD_SOCKET_PATH = config("CLAMD_SOCKET_PATH", default="/var/run/clamav/clamd.ctl")
CLAMD_FAIL_CLOSED = config("CLAMD_FAIL_CLOSED", default=True, cast=bool)

# Password reset / email verification token lifetimes (SEC-007). Django's
# PASSWORD_RESET_TIMEOUT (seconds) bounds the single-use reset token.
PASSWORD_RESET_TOKEN_HOURS = config("PASSWORD_RESET_TOKEN_HOURS", default=1, cast=int)
PASSWORD_RESET_TIMEOUT = PASSWORD_RESET_TOKEN_HOURS * 3600
EMAIL_VERIFICATION_TOKEN_HOURS = config(
    "EMAIL_VERIFICATION_TOKEN_HOURS", default=48, cast=int
)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(
        minutes=config("JWT_ACCESS_TOKEN_LIFETIME_MINUTES", default=15, cast=int)
    ),
    "REFRESH_TOKEN_LIFETIME": timedelta(
        days=config("JWT_REFRESH_TOKEN_LIFETIME_DAYS", default=7, cast=int)
    ),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# ===========================================================================
# Scale-ready lean foundation (see docs/deployment/scale-ready-lean-foundation.md)
#
# The app runs in two modes from the SAME codebase, switched purely by env:
#   * Lean mode (default): no Redis, no workers. Cache is per-process LocMem,
#     Celery tasks run inline (eager). Everything works locally with zero extra
#     services — `python manage.py runserver` is enough.
#   * Scale-ready mode: set REDIS_URL + ENABLE_REDIS_CACHE/ENABLE_BACKGROUND_JOBS
#     to route cache to Redis and tasks to real workers, with no code changes.
# ===========================================================================

# Deployment mode marker. local | staging | production. Informational + used by
# the slow-request logger and health checks; settings module still chooses the
# hard security posture (development.py vs production.py).
APP_ENV = config("APP_ENV", default="local")

# Redis is OPTIONAL. CACHE_URL falls back to REDIS_URL; the broker falls back to
# REDIS_URL too. When neither is set the app stays fully functional in lean mode.
REDIS_URL = config("REDIS_URL", default="")
CACHE_URL = config("CACHE_URL", default=REDIS_URL)

# ---- Cache backend (Redis when available, safe LocMem fallback) -----------
# ENABLE_REDIS_CACHE defaults to True only when a cache URL is actually present,
# so lean/local installs never need Redis. production.py fails closed if Redis
# cache is expected but unreachable.
ENABLE_REDIS_CACHE = config(
    "ENABLE_REDIS_CACHE", default=bool(CACHE_URL), cast=bool
)
# All app cache keys are namespaced with this prefix; combined with per-user /
# per-org key builders (apps.core.cache) this keeps tenants isolated and lets a
# shared Redis be used safely. NEVER cache decrypted file bytes or sensitive
# share/emergency payloads here (see the scale-ready doc's "what not to cache").
CACHE_KEY_PREFIX = config("CACHE_KEY_PREFIX", default="duenest")
CACHE_DEFAULT_TIMEOUT = config("CACHE_DEFAULT_TIMEOUT", default=300, cast=int)

if ENABLE_REDIS_CACHE and CACHE_URL:
    CACHES = {
        "default": {
            # Django 4.0+ ships a native Redis backend (needs the `redis` lib).
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": CACHE_URL,
            "KEY_PREFIX": CACHE_KEY_PREFIX,
            "TIMEOUT": CACHE_DEFAULT_TIMEOUT,
        }
    }
else:
    # Lean fallback: per-process memory. Fine for a single web dyno / local dev.
    # NOTE: LocMem is NOT shared across replicas, so the SEC-001 public-access
    # lockout and any rate state are per-process until Redis is enabled — this
    # is acceptable for single-instance lean staging and documented as such.
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": f"{CACHE_KEY_PREFIX}-locmem",
            "TIMEOUT": CACHE_DEFAULT_TIMEOUT,
        }
    }

# Short, conventional TTLs (seconds) for the safe cache targets. Centralised so
# they are easy to tune per environment and easy to audit.
CACHE_TTL_PLAN_CATALOG = config("CACHE_TTL_PLAN_CATALOG", default=3600, cast=int)
CACHE_TTL_FEATURE_FLAGS = config("CACHE_TTL_FEATURE_FLAGS", default=60, cast=int)
CACHE_TTL_ENTITLEMENTS = config("CACHE_TTL_ENTITLEMENTS", default=60, cast=int)
CACHE_TTL_DASHBOARD_SUMMARY = config("CACHE_TTL_DASHBOARD_SUMMARY", default=45, cast=int)
CACHE_TTL_UNREAD_COUNT = config("CACHE_TTL_UNREAD_COUNT", default=30, cast=int)
CACHE_TTL_FOUNDER_ROLLUP = config("CACHE_TTL_FOUNDER_ROLLUP", default=600, cast=int)

# ---- Background jobs (Celery) ---------------------------------------------
# ENABLE_BACKGROUND_JOBS gates whether tasks are dispatched to a real worker.
# When False (lean/local default) Celery runs tasks EAGERLY (inline, in-process)
# so no broker/worker is required and behaviour is identical to today.
ENABLE_BACKGROUND_JOBS = config("ENABLE_BACKGROUND_JOBS", default=False, cast=bool)
ENABLE_CELERY_BEAT = config("ENABLE_CELERY_BEAT", default=False, cast=bool)

CELERY_BROKER_URL = config("CELERY_BROKER_URL", default=REDIS_URL or "memory://")
CELERY_RESULT_BACKEND = config(
    "CELERY_RESULT_BACKEND",
    default=REDIS_URL or "cache+memory://",
)
# Eager mode = run inline + propagate errors (so lean mode behaves like a normal
# synchronous call). Real mode = dispatch to the broker/worker.
CELERY_TASK_ALWAYS_EAGER = not ENABLE_BACKGROUND_JOBS
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = config(
    "CELERY_WORKER_PREFETCH_MULTIPLIER", default=1, cast=int
)
CELERY_TASK_DEFAULT_QUEUE = "default"
# Named queues let a deployment scale workers per workload (e.g. a dedicated
# scanner/OCR worker) without touching code. See config/celery.py for routes.
CELERY_TASK_QUEUES_NAMES = (
    "critical",
    "email",
    "notifications",
    "push",
    "scanner",
    "files",
    "billing",
    "analytics",
    "default",
)
CELERY_TASK_TIME_LIMIT = config("CELERY_TASK_TIME_LIMIT", default=300, cast=int)
CELERY_TASK_SOFT_TIME_LIMIT = config(
    "CELERY_TASK_SOFT_TIME_LIMIT", default=240, cast=int
)
CELERY_TIMEZONE = TIME_ZONE
CELERY_ENABLE_UTC = True

# ---- Feature toggles for scale-ready subsystems ---------------------------
ENABLE_FOUNDER_ANALYTICS_ROLLUPS = config(
    "ENABLE_FOUNDER_ANALYTICS_ROLLUPS", default=False, cast=bool
)
# Scanner OCR/compression can be pushed to the `scanner` queue instead of
# blocking the web worker. Only meaningful when ENABLE_BACKGROUND_JOBS is on.
SCANNER_ASYNC_PROCESSING_ENABLED = config(
    "SCANNER_ASYNC_PROCESSING_ENABLED", default=False, cast=bool
)

# ---- OCR controls (env aliases over the existing SCANNER_OCR_* settings) ---
# The mission's OCR_* names map onto the scanner OCR knobs the security branch
# already added, so there is a single source of truth and no divergent caps.
OCR_ENABLED = config("OCR_ENABLED", default=SCANNER_OCR_ENABLED, cast=bool)
OCR_MAX_PAGES = config("OCR_MAX_PAGES", default=SCANNER_OCR_MAX_PAGES, cast=int)
OCR_TIMEOUT_SECONDS = config(
    "OCR_TIMEOUT_SECONDS", default=SCANNER_OCR_TIMEOUT_SECONDS, cast=int
)
# Re-bind the scanner OCR knobs to the unified values so existing call sites
# (apps/documents/scanner.py) automatically honour the OCR_* env vars too.
SCANNER_OCR_ENABLED = OCR_ENABLED
SCANNER_OCR_MAX_PAGES = OCR_MAX_PAGES
SCANNER_OCR_TIMEOUT_SECONDS = OCR_TIMEOUT_SECONDS

# ---- Observability --------------------------------------------------------
# Requests slower than this (ms) are logged with timing + path (never body) by
# apps.core.middleware.SlowRequestLogMiddleware. 0 disables it.
SLOW_REQUEST_MS = config("SLOW_REQUEST_MS", default=1000, cast=int)
# Downloads larger than this (bytes) emit a warning so the in-memory decrypt
# path (see file-delivery design note) is visible before it becomes a problem.
LARGE_FILE_DOWNLOAD_WARN_BYTES = config(
    "LARGE_FILE_DOWNLOAD_WARN_BYTES", default=8 * 1024 * 1024, cast=int
)
# Sentry is optional and only initialised when a DSN is provided (see
# config/observability.py, called from settings).
SENTRY_DSN = config("SENTRY_DSN", default="")
SENTRY_TRACES_SAMPLE_RATE = config(
    "SENTRY_TRACES_SAMPLE_RATE", default=0.0, cast=float
)

# Add the slow-request logger to the middleware chain (cheap; no-op when
# SLOW_REQUEST_MS <= 0). Placed last so it measures the full inner stack.
MIDDLEWARE = [*MIDDLEWARE, "apps.core.middleware.SlowRequestLogMiddleware"]

# Initialise Sentry if configured (safe no-op otherwise; never raises).
from config.observability import init_sentry  # noqa: E402

init_sentry(dsn=SENTRY_DSN, environment=APP_ENV, traces_sample_rate=SENTRY_TRACES_SAMPLE_RATE)
