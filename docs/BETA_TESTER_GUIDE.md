# CertaNest — Beta Tester Guide

Thank you for helping test CertaNest during our private beta.

CertaNest helps you get important documents **ready when life asks** — store them,
track deadlines and renewals, prepare application packs, request documents from
other people, and share safely. This guide explains what to try, what to expect,
and how to tell us when something is wrong.

> **This is a private beta.** Things may break, change, or look unfinished. Please
> treat it as a preview, not a finished product. See *Known limitations* below.

## Before you start

- Use the email address your invite was sent to.
- A laptop **and** a phone are both useful — we want feedback on each.
- You can explore safely with a **demo workspace** (fake sample data) before
  uploading anything real.

## A safe way to explore first

You don't have to upload real documents to try the product:

1. Sign in and open your dashboard.
2. Go to **Onboarding** (`/dashboard/onboarding`) and choose **Create demo data**.
   This adds clearly-labelled sample documents you can click around.
3. When you're done, choose **Clear demo data** to remove it.

If you run an organization workspace, an admin can create a **demo workspace**
(sample template, person, and case) from the portal — also clearly labelled and
removable.

## What to test

### Personal document readiness
1. **Upload or scan** a document (`/dashboard/files`, or **Scanner** on a phone).
2. **Organize** it into a folder or add tags (`/dashboard/documents/organize`).
3. **Add a deadline/renewal** and a reminder (`/dashboard/reminders`).
4. **Check Life Radar** on your dashboard — do upcoming deadlines look right?
5. **Build an application pack** (`/dashboard/bundles`).
6. **Share a document safely** with SafeSend (`/dashboard/quick-share`) — notice
   the expiry, watermark, and "private until shared" messaging.
7. **Import deadlines/files** (optional): connect Google in
   `/dashboard/settings/integrations`, then try **Google Drive import** or
   **Google Calendar import**. These are **manual and review-before-save** — you
   pick exactly what comes in, and CertaNest never changes anything in Google.

### Requesting & collecting documents
1. Create a **document request** and send the link.
2. Open the link as the recipient (`/request/<token>`) — you can upload **without
   an account**.
3. Confirm the upload felt safe and clear.

### Organization / team workflow (if you have an org)
1. An admin enables the portal and opens it
   (`/dashboard/organizations/<id>/portal`).
2. Create a **template**, add **custom fields/statuses**, add a **person**, and
   **create a case from the template**.
3. The case **requests documents**; the applicant **uploads**; staff **review**
   and **accept / reject / ask for a replacement**.
4. Accepted files **auto-organize**, and staff can send **reminders** and open a
   **sharing room**.

## What NOT to upload (please)

This is a beta. **Do not upload anything you would be uncomfortable sharing in a
preview product**, for example:
- government IDs, passports, or visas with real numbers,
- medical records,
- bank statements or anything with full account numbers,
- other people's private documents without their permission.

Use the **demo workspace** or non-sensitive test files instead. You can always
delete what you upload (Trash → permanently delete).

## Your privacy during the beta

- Your documents are **private by default** — nothing is public unless you create
  a share link.
- CertaNest does **not** store your private documents offline on your device.
- The team can see **operational health** (errors, counts, statuses) to support
  you, but **not** your document contents, file names, OCR text, or share tokens.
- Integrations are **import-only** and **read-only** — CertaNest never edits or
  deletes anything in your Google account.

## How to report a problem

When something looks wrong, please tell us:
1. **What you were doing** (the page/route, e.g. `/dashboard/reminders`).
2. **What you expected** vs. **what happened**.
3. **Device**: phone or laptop, and which browser.
4. A screenshot helps (please blur anything private).

Use the in-app **Feedback** page (`/dashboard/feedback`) or email
**support@certanest.com**.

## Known limitations (honest beta state)

- This is a **private beta**, not a public launch.
- **Billing is in test/sandbox mode** — no real charges. Paid plans are not live.
- **Integrations are manual import-only** — no automatic Google sync, and no
  write-back to Drive/Calendar/Gmail.
- There is **no native mobile app** yet (CertaNest is a fast web app / PWA you can
  install).
- There is **no offline vault** — documents are not cached on your device.
- **AI features require consent**, may be limited, and are usage-capped.
- Legal pages (Terms / Privacy / Security) are **beta drafts**, not lawyer-reviewed.
- We do **not** claim compliance certifications, antivirus guarantees, or
  enterprise SSO yet.

Thank you — your honest feedback is exactly what makes the product better.
