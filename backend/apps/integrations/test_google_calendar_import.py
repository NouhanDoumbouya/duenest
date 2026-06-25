"""
Google Calendar import V1 — backend tests.

The Google provider is always mocked: no test ever makes a real Google API call.
The suite proves the import is manual, read-only, privacy-safe (no tokens, no raw
API bodies, no event descriptions stored or logged), idempotent, plan-limit
respecting, and that each imported event becomes a real CertaNest deadline +
reminder.
"""

from __future__ import annotations

from datetime import date, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APITestCase

from apps.documents.models import (
    AuditLogEntry,
    Document,
    DocumentReminderRule,
)
from apps.documents.services import reminder_date_for_rule
from apps.features.models import FeatureFlag, Visibility
from apps.founder.models import OperationalEvent
from apps.integrations.models import (
    ConnectedIntegrationAccount,
    ImportedCalendarEvent,
    Provider,
)
from apps.integrations.providers.base import get_provider

User = get_user_model()

GOOGLE_CONFIG = dict(
    GOOGLE_OAUTH_CLIENT_ID="test-client-id",
    GOOGLE_OAUTH_CLIENT_SECRET="test-client-secret",
    GOOGLE_OAUTH_REDIRECT_URI="https://api.test/integrations/google/callback/",
    FRONTEND_APP_URL="https://app.test",
)

CAL_URL = "/api/v1/integrations/google-calendar/calendars/"
EVENTS_URL = "/api/v1/integrations/google-calendar/events/"
DEST_URL = "/api/v1/integrations/google-calendar/destinations/"
PREVIEW_URL = "/api/v1/integrations/google-calendar/import/preview/"
IMPORT_URL = "/api/v1/integrations/google-calendar/import/"

# Safe calendar/event payloads — exactly what the provider's builders produce.
CAL_FIXTURE = [
    {
        "provider_calendar_id": "primary",
        "name": "Work",
        "primary": True,
        "access_role": "owner",
        "time_zone": "UTC",
    }
]


def _event(provider_event_id: str, title: str, start_date: str, **extra) -> dict:
    base = {
        "provider_event_id": provider_event_id,
        "calendar_id": "primary",
        "provider_calendar_id": "primary",
        "title": title,
        "start": f"{start_date}T09:00:00Z",
        "end": f"{start_date}T10:00:00Z",
        "start_date": start_date,
        "all_day": False,
        "location": "",
        "status": "confirmed",
        "updated": "",
        "recurring": False,
    }
    base.update(extra)
    return base


def _enable_flags():
    for key in ("integrations", "google_integrations", "google_calendar_import"):
        FeatureFlag.objects.update_or_create(
            key=key, defaults={"visibility": Visibility.ENABLED}
        )


