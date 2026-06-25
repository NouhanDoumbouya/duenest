"""
Reliability & Observability V1 tests.

Covers: the safe-metadata scrubbing of OperationalEvent, the best-effort
recorder, correlation-id middleware, the public health endpoint, founder-only
gating of the observability endpoints, event filtering + resolution, and that an
invalid public link records an operational event WITHOUT the raw token.
"""

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework import status
from rest_framework.test import APITestCase

from .models import OperationalEvent
from .services import record_operational_event

User = get_user_model()

HEALTH = "/api/v1/health/"
SYSTEM_STATUS = "/api/v1/founder/system-status/"
OBSERVABILITY = "/api/v1/founder/observability/"
EVENTS = "/api/v1/founder/operational-events/"


def _user(username, **kw):
    return User.objects.create_user(
        username=username,
        email=f"{username}@example.com",
        password="StrongPassword123!DN",
        **kw,
    )


class RecordOperationalEventTests(APITestCase):
    def test_scrubs_forbidden_metadata_keeps_safe_ids(self):
        record_operational_event(
            category="public_link",
            source="document_request_upload",
            status="failed",
            error_code="expired",
            message="link expired",
            metadata={
                "token": "RAW-PUBLIC-TOKEN",
                "ocr_text": "passport number 12345",
                "content": "secret document body",
                "content_type": "application/pdf",  # contains "content" → scrubbed
                "file_path": "/srv/r2/objects/abc",
                "file_size": 2048,
                "mime_type": "application/pdf",
                "request_id": 7,
            },
        )
        event = OperationalEvent.objects.latest("created_at")
        # Forbidden keys are redacted (the scrubber is deliberately broad — any
        # key containing token/ocr/content/file_path/… is dropped).
        self.assertEqual(event.metadata["token"], "[redacted]")
        self.assertEqual(event.metadata["ocr_text"], "[redacted]")
        self.assertEqual(event.metadata["content"], "[redacted]")
        self.assertEqual(event.metadata["content_type"], "[redacted]")
        self.assertEqual(event.metadata["file_path"], "[redacted]")
        # ...safe ids survive.
        self.assertEqual(event.metadata["file_size"], 2048)
        self.assertEqual(event.metadata["mime_type"], "application/pdf")
        self.assertEqual(event.metadata["request_id"], 7)
        # The raw token never appears anywhere on the row.
        self.assertNotIn("RAW-PUBLIC-TOKEN", str(event.metadata))
        self.assertNotIn("RAW-PUBLIC-TOKEN", event.message)

    def test_default_severity_from_status(self):
        record_operational_event(category="upload", source="x", status="failed")
        self.assertEqual(
            OperationalEvent.objects.latest("created_at").severity, "error"
        )
        record_operational_event(category="upload", source="x", status="skipped")
        self.assertEqual(
            OperationalEvent.objects.latest("created_at").severity, "info"
        )

    def test_recorder_never_raises(self):
        # A bad organization value must not bubble out of a best-effort recorder.
        before = OperationalEvent.objects.count()
        record_operational_event(
            category="storage", source="x", status="failed", organization=object()
        )
        # No exception; nothing forced to be written, but the call returned cleanly.
        self.assertGreaterEqual(OperationalEvent.objects.count(), before)


class CorrelationIdMiddlewareTests(APITestCase):
    def test_health_returns_safe_status_and_correlation_header(self):
        response = self.client.get(HEALTH)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "ok")
        # A correlation id is always present...
        self.assertTrue(response.headers.get("X-Request-ID"))
        # ...and the body carries no secret-looking keys.
        body = str(response.data).lower()
        for forbidden in ("token", "secret", "password", "api_key"):
            self.assertNotIn(forbidden, body)

    def test_incoming_request_id_is_sanitized_and_echoed(self):
        response = self.client.get(HEALTH, HTTP_X_REQUEST_ID="abc-123!!!<script>")
        # Non-alphanumeric/dash characters are stripped.
        self.assertEqual(response.headers.get("X-Request-ID"), "abc-123script")


