"""
Plan-aware model routing (apps.ai.routing.resolve_allowed_ai_model).

Free → Haiku; Pro → Haiku by default (Sonnet only for heavier features when
enabled); founder/admin + system calls → operator-configured model. Opus is
never reachable for normal Free/Pro usage.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings

from apps.ai.routing import resolve_allowed_ai_model
from apps.billing.models import Plan, UserSubscription

User = get_user_model()

_MODELS = dict(
    AI_MODEL="claude-opus-4-8",  # operator/founder override (Opus)
    AI_MODEL_HAIKU="claude-haiku-4-5",
    AI_MODEL_SONNET="claude-sonnet-4-6",
)


@override_settings(**_MODELS)
class ModelRoutingTests(TestCase):
    def setUp(self):
        self.free = User.objects.create_user(
            username="rfree", email="rfree@x.com", password="StrongPass123!DN"
        )
        self.pro = User.objects.create_user(
            username="rpro", email="rpro@x.com", password="StrongPass123!DN"
        )
        UserSubscription.objects.create(
            user=self.pro, plan=Plan.objects.get(key="pro"),
            provider="manual", status="active", billing_interval="month",
        )
        self.founder = User.objects.create_user(
            username="rfounder", email="rfounder@x.com",
            password="StrongPass123!DN", is_staff=True,
        )

    def test_free_gets_haiku_only(self):
        self.assertEqual(
            resolve_allowed_ai_model(self.free, feature="document_qa"),
            "claude-haiku-4-5",
        )

    def test_free_never_gets_opus_even_if_requested(self):
        model = resolve_allowed_ai_model(
            self.free, feature="pack_copilot", requested_model="claude-opus-4-8"
        )
        self.assertEqual(model, "claude-haiku-4-5")
        self.assertNotIn("opus", model)

    def test_pro_defaults_to_haiku(self):
        self.assertEqual(
            resolve_allowed_ai_model(self.pro, feature="document_qa"),
            "claude-haiku-4-5",
        )

    def test_pro_never_gets_opus(self):
        model = resolve_allowed_ai_model(self.pro, feature="pack_copilot")
        self.assertNotIn("opus", model)

    @override_settings(**{**_MODELS, "AI_PRO_SONNET_ENABLED": False})
    def test_pro_heavy_feature_stays_haiku_when_sonnet_disabled(self):
        self.assertEqual(
            resolve_allowed_ai_model(self.pro, feature="pack_copilot"),
            "claude-haiku-4-5",
        )

    @override_settings(**{**_MODELS, "AI_PRO_SONNET_ENABLED": True})
    def test_pro_heavy_feature_uses_sonnet_when_enabled(self):
        self.assertEqual(
            resolve_allowed_ai_model(self.pro, feature="pack_copilot"),
            "claude-sonnet-4-6",
        )
        # A light feature still stays on Haiku even with Sonnet enabled.
        self.assertEqual(
            resolve_allowed_ai_model(self.pro, feature="document_qa"),
            "claude-haiku-4-5",
        )

    def test_founder_may_use_configured_override_model(self):
        self.assertEqual(
            resolve_allowed_ai_model(self.founder, feature="document_qa"),
            "claude-opus-4-8",
        )

    def test_system_calls_use_configured_model(self):
        # user=None (scheduled digests / operator scripts): no plan clamp.
        self.assertEqual(
            resolve_allowed_ai_model(None, feature="briefing"), "claude-opus-4-8"
        )
