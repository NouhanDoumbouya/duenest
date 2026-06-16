import base64
import os

from .base import *  # noqa: F401,F403

DEBUG = False

# Tests exercise the manual billing provider (no Stripe credentials available).
BILLING_ALLOW_MANUAL_PROVIDER = True

# Existing founder tests grant access by is_staff; keep that here and assert the
# production allowlist behaviour explicitly via override_settings in SEC-009 tests.
FOUNDER_ALLOW_ALL_STAFF = True

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# Ephemeral, in-process encryption keys for the test run only. Generated fresh
# each run and never persisted, so runs are independent and no real key
# material is involved. A second version lets key rotation be exercised.
DUENEST_ACTIVE_KEK_VERSION = "v1"
DUENEST_KEKS = {
    "v1": base64.b64encode(os.urandom(32)).decode("ascii"),
    "v2": base64.b64encode(os.urandom(32)).decode("ascii"),
}
