# CertaNest SEO Strategy

The discoverability map for CertaNest. CertaNest is a **new brand**, so most early
visitors won't search the name — non-brand, problem/solution search matters most.

## Positioning (use naturally in copy)

- **Primary category:** Life admin app for important documents.
- **Secondary:** Document readiness platform.
- **B2B:** Client document collection portal.
- **Core sentence:** "CertaNest is a life admin app for important documents —
  helping you organize files, track expiry dates and deadlines, prepare
  application packs, request documents, and share proof securely."

Honesty rules (enforced by a test): no SOC 2 / HIPAA / GDPR-certification /
bank-level / military-grade / "Google verified" claims; Gmail import is
limited/beta (never public/unrestricted); no legal/immigration/financial advice;
no approval guarantees.

## Brand keywords

`certanest` · `certanest app` · `certanest document app` · `certanest life admin`.
Covered by: homepage title/description + Organization/WebSite JSON-LD + brand in
every page title template.

## Problem / solution keyword clusters

| Cluster | Example queries | Primary page |
|---|---|---|
| 1 · Personal organization | document organizer app, important document tracker, document vault, digital document vault, family document organizer, life admin app, organize important documents | `/`, `/use-cases/students`, `/use-cases/families` |
| 2 · Deadlines & renewals | document expiry reminder, passport expiry reminder, renewal reminder app, deadline tracker, visa deadline tracker | `/use-cases/passport-renewal-reminders`, `/use-cases/visa-documents` |
| 3 · Applications | application document checklist, scholarship document checklist, visa document organizer, student document management, reusable application pack | `/use-cases/students`, `/use-cases/scholarship-applications`, `/use-cases/visa-documents` |
| 4 · Secure sharing | secure document sharing, expiring document link, revoke document access, share proof securely, secure file request link | `/use-cases/secure-document-sharing`, `/use-cases/document-sharing` |
| 5 · B2B collection | client document collection portal, collect documents from clients, document request portal, document collection software, school/agency document collection | `/use-cases/client-document-collection`, `/use-cases/agencies-schools` |

## Audience → search intent → CTA

| Audience | Intent | CTA |
|---|---|---|
| Students / applicants | "get my documents ready for an application" | Start organizing / Join the beta |
| Visa applicants | "track passport/visa expiry, build a pack" | Prepare your documents |
| Families | "keep documents ready + emergency access" | Start organizing |
| Agencies / schools / teams | "collect documents without email chaos" | Organize document collection |

Primary CTA is centralized in `@/lib/cta` (waitlist during private beta, register
at launch) so it never drifts.

## Use-case pages (live)

Existing: `/use-cases` · students · visa-documents · scholarship-applications ·
job-applications · document-sharing · agencies-schools · families.
Added in this branch: **client-document-collection** · **secure-document-sharing**
· **passport-renewal-reminders**.

Each use-case page has a unique title/description/canonical, a problem → solution
→ workflow → features narrative, a visible FAQ (mirrored as `FAQPage` JSON-LD),
`Organization` + `WebSite` + `BreadcrumbList` JSON-LD, related-page internal links,
and a link back to `/use-cases` and the homepage.

## Technical SEO (state)

- `app/sitemap.ts` — auto-includes the homepage, legal/marketing pages, and every
  `USE_CASES` slug. Adding a use case automatically adds it to the sitemap.
- `app/robots.ts` — allows marketing, disallows dashboard/founder/api/auth and all
  token-gated share/request/room/emergency routes; references the sitemap.
- Canonical: homepage + every use-case page. Canonical domain: `certanest.com`.
- Structured data: homepage (Organization/SoftwareApplication/FAQPage) + use-case
  pages (Organization/WebSite/BreadcrumbList/FAQPage).

## Internal linking plan

Homepage → `/use-cases` and key use-case pages · `/use-cases` index lists all
pages · each use-case page → 3 related pages (descriptive anchors, e.g. "Collect
documents from clients without email chaos") + back to `/use-cases` · footer →
use cases. Keep anchors descriptive; never "click here".

## Future content roadmap

- Per-page Open Graph images for the new use-case pages (currently use the site
  default OG image).
- Comparison pages ("CertaNest vs Google Drive for documents").
- A short blog/guide cluster (e.g. "visa document checklist", "scholarship
  application checklist") linking into the matching use-case pages.
- After `marketing/premium-landing-v2` settles, align homepage H1/H2 with the
  primary category in `marketing/seo-final-alignment-v1` (see
  `docs/SEARCH_CONSOLE_SETUP.md`).
