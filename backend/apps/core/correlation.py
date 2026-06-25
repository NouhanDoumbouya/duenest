"""
Request correlation IDs for observability.

A correlation ID is a short, RANDOM, non-sensitive identifier attached to each
request. It lets a founder/admin tie a user-reported failure to the operational
events and logs for that request ("Reference: ABC123") WITHOUT exposing any
private data — it is never derived from a token, session, user id, or any secret.

The value is stored in a ContextVar so any code in the request's call stack
(services, recorders) can read it without threading it through every function.
"""

from __future__ import annotations

import contextvars
import re
import uuid

# Per-request correlation id. Empty string means "no request context".
_correlation_id: contextvars.ContextVar[str] = contextvars.ContextVar(
    "correlation_id", default=""
)

# A safe correlation id is short and alphanumeric/dash only. We accept a
# client-supplied X-Request-ID but sanitise it to this shape so an attacker can't
# inject header content or smuggle a token in as the "id".
_SAFE_ID = re.compile(r"[^A-Za-z0-9-]")
_MAX_LEN = 64


def new_correlation_id() -> str:
    """A fresh random correlation id (no PII, no secret material)."""
    return uuid.uuid4().hex[:32]


def sanitize_correlation_id(value: str | None) -> str:
    """Coerce an incoming id to the safe shape, or "" if nothing usable."""
    cleaned = _SAFE_ID.sub("", (value or "").strip())[:_MAX_LEN]
    return cleaned


def set_correlation_id(value: str) -> None:
    _correlation_id.set((value or "")[:_MAX_LEN])


def get_correlation_id() -> str:
    return _correlation_id.get()
