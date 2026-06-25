"""
Integrations OAuth Foundation V1 — tests.

No real Google API is ever called: the provider's network methods are mocked.
The focus is the security contract — hashed single-use state, no open redirect,
encrypted token storage, no tokens in serializers or audit/operational metadata,
ownership isolation, and feature-flag gating.
"""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.features.models import FeatureFlag, Visibility

from .models import ConnectedIntegrationAccount, IntegrationOAuthState, Provider
from .oauth import DEFAULT_REDIRECT_PATH, create_oauth_state, hash_state, is_safe_redirect_path
from .providers.base import ProviderProfile, ProviderTokens, get_provider

User = get_user_model()

GOOGLE_CONFIG = dict(
    GOOGLE_OAUTH_CLIENT_ID="test-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET="test-client-secret",
    GOOGLE_OAUTH_REDIRECT_URI="https://api.test/integrations/google/callback/",
    FRONTEND_APP_URL="https://app.test",
)

FAKE_TOKENS = ProviderTokens(
    access_token="ya29.FAKE_ACCESS_TOKEN",
    refresh_token="1//FAKE_REFRESH_TOKEN",
    expires_at=None,
    scopes=["openid", "email", "profile", "https://www.googleapis.com/auth/drive.readonly"],
)
FAKE_PROFILE = ProviderProfile(
    account_id="google-sub-123", email="user@example.com", display_name="Test User"
)


def _enable_flags():
    for key in ("integrations", "google_integrations"):
        FeatureFlag.objects.update_or_create(
            key=key, defaults={"visibility": Visibility.ENABLED}
        )


@override_settings(**GOOGLE_CONFIG)
class IntegrationsBaseTest(APITestCase):
    def setUp(self):
        _enable_flags()
        self.user = User.objects.create_user(
            username="alice", email="alice@x.com", password="StrongPassword123!DN"
        )
        self.other = User.objects.create_user(
            username="bob", email="bob@x.com", password="StrongPassword123!DN"
        )


