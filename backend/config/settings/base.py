from datetime import timedelta
from pathlib import Path

import dj_database_url
from corsheaders.defaults import default_headers as cors_default_headers
import sys

from decouple import Csv, config

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
    "apps.notifications.apps.NotificationsConfig",
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
# TODO(production): switch to a private object-storage backend (e.g.
# S3-compatible) with signed, time-limited access instead of local disk.
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Email/reminder delivery. Local development defaults to console output; production
# can supply SMTP/Postmark/SendGrid/Mailgun SMTP settings without provider-specific
# code. Do not put secrets in source control.
EMAIL_BACKEND = config(
    "EMAIL_BACKEND", default="django.core.mail.backends.console.EmailBackend"
)
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="DueNest <noreply@localhost>")
SERVER_EMAIL = config("SERVER_EMAIL", default=DEFAULT_FROM_EMAIL)
EMAIL_HOST = config("EMAIL_HOST", default="")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
EMAIL_USE_SSL = config("EMAIL_USE_SSL", default=False, cast=bool)
EMAIL_TIMEOUT = config("EMAIL_TIMEOUT", default=10, cast=int)
DUENEST_APP_BASE_URL = config("DUENEST_APP_BASE_URL", default="http://localhost:3000")
NOTIFICATION_REMINDER_CATCHUP_DAYS = config(
    "NOTIFICATION_REMINDER_CATCHUP_DAYS", default=3, cast=int
)

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
        "rest_framework_simplejwt.authentication.JWTAuthentication",
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
        # Auth + public access-code brute-force protection.
        "login": _throttle_rate("10/min"),
        "register": _throttle_rate("10/hour"),
        "share_file_code": _throttle_rate("10/min"),
        "emergency_code": _throttle_rate("10/min"),
        "room_code": _throttle_rate("10/min"),
        "feedback": _throttle_rate("20/hour"),
    },
}

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
