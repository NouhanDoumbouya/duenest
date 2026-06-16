"""
Public access-code hardening (SEC-001).

Public share links, emergency packs and secure rooms are protected by an
owner-set (or generated) access code. The dedicated *verify* endpoints were
rate-limited, but the *metadata / preview / download / item* endpoints also
accept the same ``X-Access-Code`` header — so an attacker holding a valid link
could brute-force the code through those routes.

This module centralises code handling so every code-accepting endpoint shares
the same controls:

* **Strong generation** — new codes are ambiguity-safe alphanumeric (not the
  old 6-digit numeric space).
* **Strength validation** — weak owner-supplied codes are rejected at creation.
* **Per-resource lockout** — repeated wrong codes for a *single* resource lock
  that resource for everyone (not only per-IP), with optional exponential
  backoff. State lives in the Django cache (no schema change, no plaintext).

Codes are only ever stored hashed (``make_password``); this module never logs or
persists raw codes. Verification stays backward compatible with existing hashes.

Cache backend note: the default ``LocMemCache`` is per-process. For a multi-
process production deployment configure a shared cache (Redis / database) so the
lockout (and DRF throttles) are enforced cluster-wide. See docs/security.
"""

from __future__ import annotations

import secrets
from dataclasses import dataclass

from django.conf import settings
from django.contrib.auth.hashers import check_password
from django.core.cache import cache

# Ambiguity-safe alphabet: no 0/O, 1/I/L, no vowels that form words.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_DEFAULT_CODE_LENGTH = 10

# A small denylist of trivially-guessable owner-supplied codes.
_WEAK_CODES = {
    "000000", "111111", "123456", "654321", "121212", "112233",
    "password", "letmein", "qwerty", "abc123", "000000000", "1234",
    "12345", "1234567", "12345678", "123456789", "11111111",
}


def normalize_access_code(code: str | None) -> str:
    """Trim surrounding whitespace from a supplied code. Case is preserved
    (generated codes are uppercase; owner codes may be case-sensitive)."""
    return (code or "").strip()


def generate_strong_access_code(length: int = _DEFAULT_CODE_LENGTH) -> str:
    """Return a high-entropy, ambiguity-safe access code.

    10 chars over a 31-symbol alphabet ≈ 49 bits of entropy — astronomically
    larger than the previous 6-digit (≈20-bit) numeric space.
    """
    length = max(8, int(length))
    return "".join(secrets.choice(_CODE_ALPHABET) for _ in range(length))


def validate_access_code_strength(code: str | None) -> tuple[bool, str]:
    """Validate an *owner-supplied* code at creation time.

    Returns ``(is_valid, error_message)``. Applied only on create — never on
    verification — so existing (possibly weaker) legacy codes keep working.
    """
    value = normalize_access_code(code)
    min_len = int(getattr(settings, "PUBLIC_ACCESS_CODE_MIN_LENGTH", 6))
    if len(value) < min_len:
        return False, f"Access code must be at least {min_len} characters."
    if value.lower() in _WEAK_CODES:
        return False, "That access code is too common. Choose a less guessable code."
    if len(set(value)) == 1:
        return False, "Access code is too simple. Use a mix of characters."
    return True, ""


# ---------------------------------------------------------------------------
# Per-resource lockout (cache-backed)
# ---------------------------------------------------------------------------

def _max_attempts() -> int:
    return int(getattr(settings, "PUBLIC_ACCESS_CODE_MAX_ATTEMPTS", 8))


def _lockout_seconds() -> int:
    return int(getattr(settings, "PUBLIC_ACCESS_CODE_LOCKOUT_MINUTES", 15)) * 60


def _backoff_enabled() -> bool:
    return bool(getattr(settings, "PUBLIC_ACCESS_CODE_BACKOFF_ENABLED", True))


def _fail_key(kind: str, identifier: str) -> str:
    return f"pac:{kind}:{identifier}:fails"


def _rounds_key(kind: str, identifier: str) -> str:
    return f"pac:{kind}:{identifier}:rounds"


def _lock_key(kind: str, identifier: str) -> str:
    return f"pac:{kind}:{identifier}:lock"


def lockout_retry_after(kind: str, identifier: str) -> int | None:
    """Seconds remaining on an active lockout, or None if not locked."""
    ttl = cache.ttl(_lock_key(kind, identifier)) if hasattr(cache, "ttl") else None
    if ttl:
        return int(ttl)
    # Backends without ttl() support: presence of the key implies locked.
    return _lockout_seconds() if cache.get(_lock_key(kind, identifier)) else None


def is_public_access_locked(kind: str, identifier: str) -> bool:
    return cache.get(_lock_key(kind, identifier)) is not None


def reset_public_access_code_failures(kind: str, identifier: str) -> None:
    """Clear failure/lockout state (call after a successful verification)."""
    cache.delete_many(
        [_fail_key(kind, identifier), _lock_key(kind, identifier)]
    )
    # Intentionally keep the rounds counter so a serial attacker who keeps
    # tripping the lock faces escalating backoff; it expires on its own TTL.


def record_public_access_code_failure(kind: str, identifier: str) -> bool:
    """Record one wrong-code attempt. Returns True if the resource is now
    locked. Applies exponential backoff to the lockout window when enabled."""
    fail_key = _fail_key(kind, identifier)
    window = _lockout_seconds()
    try:
        fails = cache.incr(fail_key)
    except ValueError:
        cache.set(fail_key, 1, timeout=window)
        fails = 1

    if fails >= _max_attempts():
        rounds = 1
        if _backoff_enabled():
            try:
                rounds = cache.incr(_rounds_key(kind, identifier))
            except ValueError:
                cache.set(_rounds_key(kind, identifier), 1, timeout=window * 8)
                rounds = 1
        lock_for = window * (2 ** (rounds - 1)) if _backoff_enabled() else window
        cache.set(_lock_key(kind, identifier), True, timeout=lock_for)
        cache.delete(fail_key)
        return True
    return False


# ---------------------------------------------------------------------------
# Unified verification
# ---------------------------------------------------------------------------

@dataclass
class AccessCodeResult:
    ok: bool
    state: str  # "ok" | "requires_code" | "wrong_code" | "locked"
    retry_after: int | None = None

    @property
    def is_wrong_code(self) -> bool:
        return self.state == "wrong_code"


_LOCKED = "Too many incorrect attempts. This link is temporarily locked. Try again later."


def check_public_access_code(
    *,
    kind: str,
    identifier: str,
    supplied_code: str | None,
    access_code_hash: str,
    required: bool = True,
) -> AccessCodeResult:
    """Verify a public access code with per-resource lockout.

    ``kind`` is a short namespace ("share", "emergency", "room", "quick_share").
    ``identifier`` is the resource's public token. Never pass internal PKs that
    would let an attacker correlate lockouts to existence.
    """
    if not required:
        return AccessCodeResult(ok=True, state="ok")

    if is_public_access_locked(kind, identifier):
        return AccessCodeResult(
            ok=False, state="locked",
            retry_after=lockout_retry_after(kind, identifier),
        )

    code = normalize_access_code(supplied_code)
    if not code:
        return AccessCodeResult(ok=False, state="requires_code")

    if access_code_hash and check_password(code, access_code_hash):
        reset_public_access_code_failures(kind, identifier)
        return AccessCodeResult(ok=True, state="ok")

    locked = record_public_access_code_failure(kind, identifier)
    if locked:
        return AccessCodeResult(
            ok=False, state="locked",
            retry_after=lockout_retry_after(kind, identifier),
        )
    return AccessCodeResult(ok=False, state="wrong_code")


def locked_detail() -> str:
    return _LOCKED
