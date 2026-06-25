"""
Scheduled Jobs & Background Operations V1 tests.

Covers the registry, the runner (success/failure/lock/skip), manual-run safety
(destructive + AI jobs not runnable from the console), dry-run safety, stale /
never-run detection, metadata scrubbing, command bridging, and founder-only API
gating + filters. No emails are sent and no AI is called (the test DB has no due
items and AI is not configured).
"""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.core.scheduled_jobs import all_jobs, get_job
from .job_runner import (
    JobNotRunnable,
    bridge_run,
    lock_key_for,
    run_scheduled_job,
)
from .job_status import build_jobs_summary, compute_health
from .models import OperationalEvent, ScheduledJobRun

User = get_user_model()

JOBS = "/api/v1/founder/jobs/"


def _user(username, **kw):
    return User.objects.create_user(
        username=username,
        email=f"{username}@example.com",
        password="StrongPassword123!DN",
        **kw,
    )


def _ok_work(*, dry_run=False, limit=None):
    return {"attempted": 3, "succeeded": 2, "skipped": 1, "failed": 0, "message": "ok"}


def _boom_work(*, dry_run=False, limit=None):
    raise RuntimeError("kaboom")


class RegistryTests(APITestCase):
    def test_registry_lists_known_jobs_only(self):
        names = {job.job_name for job in all_jobs()}
        self.assertIn("notification_delivery", names)
        self.assertIn("weekly_radar_email", names)
        self.assertIn("purge_expired_trash", names)
        # The AI digest job is registered for visibility but NOT runnable.
        ai = get_job("ai_briefing_digest")
        self.assertIsNotNone(ai)
        self.assertFalse(ai.is_manual_run_allowed)
        self.assertIsNone(ai.work_path)
        # The destructive job is not manually runnable.
        purge = get_job("purge_expired_trash")
        self.assertTrue(purge.is_destructive)
        self.assertFalse(purge.is_manual_run_allowed)
        self.assertTrue(purge.supports_dry_run)


class RunnerTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_successful_run_records_scheduledjobrun_and_event(self):
        result = run_scheduled_job(
            "purge_expired_trash", work=_ok_work, triggered_by="command"
        )
        run = ScheduledJobRun.objects.get(id=result["run_id"])
        self.assertEqual(run.status, ScheduledJobRun.Status.SUCCEEDED)
        self.assertEqual(run.attempted_count, 3)
        self.assertEqual(run.success_count, 2)
        self.assertEqual(run.skipped_count, 1)
        # A correlated operational event was recorded.
        self.assertTrue(
            OperationalEvent.objects.filter(
                category="scheduled_job", source="purge_expired_trash"
            ).exists()
        )
        # Lock was released.
        self.assertIsNone(cache.get(lock_key_for("purge_expired_trash")))

    def test_failed_run_records_failed_and_reraises(self):
        with self.assertRaises(RuntimeError):
            run_scheduled_job("purge_expired_trash", work=_boom_work)
        run = ScheduledJobRun.objects.latest("created_at")
        self.assertEqual(run.status, ScheduledJobRun.Status.FAILED)
        self.assertEqual(run.error_code, "RuntimeError")
        self.assertTrue(
            OperationalEvent.objects.filter(
                source="purge_expired_trash", status="failed"
            ).exists()
        )
        # Lock released even on failure.
        self.assertIsNone(cache.get(lock_key_for("purge_expired_trash")))

    def test_lock_prevents_concurrent_run(self):
        # Simulate another instance holding the lock.
        cache.add(lock_key_for("weekly_radar_email"), "1", 600)
        result = run_scheduled_job("weekly_radar_email", work=_ok_work)
        self.assertEqual(result["reason"], "already_running")
        run = ScheduledJobRun.objects.latest("created_at")
        self.assertEqual(run.status, ScheduledJobRun.Status.SKIPPED)
        self.assertEqual(run.error_code, "already_running")

    def test_metadata_is_scrubbed(self):
        def leaky_work(*, dry_run=False, limit=None):
            return {
                "succeeded": 1,
                "metadata": {"token": "RAW", "ocr_text": "x", "sent": 4},
            }

        run_scheduled_job("weekly_radar_email", work=leaky_work)
        run = ScheduledJobRun.objects.latest("created_at")
        self.assertEqual(run.metadata.get("token"), "[redacted]")
        self.assertEqual(run.metadata.get("ocr_text"), "[redacted]")
        self.assertEqual(run.metadata.get("sent"), 4)
        self.assertNotIn("RAW", str(run.metadata))

    def test_ai_digest_job_is_not_runnable_from_console(self):
        # No work_path → cannot be invoked standalone (guards AI cost).
        with self.assertRaises(JobNotRunnable):
            run_scheduled_job("ai_briefing_digest")

    def test_dry_run_does_not_persist_a_run(self):
        before = ScheduledJobRun.objects.count()
        result = run_scheduled_job(
            "purge_expired_trash", dry_run=True, work=_ok_work
        )
        self.assertTrue(result["dry_run"])
        self.assertEqual(ScheduledJobRun.objects.count(), before)


