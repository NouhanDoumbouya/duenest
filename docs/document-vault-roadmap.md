# DueNest Document Vault Roadmap

**Version:** v0.1
**Status:** Planning
**Scope:** The Documents module of DueNest
**Owner doc:** This file is the source of truth for the documents-first product and technical roadmap. Detailed models live in `database-design.md`, endpoints in `api-spec.md`, security in `security-plan.md`, and sequencing in `roadmap.md`.

---

## 1. Positioning

DueNest is **not** basic document storage. It is being built as a:

> **Premium document renewal and expiry management vault** that helps users store important documents, understand what needs attention, prepare renewals, and avoid last-minute expiry stress.

The product promise:

> **DueNest helps you keep important documents ready, complete, secure, and renewed on time.**

The Documents module is the first module to reach a pay-worthy bar. Subscriptions, application packs, an AI assistant, and broader life-admin tasks come **after** the vault is strong on its own.

### Questions the vault answers

- What documents do I have?
- Where is the file?
- When does it expire?
- What needs attention right now?
- What information is missing?
- What should I prepare for an upcoming renewal?
- Who can I safely share a document with?

The difference between "free" and "pay-worthy" is the difference between *"upload documents"* and *"DueNest tells me what is safe, what is expiring, what is missing, what needs renewal, and what to do next."*

---

## 2. The first paid MVP

The first realistic paid MVP is a **beautiful, trustworthy document vault that thinks for the user**. It includes:

- Beautiful, mobile-friendly document vault UI
- Document records with document-type templates
- File upload with validation
- In-app preview for PDFs and images (no download required)
- Secure, ownership-checked file download
- Smart expiry/status intelligence (auto-derived, not just a manual field)
- Missing-information detection
- "Attention Needed" inbox
- Search, filter, and sort
- A polished document detail/workspace page
- Reminder rules and renewal checklists
- Strong security and ownership checks throughout

### Why users would pay

DueNest helps users **avoid expiry mistakes, lost-document chaos, and last-minute renewal stress**. A single missed passport, visa, insurance, or license deadline can cost money, delay an application, or block travel. The vault's value is not storage — it is *peace of mind that nothing important is quietly expiring*.

What the MVP deliberately leaves out: OCR, sharing, bundles, version history, family vaults, and exports. Those are differentiators layered on a solid base — not part of the first paid release.

---

## 3. Phased roadmap

Phases are ordered by user value, implementation risk, and product readiness. Earlier phases must be solid before later ones begin (e.g. upload → preview → status before sharing or OCR).

### Phase 1 — Production Document Vault MVP

**Why it matters:** Users should be able to add important documents, attach files, preview them, and immediately understand which records need attention — without ever feeling like they are using a raw database.

**Includes:** document records; categories and document-type templates; file uploads; secure file download; in-app PDF/image preview; document detail page; search, filter, and sort; smart status calculation; expiry intelligence; missing-information detection; "Attention Needed" inbox; premium dashboard/vault UI; mobile-friendly management; polished empty/loading/error states.

**Outcomes:**

- Users can store documents and attach files.
- Users can preview PDFs/images without downloading.
- Users can see expiring / expired / missing-info documents at a glance.
- Users can search and filter their vault.
- Users always know what needs action next.

### Phase 2 — Intelligent Renewal Experience

**Why it matters:** Reminders tell users *when* to act. Checklists and renewal workflows tell users *what to prepare* and *how far they are* from being ready.

**Includes:** renewal reminder rules; recommended renewal windows; renewal preparation checklists; document-type-specific checklist templates; renewal readiness score; appointment tracking; renewal process status; renewal history; renewal notes/instructions; monthly action view; calendar/timeline view; weekly document digest.

**Checklist templates:** passport, visa, student pass, insurance, driver license.

**Process statuses:** Not started → Preparing documents → Appointment booked → Submitted → Waiting for approval → Approved → Collected → Completed.

### Phase 3 — Secure Sharing and Collaboration

**Why it matters:** Sharing is high-trust and high-risk. It must come **after** upload, preview, ownership checks, and secure download are solid.

**Implemented foundation:** file-level time-limited share links; revoke links;
view-only/download permissions; optional access-code protection; share activity
log; owner-facing labels, recipient email, and purpose notes.

**Future hardening:** watermarked links; redaction before sharing; email-based
sharing; trusted contacts; emergency access.

**Rules:** unguessable tokens; expiry dates; revocation; never expose internal file paths; never list private files publicly; no access after expiry or revocation; log access where possible.

