# Transactional Email

CertaNest sends transactional email through Django's email backend. The **same**
provider configuration powers all transactional email — not just reminders:

- **Invite** and **waitlist confirmation** (founder / private-beta flow)
- **Password reset** and **email verification** (account recovery)
- **Reminder** summaries (notification service)

All of these render from shared, branded templates in `backend/templates/emails/`
(each extends `base.html` / `base.txt`) via `common.email.send_branded_email`.
Emails never include document contents, files, access codes, or share tokens.

> Links use `FRONTEND_APP_URL` (invite / password reset / email verification)
> and `DUENEST_APP_BASE_URL` (reminders) — set **both** to your frontend app URL
> in production.

## Development Setup

Local development defaults to the Django console backend:

```env
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
DEFAULT_FROM_EMAIL=CertaNest <noreply@localhost>
DUENEST_APP_BASE_URL=http://localhost:3000
```

Run:

```bash
cd backend
python manage.py process_due_notifications --dry-run
python manage.py process_due_notifications
```

The real run creates notification records and prints email bodies to the console
when the console backend is active.

## Production Setup

Production should configure a transactional provider through Django email
settings, for example SMTP credentials supplied by Postmark, SendGrid, Mailgun,
or another provider:

```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
DEFAULT_FROM_EMAIL=CertaNest <reminders@example.com>
SERVER_EMAIL=CertaNest <server@example.com>
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
EMAIL_TIMEOUT=10
DUENEST_APP_BASE_URL=https://app.example.com
```

Do not claim production email readiness until the deployment has:

- authenticated sending domain;
- SPF/DKIM/DMARC;
- provider monitoring;
- bounce/complaint handling;
- scheduler monitoring for the management command;
- alerting for repeated delivery failures.

## Templates

Templates live at:

```txt
backend/templates/emails/notification_reminder.txt
backend/templates/emails/notification_reminder.html
```

The email service maps notification types to safe generic copy. It intentionally
does not render raw notification titles/messages into the email body because
those may include user-entered document or organization names.

## Email Privacy Rules

Reminder emails must never include:

- file attachments;
- document contents or decrypted previews;
- public share tokens;
- emergency tokens;
- access codes;
- encryption keys;
- raw OCR text;
- private notes;
- payment credentials or full payment details.

Emails should link users back to authenticated CertaNest pages through
`DUENEST_APP_BASE_URL`.

## Email log & suppression

All **branded** emails (transactional registry, receipts, and future lifecycle
mail) flow through `common.email.send_branded_email`, which in one place:

- **Checks suppression** against `notifications.SuppressedEmail` before sending.
  `scope=all` (hard bounce / spam complaint) blocks every category; `scope=marketing`
  (unsubscribe) blocks only non-essential mail (`lifecycle` / `marketing`), so
  essential transactional mail (password reset, email verification, receipts)
  still sends. Lookups fail open so a hiccup never drops essential mail.
- **Logs each attempt** to `notifications.EmailLog` (`email_type`, `category`,
  recipient, subject, status: `sent` / `failed` / `suppressed`, plus
  `provider_message_id` and delivered/opened/bounced timestamps reserved for ESP
  webhooks). Routing metadata only — never contents.

Callers pass `email_type` (a stable analytics key, e.g. `payment_receipt`) and a
`category`. Founders see aggregate health (totals by status, per-type breakdown,
masked recent sends, suppression-list size) at `GET /api/v1/founder/email-analytics/`,
surfaced on the founder **Emails** page.

## Sending via Resend (recommended provider)

Resend is the recommended ESP. Sending already works over SMTP — no extra Python
dependency — by setting:

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...            # used as the SMTP password
DEFAULT_FROM_EMAIL=CertaNest <noreply@yourdomain.com>
```

**Domain authentication is mandatory for inbox placement.** In the Resend
dashboard, add your sending domain and create the DNS records it shows:

- **SPF** (`TXT` `v=spf1 include:...`),
- **DKIM** (the `CNAME`/`TXT` records Resend provides),
- **DMARC** (`TXT _dmarc` — start `p=none` to monitor, then tighten).

Without these, branded mail (receipts included) lands in spam.

## Resend delivery webhook

`POST /api/v1/email/webhook/resend/` ingests Resend events. It is **Svix-signed**;
the signature is verified against `RESEND_WEBHOOK_SECRET` (`whsec_...`, from the
Resend webhook settings) before any event is applied — empty secret returns 503.

- `email.bounced` → `SuppressedEmail(scope=all, reason=bounce)` + the recent
  `EmailLog` row marked `bounced`.
- `email.complained` → `SuppressedEmail(scope=all, reason=complaint)`.
- `email.delivered` / `email.opened` → enrich the recent `EmailLog` row.

Point a Resend webhook at that URL and subscribe to the bounce/complaint/
delivered/opened events.

## One-click unsubscribe (List-Unsubscribe)

Non-essential mail (`lifecycle` / `marketing`) automatically carries
`List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers
(Gmail/Yahoo bulk-sender requirement) pointing at a signed, per-recipient link:
`GET|POST /api/v1/email/unsubscribe/?token=...`. Following it adds a
`marketing`-scope suppression — the recipient stops receiving non-essential mail
but still gets essential transactional mail (password reset, verification,
receipts). Tokens are signed (`django.core.signing`) and expire after a year.