@override_settings(FOUNDER_ALLOW_ALL_STAFF=False, FOUNDER_EMAILS=["boss@duenest.com"])
class ObservabilityPermissionTests(APITestCase):
    def setUp(self):
        self.boss = User.objects.create_user(
            username="boss",
            email="boss@duenest.com",
            password="StrongPassword123!DN",
            is_staff=True,
        )

    def test_normal_user_cannot_access_observability(self):
        self.client.force_authenticate(_user("normal"))
        self.assertEqual(
            self.client.get(SYSTEM_STATUS).status_code, status.HTTP_403_FORBIDDEN
        )
        self.assertEqual(
            self.client.get(OBSERVABILITY).status_code, status.HTTP_403_FORBIDDEN
        )
        self.assertEqual(
            self.client.get(EVENTS).status_code, status.HTTP_403_FORBIDDEN
        )

    def test_founder_system_status_shape(self):
        self.client.force_authenticate(self.boss)
        response = self.client.get(SYSTEM_STATUS)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn(response.data["overall"], ("ok", "degraded", "down"))
        self.assertIn("database", response.data["components"])
        self.assertIn("storage", response.data["components"])
        self.assertIn("email", response.data["components"])
        self.assertIn("ai", response.data["components"])
        # Never expose a bucket name or any secret in the status payload.
        body = str(response.data).lower()
        self.assertNotIn("secret", body)
        self.assertNotIn("access_key", body)

    def test_founder_observability_overview_shape(self):
        self.client.force_authenticate(self.boss)
        response = self.client.get(OBSERVABILITY)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for key in (
            "system_status",
            "recent_critical_events",
            "ai_health",
            "public_link_issues",
            "upload_storage_issues",
        ):
            self.assertIn(key, response.data)

    def test_event_list_filters_by_category_and_severity(self):
        record_operational_event(category="upload", source="a", status="failed")
        record_operational_event(category="email", source="b", status="failed")
        record_operational_event(
            category="public_link", source="c", status="skipped", severity="info"
        )
        self.client.force_authenticate(self.boss)

        upload = self.client.get(EVENTS, {"category": "upload"})
        self.assertEqual(upload.status_code, status.HTTP_200_OK)
        cats = {row["category"] for row in upload.data["results"]}
        self.assertEqual(cats, {"upload"})

        errors = self.client.get(EVENTS, {"severity": "error"})
        sevs = {row["severity"] for row in errors.data["results"]}
        self.assertEqual(sevs, {"error"})

    def test_resolve_requires_founder_and_records_resolver(self):
        record_operational_event(category="storage", source="x", status="failed")
        event = OperationalEvent.objects.latest("created_at")
        url = f"/api/v1/founder/operational-events/{event.id}/resolve/"

        # Normal user blocked.
        self.client.force_authenticate(_user("normal"))
        self.assertEqual(
            self.client.post(url, {}).status_code, status.HTTP_403_FORBIDDEN
        )

        # Founder resolves; resolver + note are recorded.
        self.client.force_authenticate(self.boss)
        response = self.client.post(url, {"resolution_note": "handled"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        event.refresh_from_db()
        self.assertTrue(event.resolved)
        self.assertEqual(event.resolved_by_id, self.boss.id)
        self.assertEqual(event.resolution_note, "handled")


class PublicLinkObservabilityTests(APITestCase):
    def test_invalid_document_request_link_records_event_without_token(self):
        before = OperationalEvent.objects.count()
        url = "/api/v1/public/document-request-links/NOT-A-REAL-TOKEN/upload/"
        response = self.client.post(url, {}, format="multipart")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        self.assertEqual(OperationalEvent.objects.count(), before + 1)
        event = OperationalEvent.objects.latest("created_at")
        self.assertEqual(event.category, "public_link")
        self.assertEqual(event.source, "document_request_upload")
        self.assertEqual(event.status, "failed")
        # The raw token is NEVER stored.
        self.assertNotIn("NOT-A-REAL-TOKEN", event.message)
        self.assertNotIn("NOT-A-REAL-TOKEN", str(event.metadata))
        self.assertNotIn("NOT-A-REAL-TOKEN", event.error_code)
