"""Tests for the tenant-safe cache helpers and the readiness probe."""

from __future__ import annotations

from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse

from apps.core import cache as cache_helpers


class CacheKeyIsolationTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_user_keys_are_namespaced_per_user(self):
        k1 = cache_helpers.user_key(1, "dashboard", "summary")
        k2 = cache_helpers.user_key(2, "dashboard", "summary")
        self.assertNotEqual(k1, k2)
        self.assertIn("u1", k1)
        self.assertIn("u2", k2)

    def test_one_users_cached_value_never_leaks_to_another(self):
        cache.set(cache_helpers.user_key(1, "unread"), 5, 30)
        # A different user must miss — different key entirely.
        self.assertEqual(cache.get(cache_helpers.user_key(2, "unread")), None)
        self.assertEqual(cache.get(cache_helpers.user_key(1, "unread")), 5)

    def test_org_keys_are_namespaced_per_org(self):
        self.assertNotEqual(
            cache_helpers.org_key(10, "members"),
            cache_helpers.org_key(11, "members"),
        )

    def test_cached_call_computes_once_then_serves_from_cache(self):
        calls = {"n": 0}

        def producer():
            calls["n"] += 1
            return {"value": 42}

        key = cache_helpers.global_key("test", "compute")
        first = cache_helpers.cached_call(key, 60, producer)
        second = cache_helpers.cached_call(key, 60, producer)
        self.assertEqual(first, {"value": 42})
        self.assertEqual(second, {"value": 42})
        self.assertEqual(calls["n"], 1)  # producer ran only on the miss

    def test_cached_call_caches_none_result(self):
        calls = {"n": 0}

        def producer():
            calls["n"] += 1
            return None

        key = cache_helpers.global_key("test", "none")
        self.assertIsNone(cache_helpers.cached_call(key, 60, producer))
        self.assertIsNone(cache_helpers.cached_call(key, 60, producer))
        self.assertEqual(calls["n"], 1)

    def test_invalidate_removes_key(self):
        key = cache_helpers.global_key("test", "drop")
        cache.set(key, "x", 60)
        cache_helpers.invalidate(key)
        self.assertIsNone(cache.get(key))

    def test_cache_healthy_roundtrips_on_locmem_fallback(self):
        # The default test cache is LocMem (no Redis configured) — the fallback
        # path must still report healthy.
        self.assertTrue(cache_helpers.cache_healthy())


class ReadinessProbeTests(TestCase):
    def test_readiness_reports_db_and_cache_ok(self):
        resp = self.client.get(reverse("readiness-check"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "ok")
        self.assertTrue(resp.data["checks"]["database"])
        self.assertTrue(resp.data["checks"]["cache"])
