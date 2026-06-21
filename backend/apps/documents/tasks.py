"""
Celery tasks for document-heavy / scheduled work.

* ``run_scanner_ocr`` moves the CPU-heavy OCR step off the web worker (scale-ready
  mode only; lean mode runs OCR inline during upload as before).
* ``purge_expired_trash`` is the scheduled trash-retention sweep.

These run inline/eagerly in lean mode, so behaviour is unchanged without a worker.
Never log OCR text, file bytes, names, or paths.
"""

from __future__ import annotations

import logging

from celery import shared_task
from django.core.management import call_command

logger = logging.getLogger("duenest.documents")


@shared_task(
    name="apps.documents.tasks.run_scanner_ocr",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    acks_late=True,
)
def run_scanner_ocr(self, document_file_id: int, user_id: int) -> dict:
    """Decrypt an already-stored scanned file and run bounded OCR on it.

    Authorization was already enforced at upload time; this re-loads the owner's
    file and re-derives plaintext only to extract text. OCR remains bounded by
    OCR_MAX_PAGES / OCR_TIMEOUT_SECONDS. Best-effort: failures are logged (no
    content) and do not corrupt the stored file.
    """
    from django.contrib.auth import get_user_model

    from apps.documents.file_encryption import read_plaintext
    from apps.documents.models import DocumentFile
    from apps.documents.scanner import _maybe_run_ocr

    try:
        instance = DocumentFile.objects.select_related("document").get(
            pk=document_file_id
        )
    except DocumentFile.DoesNotExist:
        return {"ocr_stored": False, "reason": "missing"}

    try:
        user = get_user_model().objects.get(pk=user_id)
    except get_user_model().DoesNotExist:
        return {"ocr_stored": False, "reason": "missing_user"}

    try:
        data = read_plaintext(instance)
        stored = _maybe_run_ocr(
            user, instance, data, instance.content_type or "application/pdf"
        )
    except Exception as exc:  # noqa: BLE001 - never log content; retry-bounded
        logger.warning(
            "scanner_ocr_task_failed file_id=%s error_category=%s",
            document_file_id,
            type(exc).__name__,
        )
        raise self.retry(exc=exc)
    return {"ocr_stored": bool(stored)}


@shared_task(name="apps.documents.tasks.purge_expired_trash", acks_late=True)
def purge_expired_trash() -> dict:
    """Scheduled: permanently remove documents/files past trash retention."""
    call_command("purge_expired_trash")
    logger.info("purge_expired_trash_task complete")
    return {"ok": True}


@shared_task(name="apps.documents.tasks.send_ai_digests", acks_late=True)
def send_ai_digests() -> dict:
    """Scheduled: send the opt-in weekly AI briefing digest to eligible users."""
    call_command("send_ai_digests")
    logger.info("send_ai_digests_task complete")
    return {"ok": True}
