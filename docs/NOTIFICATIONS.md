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
  sends a **generic** push (title/body never name the document, file, recipient,
  or any private detail; only an internal URL is included). The real content is
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

See `docs/PWA.md` §9 for the full flow and the deferred items (quiet hours, a
dedicated push queue/task).

## Known Limitations

- No Celery/Redis worker is configured yet.
- Daily digest delivery is reserved for later.
- Activity event hooks such as `share_viewed` can use the model, but this pass
  focuses on reminder generation.
- Founder delivery metrics are not added in this pass.
