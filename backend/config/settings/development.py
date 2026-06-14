import base64
import hashlib

from .base import *  # noqa: F401,F403

DEBUG = True

ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
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
