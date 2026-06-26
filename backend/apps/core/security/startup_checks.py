"""
Fail-closed production configuration checks (SEC-010).

Several security-critical settings ship with *insecure development defaults* so
the app and the test suite run out of the box (a baked-in secret key, a known
audit-hash salt). Those defaults must never be active in production. The base
settings keep the convenient defaults; ``production.py`` calls
:func:`verify_production_security` at import time so the process **refuses to
start** when a critical value is missing or still set to its dev default —
mirroring how the encryption KEK and billing provider already fail closed.

This module imports no Django settings (so it is safe to import from
``base.py``) and the check function is pure, so it is easy to unit-test.
"""

from __future__ import annotations

from django.core.exceptions import ImproperlyConfigured

# Insecure development defaults. base.py uses these as the ``config(default=...)``
# fallbacks, and the production check rejects them, so the two can never drift.
INSECURE_DEV_SECRET_KEY = (
    "unsafe-dev-secret-key-change-me-for-local-development-only"
)
INSECURE_DEV_AUDIT_SALT = "dev-audit-salt-not-for-production"


def verify_production_security(
    *,
    secret_key: str,
    audit_salt: str,
    founder_allow_all_staff: bool,
) -> None:
    """Raise :class:`ImproperlyConfigured` if a critical prod value is unsafe.

    Catches the three fail-open settings the security audit flagged:

    * ``DJANGO_SECRET_KEY`` unset or still the public dev default (H-1) — would
      let an attacker forge session/reset/verification tokens.
    * ``AUDIT_LOG_HASH_SALT`` unset or still the public dev default (M-3) — would
      let a leaked audit table be de-anonymised with a known salt.
    * ``FOUNDER_ALLOW_ALL_STAFF`` left on (M-4) — would grant every staff account
      full founder/CRM/export/manual-billing power.
    """
    problems: list[str] = []

    if not secret_key or secret_key == INSECURE_DEV_SECRET_KEY:
        problems.append(
            "DJANGO_SECRET_KEY is unset or still uses the insecure development "
            "default — set a strong, unique value."
        )
    if not audit_salt or audit_salt == INSECURE_DEV_AUDIT_SALT:
        problems.append(
            "AUDIT_LOG_HASH_SALT is unset or still uses the insecure development "
            "default — set a strong, random value."
        )
    if founder_allow_all_staff:
        problems.append(
            "FOUNDER_ALLOW_ALL_STAFF must be False in production (use the "
            "FOUNDER_EMAILS allowlist instead)."
        )

    if problems:
        raise ImproperlyConfigured(
            "Refusing to start: insecure production configuration. "
            + " ".join(problems)
        )
