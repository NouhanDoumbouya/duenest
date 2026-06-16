import base64
import hashlib

from .base import *  # noqa: F401,F403

DEBUG = True

ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

# Recommended dev setup: open the app at any host (localhost / 127.0.0.1 / LAN
# IP) and let Next proxy /api/v1/* to this backend (see frontend/next.config.ts +
# NEXT_PUBLIC_API_BASE_URL=/api/v1). That keeps the auth cookies first-party.
#
# If you open the app from a LAN IP (e.g. http://172.16.114.9:3000), add that
# origin so Django trusts it for CSRF on authenticated writes:
#   DJANGO_DEV_EXTRA_ORIGINS=http://172.16.114.9:3000
_DEV_EXTRA_ORIGINS = config("DJANGO_DEV_EXTRA_ORIGINS", default="", cast=Csv())  # noqa: F405

# Manual billing (no real payments) is fine for local development.
BILLING_ALLOW_MANUAL_PROVIDER = True

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    *_DEV_EXTRA_ORIGINS,
]
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    *_DEV_EXTRA_ORIGINS,
]

# Local development / test encryption key. If a real key is provided via the
# environment it is used; otherwise a DETERMINISTIC, INSECURE dev-only key is
# derived so the app and the test suite work out of the box. This deterministic
# key is for local development ONLY and must never be used in production
# (production.py loads keys from the environment and fails closed without them).
if not DUENEST_KEKS:  # noqa: F405
    _dev_kek = base64.b64encode(
        hashlib.sha256(b"duenest-insecure-local-dev-kek-v1").digest()
    ).decode("ascii")
    DUENEST_ACTIVE_KEK_VERSION = "v1"
    DUENEST_KEKS = {"v1": _dev_kek}