### Phase 4 — OCR and Automation

**Why it matters:** OCR reduces manual entry but must never be trusted blindly.

**Safety rule:** **OCR must never silently overwrite trusted document data. Users review extracted details before they are applied.**

**Includes:** OCR text extraction; OCR-assisted field suggestions; user review/confirm screen; document-type-specific extraction; document quality checker; smart file naming; duplicate file detection; document mismatch detection; confidence levels; personal-profile comparison.

**Suggested fields:** document type, full name, document/reference number, country, issuer, issue date, expiry date.

**Quality checker examples:** "This image looks blurry." · "The document may be cropped." · "The file is too dark." · "Upload a clearer version for better extraction."

**Mismatch examples:** "Your visa passport number does not match your saved passport number." · "Your insurance name spelling differs from your profile." · "This document uses an old address."

### Phase 5 — Premium Power Features

**Includes:** document version history; document relationships; application/renewal bundles; reusable application packs; document completeness score; bundle readiness score; activity timeline; audit log; trash and restore; export summary as PDF/CSV; download all files as ZIP; renewal cost tracking; institution/contact directory; custom fields per document type; smart tags and labels; sensitive-field masking; document lock mode; private notes.

**Bundle examples:** Student Pass Renewal Bundle · Scholarship Application Bundle · Visa Application Pack · Internship/Job Application Pack · Insurance Claim Pack · Travel Emergency Pack.

**Bundle readiness example:** "Student Pass Renewal Bundle: 4/6 documents ready — Missing: bank statement, insurance certificate."

**Version history example:** "Passport scan — Version 1 — Uploaded Jan 2026" · "Passport scan — Version 2 — Uploaded Jun 2026 — Current version."

### Phase 6 — Family, Travel, and Advanced Use Cases

**Includes:** family/dependent vault; travel document pack; emergency access pack; offline/PWA access; email-to-vault; quick scan from phone; country-specific renewal notes; renewal playbooks; document analytics; calendar export; trusted contacts; (later) organization/team document vault.

**Audiences:** international students, travelers, families, immigrants, freelancers, workers abroad, scholarship applicants, small organizations.

**Emergency pack example:** Emergency Travel Pack — Passport, Visa, Insurance, Residence permit, Emergency contact.

---

## 4. Feature prioritization

Tiers: **Must-have (paid MVP)** · **Should-have (post-MVP)** · **Premium differentiator** · **Advanced/future** · **Do not build yet**.

| Feature | User value | Tech complexity | Security sensitivity | Phase | Reason |
| --- | --- | --- | --- | --- | --- |
| Document records + metadata | High | Low | Medium | 1 (Must-have) | Foundation of the vault; already implemented. |
| File upload + validation | High | Medium | High | 1 (Must-have) | A vault without files is just a list. |
| Secure download | High | Medium | High | 1 (Must-have) | Files must be retrievable only by the owner. |
| In-app preview (PDF/image) | High | Medium | High | 1 (Must-have) | The single biggest "feels premium" jump. |
| Smart status + expiry intelligence | Very high | Medium | Low | 1 (Must-have) | This is the core reason to pay. |
| Missing-information detection | High | Low | Low | 1 (Must-have) | Turns a passive vault into an advisor. |
| Attention Needed inbox | Very high | Medium | Low | 1 (Must-have) | One place that answers "what now?". |
| Search / filter / sort | High | Medium | Low | 1 (Must-have) | Required once a vault has real volume. |
| Document-type templates | Medium | Low | Low | 1 (Must-have) | Makes adding documents fast and consistent. |
| Reminder rules | Very high | Medium | Low | 2 (Must-have) | Acting on time is the promise. |
| Renewal checklists | High | Medium | Low | 2 (Should-have) | Tells users *what to prepare*. |
| Calendar/timeline view | Medium | Medium | Low | 2 (Should-have) | Visualizes the deadline landscape. |
| Renewal process status + history | Medium | Low | Low | 2 (Should-have) | Tracks long renewal journeys. |
| Secure share links | High | High | Very high | 3 (Premium) | High trust; only after the base is solid. |
| OCR-assisted extraction | High | High | High | 4 (Premium) | Saves entry, but review-gated. |
| Document quality / mismatch checks | Medium | High | Medium | 4 (Premium) | Builds confidence in stored data. |
| Application/renewal bundles | High | Medium | Medium | 5 (Premium) | Reusable packs are a strong paid hook. |
| Version history | Medium | Medium | Medium | 5 (Premium) | Important for documents that get re-issued. |
| Activity timeline / audit log | Medium | Medium | High | 5 (Premium) | Trust + accountability. |
| Trash and restore | Medium | Low | Medium | 5 (Should-have) | Safety net for deletions. |
| Exports (PDF/CSV/ZIP) | Medium | Medium | High | 5 (Premium) | Portability and backup. |
| Family/dependent vault | High | High | Very high | 6 (Advanced) | Multi-owner access model needed first. |
| Emergency access pack | Medium | High | Very high | 6 (Advanced) | Sensitive; needs sharing + audit mature. |
| Organization/team vault | Medium | Very high | Very high | 6 (Do not build yet) | Different product; needs roles/billing. |
| Native mobile app | Medium | High | Medium | Future (Do not build yet) | Web/PWA first per product decisions. |