## Failure Handling

Failed sends:

- increment `email_attempts`;
- store `email_last_error="send_failed"`;
- mark the notification `failed`;
- keep in-app delivery if enabled;
- do not log email bodies or provider response details.

The service stops retrying a notification after three email attempts.

## Provider-neutral configuration (beta)

Email is now configured with provider-neutral env vars (`EMAIL_PROVIDER` + a few
keys). Legacy `EMAIL_*` names still work. See `apps/notifications/email_config.py`.

`EMAIL_PROVIDER` options:

- `console` (default) — prints to console; **no credentials needed** for local dev.
- `smtp` — generic SMTP via `SMTP_HOST/SMTP_PORT/SMTP_USERNAME/SMTP_PASSWORD/SMTP_USE_TLS`.
- `resend` — host `smtp.resend.com`, user `resend`, password `RESEND_API_KEY`.
- `postmark` — host `smtp.postmarkapp.com`, server token via `POSTMARK_SERVER_TOKEN`.
- `sendgrid` — host `smtp.sendgrid.net`, user `apikey`, password `SENDGRID_API_KEY`.
- `mailgun` — host `smtp.mailgun.org`, `MAILGUN_DOMAIN` + SMTP password (`SMTP_PASSWORD` or `MAILGUN_API_KEY`).
- `ses` — host derived from `AWS_SES_REGION`; uses **SES SMTP credentials** in `SMTP_USERNAME/SMTP_PASSWORD` (not IAM keys).

**Honest skip:** if a provider is selected but not fully configured,
`EMAIL_CONFIGURED` is False, in-app delivery still happens, and email is recorded
as `email_last_error="not_configured"` (counted as *skipped*, not *failed*, not
sent). It will deliver once a provider is configured — `email_attempts` is not
consumed.

## Scheduled job (production)

There is no Celery/Redis worker. Run the management command on a schedule
(cron / platform scheduled job), e.g. every 15 minutes:

```cron
*/15 * * * * cd /app/backend && python manage.py process_due_notifications >> /var/log/duenest-reminders.log 2>&1
```

Platform examples:
- **Render:** add a Cron Job service running `python manage.py process_due_notifications`.
- **Railway:** add a cron schedule for the same command.
- **systemd timer / Kubernetes CronJob:** same command.

Behaviour for schedulers:
- Idempotent — safe to run repeatedly (unique `dedupe_key` prevents duplicates).
- Per-candidate errors are isolated; one bad record never aborts the run.
- Exit code is non-zero **only on catastrophic failure**, so transient per-email
  failures don't spam scheduler alerting.
- Each real (non-dry) run records a `NotificationDeliveryRun` row.

Flags: `--dry-run`, `--limit N`, `--user-id ID`, `--type TYPE`, `--now ISO`,
`--manual` (tags the run as manual in history).

## Founder delivery-health metrics

`GET /api/v1/founder/notification-health/` (founder/admin only) returns:
email provider + configured flag, today's generated / in-app / sent / skipped /
failed counts, pending-undelivered count, last run, last successful run, recent
runs, recent failure samples (type + timestamp + error code only — no PII), and
the 7-day email failure rate.

## Domain authentication checklist (before claiming email readiness)

- [ ] Verified sending domain at the provider
- [ ] SPF record published
- [ ] DKIM signing enabled + DNS records published
- [ ] DMARC policy published
- [ ] Branded `DEFAULT_FROM_EMAIL` on the authenticated domain
- [ ] Provider monitoring/dashboards enabled
- [ ] Bounce/complaint handling (future step — see below)
- [ ] Scheduler monitoring + alerting on repeated failures

## Testing checklist

1. Create a document with an expiry date ~7 days out (generates a reminder).
2. Create a subscription with `next_billing_date` ~7 days out.
3. `python manage.py process_due_notifications --dry-run` → review counts, nothing sent.
4. `python manage.py process_due_notifications` → notifications created + delivered.
5. Verify the in-app notification appears (`/api/v1/notifications/` or the bell).
6. Verify email behaviour: console prints in dev; with a provider, a real email
   arrives; with a provider selected but no credentials, it's recorded *skipped*.
7. Check `GET /api/v1/founder/notification-health/` as a founder for the run + counts.

## Future work (deferred this sprint)

- **Daily digest batching.** `NotificationPreference.reminder_digest_enabled`
  exists but per-user digest grouping is not implemented yet. Future: a daily
  digest that groups expiring documents, renewing subscriptions, trial/cancellation
  deadlines, and important unread notifications into one email; skip empty digests.
- **Per-message tracking correlation.** Bounce/complaint suppression and
  delivered/opened enrichment work today via the Resend webhook (recipient-based
  correlation — see "Resend delivery webhook" above). Precise per-message
  correlation by provider message-id would need the Resend **API** backend
  (e.g. django-anymail) instead of SMTP; deferred since recipient-based handling
  already drives suppression + analytics.
- **Background worker (Celery/Redis).** Not needed for beta; the cron-driven
  command is sufficient. Revisit if volume grows or near-real-time sends are required.
