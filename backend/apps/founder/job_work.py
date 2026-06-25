"""
Uniform "work" adapters for scheduled jobs.

Each adapter has the signature `work(*, dry_run: bool, limit: int | None = None)`
and returns a small **safe** result dict — `{attempted, succeeded, skipped,
failed, message, metadata}` — by calling the existing, already-tested service
function for that job. The job runner records counts/status from this; the
underlying business logic is unchanged. Adapters never return tokens, contents,
or other sensitive data — only integer tallies and short safe strings.
"""

from __future__ import annotations


def _result(
    *,
    attempted: int = 0,
    succeeded: int = 0,
    skipped: int = 0,
    failed: int = 0,
    message: str = "",
    metadata: dict | None = None,
) -> dict:
    return {
        "attempted": int(attempted or 0),
        "succeeded": int(succeeded or 0),
        "skipped": int(skipped or 0),
        "failed": int(failed or 0),
        "message": str(message or "")[:255],
        "metadata": metadata or {},
    }


def run_notification_delivery(*, dry_run: bool = False, limit: int | None = None) -> dict:
    """Bridge to `process_due_notifications` (which keeps its own detailed
    NotificationDeliveryRun for real runs). Idempotent via dedupe_key."""
    from apps.notifications.services import process_due_notifications

    s = process_due_notifications(
        dry_run=dry_run,
        limit=limit or 100,
        record_run=not dry_run,
    )
    keys = (
        "evaluated",
        "created",
        "existing",
        "in_app_delivered",
        "emails_sent",
        "emails_skipped",
        "emails_failed",
        "skipped_preferences",
        "errors",
    )
    return _result(
        attempted=s.get("evaluated", 0),
        succeeded=s.get("created", 0),
        skipped=s.get("existing", 0) + s.get("skipped_preferences", 0),
        failed=s.get("errors", 0) + s.get("emails_failed", 0),
        message=f"delivered {s.get('emails_sent', 0)} email(s)",
        metadata={k: s.get(k, 0) for k in keys},
    )


def run_weekly_radar(*, dry_run: bool = False, limit: int | None = None) -> dict:
    """Bridge to `send_weekly_radar_batch`. Dedupes via EmailLog (no double-send)."""
    from apps.notifications.weekly_radar import send_weekly_radar_batch

    s = send_weekly_radar_batch(dry_run=dry_run, limit=limit)
    return _result(
        attempted=s.get("sent", 0) + s.get("skipped", 0) + s.get("failed", 0),
        succeeded=s.get("sent", 0),
        skipped=s.get("skipped", 0),
        failed=s.get("failed", 0),
        message=f"sent {s.get('sent', 0)}",
        metadata={k: s.get(k, 0) for k in ("sent", "skipped", "failed")},
    )


def run_emergency_checkins(*, dry_run: bool = False, limit: int | None = None) -> dict:
    """Bridge to `process_emergency_checkins`. Idempotent + feature-gated."""
    from apps.documents.services import process_emergency_checkins

    s = process_emergency_checkins(dry_run=dry_run)
    return _result(
        attempted=s.get("evaluated", 0),
        succeeded=s.get("fired", 0) + s.get("nudged", 0),
        failed=s.get("errors", 0),
        message=f"fired {s.get('fired', 0)}",
        metadata={k: s.get(k, 0) for k in ("evaluated", "fired", "nudged", "errors")},
    )


def run_purge_expired_trash(*, dry_run: bool = False, limit: int | None = None) -> dict:
    """Bridge to `purge_expired_trash` (DESTRUCTIVE for a real run). The console
    only ever calls this with `dry_run=True`; real runs come from the scheduler."""
    from apps.documents.services import purge_expired_trash

    s = purge_expired_trash(dry_run=dry_run)
    docs = s.get("documents", 0)
    files = s.get("files", 0)
    return _result(
        attempted=docs + files,
        succeeded=docs + files,
        message=(
            "auto-purge disabled"
            if s.get("disabled")
            else f"purged {docs} document(s), {files} file(s)"
        ),
        metadata={
            "documents": docs,
            "files": files,
            "disabled": bool(s.get("disabled")),
        },
    )
