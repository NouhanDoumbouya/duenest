# Private Beta — Manual QA Script

A repeatable, click-through script to verify the launch-critical flows before
inviting beta users. Run it on **a laptop and a real phone**. Routes below are the
real app routes confirmed in the codebase.

> No automated browser exists in the build environment, so these are **manual**
> checks. Record pass/fail + notes for each step. Stop and treat any security-flow
> failure as a launch blocker (see `docs/FOUNDER_BETA_RUNBOOK.md` §6).

## Pre-flight

- [ ] `python manage.py migrate` applied.
- [ ] `python manage.py beta_readiness_check` → no `[FAIL]`; review `[WARN]`.
- [ ] `python manage.py seed_feature_flags` run; beta flags set deliberately.
- [ ] A founder (staff/superuser) account can reach `/founder`.

---

## A. Personal flow

1. **Sign up / log in** — `/register` → `/login` → lands on `/dashboard`.
   (If private beta is enabled, registration requires a valid invite code.)
2. **Onboarding / demo** — `/dashboard/onboarding` → **Create demo data** →
   sample documents appear → **Clear demo data** removes them.
3. **Upload / scan** — `/dashboard/files` upload a non-sensitive file; on a phone,
   `/dashboard/scanner` capture → crop → save.
4. **Organize** — `/dashboard/documents/organize` move into a folder / add a tag.
5. **Create a pack** — `/dashboard/bundles` → new pack → add documents.
6. **Reminder** — `/dashboard/reminders` add a renewal/deadline + reminder.
7. **Life Radar** — `/dashboard` shows the deadline with the right urgency.
8. **Share a document** — `/dashboard/quick-share` create a SafeSend link →
   confirm expiry + watermark + "private until shared" copy → open the link in a
   private window → revoke → confirm it no longer opens.
9. **Import a Drive file** — `/dashboard/settings/integrations` connect Google →
   `/dashboard/settings/integrations/google-drive` → search → select → **review**
   → import → file lands in the chosen destination.
10. **Import a Calendar deadline** —
    `/dashboard/settings/integrations/google-calendar` → pick calendar → select an
    event → **review** → import → it appears as a reminder/deadline.
11. **Import a Gmail attachment** *(only if Gmail import has merged)* — confirm it
    is **manual, attachment-only, read-only**; otherwise mark **N/A**.

## B. Organization (B2B) flow

1. **Founder enables the org** —
   `python manage.py set_organization_plan --org-id <id> --plan teams_beta --portal-enabled true`.
2. **Admin opens the portal** — `/dashboard/organizations/<id>/portal`.
3. **Create a template** — portal → Templates.
4. **Custom fields / statuses** — `/dashboard/organizations/<id>/portal/settings/customization`.
5. **Add a person** — portal → People.
6. **Create a case from the template** — portal → Templates → Create case.
7. **Requests are created** for the case's required documents.
8. **Public recipient uploads** — open the request link (`/request/<token>`) with
   no account → upload a file.
9. **Staff reviews** — `/dashboard/organizations/<id>/portal/cases/<caseId>` →
   see the upload.
10. **Accept / reject / needs-replacement** — confirm each decision works and (if
    configured) a branded decision email is sent.
11. **Files auto-organize** — accepted file is attached to the case's pack.
12. **Send a reminder** — portal reminder queue (respects the 3-day cooldown).
13. **Open a sharing room** — confirm the public room (`/room/<token>`) shows only
    intended documents/requests.
14. **Founder observes** — `/founder` observability + jobs show the activity with
    **safe aggregates only** (no contents/tokens).

## C. Security flow (must pass)

1. **Invalid token** — `/request/<garbage>` and `/room/<garbage>` show a calm
   "couldn't load / not found" state with **no leak** of whether the token exists.
2. **Expired / revoked link** — an expired `/room/<token>` shows an "expired"
   state; a revoked one shows "revoked"; neither exposes contents.
3. **Unauthorized folder access** — a non-member cannot read another org's
   documents (403), and a public room **cannot see the folder tree**.
4. **Founder-page access blocked** — a normal (non-staff) user visiting `/founder`
   is denied; `GET /api/v1/founder/beta-readiness/` returns 403 for them.
5. **Private URLs never shown** — view page source on a public room/request and a
   shared document: no raw R2 URLs, no object keys, no access tokens in the HTML.
6. **Audit/observability scrub** — `/dashboard/security/audit` and `/founder`
   payloads contain no document contents, OCR text, tokens, or raw IPs.
7. **Offline privacy** — go offline and navigate; the app shows `/offline` and
   states it does **not** cache private documents (no vault data is readable).

## D. Mobile / PWA

- [ ] Public upload works on a phone (`/request/<token>`).
- [ ] Scanner works on a phone.
- [ ] Portal Overview is usable on a phone (no squeezed-desktop feel).
- [ ] Modals/sheets are usable on a phone.
- [ ] Install the PWA (Add to Home Screen) and launch it.
- [ ] Offline fallback is the safe `/offline` page.

## Sign-off

- [ ] Personal flow: pass
- [ ] B2B flow: pass
- [ ] **Security flow: pass (blocker if not)**
- [ ] Mobile/PWA: pass
- [ ] `beta_readiness_check`: no `[FAIL]`
- Tester: __________  Date: __________  Build/commit: __________