class ProvidersAndAccountsTests(IntegrationsBaseTest):
    def test_providers_lists_google_configured(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/v1/integrations/providers/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        providers = resp.data["providers"]
        google = next(p for p in providers if p["key"] == "google")
        self.assertTrue(google["configured"])
        self.assertTrue(google["available"])
        # Scope groups are described; Gmail is flagged privacy-sensitive.
        gmail = next(g for g in google["scope_groups"] if g["key"] == "gmail")
        self.assertTrue(gmail["privacy_sensitive"])

    @override_settings(GOOGLE_OAUTH_CLIENT_SECRET="", GOOGLE_OAUTH_REDIRECT_URI="")
    def test_providers_shows_not_configured_without_env(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/v1/integrations/providers/")
        google = next(p for p in resp.data["providers"] if p["key"] == "google")
        self.assertFalse(google["configured"])
        self.assertEqual(google["status"], "not_configured")

    def test_user_lists_only_own_accounts(self):
        ConnectedIntegrationAccount.objects.create(
            user=self.user, provider=Provider.GOOGLE, provider_account_id="a1"
        )
        ConnectedIntegrationAccount.objects.create(
            user=self.other, provider=Provider.GOOGLE, provider_account_id="b1"
        )
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/v1/integrations/accounts/")
        ids = {a["provider_account_id"] for a in resp.data["accounts"]}
        self.assertEqual(ids, {"a1"})

    def test_cannot_access_other_users_account(self):
        acct = ConnectedIntegrationAccount.objects.create(
            user=self.other, provider=Provider.GOOGLE, provider_account_id="b1"
        )
        self.client.force_authenticate(self.user)
        for url in (
            f"/api/v1/integrations/accounts/{acct.id}/health/",
        ):
            self.assertEqual(self.client.get(url).status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(
            self.client.post(
                f"/api/v1/integrations/accounts/{acct.id}/disconnect/"
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )


class OAuthStartTests(IntegrationsBaseTest):
    def test_start_creates_hashed_single_use_state(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/integrations/google/start/", {"scope_groups": ["drive"]}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        url = resp.data["authorization_url"]
        self.assertIn("accounts.google.com", url)
        # The raw state is in the URL but only its hash is persisted.
        raw_state = url.split("state=")[1].split("&")[0]
        row = IntegrationOAuthState.objects.get(user=self.user)
        self.assertEqual(row.state_hash, hash_state(raw_state))
        self.assertNotEqual(row.state_hash, raw_state)
        # Gmail scope must NOT be present when only Drive was chosen.
        self.assertNotIn("gmail", url)

    def test_start_does_not_request_gmail_by_default(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post("/api/v1/integrations/google/start/", {}, format="json")
        url = resp.data["authorization_url"]
        self.assertNotIn("gmail", url)
        row = IntegrationOAuthState.objects.get(user=self.user)
        self.assertNotIn("gmail", row.scope_groups)

    def test_start_rejects_unsafe_redirect_path(self):
        self.assertFalse(is_safe_redirect_path("//evil.com"))
        self.assertFalse(is_safe_redirect_path("https://evil.com"))
        self.assertFalse(is_safe_redirect_path("/x\\y"))
        self.assertTrue(is_safe_redirect_path("/dashboard/settings/integrations"))
        self.client.force_authenticate(self.user)
        self.client.post(
            "/api/v1/integrations/google/start/",
            {"redirect_path": "//evil.com"},
            format="json",
        )
        row = IntegrationOAuthState.objects.get(user=self.user)
        # Unsafe path is replaced by the safe default — never an open redirect.
        self.assertEqual(row.redirect_path, DEFAULT_REDIRECT_PATH)

    @override_settings(GOOGLE_OAUTH_CLIENT_SECRET="")
    def test_start_returns_not_configured(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post("/api/v1/integrations/google/start/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(resp.data["status"], "not_configured")


@override_settings(**GOOGLE_CONFIG)
class OAuthCallbackTests(IntegrationsBaseTest):
    def _start_state(self, scope_groups=None):
        raw, _ = create_oauth_state(
            user=self.user,
            provider=Provider.GOOGLE,
            scopes=["openid", "email", "profile"],
            scope_groups=scope_groups or ["drive"],
        )
        return raw

    def _callback(self, raw_state, code="auth-code-123"):
        google = get_provider("google")
        with patch.object(google, "exchange_code_for_tokens", return_value=FAKE_TOKENS), \
                patch.object(google, "get_profile", return_value=FAKE_PROFILE):
            return self.client.get(
                "/api/v1/integrations/google/callback/",
                {"code": code, "state": raw_state},
            )

    def test_callback_connects_and_stores_encrypted_tokens(self):
        raw = self._start_state()
        resp = self._callback(raw)
        self.assertEqual(resp.status_code, status.HTTP_302_FOUND)
        self.assertIn("status=connected", resp["Location"])
        # No token or code ever appears in the redirect URL.
        self.assertNotIn("FAKE_ACCESS_TOKEN", resp["Location"])
        self.assertNotIn("auth-code-123", resp["Location"])

        acct = ConnectedIntegrationAccount.objects.get(user=self.user)
        self.assertEqual(acct.status, ConnectedIntegrationAccount.Status.CONNECTED)
        self.assertEqual(acct.provider_email, "user@example.com")
        # Tokens are stored ENCRYPTED (ciphertext != plaintext) and decrypt back.
        self.assertTrue(acct.access_token_ciphertext)
        self.assertNotIn(b"FAKE_ACCESS_TOKEN", bytes(acct.access_token_ciphertext))
        self.assertEqual(acct.get_access_token(), "ya29.FAKE_ACCESS_TOKEN")
        self.assertEqual(acct.get_refresh_token(), "1//FAKE_REFRESH_TOKEN")

    def test_callback_rejects_invalid_state(self):
        resp = self._callback("not-a-real-state")
        self.assertEqual(resp.status_code, status.HTTP_302_FOUND)
        self.assertIn("status=error", resp["Location"])
        self.assertFalse(ConnectedIntegrationAccount.objects.exists())

    def test_callback_rejects_expired_state(self):
        raw = self._start_state()
        IntegrationOAuthState.objects.filter(user=self.user).update(
            expires_at=timezone.now() - timedelta(minutes=1)
        )
        resp = self._callback(raw)
        self.assertIn("status=error", resp["Location"])
        self.assertFalse(ConnectedIntegrationAccount.objects.exists())

    def test_callback_rejects_replayed_state(self):
        raw = self._start_state()
        first = self._callback(raw)
        self.assertIn("status=connected", first["Location"])
        # Second use of the same state must fail (single-use).
        second = self._callback(raw)
        self.assertIn("status=error", second["Location"])
        self.assertEqual(ConnectedIntegrationAccount.objects.count(), 1)

    def test_serialized_account_never_includes_tokens(self):
        raw = self._start_state()
        self._callback(raw)
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/v1/integrations/accounts/")
        account = resp.data["accounts"][0]
        for forbidden in (
            "access_token", "refresh_token", "access_token_ciphertext",
            "refresh_token_ciphertext",
        ):
            self.assertNotIn(forbidden, account)

    def test_audit_and_operational_metadata_have_no_secrets(self):
        from apps.documents.models import AuditLogEntry
        from apps.founder.models import OperationalEvent

        raw = self._start_state()
        self._callback(raw)

        def _blob(metadata):
            return " ".join(str(v) for v in (metadata or {}).values())

        for entry in AuditLogEntry.objects.filter(owner=self.user):
            keys = set(entry.metadata or {})
            self.assertEqual(keys & {"access_token", "refresh_token", "code", "state", "state_hash", "client_secret"}, set())
            blob = _blob(entry.metadata)
            self.assertNotIn("FAKE_ACCESS_TOKEN", blob)
            self.assertNotIn("FAKE_REFRESH_TOKEN", blob)
            self.assertNotIn("auth-code", blob)
        for ev in OperationalEvent.objects.all():
            blob = _blob(ev.metadata)
            self.assertNotIn("FAKE_ACCESS_TOKEN", blob)
            self.assertNotIn("FAKE_REFRESH_TOKEN", blob)


class DisconnectRefreshTests(IntegrationsBaseTest):
    def _account(self):
        acct = ConnectedIntegrationAccount.objects.create(
            user=self.user, provider=Provider.GOOGLE, provider_account_id="a1",
            status=ConnectedIntegrationAccount.Status.CONNECTED,
        )
        acct.set_tokens(access_token="acc", refresh_token="ref")
        acct.save()
        return acct

    @override_settings(**GOOGLE_CONFIG)
    def test_disconnect_marks_disconnected_and_clears_tokens(self):
        acct = self._account()
        self.client.force_authenticate(self.user)
        google = get_provider("google")
        with patch.object(google, "revoke", return_value=None) as revoke:
            resp = self.client.post(
                f"/api/v1/integrations/accounts/{acct.id}/disconnect/"
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        acct.refresh_from_db()
        self.assertEqual(acct.status, ConnectedIntegrationAccount.Status.DISCONNECTED)
        self.assertIsNotNone(acct.disconnected_at)
        self.assertFalse(acct.access_token_ciphertext)
        self.assertFalse(acct.refresh_token_ciphertext)
        revoke.assert_called()

    @override_settings(GOOGLE_OAUTH_CLIENT_SECRET="", GOOGLE_OAUTH_REDIRECT_URI="")
    def test_refresh_handles_missing_provider_config_safely(self):
        acct = self._account()
        self.client.force_authenticate(self.user)
        resp = self.client.post(f"/api/v1/integrations/accounts/{acct.id}/refresh/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["result"]["status"], "configuration_required")
        acct.refresh_from_db()
        self.assertEqual(acct.status, ConnectedIntegrationAccount.Status.ERROR)
        self.assertEqual(acct.last_error_code, "configuration_required")


class FeatureFlagGateTests(IntegrationsBaseTest):
    def test_disabled_flag_gates_endpoints(self):
        FeatureFlag.objects.update_or_create(
            key="integrations", defaults={"visibility": Visibility.DISABLED}
        )
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/v1/integrations/providers/")
        self.assertEqual(resp.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertEqual(resp.data["feature"], "integrations")

    def test_founder_only_flag_blocks_normal_user(self):
        FeatureFlag.objects.update_or_create(
            key="integrations", defaults={"visibility": Visibility.FOUNDER_ONLY}
        )
        self.client.force_authenticate(self.user)  # not staff
        self.assertEqual(
            self.client.get("/api/v1/integrations/accounts/").status_code,
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )
