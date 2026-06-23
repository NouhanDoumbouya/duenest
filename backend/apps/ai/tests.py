"""Tests for the key-gated AI foundation.

Two paths are covered, mirroring the email config/sender split:
  * the pure ``resolve_ai_settings`` resolver (no Django, no network), and
  * the ``generate`` wrapper — the *no-key* path is exercised for real, and the
    *key-present* path runs against a mocked Anthropic client (no network, no
    real key needed).
"""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase, override_settings

from apps.ai import client as ai_client
from apps.ai.config import (
    DEFAULT_MAX_TOKENS,
    DEFAULT_MODEL,
    estimate_cost_usd,
    resolve_ai_settings,
)
from apps.ai.models import AiUsage


def _get_from(values: dict):
    """Build a getter (key, default) -> value over a dict, like config()."""
    return lambda key, default="": values.get(key, default)


def _fake_response(*, text="", stop_reason="end_turn", model="claude-opus-4-8"):
    """A minimal stand-in for an Anthropic Messages API response."""
    content = [SimpleNamespace(type="text", text=text)] if text else []
    return SimpleNamespace(
        content=content,
        stop_reason=stop_reason,
        model=model,
        usage=SimpleNamespace(input_tokens=10, output_tokens=5),
    )


def _fake_anthropic(response=None, *, raise_on_create=None):
    """A fake ``anthropic`` module whose client returns ``response``."""
    create = mock.Mock()
    if raise_on_create is not None:
        create.side_effect = raise_on_create
    else:
        create.return_value = response
    instance = SimpleNamespace(messages=SimpleNamespace(create=create))
    module = SimpleNamespace(Anthropic=mock.Mock(return_value=instance))
    return module, create


class ResolveAiSettingsTests(SimpleTestCase):
    def test_no_key_is_not_configured(self):
        settings = resolve_ai_settings(_get_from({}))
        self.assertFalse(settings["AI_CONFIGURED"])
        self.assertEqual(settings["ANTHROPIC_API_KEY"], "")
        self.assertEqual(settings["AI_MODEL"], DEFAULT_MODEL)
        self.assertEqual(settings["AI_MAX_TOKENS"], DEFAULT_MAX_TOKENS)

    def test_key_activates_configured_with_defaults(self):
        settings = resolve_ai_settings(_get_from({"ANTHROPIC_API_KEY": "sk-test"}))
        self.assertTrue(settings["AI_CONFIGURED"])
        self.assertEqual(settings["AI_PROVIDER"], "anthropic")
        self.assertEqual(settings["AI_MODEL"], DEFAULT_MODEL)

    def test_overrides_are_honoured(self):
        settings = resolve_ai_settings(
            _get_from(
                {
                    "ANTHROPIC_API_KEY": "sk-test",
                    "AI_MODEL": "claude-haiku-4-5",
                    "AI_MAX_TOKENS": "1024",
                }
            )
        )
        self.assertEqual(settings["AI_MODEL"], "claude-haiku-4-5")
        self.assertEqual(settings["AI_MAX_TOKENS"], 1024)

    def test_bad_max_tokens_falls_back_to_default(self):
        settings = resolve_ai_settings(
            _get_from({"ANTHROPIC_API_KEY": "sk-test", "AI_MAX_TOKENS": "not-an-int"})
        )
        self.assertEqual(settings["AI_MAX_TOKENS"], DEFAULT_MAX_TOKENS)

    def test_unknown_provider_is_not_configured_even_with_key(self):
        settings = resolve_ai_settings(
            _get_from({"AI_PROVIDER": "openai", "ANTHROPIC_API_KEY": "sk-test"})
        )
        self.assertFalse(settings["AI_CONFIGURED"])


