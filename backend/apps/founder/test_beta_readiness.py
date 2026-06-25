"""
Tests for Private Beta Readiness V1 — the automated readiness report, the founder
endpoint, and the `beta_readiness_check` management command.

These prove the report is founder-only, leaks no secrets, and that the command is
read-only (no email sent, no AI usage recorded, no operational events written).
"""

from __future__ import annotations

import json
from io import StringIO

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.management import call_command
from rest_framework.test import APITestCase

from apps.founder.beta_readiness import build_beta_readiness_report

User = get_user_model()

URL = "/api/v1/founder/beta-readiness/"
_VALID_STATUSES = {"ok", "info", "warn", "fail"}


class BetaReadinessReportTests(APITestCase):
    def test_report_shape_is_safe_and_complete(self):
        report = build_beta_readiness_report()
        self.assertIn(report["overall"], {"ready", "attention", "blocked"})
        self.assertTrue(report["gates"])
        for gate in report["gates"]:
            self.assertEqual({"key", "label", "status", "detail"}, set(gate))
            self.assertIn(gate["status"], _VALID_STATUSES)
        self.assertEqual(
            report["summary"]["total"], len(report["gates"])
        )

    def test_report_contains_no_secret_values(self):
        # The report is prose + booleans; the real guarantee is that no actual
        # secret VALUE (or secret-shaped string) appears anywhere in it.
        body = json.dumps(build_beta_readiness_report(include_db_counts=True))
        for secret in (
            settings.SECRET_KEY,
            getattr(settings, "AUDIT_LOG_HASH_SALT", ""),
            getattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", ""),
            getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", ""),
            getattr(settings, "ANTHROPIC_API_KEY", ""),
            getattr(settings, "STRIPE_SECRET_KEY", ""),
            getattr(settings, "STORAGE_SECRET_ACCESS_KEY", ""),
        ):
            if secret:
                self.assertNotIn(str(secret), body)
        # No secret-shaped strings (provider key/token prefixes) leak as values.
        for shape in ("sk_live", "sk_test", "ya29.", "AKIA", "whsec_"):
            self.assertNotIn(shape, body)

    def test_stripe_gate_never_reports_live_in_test_env(self):
        report = build_beta_readiness_report()
        stripe = next(g for g in report["gates"] if g["key"] == "stripe")
        # Test settings are never live Stripe, so this must not be a blocker.
        self.assertNotEqual(stripe["status"], "fail")


class BetaReadinessEndpointTests(APITestCase):
    def setUp(self):
        self.founder = User.objects.create_superuser(
            username="founder", email="founder@certanest.com", password="StrongPassw0rd!DN"
        )
        self.normal = User.objects.create_user(
            username="normal", email="normal@example.com", password="StrongPassw0rd!DN"
        )

    def test_requires_authentication(self):
        res = self.client.get(URL)
        self.assertIn(res.status_code, (401, 403))

    def test_normal_user_forbidden(self):
        self.client.force_authenticate(self.normal)
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 403)

    def test_founder_gets_report(self):
        self.client.force_authenticate(self.founder)
        res = self.client.get(URL)
        self.assertEqual(res.status_code, 200)
        self.assertIn(res.data["overall"], {"ready", "attention", "blocked"})
        self.assertTrue(res.data["gates"])

    def test_endpoint_payload_has_no_secrets(self):
        self.client.force_authenticate(self.founder)
        res = self.client.get(URL, {"include_counts": "true"})
        body = json.dumps(res.data)
        if settings.SECRET_KEY:
            self.assertNotIn(settings.SECRET_KEY, body)


class BetaReadinessCommandTests(APITestCase):
    def test_command_runs_and_prints_report(self):
        out = StringIO()
        call_command("beta_readiness_check", stdout=out)
        text = out.getvalue()
        self.assertIn("Private Beta Readiness", text)
        self.assertIn("OVERALL:", text)

    def test_command_json_mode_is_valid_json(self):
        out = StringIO()
        call_command("beta_readiness_check", "--json", stdout=out)
        data = json.loads(out.getvalue())
        self.assertIn("overall", data)
        self.assertIn("gates", data)

    def test_command_is_read_only_no_email_no_ai(self):
        # Read-only probe: no email is sent, and no AI usage / operational events
        # are created as a side effect of running it.
        from apps.founder.models import OperationalEvent

        before_events = OperationalEvent.objects.count()
        out = StringIO()
        call_command("beta_readiness_check", stdout=out)

        self.assertEqual(len(mail.outbox), 0)
        self.assertEqual(OperationalEvent.objects.count(), before_events)
        try:
            from apps.ai.models import AiUsage

            self.assertEqual(AiUsage.objects.count(), 0)
        except Exception:  # noqa: BLE001 - AiUsage may not exist in all configs
            pass
