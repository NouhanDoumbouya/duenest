import base64
import os

from .base import *  # noqa: F401,F403

DEBUG = False

# The broad default User/Anon throttle backstop is a production safeguard. In the
# test suite every anonymous request shares one 127.0.0.1 bucket, so leave the
# global default off for deterministic runs — the per-endpoint ScopedRateThrottle
# limits (login, exports, public access codes, …) stay active and are tested
# directly. See SEC-012.
REST_FRAMEWORK = {**REST_FRAMEWORK, "DEFAULT_THROTTLE_CLASSES": ()}  # noqa: F405

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