@override_settings(
    AI_CONFIGURED=True,
    ANTHROPIC_API_KEY="sk-test",
    AI_MODEL="claude-opus-4-8",
    AI_MAX_TOKENS=4096,
    # This class tests the provider wrapper only — keep metering/guard off so it
    # stays DB-free (SimpleTestCase). Cost control is covered in MeteringTests.
    AI_USAGE_METERING_ENABLED=False,
    AI_BUDGET_GUARD_ENABLED=False,
)
class GenerateConfiguredTests(SimpleTestCase):
    def test_successful_text_generation(self):
        module, create = _fake_anthropic(_fake_response(text="Hello there"))
        with mock.patch.object(ai_client, "_load_anthropic", return_value=module):
            result = ai_client.generate(prompt="hi", system="be brief")

        self.assertTrue(result.ok)
        self.assertEqual(result.reason, "ok")
        self.assertEqual(result.text, "Hello there")
        self.assertEqual(result.usage["output_tokens"], 5)
        # system + the configured model/max_tokens were forwarded
        _, kwargs = create.call_args
        self.assertEqual(kwargs["model"], "claude-opus-4-8")
        self.assertEqual(kwargs["max_tokens"], 4096)
        self.assertEqual(kwargs["system"], "be brief")
        self.assertNotIn("output_config", kwargs)

    def test_structured_output_is_parsed(self):
        module, create = _fake_anthropic(_fake_response(text='{"expiry": "2027-01-01"}'))
        schema = {"type": "object", "properties": {"expiry": {"type": "string"}}}
        with mock.patch.object(ai_client, "_load_anthropic", return_value=module):
            result = ai_client.generate(prompt="extract", output_schema=schema)

        self.assertTrue(result.ok)
        self.assertEqual(result.data, {"expiry": "2027-01-01"})
        _, kwargs = create.call_args
        self.assertEqual(
            kwargs["output_config"]["format"]["type"], "json_schema"
        )

    def test_invalid_json_with_schema_is_an_error(self):
        module, _ = _fake_anthropic(_fake_response(text="not json"))
        schema = {"type": "object"}
        with mock.patch.object(ai_client, "_load_anthropic", return_value=module):
            result = ai_client.generate(prompt="x", output_schema=schema)

        self.assertFalse(result.ok)
        self.assertEqual(result.reason, "error")

    def test_refusal_is_reported_not_raised(self):
        module, _ = _fake_anthropic(_fake_response(text="", stop_reason="refusal"))
        with mock.patch.object(ai_client, "_load_anthropic", return_value=module):
            result = ai_client.generate(prompt="x")

        self.assertFalse(result.ok)
        self.assertEqual(result.reason, "refusal")

    def test_transport_error_is_swallowed(self):
        module, _ = _fake_anthropic(raise_on_create=RuntimeError("boom"))
        with mock.patch.object(ai_client, "_load_anthropic", return_value=module):
            result = ai_client.generate(prompt="x")

        self.assertFalse(result.ok)
        self.assertEqual(result.reason, "error")

    def test_missing_sdk_degrades_gracefully(self):
        with mock.patch.object(
            ai_client, "_load_anthropic", side_effect=ImportError
        ):
            result = ai_client.generate(prompt="x")

        self.assertFalse(result.ok)
        self.assertEqual(result.reason, "sdk_missing")


class GenerateNotConfiguredTests(SimpleTestCase):
    @override_settings(AI_CONFIGURED=False)
    def test_no_key_returns_not_configured_without_touching_sdk(self):
        # _load_anthropic must NOT be called when AI is unconfigured.
        with mock.patch.object(ai_client, "_load_anthropic") as load:
            result = ai_client.generate(prompt="x")

        load.assert_not_called()
        self.assertFalse(result.ok)
        self.assertEqual(result.reason, "not_configured")

    @override_settings(AI_CONFIGURED=False)
    def test_ai_available_reflects_setting(self):
        self.assertFalse(ai_client.ai_available())


class EstimateCostTests(SimpleTestCase):
    """The offline pricing estimator (no DB, no network)."""

    def test_known_model_estimates_from_tokens(self):
        # opus: $15/Mtok in, $75/Mtok out -> 10*15e-6 + 5*75e-6
        cost = estimate_cost_usd("claude-opus-4-8", 10, 5)
        self.assertEqual(cost, Decimal("0.000525"))

    def test_unknown_model_is_zero(self):
        self.assertEqual(estimate_cost_usd("mystery-model-9", 1000, 1000), Decimal("0"))

    def test_haiku_is_cheaper_than_opus(self):
        self.assertLess(
            estimate_cost_usd("claude-haiku-4-5", 1000, 1000),
            estimate_cost_usd("claude-opus-4-8", 1000, 1000),
        )


