from decouple import Csv, config

from .base import *  # noqa: F401,F403
from apps.core.security import key_provider

DEBUG = False

# Fail closed: refuse to start if the active file/field encryption KEK is
# missing or malformed, so we never silently run without encryption keys.
key_provider.validate_configuration()

# ---------------------------------------------------------------------------
# Static files (WhiteNoise) — serve hashed, compressed static assets from the
# app process without a separate web server. Media (uploaded documents) is NOT
# served this way; it stays in object storage behind authenticated endpoints.
# ---------------------------------------------------------------------------
MIDDLEWARE = list(MIDDLEWARE)  # noqa: F405
_security_index = MIDDLEWARE.index("django.middleware.security.SecurityMiddleware")
MIDDLEWARE.insert(_security_index + 1, "whitenoise.middleware.WhiteNoiseMiddleware")

STORAGES["staticfiles"] = {  # noqa: F405
    "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
}

# ---------------------------------------------------------------------------
# Transport security (terminated at the proxy/load balancer; SecurityMiddleware
# honours X-Forwarded-Proto). All values are env-driven so they can be tuned per
# environment without code changes.
# ---------------------------------------------------------------------------
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = config("DJANGO_SECURE_SSL_REDIRECT", default=True, cast=bool)

# HSTS — start conservative and only enable subdomains/preload when the whole
# domain is HTTPS-ready (avoid locking out subdomains prematurely).
SECURE_HSTS_SECONDS = config("DJANGO_HSTS_SECONDS", default=3600, cast=int)
SECURE_HSTS_INCLUDE_SUBDOMAINS = config(
    "DJANGO_HSTS_INCLUDE_SUBDOMAINS", default=False, cast=bool
)
SECURE_HSTS_PRELOAD = config("DJANGO_HSTS_PRELOAD", default=False, cast=bool)

# Cookies
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# Content / framing / referrer
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"

# CORS / CSRF — explicit allowlists in production (never allow-all).
# Cookie auth requires credentialed CORS (defaults to True now); origins must be
# an explicit allowlist (never "*") — enforced by never enabling allow-all.
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = config(
    "DJANGO_CORS_ALLOW_CREDENTIALS", default=True, cast=bool
)
CORS_ALLOWED_ORIGINS = config(
    "DJANGO_CORS_ALLOWED_ORIGINS", default="", cast=Csv()
)
CSRF_TRUSTED_ORIGINS = config(
    "DJANGO_CSRF_TRUSTED_ORIGINS", default="", cast=Csv()
)

# Auth cookies must be Secure in production regardless of the base default.
AUTH_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Content-Security-Policy applied by apps.core.middleware.SecurityHeadersMiddleware.
# Connect-src must include the API + any storage/analytics origins; tune via env.
CSP_CONNECT_EXTRA = config("DJANGO_CSP_CONNECT_SRC", default="", cast=Csv())
SECURITY_HEADERS_ENABLED = True
