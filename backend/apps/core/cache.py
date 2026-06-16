"""
Cache helpers with tenant-safe key construction.

The whole point of this module is to make it *hard* to accidentally leak one
user's (or one org's) cached data to another. Every per-user key includes the
user id and every per-org key includes the org id, so even on a shared Redis the
namespaces never collide.

HARD RULES (enforced by review + the docstrings here, see the scale-ready doc):
  * NEVER cache decrypted document bytes or any raw file response.
  * NEVER cache emergency-access / share-code-protected / token-gated payloads.
  * Only cache the safe targets: plan catalog, feature flags, entitlements,
    dashboard summary counts, unread counts, founder rollups — all small,
    non-sensitive, and short-TTL.

Works with whatever backend ``CACHES["default"]`` is — Redis in scale-ready
mode, LocMem in lean mode — so callers never branch on configuration.
"""

from __future__ import annotations

from typing import Any, Callable

from django.conf import settings
from django.core.cache import cache

# Namespace segment used by every key built here, on top of the backend-level
# KEY_PREFIX. Keeps DueNest keys grouped and greppable.
_NS = "dn"


def _prefix() -> str:
    return getattr(settings, "CACHE_KEY_PREFIX", "duenest")


def user_key(user_id: int | str, *parts: Any) -> str:
    """Build a per-user cache key. The user id is always embedded."""
    tail = ":".join(str(p) for p in parts)
    return f"{_prefix()}:{_NS}:u{user_id}:{tail}" if tail else f"{_prefix()}:{_NS}:u{user_id}"


def org_key(org_id: int | str, *parts: Any) -> str:
    """Build a per-organization cache key. The org id is always embedded."""
    tail = ":".join(str(p) for p in parts)
    return f"{_prefix()}:{_NS}:o{org_id}:{tail}" if tail else f"{_prefix()}:{_NS}:o{org_id}"


def global_key(*parts: Any) -> str:
    """Build a non-tenant (public/global) cache key, e.g. plan catalog, flags."""
    tail = ":".join(str(p) for p in parts)
    return f"{_prefix()}:{_NS}:g:{tail}"


def cached_call(key: str, timeout: int, producer: Callable[[], Any]) -> Any:
    """Return cache[key], or compute via ``producer()``, store, and return it.

    A thin get-or-set so call sites stay one-liners. ``producer`` is only run on
    a miss. Storing ``None`` is supported (uses a sentinel) so a legitimately
    empty result is still cached for the TTL rather than recomputed every call.
    """
    sentinel = object()
    value = cache.get(key, sentinel)
    if value is not sentinel:
        return None if value == _NONE else value
    produced = producer()
    cache.set(key, _NONE if produced is None else produced, timeout)
    return produced


# Marker stored in place of a real None so a cached None is distinguishable from
# a cache miss.
_NONE = "__dn_cached_none__"


def invalidate(*keys: str) -> None:
    """Delete one or more cache keys (e.g. after a write that changes them)."""
    for key in keys:
        cache.delete(key)


def cache_healthy() -> bool:
    """Round-trip a probe value to confirm the cache backend is reachable.

    Used by the health-check endpoint. Returns False instead of raising if the
    backend (Redis) is down, so the check can report degraded status cleanly.
    """
    probe = global_key("health", "probe")
    try:
        cache.set(probe, "ok", 10)
        return cache.get(probe) == "ok"
    except Exception:  # noqa: BLE001 - a down cache must not raise here
        return False
