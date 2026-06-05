<p align="center">
  <img src="./brand/logo/duenest-logo.png" alt="DueNest Logo" width="396" />
</p>

<h1 align="center">DueNest</h1>

<p align="center">
  <strong>AI-powered life admin platform for documents, deadlines, renewals, reminders, and application-ready document packs.</strong>
</p>

<p align="center">
  Never miss what matters. Keep your documents ready. Stay ahead of every deadline.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-planning-blue" alt="Project Status" />
  <img src="https://img.shields.io/badge/frontend-Next.js-black" alt="Frontend" />
  <img src="https://img.shields.io/badge/backend-Django%20REST%20Framework-092E20" alt="Backend" />
  <img src="https://img.shields.io/badge/database-PostgreSQL-336791" alt="Database" />
  <img src="https://img.shields.io/badge/AI-planned-purple" alt="AI Planned" />
  <img src="https://img.shields.io/badge/license-private-lightgrey" alt="License" />
</p>

---

## Overview

**DueNest** is a SaaS-ready full-stack platform designed to help users manage important documents, deadlines, renewals, reminders, subscriptions, and reusable application document packs in one secure workspace.

The platform helps users organize essential files, track expiry dates, manage recurring obligations, receive deadline reminders, and prepare application-ready document bundles for jobs, scholarships, visas, internships, universities, grants, and professional opportunities.

The long-term vision is to turn DueNest into an **AI-powered life admin operating system** for students, professionals, immigrants, freelancers, families, and small teams.

---

## Table of Contents

