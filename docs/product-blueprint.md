# DueNest Product Blueprint

**Version:** v0.1  
**Status:** Planning  
**Product Type:** SaaS-ready life admin platform  
**Primary Platform:** Responsive web app  
**Future Platform:** Progressive Web App, then native mobile app after validation  

---

## 1. Product Summary

**DueNest** is an AI-powered life admin platform that helps users organize important documents, track deadlines, manage renewals, receive reminders, and generate reusable application document packs.

The platform is designed for people who often manage important documents and deadlines across different places such as emails, cloud drives, laptops, WhatsApp chats, screenshots, paper folders, and memory.

DueNest helps users answer one important question:

> What important document, deadline, renewal, or application requirement am I about to miss?

---

## 1.5 Documents-First Strategy

> **Refocus (2026-06-21):** DueNest is now a **private life-document readiness
> platform**, not a subscription/finance tracker. The legacy Subscription Radar
> is deprecated (see `docs/roadmap.md` §0); recurring renewals live under
> **Deadlines & Renewals**. Older "subscriptions" references below are historical.

DueNest is now sequenced as a **documents-first product**. The long-term vision
(below) is unchanged, but the path to it starts by making **one module** —
the Documents module — strong enough to stand alone as a paid product.

- **Primary MVP:** a premium **document renewal and expiry management vault**.
- **Future expansion:** application packs, deadlines & renewals, an AI assistant,
  and broader document-readiness workflows — layered on top of a proven vault.

The vault's job is not "store documents." It is to help users see which
documents are **safe, incomplete, expiring soon, expired, or ready for
renewal**, and to tell them what to do next. The full phased plan, paid-MVP
definition, prioritization, and build order live in
[`document-vault-roadmap.md`](document-vault-roadmap.md).

### Target audiences (documents-first)

International students · immigrants · travelers · families · professionals ·
freelancers · scholarship applicants · people managing documents across
countries.

---

## 2. Product Vision

The long-term vision of DueNest is to become an **AI-powered life admin operating system** for individuals, students, professionals, immigrants, freelancers, families, and small teams.

DueNest should not only store documents. It should help users stay prepared, avoid missed deadlines, reduce stress, save time, and prevent financial or administrative losses.

---

## 3. Problem Statement

Many people lose time, money, and opportunities because their important documents and deadlines are poorly organized.

Common problems include:

- Forgetting subscription renewals and free-trial endings
- Missing passport, visa, student pass, license, or insurance expiry dates
- Losing track of certificates, transcripts, CVs, contracts, and recommendation letters
- Repeating the same document preparation process for every application
- Forgetting contract, domain, warranty, hosting, or software renewal deadlines
- Searching across email, Google Drive, WhatsApp, laptop folders, and physical files
- Not knowing which documents are expired, expiring soon, or missing

For students, professionals, immigrants, and small teams, missing one important deadline can delay an application, cost money, block an opportunity, or create unnecessary stress.

---

## 4. Proposed Solution

DueNest provides one secure workspace where users can:

- Upload and organize essential documents
- Track expiry dates and renewal dates
- Manage subscriptions and recurring obligations
- Receive reminders before important deadlines
- Create reusable application document packs
- Search, filter, and categorize documents
- View upcoming deadlines from a central dashboard
- Later use AI to classify documents and extract key dates automatically

The product starts as a manual but useful platform, then evolves into an intelligent automation system.

---

## 5. Core Product Pillars

| Pillar | Description |
| --- | --- |
| Document Vault | Store, organize, and manage important documents securely |
| Deadline Intelligence | Track expiry dates, renewals, preparation windows, and upcoming actions |
| Application Readiness | Generate reusable document packs for jobs, scholarships, visas, internships, universities, and grants |
| AI Automation | Extract document metadata, classify documents, detect dates, and suggest actions |
| Reminder System | Notify users before important dates through in-app and email reminders |
| Secure Sharing | Allow users to share application packs through controlled, expiring links in later versions |

---

## 6. Target Users

### 6.1 Students

Students need to manage transcripts, certificates, CVs, recommendation letters, scholarship documents, internship documents, and university application materials.

### 6.2 International Students and Immigrants

International students and immigrants need to track visas, passports, student passes, insurance, residence permits, admission letters, financial documents, and renewal deadlines.

### 6.3 Professionals

Professionals need to manage CVs, certifications, licenses, contracts, work permits, IDs, and job application documents.

### 6.4 Freelancers

Freelancers need to manage client contracts, invoices, software subscriptions, domain renewals, hosting renewals, and business documents.

### 6.5 Families

Families may need to manage shared documents such as passports, IDs, insurance policies, warranties, school documents, and household renewals.

### 6.6 Small Teams

Small teams may need to manage business licenses, contracts, vendor renewals, software tools, company documents, and compliance deadlines.

---

## 7. Primary Use Cases

### Use Case 1: Track an Expiring Document

A user uploads a passport, visa, insurance policy, certificate, or license and adds an expiry date. DueNest shows the document status and reminds the user before it expires.

### Use Case 2: Manage a Subscription Renewal