---

## 5. Recommended build order

This is the recommended sequence. It can be adjusted, but the first paid MVP should **not** try to build everything, and sharing/OCR must not come before upload/preview/status are solid.

1. Premium authenticated app UI polish *(done)*
2. Backend file upload foundation *(done)*
3. Frontend document upload UI *(done)*
4. Backend secure preview/download access *(done)*
5. Frontend in-app document preview *(done)*
6. Smart status and expiry intelligence *(done: computed document health)*
7. Search, filter, and sort *(done)*
8. Missing-information detection *(done: missing file / missing expiry flags)*
9. "Attention Needed" inbox *(done)*
10. Renewal reminder rules *(done: rules + calculated upcoming dates; no sending yet)*
11. Renewal preparation checklists *(done: templates + per-document checklists + progress)*
12. Document detail page upgrade *(done: checklists + extracted-details sections added)*
13. Calendar/timeline view *(done: aggregated timeline API + premium timeline UI)*
14. Secure share links *(done: file-level links)*
15. OCR-assisted extraction *(done: local PDF text + Tesseract OCR, review-gated; no third-party OCR)*
16. Application/renewal bundles *(done: bundles + requirements + readiness score)*
17. Activity timeline and audit log *(partially done: file activity)*
18. Version history
19. Emergency access pack
20. Export and backup features

> Steps 1–16 are implemented at foundation level (with notification sending and
> version/emergency/export work still ahead). The **Document Renewal Workspace**
> branch delivered renewal preparation checklists (with shared system
> templates), application/renewal bundles with a readiness score and missing-
> item detection, an aggregated calendar/timeline view, and a review-gated
> OCR-assisted extraction foundation. Files are never sent to a third-party OCR
> service, and extracted values are only ever applied after explicit owner
> review.

---

## 6. Upcoming branch sequence

Realistic, focused branches (backend before its matching frontend):

```txt
backend/document-status-intelligence   # done in feature/document-intelligence-foundation
frontend/document-status-polish        # done in feature/document-intelligence-foundation
backend/document-search-filter         # done in feature/document-intelligence-foundation
frontend/document-search-filter        # done in feature/document-intelligence-foundation
backend/document-attention-inbox       # done in feature/document-intelligence-foundation
frontend/document-attention-inbox      # done in feature/document-intelligence-foundation
backend/document-reminder-rules        # done in feature/document-intelligence-foundation
frontend/document-reminder-experience  # done in feature/document-intelligence-foundation
backend/document-checklists            # done in feature/document-renewal-workspace
frontend/document-checklists           # done in feature/document-renewal-workspace
backend/document-bundles               # done in feature/document-renewal-workspace
frontend/document-bundles              # done in feature/document-renewal-workspace
backend/document-timeline              # done in feature/document-renewal-workspace
frontend/document-timeline             # done in feature/document-renewal-workspace
backend/document-ocr-foundation        # done in feature/document-renewal-workspace (review-gated, no third-party OCR)
frontend/document-ocr-review-ui        # done in feature/document-renewal-workspace
```

---

## 7. Cross-references

- **Data models:** `database-design.md` → "Planned Document Vault Models".
- **APIs:** `api-spec.md` → "Document Vault API Plan" (Implemented / Planned MVP / Future).
- **Security:** `security-plan.md` → "Document Vault Security Plan".
- **Architecture:** `architecture.md` → "Document Vault Architecture Evolution".
- **Sequencing:** `roadmap.md` → "Documents-First Build Sequence".
- **Positioning:** `product-blueprint.md` → "Documents-First Strategy".
