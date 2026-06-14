# Private Beta Readiness: Notifications and Email

This note tracks readiness for the notification/email reminder pass.

## Implemented

- Notification model and preference model.
- Notification APIs for list, summary, read, mark-all-read, dismiss, and
  preferences.
- Dashboard notification bell.
- `/dashboard/notifications` center.
- `/dashboard/notifications/settings` preferences page.
- `process_due_notifications` management command with dry-run, limit, user,
  type, and now options.
- Privacy-safe text and HTML email templates.
- Backend tests for document/subscription/emergency/org generation,
  deduplication, preference handling, API actions, dry-run, failed email, and
  timezone behavior.

## Not Production-Complete Yet

- No Celery/Redis scheduler is deployed.
- No production transactional email provider is configured.
- No sending-domain authentication, bounce handling, or delivery monitoring is
  configured.
- Founder delivery metrics were deferred.
- Push/SMS/WhatsApp/Telegram are deferred.

## Private Beta Operator Checklist

- Run migrations after deployment.
- Configure `DUENEST_APP_BASE_URL` for the frontend domain.
- Keep console email backend in local/dev only.
- Add a platform scheduler or cron entry for:

```bash
python manage.py process_due_notifications --limit 100
```

- Monitor command logs for failed delivery counts.
- Verify sample email bodies contain no document contents, tokens, access
  codes, raw OCR text, private notes, or files.
