"""
Regression tests for the security hardening pass (SEC-010 … SEC-014).

Covers the fail-closed production config check, spoof-resistant client IP
resolution, the unified founder check, the heavy-endpoint throttle wiring, and
the removal of raw visitor IPs from owner-facing activity serializers.
"""

from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.test import RequestFactory, TestCase, override_settings

from apps.core.security.startup_checks import (
    INSECURE_DEV_AUDIT_SALT,
    INSECURE_DEV_SECRET_KEY,
    verify_production_security,
)
from apps.documents.services import client_ip

User = get_user_model()

_GOOD = dict(
    secret_key="a-strong-unique-production-secret",
    audit_salt="a-strong-random-audit-salt",
    founder_allow_all_staff=False,
)


class ProductionFailClosedTests(TestCase):
    """SEC-010 / H-1 / M-3 / M-4 — refuse to start on insecure prod config."""

    def test_good_config_does_not_raise(self):
        verify_production_security(**_GOOD)  # should not raise

    def test_dev_default_secret_key_is_rejected(self):
        with self.assertRaises(ImproperlyConfigured):
            verify_production_security(**{**_GOOD, "secret_key": INSECURE_DEV_SECRET_KEY})

    def test_empty_secret_key_is_rejected(self):
        with self.assertRaises(ImproperlyConfigured):
            verify_production_security(**{**_GOOD, "secret_key": ""})

    def test_dev_default_audit_salt_is_rejected(self):
        with self.assertRaises(ImproperlyConfigured):
            verify_production_security(**{**_GOOD, "audit_salt": INSECURE_DEV_AUDIT_SALT})

    def test_founder_allow_all_staff_on_is_rejected(self):
        with self.assertRaises(ImproperlyConfigured):
            verify_production_security(**{**_GOOD, "founder_allow_all_staff": True})

    def test_error_lists_every_problem_at_once(self):
        with self.assertRaises(ImproperlyConfigured) as ctx:
            verify_production_security(
                secret_key=INSECURE_DEV_SECRET_KEY,
                audit_salt=INSECURE_DEV_AUDIT_SALT,
                founder_allow_all_staff=True,
            )
        message = str(ctx.exception)
        self.assertIn("DJANGO_SECRET_KEY", message)
        self.assertIn("AUDIT_LOG_HASH_SALT", message)
        self.assertIn("FOUNDER_ALLOW_ALL_STAFF", message)


class ClientIpSpoofResistanceTests(TestCase):
    """SEC-011 / M-6 — X-Forwarded-For must not be client-spoofable."""

    def setUp(self):
        self.rf = RequestFactory()

    def _req(self, *, xff=None, remote="10.0.0.1"):
        meta = {"REMOTE_ADDR": remote}
        if xff is not None:
            meta["HTTP_X_FORWARDED_FOR"] = xff
        return self.rf.get("/", **meta)

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_single_proxy_takes_rightmost_not_spoofable_leftmost(self):
        # Client pre-set "1.2.3.4" (spoof); the LB appended the real peer.
        req = self._req(xff="1.2.3.4, 203.0.113.9")
        self.assertEqual(client_ip(req), "203.0.113.9")

    @override_settings(TRUSTED_PROXY_COUNT=2)
    def test_two_proxies_count_from_the_right(self):
        req = self._req(xff="1.2.3.4, 203.0.113.9, 10.0.0.5")
        self.assertEqual(client_ip(req), "203.0.113.9")

    @override_settings(TRUSTED_PROXY_COUNT=0)
    def test_zero_proxies_ignores_forwarded_header(self):
        req = self._req(xff="1.2.3.4", remote="198.51.100.7")
        self.assertEqual(client_ip(req), "198.51.100.7")

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_no_forwarded_header_uses_remote_addr(self):
        self.assertEqual(client_ip(self._req(remote="198.51.100.7")), "198.51.100.7")

    @override_settings(TRUSTED_PROXY_COUNT=3)
    def test_header_shorter_than_proxy_count_falls_back(self):
        # Fewer hops than expected → don't trust a too-short chain.
        req = self._req(xff="1.2.3.4", remote="198.51.100.7")
        self.assertEqual(client_ip(req), "198.51.100.7")


class UnifiedFounderCheckTests(TestCase):
    """SEC-009 / M-5 — feature-flag is_founder uses the strict allowlist rule."""

    def test_flags_is_founder_delegates_to_founder_permissions(self):
        from apps.features.flags import is_founder as flags_is_founder
        from apps.founder.permissions import is_founder as strict_is_founder

        # Same object identity not required, but behaviour must match exactly.
        for user in (
            User.objects.create_user("super", "s@x.com", "pw", is_superuser=True, is_staff=True),
            User.objects.create_user("staff", "t@x.com", "pw", is_staff=True),
            User.objects.create_user("plain", "p@x.com", "pw"),
        ):
            self.assertEqual(flags_is_founder(user), strict_is_founder(user))

    @override_settings(FOUNDER_ALLOW_ALL_STAFF=False, FOUNDER_EMAILS=[])
    def test_plain_staff_is_not_a_founder_under_prod_rules(self):
        from apps.features.flags import is_founder

        staff = User.objects.create_user("s2", "s2@x.com", "pw", is_staff=True)
        self.assertFalse(is_founder(staff))  # weak "any staff" rule is gone

    @override_settings(FOUNDER_ALLOW_ALL_STAFF=False, FOUNDER_EMAILS=[])
    def test_superuser_is_always_a_founder(self):
        from apps.features.flags import is_founder

        su = User.objects.create_user("su", "su@x.com", "pw", is_superuser=True, is_staff=True)
        self.assertTrue(is_founder(su))


class ThrottleWiringTests(TestCase):
    """SEC-012 / H-2 — heavy endpoints declare a tight per-user throttle."""

    def test_heavy_views_declare_scoped_throttles(self):
        from rest_framework.throttling import ScopedRateThrottle

        from apps.documents import views

        cases = {
            views.DocumentsBulkExportView: "document_export",
            views.DocumentBundleExportMergedPdfView: "document_export",
            views.ProtectedCopyGenerateView: "protected_copy",
            views.DocumentFileFillSignView: "fill_sign",
        }
        for view_cls, scope in cases.items():
            self.assertIn(ScopedRateThrottle, view_cls.throttle_classes, view_cls.__name__)
            self.assertEqual(view_cls.throttle_scope, scope, view_cls.__name__)

    def test_heavy_scopes_have_configured_rates(self):
        from django.conf import settings

        rates = settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"]
        for scope in ("document_export", "protected_copy", "fill_sign"):
            self.assertIn(scope, rates)
            self.assertTrue(rates[scope])


class ActivitySerializerPrivacyTests(TestCase):
    """SEC-014 / M-2 — raw visitor IPs are never serialized to owners."""

    def test_activity_serializers_omit_ip_address(self):
        from apps.documents.serializers import (
            DocumentFileActivitySerializer,
            RoomActivitySerializer,
        )

        self.assertNotIn("ip_address", DocumentFileActivitySerializer().fields)
        self.assertNotIn("ip_address", RoomActivitySerializer().fields)
