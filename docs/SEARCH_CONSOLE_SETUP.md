# Google Search Console — Setup & Submission

Manual, operator-run steps to get CertaNest indexed. Nothing here is automated and
no tracking script is added to the site.

## 1. Add the property

- Preferred: **Domain property** `certanest.com` (covers http/https + all
  subdomains). Requires a DNS TXT record.
- Or: **URL-prefix property** `https://certanest.com`.

## 2. Verify ownership

- Domain property → add the Google-provided **TXT record** to your DNS
  (Cloudflare/registrar), then click Verify.
- URL-prefix → DNS, or the HTML-tag / HTML-file method.

> CertaNest does not embed an analytics/verification `<script>` — use the DNS or
> file method so no third-party tag is added to the app.

## 3. Submit the sitemap

- Sitemaps → add `https://certanest.com/sitemap.xml` (served by `app/sitemap.ts`;
  it auto-lists the homepage, legal/marketing pages, and every use-case page).

## 4. Inspect the homepage

- URL Inspection → `https://certanest.com/` → confirm it's crawlable and indexable
  (not blocked by robots, not `noindex`).

## 5. Request indexing (after the landing redesign settles)

- Request indexing for `https://certanest.com/` once homepage copy is final
  (coordinate with `marketing/premium-landing-v2` / `seo-final-alignment-v1`).

## 6. Inspect the use-case pages

Request indexing for each:

- `/use-cases`
- `/use-cases/students`
- `/use-cases/visa-documents`
- `/use-cases/agencies-schools`
- `/use-cases/client-document-collection`
- `/use-cases/secure-document-sharing`
- `/use-cases/passport-renewal-reminders`
- (and the rest: scholarship-applications, job-applications, document-sharing, families)

## 7. Queries to track (Performance report)

Brand: `certanest`, `certanest app`, `certanest document app`.
Non-brand: `life admin app`, `document organizer app`, `document vault with
reminders`, `document expiry reminder`, `passport expiry reminder`, `visa document
organizer`, `scholarship document checklist`, `application document checklist`,
`secure document sharing app`, `client document collection portal`, `collect
documents from clients`, `document request portal`, `secure file request link`.

## 8. Fix coverage / indexing errors

- Pages → check Excluded/Error reasons. Confirm private routes (`/dashboard`,
  `/founder`, `/login`, `/request/*`, `/room/*`, etc.) show as **Blocked by
  robots.txt** — that's expected and correct.
- Validate any "Discovered – not indexed" on marketing/use-case pages and request
  re-indexing.

## 9. Re-submit after major SEO changes

Re-submit the sitemap whenever use-case pages are added/removed or metadata
changes significantly.

## 10. Repeat after the landing page branch merges

After `marketing/premium-landing-v2` lands and homepage copy is final, run
**`marketing/seo-final-alignment-v1`** to:

- review homepage metadata and align H1/H2 with the primary category
  ("life admin app for important documents");
- verify the homepage naturally includes the category and links to `/use-cases`;
- verify all use-case links are visible and the sitemap includes every page;
- run this Search Console checklist again and fix any crawl/indexing issues.

## Rich results

After deploy, validate structured data with Google's **Rich Results Test** on the
homepage and a use-case page (e.g. `/use-cases/secure-document-sharing`) — expect
Organization, WebSite, BreadcrumbList, and FAQ to be detected. Do not add ratings,
reviews, or pricing markup (none are real).