- [Overview](#overview)
- [Table of Contents](#table-of-contents)
- [Problem](#problem)
- [Solution](#solution)
- [Product Vision](#product-vision)
- [Core Features](#core-features)
  - [v0.1 — Core MVP](#v01--core-mvp)
  - [v0.2 — Smart Automation](#v02--smart-automation)
  - [v0.3 — Application Packs \& Secure Sharing](#v03--application-packs--secure-sharing)
  - [v0.4 — Integrations](#v04--integrations)
  - [v1.0 — SaaS-Ready Product](#v10--saas-ready-product)
- [Target Users](#target-users)
- [Tech Stack](#tech-stack)
  - [Frontend](#frontend)
  - [Backend](#backend)
  - [AI \& Document Processing](#ai--document-processing)
  - [DevOps \& Infrastructure](#devops--infrastructure)
- [Platform Strategy](#platform-strategy)
- [Planned Architecture](#planned-architecture)
- [Repository Structure](#repository-structure)
- [Brand Assets](#brand-assets)
- [Product Modules](#product-modules)
  - [Authentication](#authentication)
  - [Document Vault](#document-vault)
  - [Deadline Tracker](#deadline-tracker)
  - [Renewal Manager](#renewal-manager)
  - [Application Packs](#application-packs)
  - [Reminder System](#reminder-system)
  - [Dashboard](#dashboard)
  - [AI Extraction](#ai-extraction)
- [Project Status](#project-status)
  - [Status Legend](#status-legend)
- [Current Focus](#current-focus)
- [Roadmap](#roadmap)
  - [Sprint Progress](#sprint-progress)
  - [Goal](#goal)
  - [Tasks](#tasks)
  - [Deliverable](#deliverable)
  - [Goal](#goal-1)
  - [Tasks](#tasks-1)
  - [Deliverable](#deliverable-1)
  - [Goal](#goal-2)
  - [Tasks](#tasks-2)
  - [Deliverable](#deliverable-2)
  - [Goal](#goal-3)
  - [Tasks](#tasks-3)
  - [Deliverable](#deliverable-3)
  - [Goal](#goal-4)
  - [Tasks](#tasks-4)
  - [Deliverable](#deliverable-4)
  - [Goal](#goal-5)
  - [Tasks](#tasks-5)
  - [Deliverable](#deliverable-5)
  - [Goal](#goal-6)
  - [Tasks](#tasks-6)
  - [Deliverable](#deliverable-6)
  - [Goal](#goal-7)
  - [Tasks](#tasks-7)
  - [Deliverable](#deliverable-7)
  - [Goal](#goal-8)
  - [Tasks](#tasks-8)
  - [Deliverable](#deliverable-8)
- [Documentation](#documentation)
- [Security Principles](#security-principles)
- [Local Development](#local-development)
- [Git Workflow](#git-workflow)
- [Why This Project Matters](#why-this-project-matters)
- [Disclaimer](#disclaimer)
- [Author](#author)
- [Note](#note)

---

## Problem

Important documents, renewals, subscriptions, and deadlines are often scattered across emails, cloud drives, laptops, WhatsApp chats, screenshots, paper folders, and memory.

This creates real problems:

- Forgotten subscription renewals and trial endings
- Missed visa, passport, insurance, or license expiry dates
- Lost certificates, transcripts, CVs, recommendation letters, and application documents
- Repeated preparation of the same documents for different applications
- Missed contract, domain, hosting, warranty, or professional renewal deadlines
- Lack of one trusted workspace for personal and professional life admin
- Stress, wasted time, lost money, and missed opportunities caused by poor deadline tracking

For many people, missing one important deadline can delay an application, create unnecessary financial loss, or block an opportunity.

---

## Solution

DueNest provides one secure workspace where users can:

- Store essential documents
- Track expiry dates and renewal deadlines
- Manage subscriptions and recurring obligations
- Receive reminders before important dates
- Create reusable application document packs
- Organize documents by category, purpose, and status
- Later use AI to extract dates, classify documents, and suggest actions automatically

DueNest is not only a reminder app. It is designed to become a trusted system for managing important personal, academic, professional, and administrative obligations.

---

## Product Vision

DueNest is built around one core question:

> What important document, deadline, renewal, or application requirement am I about to miss?

The product is designed around four main pillars:

| Pillar | Description |
| --- | --- |
| Document Vault | Securely store and organize important documents |
| Deadline Intelligence | Track expiry dates, renewals, and preparation windows |
| Application Readiness | Generate reusable document packs for applications |
| AI Automation | Extract metadata, classify documents, and suggest actions |

---

## Core Features

### v0.1 — Core MVP

The first version focuses on building a stable, useful, and professional foundation.

- User authentication
- Secure document vault
- Manual document metadata entry
- Expiry date tracking
- Renewal and subscription tracker
- Dashboard for upcoming deadlines
- Basic reminders
- Application document packs
- Document categories and statuses
- Responsive web interface

### v0.2 — Smart Automation

This version introduces intelligent document processing.

- PDF text extraction
- AI-powered document classification
- Expiry date extraction
- Renewal date extraction
- Confidence score for extracted data
- User confirmation and correction flow
- Smart reminder suggestions

### v0.3 — Application Packs & Secure Sharing

This version makes DueNest more useful for real applications.

- Create reusable document packs
- Download selected documents as ZIP files
- Generate secure share links
- Add link expiration
- Track access logs
- Revoke shared access
- Add templates for jobs, scholarships, visas, internships, grants, and universities

### v0.4 — Integrations

This version connects DueNest with user workflows.

- Gmail scanning for renewal and subscription emails
- Google Calendar reminders
- Email notifications
- Optional WhatsApp or Telegram reminders
- Cloud storage integration

### v1.0 — SaaS-Ready Product

This version prepares DueNest for public demonstration or launch.

- Polished landing page
- Demo account
- Public documentation
- CI/CD pipeline
- Automated tests
- Production deployment
- Security hardening
- Monitoring and error tracking
- Pricing page
- Billing foundation

---

## Target Users

| User Group | Use Case |
| --- | --- |
| Students | Scholarships, internships, university applications, certificates |
| International students | Visas, passports, insurance, school documents, application packs |
| Professionals | CVs, certificates, licenses, contracts, job applications |
| Freelancers | Client contracts, invoices, software subscriptions, renewals |
| Families | Shared documents, IDs, insurance, household renewals |
| Small teams | Business documents, tools, licenses, vendor renewals |

---

## Tech Stack

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- TanStack Query
- Recharts

### Backend

- Django
- Django REST Framework
- PostgreSQL
- Celery
- Redis
- Django Simple JWT
- Django CORS Headers

### AI & Document Processing

Planned for later versions:

- OCR
- PDF text extraction
- LLM-powered structured extraction
- Document classification
- Metadata extraction
- Confidence scoring

### DevOps & Infrastructure

Planned:

- Docker
- Docker Compose
- GitHub Actions
- PostgreSQL
- Redis
- Vercel for frontend deployment
- Render, Railway, Fly.io, or similar for backend deployment
- S3-compatible storage for documents

---

## Platform Strategy

DueNest will be built in this order:

1. **Responsive Web App**  
   The main product experience for document management, dashboards, uploads, tables, application packs, and settings.

2. **Progressive Web App**  
   An installable mobile-like experience for quick access, reminders, and deadline checking.

3. **Native Mobile App**  
   A future app focused on quick uploads, document scanning, mobile reminders, and deadline alerts.

The first version will prioritize a high-quality web dashboard because the product requires forms, file uploads, data tables, charts, settings, and workflow management.

---

## Planned Architecture

```txt
DueNest
│
├── Frontend
│   └── Next.js + TypeScript
│
├── Backend API
│   └── Django REST Framework
│
├── Database
│   └── PostgreSQL
│
├── Background Jobs
│   └── Celery + Redis
│
├── File Storage
│   ├── Local development storage
│   └── S3-compatible production storage later
│
└── AI Layer
    ├── OCR
    ├── PDF extraction
    ├── Document classification
    └── Metadata extraction
```

---

## Repository Structure

```txt
duenest/
│
├── backend/
│   └── Django + Django REST Framework backend
│
├── frontend/
│   └── Next.js + TypeScript frontend
│
├── docs/
│   ├── product-blueprint.md
│   ├── architecture.md
│   ├── database-design.md
│   ├── api-spec.md
│   ├── roadmap.md
│   └── security-plan.md
│
├── brand/
│   ├── logo/
│   ├── icons/
│   ├── colors/
│   ├── social/
│   ├── guidelines/
│   ├── messaging/
│   └── README.md
│
├── .github/
│   ├── workflows/
│   └── ISSUE_TEMPLATE/
│
├── README.md
└── docker-compose.yml
```

---

## Brand Assets

DueNest brand assets are stored in the `brand/` folder.

This includes:

- Logo variations
- App icons and favicons
- Color palette
- UI design tokens
- Social and pitch assets
- Brand guidelines
- Messaging references

The main logo used in this README is located at:

```txt
brand/logo/duenest-logo.png
```

Brand asset folders:

| Folder | Purpose |
| --- | --- |
| `brand/logo/` | Main logo, logo variations, SVG and PNG assets |
| `brand/icons/` | Favicons, app icons, and PWA icon assets |
| `brand/colors/` | Color palette, CSS variables, and UI tokens |
| `brand/social/` | Social banners, Open Graph images, and pitch visuals |
| `brand/guidelines/` | Brand guideline documents |
| `brand/messaging/` | Messaging system, landing copy, and profile copy |

---

## Product Modules

### Authentication

User registration, login, protected routes, user profile, and secure access to personal data.

### Document Vault

A secure place to upload, categorize, search, preview, and manage important documents.

### Deadline Tracker

Tracks expiry dates, renewal dates, preparation windows, and upcoming actions.

### Renewal Manager

Manages subscriptions, contracts, warranties, domains, insurance, licenses, and recurring obligations.

### Application Packs

Allows users to bundle documents for specific use cases such as scholarships, jobs, visas, internships, grants, or university applications.

### Reminder System

Sends reminders before important dates and helps users stay ahead of deadlines.

### Dashboard

Provides a clear overview of upcoming deadlines, expired documents, active renewals, monthly costs, and important actions.

### AI Extraction

Uses AI to extract document type, expiry date, provider, amount, renewal date, and recommended actions from uploaded files.

---

## Project Status

| Area | Status |
| --- | --- |
| Planning | 🟡 In Progress |
| Branding | ✅ Completed |
| Repository Setup | ✅ Completed |
| Backend | ⚪ Not Started |
| Frontend | ⚪ Not Started |
| MVP Development | ⚪ Not Started |
| AI Features | 🔵 Planned |
| Deployment | 🔵 Planned |

### Status Legend

| Symbol | Meaning |
| --- | --- |
| ✅ | Completed |
| 🟡 | In Progress |
| 🔵 | Planned |
| ⚪ | Not Started |
| 🔴 | Blocked |

---

## Current Focus

The current focus is preparing the technical foundation for implementation.

- Finalizing core project documentation
- Organizing product and technical planning files
- Preparing backend architecture
- Preparing frontend architecture
- Preparing the first Django REST Framework backend sprint
- Keeping the repository clean, structured, and implementation-ready

---

## Roadmap

### Sprint Progress

- [x] Sprint 0 — Project Foundation
- [ ] Sprint 1 — Backend Foundation
- [ ] Sprint 2 — Frontend Foundation
- [ ] Sprint 3 — Document Vault
- [ ] Sprint 4 — Renewal Tracker
- [ ] Sprint 5 — Dashboard
- [ ] Sprint 6 — Application Packs
- [ ] Sprint 7 — Reminders
- [ ] Sprint 8 — AI Extraction

---

<details>
<summary><strong>Sprint 0 — Project Foundation</strong> ✅</summary>

### Goal

Prepare the repository, documentation, branding, roadmap, and initial product structure.

### Tasks

- [x] Create GitHub repository
- [x] Configure repository visibility and description
- [x] Clone repository using SSH
- [x] Create project foundation branch
- [x] Set up backend folder
- [x] Set up frontend folder
- [x] Set up docs folder
- [x] Set up brand folder
- [x] Set up GitHub workflow folders
- [x] Add initial README
- [x] Add initial project documentation placeholders
- [x] Add brand assets to repository
- [ ] Add full product blueprint in Markdown
- [ ] Add architecture document
- [ ] Add database ERD
- [ ] Add API specification
- [ ] Add security plan

### Deliverable

A clean, professional repository foundation ready for backend and frontend implementation.

</details>

<details>
<summary><strong>Sprint 1 — Backend Foundation</strong> ⚪</summary>

### Goal

Set up the Django backend foundation.

### Tasks

- [ ] Create Django project
- [ ] Create modular backend app structure
- [ ] Configure Django REST Framework
- [ ] Configure environment variables
- [ ] Configure PostgreSQL
- [ ] Create custom user model
- [ ] Add JWT authentication
- [ ] Configure CORS
- [ ] Configure development settings
- [ ] Add backend README
- [ ] Add initial backend tests

### Deliverable

A working Django REST API foundation with authentication support.

</details>

<details>
<summary><strong>Sprint 2 — Frontend Foundation</strong> ⚪</summary>

### Goal

Set up the Next.js frontend foundation.

### Tasks

- [ ] Create Next.js application
- [ ] Configure TypeScript
- [ ] Configure Tailwind CSS
- [ ] Install and configure shadcn/ui
- [ ] Create global layout
- [ ] Build landing page
- [ ] Build login page
- [ ] Build register page
- [ ] Create dashboard layout
- [ ] Create protected route structure
- [ ] Set up API client
- [ ] Connect frontend to backend API

### Deliverable

A working frontend foundation with landing page, authentication screens, and dashboard shell.

</details>

<details>
<summary><strong>Sprint 3 — Document Vault</strong> ⚪</summary>

### Goal

Build the first core product module for managing essential documents.

### Tasks

- [ ] Create document model
- [ ] Create document serializer
- [ ] Create document API endpoints
- [ ] Add file upload support
- [ ] Add document listing
- [ ] Add document detail view
- [ ] Add document metadata editing
- [ ] Add document deletion
- [ ] Add categories and document types
- [ ] Add expiry date field
- [ ] Add expiry status calculation
- [ ] Build document vault frontend page

### Deliverable

Users can upload, view, organize, edit, and manage important documents.

</details>

<details>
<summary><strong>Sprint 4 — Renewal Tracker</strong> ⚪</summary>

### Goal

Build the renewal and subscription management module.

### Tasks

- [ ] Create renewal model
- [ ] Create renewal serializer
- [ ] Create renewal API endpoints
- [ ] Add subscription amount and currency
- [ ] Add renewal date
- [ ] Add recurring frequency
- [ ] Add provider field
- [ ] Add cancellation URL
- [ ] Add renewal status
- [ ] Build renewal tracker frontend page
- [ ] Add monthly and yearly cost summary

### Deliverable

Users can manage subscriptions, renewals, and recurring obligations.

</details>

<details>
<summary><strong>Sprint 5 — Dashboard</strong> ⚪</summary>

### Goal

Build the central dashboard experience.

### Tasks

- [ ] Add upcoming deadlines widget
- [ ] Add expiring documents widget
- [ ] Add renewals due soon widget
- [ ] Add expired items widget
- [ ] Add subscription cost summary
- [ ] Add deadline timeline
- [ ] Add quick action cards
- [ ] Add basic charts
- [ ] Add empty states
- [ ] Improve responsive layout

### Deliverable

Users can quickly understand what requires attention and what deadlines are approaching.

</details>

<details>
<summary><strong>Sprint 6 — Application Packs</strong> ⚪</summary>

### Goal

Allow users to prepare reusable document bundles for applications.

### Tasks

- [ ] Create application pack model
- [ ] Create pack-document relationship
- [ ] Create application pack API endpoints
- [ ] Build pack creation form
- [ ] Allow users to select documents
- [ ] Add pack details page
- [ ] Add pack editing
- [ ] Add ZIP export
- [ ] Add templates for jobs, scholarships, visas, and university applications

### Deliverable

Users can generate reusable document packs for real-world applications.

</details>

<details>
<summary><strong>Sprint 7 — Reminders</strong> ⚪</summary>

### Goal

Build the reminder and notification foundation.

### Tasks

- [ ] Create reminder model
- [ ] Create notification model
- [ ] Add reminder API endpoints
- [ ] Add notification API endpoints
- [ ] Configure Celery
- [ ] Configure Redis
- [ ] Add background reminder jobs
- [ ] Add in-app notifications
- [ ] Add email reminder foundation
- [ ] Add reminder preferences

### Deliverable

Users can receive reminders before important deadlines and renewal dates.

</details>

<details>
<summary><strong>Sprint 8 — AI Extraction</strong> 🔵</summary>

### Goal

Add intelligent document processing and metadata extraction.

### Tasks

- [ ] Add PDF text extraction
- [ ] Add OCR foundation
- [ ] Add document classification
- [ ] Extract expiry dates
- [ ] Extract renewal dates
- [ ] Extract provider names
- [ ] Extract document type
- [ ] Add confidence score
- [ ] Add user confirmation workflow
- [ ] Save extraction results
- [ ] Allow user corrections

### Deliverable

DueNest can intelligently extract useful metadata from uploaded documents.

</details>

---

## Documentation

Detailed project documentation will be maintained in the `docs/` folder.

| Document | Purpose |
| --- | --- |
| `product-blueprint.md` | Product vision, target users, features, MVP scope, and product strategy |
| `architecture.md` | System architecture, technical decisions, and platform structure |
| `database-design.md` | Database models, relationships, indexes, and ERD planning |
| `api-spec.md` | API endpoints, request/response formats, and backend contracts |
| `roadmap.md` | Sprint plan, feature prioritization, and release roadmap |
| `security-plan.md` | Security principles, risks, privacy controls, and protection strategy |

---

## Security Principles

DueNest may handle sensitive personal documents, so security is a core product principle.

Planned security practices include:

- Private-by-default documents
- Strict user ownership checks
- Secure authentication
- Encrypted file storage in production
- Signed URLs for document access
- Expiring share links
- Access logs
- Revocable sharing
- Environment variables for secrets
- No hardcoded credentials
- Secure file upload validation
- Careful handling of personal documents

During development, only test or sample documents should be used.

> Do not upload real passports, visas, IDs, certificates, financial documents, or private documents during development.

---

## Local Development

Local setup instructions will be added as the backend and frontend are implemented.

Expected development flow:

```bash
# Clone the repository
git clone git@github.com:nouhandoumbouya655/duenest.git

# Enter the project
cd duenest
```

Backend, frontend, database, and Docker setup instructions will be documented in future implementation sprints.

---

## Git Workflow

This project follows a branch-based workflow.

Example branches:

```txt
setup/project-foundation
docs/initial-readme
brand/add-initial-assets
backend/django-setup
frontend/nextjs-setup
feature/authentication
feature/document-vault
feature/renewal-tracker
feature/dashboard
feature/application-packs
feature/reminders
feature/ai-extraction
```

Commit message examples:

```txt
chore: initialize project structure
docs: add product roadmap
brand: add initial brand assets
feat: add user registration API
feat: build document upload endpoint
fix: correct expiry status calculation
refactor: reorganize document services
test: add renewal model tests
```

---

## Why This Project Matters

DueNest is not a basic CRUD project. It is designed to demonstrate real software engineering ability through:

- Full-stack architecture
- Authentication
- File handling
- Database modeling
- Background jobs
- Dashboards
- Reminders
- Security-conscious design
- AI-powered automation
- Product thinking
- SaaS execution
- Professional documentation

The goal is to build something that can serve as both a standout portfolio project and a serious startup MVP.

---

## Disclaimer

DueNest is currently in early development. The project is not yet production-ready and should not be used to store real sensitive documents until security, storage, access control, deployment hardening, and privacy controls are fully implemented.

---

## Author

Built by **Nouhan Doumbouya**.

DueNest is built as a flagship full-stack SaaS project focused on real-world product design, secure document workflows, deadline intelligence, and AI-powered automation.

---

## Note

DueNest is currently under active planning and early development. The repository will evolve as the product moves from foundation setup to working MVP.
