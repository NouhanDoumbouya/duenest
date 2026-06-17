# DueNest Notifications

DueNest notifications are owner-scoped records that surface due reminders and
safe account events in the dashboard notification center.

## Implemented Scope

- In-app notification model and API under `/api/v1/notifications/`.
- User preferences at `/api/v1/notifications/preferences/`.
- Dashboard bell dropdown.
- Full notification center at `/dashboard/notifications`.
- Preferences page at `/dashboard/notifications/settings`.
- Cron-compatible generation/delivery command:

```bash
cd backend
python manage.py process_due_notifications
```

## Reminder Sources

The command generates due notifications for:

- Documents: expiry, renewal date, missing file, extraction/review needed.
- Subscriptions: renewal, trial ending, cancellation deadline.
- Bundles/checklists: deadline, incomplete bundle, item due, missing required file.
- Organizations: assigned request due, submitted file review, campaign deadline,
  member missing required documents.
- Sharing: file share, Quick Share, and Secure Room expiry.
- Emergency access: review reminder and expiring emergency link.
- System/account: model support exists for security alerts and failed login
  warnings; event hooks can create those records separately.

## Event-Driven Notifications

Some notifications are created in real time from app events rather than the
scheduled sweep:

- Emergency access: `emergency_request` and `emergency_viewed` are created when a
  trusted contact requests or opens an emergency pack (`apps/documents/views.py`
  via `notify_pack_owner`).
- Billing: `billing_payment_failed`, `billing_canceled`, and
  `billing_trial_ending` are created from billing lifecycle events
  (`apps/billing/services.py`).
- Quick Share / SafeSend: `share_viewed` is created when a recipient previews or
  downloads a shared file (`apps/quick_share/views.py` via
  `notify_owner_share_viewed`). It respects the owner's "activity notifications"
  preference (off by default), skips owner self-views, and dedupes to one record
  per session per day. The copy never names the file or recipient.

These reuse the same `create_notification` helper, `dedupe_key` rule, and
metadata sanitization as scheduled notifications.

## Delivery Command

```bash
python manage.py process_due_notifications --dry-run
python manage.py process_due_notifications --limit 100
python manage.py process_due_notifications --user-id 42
python manage.py process_due_notifications --type document_expiry
python manage.py process_due_notifications --now 2026-06-14T09:00:00+00:00
```

The command:

- evaluates active users;
- uses each user's notification timezone when calculating date-sensitive
  reminders;
- creates missing notification records;
- records in-app delivery when enabled;
- sends email when enabled and configured;
- records safe failure status when email fails;
- logs only safe ids, types, counts, and error categories.

## Duplicate Prevention

Every generated event has a stable unique `dedupe_key`, for example:

```txt
document_expiry:{user_id}:{document_id}:{lead_days}:{expiry_date}
subscription_renewal:{user_id}:{subscription_id}:{lead_days}:{next_billing_date}
emergency_review:{user_id}:{pack_id}:{review_date}
```

The database enforces uniqueness on `dedupe_key`. Re-running the command finds
the existing notification and does not send the email again once
`delivered_email_at` is set.

## Preferences

`NotificationPreference` stores:

- global in-app and email switches;
- category switches for documents, subscriptions, checklists/bundles,
  organizations, emergency access, security alerts, and activity notifications;
- future digest toggle;
- default lead days;
- timezone.

Invalid timezone names fall back to UTC in the service layer.

Security notifications are always allowed for in-app delivery. The security
alert preference is used to control email delivery for security notifications.

## Privacy Rules

Notification metadata is sanitized. It must not store access codes, share
tokens, emergency tokens, encryption keys, raw OCR text, file paths, private
notes, or document contents.

Action URLs are restricted to internal paths and are reset to `/dashboard` if
they look unsafe.

## Scheduled Delivery

Celery tasks and a beat schedule are defined (`config/celery.py`,
`apps/notifications/tasks.py`). In the default lean mode
(`ENABLE_BACKGROUND_JOBS=false`) Celery runs eagerly inline, so the supported way
to deliver due notifications is to run `process_due_notifications` from an
external scheduler (cron / hosting scheduler). Scale-ready mode (a real worker +
beat) requires `REDIS_URL`, `ENABLE_BACKGROUND_JOBS=true`, and
`ENABLE_CELERY_BEAT=true`. Until one of those runs the command, scheduled
reminders are generated only on demand.

Pick exactly one of these per environment:

- **Lean mode (recommended for beta):** a platform/system cron that runs the
  command every ~15 minutes. The command is idempotent, so the cadence only
  affects latency, never duplicates:

  ```cron
  */15 * * * *  python manage.py process_due_notifications
  ```

- **Scale-ready mode:** run the `beat` process (`Procfile`,
  `ENABLE_CELERY_BEAT=true`) which already schedules
  `process-due-notifications` every 15 minutes onto the `notifications` queue.

See `docs/deployment/scale-ready-lean-foundation.md` (Scheduled jobs) and
`docs/DEPLOYMENT.md` for the full per-platform setup.

Each run is recorded as a `NotificationDeliveryRun` (aggregate counts only, no
user data), surfaced to founders via the delivery-health endpoint
(`apps/founder/views.py` → `build_delivery_health`), so you can confirm the
scheduler is actually firing in production.

## PWA Web Push (opt-in)

In-app notifications can optionally be mirrored as device/browser Web Push
notifications. This is **opt-in and privacy-safe**:

- Off until VAPID keys are configured (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
  `VAPID_SUBJECT`) — no prompts, no delivery otherwise.
- The user enables it per device from
  `/dashboard/notifications/settings` (which sets the `push_enabled` preference
  and registers a `PushWebSubscription`). Permission is requested only on that
  explicit action — never on page load.
- When a notification is first delivered in-app, `apps/notifications/push.py`
  sends a **category-level** push: the body says what *kind* of thing needs
  attention (e.g. "A subscription renewal is coming up.") but never names the
  document, file, recipient, amount, date, or any private detail. The title is a
  constant "DueNest" and only an internal URL is included. The real content is
  shown after the user opens DueNest and is authenticated.
- Endpoints: `GET /notifications/push/public-key/`,
  `POST /notifications/push/subscribe/`, `POST /notifications/push/unsubscribe/`.
- `pywebpush` is imported lazily; if absent or unconfigured, push is a no-op.
- Gone subscriptions (HTTP 404/410) are deleted automatically.
- Delivery is inline in lean mode; in scale-ready mode
  (`ENABLE_BACKGROUND_JOBS=true`) it runs on the dedicated `push` Celery queue
  via the `send_push` task.
- **Quiet hours:** users can set a daily window (in their notification timezone,
  may wrap midnight) that holds back device pushes only — in-app notifications
  are never suppressed.

See `docs/PWA.md` §9 for the full flow.

## Known Limitations

- No worker/beat process or cron is wired by default — scheduled reminders need
  an external scheduler to invoke `process_due_notifications` (see above).
- Daily digest delivery is reserved for later.
- PWA Web Push is implemented as an opt-in foundation (see above and
  `docs/PWA.md` §9) but stays off until VAPID keys are configured; per-type push
  controls remain a future enhancement.