A user adds a subscription or recurring payment such as software, hosting, domain, insurance, or membership. DueNest tracks the renewal date and cost.

### Use Case 3: Prepare an Application Pack

A user creates a document pack for a scholarship, job, visa, internship, university application, or grant. The user selects documents from the vault and exports them as a reusable bundle.

### Use Case 4: View Upcoming Deadlines

A user opens the dashboard and immediately sees documents expiring soon, renewals due soon, expired items, and important upcoming actions.

### Use Case 5: Receive Reminders

A user receives reminders before important dates so they can prepare, renew, cancel, or update documents on time.

### Use Case 6: AI-Assisted Extraction

In a later version, the user uploads a document and DueNest automatically detects the document type, expiry date, provider, amount, renewal date, and suggested action.

---

## 8. MVP Scope: v0.1

The first version should be useful without AI. It should prove the core product value manually before automation is added.

### v0.1 Features

- User registration and login
- Protected dashboard
- Document vault
- Manual document metadata entry
- File upload
- Document categories
- Issue date and expiry date tracking
- Document status calculation
- Renewal and subscription tracker
- Renewal date tracking
- Subscription amount and currency
- Dashboard with upcoming deadlines
- Basic reminder records
- Application pack creation
- Ability to select documents for a pack
- Basic ZIP export for application packs
- Responsive web interface

### v0.1 Goal

The goal of v0.1 is to allow a user to:

> Create an account, upload important documents, track expiry and renewal dates, view upcoming deadlines, and generate a simple application document pack.

---

## 9. Out of Scope for v0.1

These features are important but should not be built in the first version:

- AI document extraction
- OCR
- Gmail scanning
- Google Calendar integration
- WhatsApp or Telegram reminders
- Bank transaction import
- Browser extension
- Native mobile app
- Team workspaces
- Role-based access control
- SaaS billing
- Subscription payment system
- Advanced analytics
- Secure public sharing links
- Contract clause analysis
- Cancellation assistant

These features should be added only after the core manual product works properly.

---

## 10. Feature Roadmap

### v0.1 — Core MVP

Focus: manual tracking, document vault, renewals, dashboard, and application packs.

### v0.2 — Smart Automation

Focus: PDF extraction, AI document classification, expiry date extraction, confidence score, and user confirmation flow.

### v0.3 — Application Packs and Secure Sharing

Focus: reusable templates, ZIP export, secure share links, access logs, link expiration, and revocation.

### v0.4 — Integrations

Focus: Gmail scanning, Google Calendar reminders, email reminders, cloud storage integration, and optional WhatsApp or Telegram reminders.

### v0.5 — Team and Family Workspace

Focus: shared workspaces, family/team members, ownership roles, shared documents, and collaborative renewal tracking.

### v1.0 — SaaS-Ready Release

Focus: production deployment, polished landing page, demo account, CI/CD, tests, monitoring, security hardening, and pricing foundation.

---

## 11. Key Workflows

### 11.1 Document Upload Workflow

1. User logs in.
2. User opens the Document Vault.
3. User uploads a document.
4. User adds title, category, document type, issue date, expiry date, and notes.
5. DueNest stores the document and metadata.
6. DueNest calculates the document status.
7. The document appears in the vault and dashboard if relevant.

### 11.2 Renewal Tracking Workflow

1. User opens the Renewal Tracker.
2. User creates a renewal item.
3. User enters provider, amount, currency, renewal date, frequency, category, and notes.
4. DueNest stores the renewal.
5. DueNest displays upcoming renewals and cost summaries.

### 11.3 Application Pack Workflow

1. User opens Application Packs.
2. User creates a new pack.
3. User selects a purpose such as scholarship, job, visa, internship, university, or grant.
4. User selects documents from the vault.
5. DueNest saves the pack.
6. User can view, edit, or export the pack.

### 11.4 Reminder Workflow

1. User adds expiry or renewal information.
2. DueNest creates or suggests reminder dates.
3. Reminder appears in the dashboard.
4. Later versions send email or push notifications before the deadline.

---

## 12. User Stories

### Authentication

- As a user, I want to create an account so that my documents and deadlines are private.
- As a user, I want to log in securely so that only I can access my workspace.

### Document Vault

- As a user, I want to upload important documents so that I can access them from one place.
- As a user, I want to add expiry dates so that I know when documents need renewal.
- As a user, I want to categorize documents so that I can find them quickly.
- As a user, I want to see whether a document is valid, expiring soon, or expired.

### Renewals

- As a user, I want to add subscriptions and renewals so that I do not forget recurring payments.
- As a user, I want to track renewal cost so that I understand my monthly and yearly obligations.
- As a user, I want to add cancellation links so that I can take action before renewal.

### Dashboard

- As a user, I want to see upcoming deadlines so that I know what needs attention.
- As a user, I want to see expired documents so that I can update them.
- As a user, I want to see renewals due soon so that I can renew, cancel, or prepare.

### Application Packs

- As a user, I want to create a document pack so that I can prepare faster for applications.
- As a user, I want to reuse document packs so that I do not repeat the same work.
- As a user, I want to export selected documents so that I can submit them when needed.