class StaleDetectionTests(APITestCase):
    def test_never_run_and_stale_and_healthy(self):
        weekly = get_job("weekly_radar_email")
        self.assertEqual(compute_health(weekly, None), "never_run")

        fresh = ScheduledJobRun.objects.create(
            job_name="weekly_radar_email",
            status=ScheduledJobRun.Status.SUCCEEDED,
            finished_at=timezone.now(),
        )
        self.assertEqual(compute_health(weekly, fresh), "healthy")

        old = ScheduledJobRun.objects.create(
            job_name="weekly_radar_email",
            status=ScheduledJobRun.Status.SUCCEEDED,
            finished_at=timezone.now() - timezone.timedelta(days=30),
        )
        self.assertEqual(compute_health(weekly, old), "stale")

        failed = ScheduledJobRun.objects.create(
            job_name="weekly_radar_email",
            status=ScheduledJobRun.Status.FAILED,
            finished_at=timezone.now(),
        )
        self.assertEqual(compute_health(weekly, failed), "failing")

    def test_summary_counts(self):
        summary = build_jobs_summary()
        self.assertEqual(summary["scheduled_jobs_total"], len(all_jobs()))
        # With no runs, everything (except disabled) is never_run.
        self.assertGreaterEqual(summary["scheduled_jobs_never_run"], 1)


@override_settings(FOUNDER_ALLOW_ALL_STAFF=False, FOUNDER_EMAILS=["boss@duenest.com"])
class FounderJobsApiTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.boss = User.objects.create_user(
            username="boss",
            email="boss@duenest.com",
            password="StrongPassword123!DN",
            is_staff=True,
        )

    def test_normal_user_cannot_view_jobs(self):
        self.client.force_authenticate(_user("normal"))
        self.assertEqual(self.client.get(JOBS).status_code, status.HTTP_403_FORBIDDEN)

    def test_founder_views_jobs_and_summary(self):
        self.client.force_authenticate(self.boss)
        resp = self.client.get(JOBS)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["jobs"]), len(all_jobs()))
        summary = self.client.get(f"{JOBS}summary/")
        self.assertEqual(summary.status_code, status.HTTP_200_OK)
        self.assertIn("scheduled_jobs_total", summary.data)

    def test_manual_run_rejects_destructive_and_ai_jobs(self):
        self.client.force_authenticate(self.boss)
        # Destructive (trash purge) — not runnable.
        self.assertEqual(
            self.client.post(f"{JOBS}purge_expired_trash/run/").status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        # AI digest — not runnable (would call AI).
        self.assertEqual(
            self.client.post(f"{JOBS}ai_briefing_digest/run/").status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_dry_run_trash_is_safe_and_nondestructive(self):
        # A trashed document past the cutoff must survive a dry-run.
        from apps.documents.models import Document

        owner = _user("owner")
        doc = Document.objects.create(
            owner=owner,
            title="old trashed doc",
            is_trashed=True,
            trashed_at=timezone.now() - timezone.timedelta(days=400),
        )
        self.client.force_authenticate(self.boss)
        resp = self.client.post(f"{JOBS}purge_expired_trash/dry-run/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data["dry_run"])
        # Nothing was deleted.
        self.assertTrue(Document.objects.filter(id=doc.id).exists())

    def test_runs_endpoint_filters_by_job(self):
        ScheduledJobRun.objects.create(
            job_name="weekly_radar_email", status=ScheduledJobRun.Status.SUCCEEDED
        )
        ScheduledJobRun.objects.create(
            job_name="purge_expired_trash", status=ScheduledJobRun.Status.SUCCEEDED
        )
        self.client.force_authenticate(self.boss)
        resp = self.client.get(f"{JOBS}weekly_radar_email/runs/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        names = {row["job_name"] for row in resp.data["results"]}
        self.assertEqual(names, {"weekly_radar_email"})

    def test_unknown_job_detail_404(self):
        self.client.force_authenticate(self.boss)
        self.assertEqual(
            self.client.get(f"{JOBS}nope/").status_code, status.HTTP_404_NOT_FOUND
        )


class CommandBridgeTests(APITestCase):
    def setUp(self):
        cache.clear()

    def test_trash_purge_command_records_run(self):
        call_command("purge_expired_trash")
        self.assertTrue(
            ScheduledJobRun.objects.filter(
                job_name="purge_expired_trash",
                status=ScheduledJobRun.Status.SUCCEEDED,
            ).exists()
        )

    def test_notification_delivery_runner_records_run(self):
        # Drive via the runner (no due items in a fresh DB → no emails sent).
        run_scheduled_job("notification_delivery", work=_ok_work, triggered_by="command")
        self.assertTrue(
            ScheduledJobRun.objects.filter(job_name="notification_delivery").exists()
        )

    def test_bridge_run_is_best_effort(self):
        # bridge_run must never raise even for an unknown job name.
        run = bridge_run("totally_unknown_job", status=ScheduledJobRun.Status.SUCCEEDED)
        self.assertTrue(run is None or run.job_name == "totally_unknown_job")
