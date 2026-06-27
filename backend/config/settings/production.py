from decouple import Csv, config

from .base import *  # noqa: F401,F403
from apps.core.security import key_provider
from apps.core.security.startup_checks import verify_production_security

DEBUG = False

# Founder tools are never granted to all staff in production — only superusers
# and the FOUNDER_EMAILS allowlist (SEC-009 / M-4). Hardcoded here so a stray
# FOUNDER_ALLOW_ALL_STAFF=true in the environment cannot widen access.
FOUNDER_ALLOW_ALL_STAFF = False

# Fail closed: refuse to start if the active file/field encryption KEK is
# missing or malformed, so we never silently run without encryption keys.
key_provider.validate_configuration()

# Fail closed on the remaining security-critical settings (SEC-010): a missing or
# dev-default SECRET_KEY (H-1) or AUDIT_LOG_HASH_SALT (M-3), or a left-on
# FOUNDER_ALLOW_ALL_STAFF (M-4), aborts startup instead of silently running with
# a publicly-known value.
verify_production_security(
    secret_key=SECRET_KEY,  # noqa: F405
    audit_salt=AUDIT_LOG_HASH_SALT,  # noqa: F405
    founder_allow_all_staff=FOUNDER_ALLOW_ALL_STAFF,
)

# Rate limits and public access-code lockouts are cache-backed. Under the default
# per-process LocMemCache they are NOT shared across workers/instances, so they
# fail OPEN the moment more than one process runs (SEC-012 operational note).
# This is a non-fatal warning so a single-instance lean deploy still boots.
if not ENABLE_REDIS_CACHE:  # noqa: F405
    import logging

    logging.getLogger("django.security").warning(
        "Production is running WITHOUT a shared Redis cache "
        "(ENABLE_REDIS_CACHE is off). Rate limits and public access-code "
        "lockouts will not be enforced across multiple processes/instances. "
        "Set ENABLE_REDIS_CACHE=true + REDIS_URL for any multi-instance deploy."
    )

# Billing fails closed in production via apps.billing.apps.BillingConfig.ready()
# (SEC-004): the unsigned manual provider must never be active here, and Stripe
# must have its keys. Manual mode stays available only in dev/test.
BILLING_ALLOW_MANUAL_PROVIDER = config(
    "BILLING_ALLOW_MANUAL_PROVIDER", default=False, cast=bool
)

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

# Cookies — Secure + HttpOnly always on in production.
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
AUTH_COOKIE_SECURE = True

# Cross-site cookie support. When the frontend (e.g. Vercel) and backend (e.g.
# Railway) are on DIFFERENT registrable domains, the auth/CSRF cookies must be
# SameSite=None (and Secure) for the browser to send them on cross-site XHR.
# Default "Lax" for a same-site deployment; set DJANGO_COOKIE_SAMESITE=None for
# the split Vercel/Railway staging. SameSite=None REQUIRES Secure (forced above).
_COOKIE_SAMESITE = (config("DJANGO_COOKIE_SAMESITE", default="Lax") or "Lax").strip()
if _COOKIE_SAMESITE.lower() == "none":
    _COOKIE_SAMESITE = "None"  # Django/browsers require the exact capitalization
SESSION_COOKIE_SAMESITE = _COOKIE_SAMESITE
CSRF_COOKIE_SAMESITE = _COOKIE_SAMESITE
AUTH_COOKIE_SAMESITE = _COOKIE_SAMESITE

# Content / framing / referrer
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"

# CORS / CSRF — explicit allowlists in production (never allow-all).
# Cookie auth requires credentialed CORS; origins must be an explicit allowlist
# (never "*"). To be forgiving of env-var naming, origins are read from several
# keys AND derived from FRONTEND_URL, with trailing slashes stripped (an origin
# must be scheme+host with no path/slash or django-cors-headers won't match it).
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = config(
    "DJANGO_CORS_ALLOW_CREDENTIALS", default=True, cast=bool
)


def _clean_origin(value):
    return (value or "").strip().rstrip("/")


def _collect_origins(*env_keys):
    """Merge origins from several possible env var names (de-duped, slash-stripped)."""
    out, seen = [], set()
    for key in env_keys:
        for raw in config(key, default="", cast=Csv()):
            origin = _clean_origin(raw)
            if origin and origin not in seen:
                seen.add(origin)
                out.append(origin)
    # Also accept a single FRONTEND_URL / DJANGO_FRONTEND_URL as an origin.
    for key in ("FRONTEND_URL", "DJANGO_FRONTEND_URL", "FRONTEND_APP_URL"):
        origin = _clean_origin(config(key, default=""))
        if origin and origin not in seen:
            seen.add(origin)
            out.append(origin)
    return out


CORS_ALLOWED_ORIGINS = _collect_origins(
    "DJANGO_CORS_ALLOWED_ORIGINS", "CORS_ALLOWED_ORIGINS"
)
CSRF_TRUSTED_ORIGINS = _collect_origins(
    "DJANGO_CSRF_TRUSTED_ORIGINS", "CSRF_TRUSTED_ORIGINS"
)

# Content-Security-Policy applied by apps.core.middleware.SecurityHeadersMiddleware.
# Connect-src must include the API + any storage/analytics origins; tune via env.
CSP_CONNECT_EXTRA = config("DJANGO_CSP_CONNECT_SRC", default="", cast=Csv())
SECURITY_HEADERS_ENABLED = True
