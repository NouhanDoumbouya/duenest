# Go-Live Checklist

Everything in code (billing, trials, receipts, lifecycle/dunning emails, the
founder email admin, the landing page) is implemented and unit-tested. What
remains before real users is **operational wiring + live verification** — none
of it is code. This checklist consolidates it.

> The Stripe and Resend integrations have only ever run against **mocks** in
> tests. Real payloads/signatures occasionally differ, so the live verification
> steps below are not optional.

---

## 1. Email delivery (Resend)

Without this, **no email sends** (receipts, trials, dunning, invites, resets).

### Environment

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...                      # also used as the SMTP password
DEFAULT_FROM_EMAIL=DueNest <noreply@yourdomain.com>
RESEND_WEBHOOK_SECRET=whsec_...            # from the Resend webhook settings
BACKEND_PUBLIC_URL=https://api.yourdomain.com   # builds unsubscribe links
DUENEST_APP_BASE_URL=https://app.yourdomain.com # builds in-app links
```

`EMAIL_CONFIGURED` is derived automatically (true once provider + key are set).

### DNS (mandatory for inbox placement)

In the Resend dashboard, add your sending domain and create the records it shows:

- **SPF** — `TXT` `v=spf1 include:…`
- **DKIM** — the `CNAME`/`TXT` records Resend provides
- **DMARC** — `TXT _dmarc` (start `p=none` to monitor, then tighten)

Skipping these = branded mail (receipts included) lands in spam.

### Webhook

Add a Resend webhook → `POST https://api.yourdomain.com/api/v1/email/webhook/resend/`,
subscribed to **bounced / complained / delivered / opened**. Copy its signing
secret into `RESEND_WEBHOOK_SECRET`.

---

## 2. Billing (Stripe)

### Environment

```env
BILLING_PROVIDER=stripe
BILLING_TEST_MODE=False
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...               # client-safe
STRIPE_WEBHOOK_SECRET=whsec_...
```

Create the Pro **prices** in Stripe and set their IDs on the Pro `Plan`
(`monthly_provider_price_id` / `yearly_provider_price_id`, via admin) — or the
`STRIPE_PRICE_PRO_*` env vars.

### Webhook

Add a Stripe webhook → `POST https://api.yourdomain.com/api/v1/billing/webhook/stripe/`,
events: `checkout.session.completed`, `customer.subscription.created|updated|deleted`,
`invoice.paid`, `invoice.payment_succeeded`, `invoice.payment_failed`,
`invoice.payment_action_required`, `charge.refunded`.

---

## 3. Scheduled jobs (Celery Beat)

The trial-ending, trial-expiry, renewal, dunning-follow-up, and grace-expiry
emails are driven by the hourly `sync_billing_access` task. The schedule is
**coded** (`config/celery.py`), but a **beat process must be running**:

```env
ENABLE_CELERY_BEAT=true     # plus a Procfile `beat:` / worker process
```

Without `beat`, those scheduled emails never fire.

---

## 4. Founder console setup (after the above)

1. **Founder → Billing**
   - Turn **receipts on** and pick the format (email + link / DueNest PDF / email only).
   - Fill **merchant details** (legal name, address, tax ID) for compliant receipts.
   - Set **email timing**: trial-ending / renewal lead days, grace-period length,
     and (optionally) the dunning follow-up delay.
2. **Founder → Emails**
   - **Preview** each email, then **"Send test to me"** to confirm real rendering.

---

## 5. Public launch (landing page)

When you open self-serve signup, build the frontend with:

```env
NEXT_PUBLIC_PRIVATE_BETA_ENABLED=false
```

The hero/CTAs flip to "Start your 14-day free trial" → `/register`, and the
register page already adapts to open signup.

---

## 6. Live verification (do in Stripe test mode first)

- [ ] **Trial start** → user is `trialing`, gets Pro access, sees `trial_end`.
- [ ] **Trial → paid** (add card) → first `invoice.paid` → **branded receipt**
      with a sequential number arrives.
- [ ] **No-card trial lapse** → cron downgrades to Free → `billing_trial_ended`.
- [ ] **Failed payment** → grace period + `billing_payment_failed`; after the
      configured delay, the **follow-up** dunning email; grace expiry → Pro lost.
- [ ] **Refund** (`charge.refunded`) → refund email.
- [ ] **Cancel** → win-back email.
- [ ] **Resend bounce/complaint** (send to a Resend test address) → recipient
      appears in the **suppression list**; founder **Emails → Delivery health**
      shows it.
- [ ] **Deliverability** — send a real receipt to Gmail/Outlook; confirm it lands
      in the inbox (DKIM/SPF passing), not spam.
- [ ] **Unsubscribe** — open the `List-Unsubscribe` link on a lifecycle email →
      marketing-scope suppression (transactional mail still sends).

## 7. Device checks (real phone)

- [ ] Scanner **continuous autofocus** keeps the live preview sharp.
- [ ] **Tap-to-focus** drives the lens + shows the focus ring (Android Chrome).

---

## Deferred (optional, not blockers)

- Per-message tracking correlation (needs the Resend **API** backend instead of
  SMTP; today correlation is recipient-based).
- Daily reminder **digest** batching (see `EMAIL_REMINDERS.md`).