### AI Automation

- As a user, I want DueNest to detect document type automatically so that I do not manually fill everything.
- As a user, I want DueNest to extract expiry dates automatically so that I save time.
- As a user, I want to confirm AI results so that wrong extracted data does not affect my deadlines.

---

## 13. Success Metrics

### Product Metrics

- Number of documents uploaded
- Number of renewal items created
- Number of application packs created
- Number of upcoming deadlines tracked
- Number of reminders created
- Percentage of users who return after first setup
- Number of expired or expiring items detected

### Technical Metrics

- Successful authentication flow
- Successful document upload rate
- API response reliability
- Dashboard load performance
- File access security
- Background reminder job reliability
- Test coverage for core modules

### Portfolio Metrics

- Clean repository structure
- Professional README
- Clear documentation
- Deployed demo
- Architecture diagram
- Database design
- API specification
- Test coverage
- Demo video or screenshots

---

## 14. MVP Acceptance Criteria

v0.1 can be considered complete when:

- A user can register and log in.
- A user can access a protected dashboard.
- A user can upload a document.
- A user can add document metadata.
- A user can see all uploaded documents.
- A user can filter or categorize documents.
- A user can see document expiry status.
- A user can create a renewal item.
- A user can see upcoming renewals.
- A user can see upcoming deadlines on the dashboard.
- A user can create an application pack.
- A user can add documents to an application pack.
- A user can export or prepare selected documents.
- The app has a clean responsive interface.
- The backend and frontend can run locally.
- The project has basic documentation.
- Sensitive files are not publicly exposed.

---

## 15. Non-Functional Requirements

### Security

- Users must only access their own documents and data.
- Uploaded files must not be publicly accessible by default.
- Secrets must be stored in environment variables.
- File uploads must be validated.
- Real sensitive documents should not be used during development.

### Performance

- Dashboard should load quickly for normal user data.
- Document lists should support pagination or filtering as the dataset grows.
- Background jobs should handle reminders without blocking user requests.

### Usability

- The interface should be simple and clear.
- Empty states should guide users.
- Forms should be easy to complete.
- Users should understand what action is needed next.

### Maintainability

- Backend should use modular Django apps.
- Frontend should use reusable components.
- API contracts should be documented.
- Code should be readable and tested progressively.

### Scalability

- The first version should be a modular monolith.
- Microservices should not be used at the beginning.
- AI services may later be separated if needed.

---

## 16. Product Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Product becomes too broad | Slow development and unclear MVP | Start with documents, renewals, dashboard, and application packs |
| Security concerns | Users may not trust the platform | Add clear security principles and private-by-default design |
| AI extraction errors | Wrong deadlines could harm users | Use confidence scores and user confirmation |
| Overengineering | Project may become too complex | Use modular monolith and staged roadmap |
| Weak differentiation | Looks like a simple reminder app | Focus on document vault, application packs, and life admin workflows |
| User trust | Users may hesitate to upload sensitive files | Use demo data first and build strong privacy controls |

---

## 17. Key Product Decisions

### Decision 1: Web App First

DueNest will start as a responsive web app because the first version requires dashboards, tables, uploads, document management, and settings.

### Decision 2: PWA Second

After the web app works, DueNest can become a Progressive Web App for installable mobile-like access and faster deadline checking.

### Decision 3: Native Mobile Later

A native mobile app should be considered only after the web app and PWA are validated.

### Decision 4: Django REST Framework Backend

Django REST Framework is selected because DueNest requires authentication, database models, file uploads, admin features, security, background jobs, and structured APIs.

### Decision 5: Modular Monolith

DueNest will start as a modular monolith. Microservices are not needed at the beginning.

### Decision 6: AI Comes After Core Product

AI will be added after the manual product is working. This avoids building automation before the core workflow is validated.

---

## 18. Future Advanced Features

These features can make DueNest much stronger later:

- AI document extraction
- OCR for scanned documents
- Gmail renewal scanner
- Google Calendar reminders
- Secure document sharing links
- Application templates
- Family workspace
- Team workspace
- Role-based access control
- Contract auto-renewal clause detection
- Cancellation assistant
- Subscription cost optimization
- Browser extension for trial detection
- Mobile document scanner
- Push notifications
- Document versioning
- Access logs and audit trail
- SaaS billing and pricing plans

---

## 19. First Implementation Priority

The first implementation priority is:

1. Backend foundation
2. Authentication
3. Document model
4. Document upload
5. Renewal model
6. Dashboard summary
7. Application pack model
8. Basic reminder model

The first technical goal is not AI. The first goal is to build a stable, secure, and useful core product.

---

## 20. Summary

DueNest is a serious full-stack SaaS project designed to solve real document, deadline, renewal, and application preparation problems.

The product should be built in stages:

1. Build the manual core product.
2. Add reminders and dashboard intelligence.
3. Add application packs.
4. Add AI extraction.
5. Add integrations.
6. Add secure sharing.
7. Prepare for SaaS launch.

The project should remain focused, secure, well-documented, and execution-driven.