@override_settings(
    AI_CONFIGURED=True,
    ANTHROPIC_API_KEY="sk-secret-should-never-leak",
    AI_MODEL="claude-opus-4-8",
    AI_MAX_TOKENS=4096,
    AI_USAGE_METERING_ENABLED=True,
    AI_BUDGET_GUARD_ENABLED=True,
    # Generous caps by default; per-test overrides exercise each cap.
    AI_DAILY_TOKEN_CAP_USER=1_000_000,
    AI_DAILY_TOKEN_CAP_GLOBAL=1_000_000,
    AI_MONTHLY_COST_LIMIT_USD=Decimal("1000"),
)
class MeteringAndBudgetTests(TestCase):
    """Usage metering + budget guard at the provider chokepoint (DB-backed)."""

    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="meter", email="meter@example.com", password="StrongPass123!DN"
        )

    def _run(self, *, response=None, raise_on_create=None, **kwargs):
        if response is None and raise_on_create is None:
            response = _fake_response(text="hi")
        module, create = _fake_anthropic(response, raise_on_create=raise_on_create)
        with mock.patch.object(ai_client, "_load_anthropic", return_value=module):
            result = ai_client.generate(
                prompt="x", user=self.user, feature="document_qa", **kwargs
            )
        return result, create

    # 1 + 2 + 3: success writes exactly one row with tokens + estimated cost.
    def test_success_records_one_usage_row(self):
        result, _ = self._run(response=_fake_response(text="hi"))
        self.assertTrue(result.ok)
        rows = AiUsage.objects.all()
        self.assertEqual(rows.count(), 1)
        row = rows.first()
        self.assertEqual(row.status, "success")
        self.assertEqual(row.feature, "document_qa")
        self.assertEqual(row.user, self.user)
        self.assertEqual(row.input_tokens, 10)
        self.assertEqual(row.output_tokens, 5)
        self.assertEqual(row.total_tokens, 15)
        self.assertEqual(row.estimated_cost_usd, Decimal("0.000525"))

    # 4: unknown model records zero cost but still records the tokens.
    def test_unknown_model_records_tokens_zero_cost(self):
        resp = _fake_response(text="hi", model="mystery-model-9")
        result, _ = self._run(response=resp)
        self.assertTrue(result.ok)
        row = AiUsage.objects.get()
        self.assertEqual(row.total_tokens, 15)
        self.assertEqual(row.estimated_cost_usd, Decimal("0"))

    # 5: over the per-user daily token cap blocks and never calls Anthropic.
    @override_settings(AI_DAILY_TOKEN_CAP_USER=10)
    def test_over_user_daily_cap_blocks(self):
        AiUsage.objects.create(
            user=self.user, feature="document_qa", status="success", total_tokens=50
        )
        result, create = self._run()
        create.assert_not_called()
        self.assertFalse(result.ok)
        self.assertEqual(result.reason, "budget")
        blocked = AiUsage.objects.filter(status="blocked")
        self.assertEqual(blocked.count(), 1)
        self.assertEqual(blocked.first().reason, "budget")
        self.assertEqual(blocked.first().metadata.get("cap"), "user_daily")

    # 6: over the global daily token cap blocks (even a different user).
    @override_settings(AI_DAILY_TOKEN_CAP_GLOBAL=10)
    def test_over_global_daily_cap_blocks(self):
        other = get_user_model().objects.create_user(
            username="other", email="o@example.com", password="StrongPass123!DN"
        )
        AiUsage.objects.create(
            user=other, feature="document_qa", status="success", total_tokens=50
        )
        result, create = self._run()
        create.assert_not_called()
        self.assertEqual(result.reason, "budget")
        self.assertEqual(
            AiUsage.objects.filter(status="blocked").first().metadata.get("cap"),
            "global_daily",
        )

    # 7: over the monthly estimated-cost cap blocks.
    @override_settings(AI_MONTHLY_COST_LIMIT_USD=Decimal("0.0001"))
    def test_over_monthly_cost_cap_blocks(self):
        AiUsage.objects.create(
            user=self.user,
            feature="document_qa",
            status="success",
            total_tokens=10,
            estimated_cost_usd=Decimal("0.01"),
        )
        result, create = self._run()
        create.assert_not_called()
        self.assertEqual(result.reason, "budget")
        self.assertEqual(
            AiUsage.objects.filter(status="blocked").first().metadata.get("cap"),
            "monthly_cost",
        )

    # 8: blocked attempts are recorded with status=blocked, reason=budget, 0 tokens.
    @override_settings(AI_DAILY_TOKEN_CAP_USER=0)
    def test_blocked_row_shape(self):
        result, create = self._run()
        create.assert_not_called()
        row = AiUsage.objects.get()
        self.assertEqual(row.status, "blocked")
        self.assertEqual(row.reason, "budget")
        self.assertEqual(row.total_tokens, 0)
        self.assertEqual(row.estimated_cost_usd, Decimal("0"))

    # 9: a provider error is handled safely, records an error row, leaks no key.
    def test_provider_error_is_safe_and_recorded(self):
        boom = RuntimeError("upstream failed with key sk-secret-should-never-leak")
        result, _ = self._run(raise_on_create=boom)
        self.assertFalse(result.ok)
        self.assertEqual(result.reason, "error")
        row = AiUsage.objects.get()
        self.assertEqual(row.status, "error")
        self.assertEqual(row.reason, "provider_error")
        # No secret stored anywhere on the row.
        blob = f"{row.reason}{row.model}{row.metadata}"
        self.assertNotIn("sk-secret", blob)

    # 10: a metering write failure must NOT break generate().
    def test_metering_write_failure_does_not_break_generate(self):
        module, create = _fake_anthropic(_fake_response(text="hi"))
        with mock.patch.object(ai_client, "_load_anthropic", return_value=module):
            with mock.patch.object(
                AiUsage.objects, "create", side_effect=RuntimeError("db down")
            ):
                result = ai_client.generate(
                    prompt="x", user=self.user, feature="document_qa"
                )
        self.assertTrue(result.ok)
        self.assertEqual(result.text, "hi")
        # Nothing persisted, but the call still succeeded.
        self.assertEqual(AiUsage.objects.count(), 0)

    # Budget check that fails to read the DB must fail closed (block, not spend).
    def test_budget_check_failure_fails_closed(self):
        from apps.ai import metering

        with mock.patch.object(
            metering, "check_budget", return_value="budget"
        ):
            result, create = self._run()
        create.assert_not_called()
        self.assertFalse(result.ok)
        self.assertEqual(result.reason, "budget")