@override_settings(**GOOGLE_CONFIG)
class GoogleCalendarImportTests(APITestCase):
    def setUp(self):
        _enable_flags()
        self.user = User.objects.create_user(
            username="owner", email="owner@example.com", password="StrongPassw0rd!DN"
        )
        self.account = self._account_for(self.user, "sub-1", "owner@example.com")
        self.other = User.objects.create_user(
            username="intruder", email="intruder@example.com", password="StrongPassw0rd!DN"
        )
        self.other_account = self._account_for(self.other, "sub-2", "intruder@example.com")
        self.google = get_provider("google")

    def _account_for(self, user, sub, email):
        account = ConnectedIntegrationAccount.objects.create(
            user=user,
            provider=Provider.GOOGLE,
            provider_account_id=sub,
            provider_email=email,
            status=ConnectedIntegrationAccount.Status.CONNECTED,
            token_expires_at=timezone.now() + timedelta(hours=1),
        )
        account.set_tokens(access_token="ya29.FAKE_ACCESS", refresh_token="1//FAKE_REFRESH")
        account.save()
        return account

    # ---- auth / ownership / configuration -------------------------------

    def test_calendars_requires_authentication(self):
        res = self.client.get(CAL_URL, {"account_id": self.account.id})
        self.assertIn(res.status_code, (401, 403))

    def test_unknown_account_returns_404(self):
        self.client.force_authenticate(self.user)
        res = self.client.get(CAL_URL, {"account_id": 999999})
        self.assertEqual(res.status_code, 404)

    def test_cannot_use_another_users_account(self):
        self.client.force_authenticate(self.user)
        res = self.client.get(CAL_URL, {"account_id": self.other_account.id})
        self.assertEqual(res.status_code, 404)

    @override_settings(GOOGLE_OAUTH_CLIENT_ID="", GOOGLE_OAUTH_CLIENT_SECRET="", GOOGLE_OAUTH_REDIRECT_URI="")
    def test_provider_not_configured_returns_safe_error(self):
        self.client.force_authenticate(self.user)
        res = self.client.get(CAL_URL, {"account_id": self.account.id})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["status"], "not_configured")

    # ---- listing (safe metadata) ----------------------------------------

    def test_calendar_list_returns_safe_metadata(self):
        self.client.force_authenticate(self.user)
        with mock.patch.object(self.google, "list_calendars", return_value=CAL_FIXTURE) as m:
            res = self.client.get(CAL_URL, {"account_id": self.account.id})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["calendars"], CAL_FIXTURE)
        # The provider was called with a token, never the test asserting on it.
        self.assertTrue(m.called)

    def test_event_list_returns_safe_metadata_and_annotates_imported(self):
        self.client.force_authenticate(self.user)
        ImportedCalendarEvent.objects.create(
            owner=self.user, account=self.account, provider=Provider.GOOGLE,
            provider_calendar_id="primary", provider_event_id="evt-old",
            sanitized_title="Old", event_start_date=date(2026, 8, 1),
        )
        provider_result = {
            "events": [_event("evt-old", "Old", "2026-08-01"), _event("evt-new", "New", "2026-09-01")],
            "next_page_token": "",
        }
        with mock.patch.object(self.google, "list_calendar_events", return_value=provider_result):
            res = self.client.get(EVENTS_URL, {"account_id": self.account.id, "calendar_id": "primary"})
        self.assertEqual(res.status_code, 200)
        by_id = {e["provider_event_id"]: e for e in res.data["events"]}
        self.assertTrue(by_id["evt-old"]["already_imported"])
        self.assertFalse(by_id["evt-new"]["already_imported"])
        for e in res.data["events"]:
            self.assertNotIn("description", e)
            self.assertNotIn("attendees", e)

    def test_destinations_lists_deadline_as_available(self):
        self.client.force_authenticate(self.user)
        res = self.client.get(DEST_URL)
        self.assertEqual(res.status_code, 200)
        deadline = next(d for d in res.data["destinations"] if d["type"] == "deadline")
        self.assertTrue(deadline["available"])
        # Org/case destinations are honestly marked unavailable in V1.
        self.assertTrue(any(d["type"] == "case" and not d["available"] for d in res.data["destinations"]))

    # ---- preview --------------------------------------------------------

    def test_preview_detects_already_imported(self):
        self.client.force_authenticate(self.user)
        ImportedCalendarEvent.objects.create(
            owner=self.user, account=self.account, provider=Provider.GOOGLE,
            provider_calendar_id="primary", provider_event_id="evt-old",
            sanitized_title="Old", event_start_date=date(2026, 8, 1),
        )
        body = {
            "account_id": self.account.id,
            "events": [_event("evt-old", "Old", "2026-08-01"), _event("evt-new", "New", "2026-09-01")],
            "destination": {"type": "deadline"},
        }
        res = self.client.post(PREVIEW_URL, body, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["importable_count"], 1)
        self.assertEqual(res.data["skipped_count"], 1)

    # ---- import ---------------------------------------------------------

    def test_import_creates_deadline_and_reminder(self):
        self.client.force_authenticate(self.user)
        body = {
            "account_id": self.account.id,
            "events": [_event("evt-1", "Scholarship deadline", "2026-08-20")],
            "destination": {"type": "deadline"},
        }
        res = self.client.post(IMPORT_URL, body, format="json")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["imported_count"], 1)

        doc = Document.objects.get(owner=self.user, title="Scholarship deadline")
        self.assertEqual(doc.expiry_date, date(2026, 8, 20))
        self.assertFalse(doc.is_trashed)
        rule = DocumentReminderRule.objects.get(document=doc)
        self.assertEqual(rule.trigger_type, DocumentReminderRule.TriggerType.ON_EXPIRY)
        self.assertTrue(
            ImportedCalendarEvent.objects.filter(
                owner=self.user, provider_event_id="evt-1"
            ).exists()
        )

    def test_imported_reminder_fires_on_event_date(self):
        self.client.force_authenticate(self.user)
        body = {
            "account_id": self.account.id,
            "events": [_event("evt-1", "Visa appointment", "2026-08-20")],
            "destination": {"type": "deadline"},
        }
        self.client.post(IMPORT_URL, body, format="json")
        rule = DocumentReminderRule.objects.get(owner=self.user)
        # on_expiry + days_before 0 => reminder date == the event's date.
        self.assertEqual(reminder_date_for_rule(rule), date(2026, 8, 20))

    def test_import_with_lead_days_uses_before_expiry(self):
        self.client.force_authenticate(self.user)
        body = {
            "account_id": self.account.id,
            "events": [_event("evt-1", "Deadline", "2026-08-20")],
            "destination": {"type": "deadline", "reminder_lead_days": 7},
        }
        self.client.post(IMPORT_URL, body, format="json")
        rule = DocumentReminderRule.objects.get(owner=self.user)
        self.assertEqual(rule.trigger_type, DocumentReminderRule.TriggerType.BEFORE_EXPIRY)
        self.assertEqual(rule.days_before, 7)
        self.assertEqual(reminder_date_for_rule(rule), date(2026, 8, 13))

    def test_import_skips_duplicate_by_default(self):
        self.client.force_authenticate(self.user)
        body = {
            "account_id": self.account.id,
            "events": [_event("evt-1", "Deadline", "2026-08-20")],
            "destination": {"type": "deadline"},
        }
        self.client.post(IMPORT_URL, body, format="json")
        res = self.client.post(IMPORT_URL, body, format="json")
        self.assertEqual(res.data["imported_count"], 0)
        self.assertEqual(res.data["skipped_count"], 1)
        self.assertEqual(res.data["results"][0]["reason"], "already_imported")
        self.assertEqual(Document.objects.filter(owner=self.user).count(), 1)

    def test_partial_import_returns_per_event_results(self):
        self.client.force_authenticate(self.user)
        good = _event("evt-good", "Good", "2026-08-20")
        bad = _event("evt-bad", "Bad", "")  # no parseable date
        bad["start"] = ""
        body = {
            "account_id": self.account.id,
            "events": [good, bad],
            "destination": {"type": "deadline"},
        }
        res = self.client.post(IMPORT_URL, body, format="json")
        self.assertEqual(res.data["imported_count"], 1)
        self.assertEqual(res.data["failed_count"], 1)
        statuses = {r["provider_event_id"]: r["status"] for r in res.data["results"]}
        self.assertEqual(statuses["evt-good"], "imported")
        self.assertEqual(statuses["evt-bad"], "failed")

    def test_import_respects_plan_limits(self):
        self.client.force_authenticate(self.user)
        from apps.documents.plan_usage import PlanLimitExceeded

        body = {
            "account_id": self.account.id,
            "events": [_event("evt-1", "Deadline", "2026-08-20")],
            "destination": {"type": "deadline"},
        }
        with mock.patch(
            "apps.documents.plan_usage.enforce_plan_limit",
            side_effect=PlanLimitExceeded(resource="reminders", limit=10, plan="free"),
        ):
            res = self.client.post(IMPORT_URL, body, format="json")
        self.assertEqual(res.data["failed_count"], 1)
        self.assertEqual(res.data["results"][0]["reason"], "plan_limit_reached")
        self.assertFalse(Document.objects.filter(owner=self.user).exists())

    def test_unsupported_destination_rejected(self):
        self.client.force_authenticate(self.user)
        body = {
            "account_id": self.account.id,
            "events": [_event("evt-1", "Deadline", "2026-08-20")],
            "destination": {"type": "case"},
        }
        res = self.client.post(IMPORT_URL, body, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.data["status"], "destination_not_supported")

    # ---- observability + privacy ----------------------------------------

    def test_audit_and_operational_events_recorded_safely(self):
        self.client.force_authenticate(self.user)
        body = {
            "account_id": self.account.id,
            "events": [_event("evt-1", "Scholarship deadline", "2026-08-20")],
            "destination": {"type": "deadline"},
        }
        self.client.post(IMPORT_URL, body, format="json")

        audit_types = set(
            AuditLogEntry.objects.filter(owner=self.user).values_list("event_type", flat=True)
        )
        self.assertIn("google_calendar_import_started", audit_types)
        self.assertIn("google_calendar_event_imported", audit_types)
        self.assertIn("google_calendar_import_completed", audit_types)

        op_sources = set(
            OperationalEvent.objects.values_list("source", flat=True)
        )
        self.assertIn("google_calendar_import", op_sources)

    def test_no_tokens_or_descriptions_stored_anywhere(self):
        self.client.force_authenticate(self.user)
        body = {
            "account_id": self.account.id,
            "events": [
                _event(
                    "evt-1", "Scholarship deadline", "2026-08-20",
                    # A hostile client could echo extra keys; they must never persist.
                    description="SUPER SECRET MEDICAL HISTORY",
                )
            ],
            "destination": {"type": "deadline"},
        }
        self.client.post(IMPORT_URL, body, format="json")

        blobs = []
        for entry in AuditLogEntry.objects.all():
            blobs.append(str(entry.metadata))
        for ev in OperationalEvent.objects.all():
            blobs.append(str(ev.metadata))
        for imp in ImportedCalendarEvent.objects.all():
            blobs.append(imp.sanitized_title)
        haystack = " ".join(blobs)
        for forbidden in ("ya29.FAKE_ACCESS", "1//FAKE_REFRESH", "SUPER SECRET", "access_token", "refresh_token"):
            self.assertNotIn(forbidden, haystack)
