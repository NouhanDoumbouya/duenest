"""Tests for the key-gated AI foundation.

Two paths are covered, mirroring the email config/sender split:
  * the pure ``resolve_ai_settings`` resolver (no Django, no network), and
  * the ``generate`` wrapper — the *no-key* path is exercised for real, and the
    *key-present* path runs against a mocked Anthropic client (no network, no
    real key needed).
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

from django.test import SimpleTestCase, override_settings

from apps.ai import client as ai_client
from apps.ai.config import DEFAULT_MAX_TOKENS, DEFAULT_MODEL, resolve_ai_settings


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
