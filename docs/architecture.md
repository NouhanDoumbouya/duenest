# DueNest System Architecture

**Version:** v0.1  
**Status:** Planning  
**Architecture Style:** SaaS-ready modular monolith  
**Primary Platform:** Responsive web app  
**Backend:** Django + Django REST Framework  
**Frontend:** Next.js + TypeScript  
**Database:** PostgreSQL  
**Background Processing:** Celery + Redis  
**Storage:** Local development storage, S3-compatible production storage later  

---

## 1. Architecture Summary

DueNest will be built as a **SaaS-ready modular monolith** using a modern full-stack architecture.

The system will use:

- **Next.js** for the web frontend
- **Django REST Framework** for the backend API
- **PostgreSQL** as the primary relational database
- **Celery + Redis** for background jobs and scheduled reminders
- **S3-compatible object storage** for production file storage
- **Docker Compose** for local development orchestration
- **GitHub Actions** for continuous integration
- **Vercel** for frontend deployment
- **Render, Railway, Fly.io, or similar** for backend deployment

The first version will avoid microservices because the product is still in early development, has one primary development team, and requires rapid iteration. Instead, the backend will be organized into clear domain modules so that the system remains maintainable and can evolve into distributed services later if justified.

---

## 2. Architectural Goals

DueNest architecture is designed around the following goals:

| Goal | Description |
| --- | --- |
| Product velocity | Build and iterate quickly without unnecessary infrastructure complexity |
| Maintainability | Keep backend and frontend code modular, readable, and testable |
| Security | Protect sensitive documents, user data, authentication flows, and file access |
| Scalability | Start simple but design boundaries that allow future growth |
| Reliability | Support reminders, background jobs, and document workflows predictably |
| Extensibility | Allow future AI extraction, integrations, sharing, billing, and team workspaces |
| Developer experience | Keep local setup, testing, and deployment understandable for a solo or small-team workflow |
| Recruiter-readiness | Demonstrate real-world engineering decisions, not only feature implementation |

---

## 3. High-Level Architecture

```mermaid
flowchart TD
    User["User"] --> Browser["Browser / PWA"]

    Browser --> Frontend["Next.js Frontend"]

    Frontend --> API["Django REST API"]

    API --> DB["PostgreSQL Database"]
    API --> Storage["File Storage"]
    API --> Redis["Redis Broker"]

    Redis --> Worker["Celery Workers"]

    Worker --> DB
    Worker --> Storage
    Worker --> Email["Email Provider Later"]
    Worker --> AI["AI / OCR Layer Later"]

    API --> Admin["Django Admin"]
```

### Description

The user interacts with the Next.js frontend through a browser or future PWA. The frontend communicates with the Django REST API. The backend owns authentication, authorization, business logic, database operations, file metadata, reminders, and application pack workflows.

Files are stored outside the database. PostgreSQL stores file metadata, ownership, expiry dates, renewal records, and relationships. Celery workers handle asynchronous work such as reminders, notifications, document processing, and future AI extraction.

---

## 4. Key Architectural Decisions

### 4.1 Modular Monolith Instead of Microservices

DueNest will start as a **modular monolith**.

This means the backend runs as one Django application, but the codebase is separated into clear domain modules:

- `users`
- `documents`
- `renewals`
- `reminders`
- `notifications`
- `application_packs`
- `ai_extraction`

Each module owns its models, serializers, views, services, permissions, and tests.

#### Why not microservices now?

Microservices are not appropriate for v0.1 because:

- The product is not yet validated.
- The team is small.
- Distributed infrastructure would slow development.
- Cross-service authentication, networking, logging, deployment, and debugging would add unnecessary complexity.
- Most domain operations are still tightly connected.
- PostgreSQL relational integrity is valuable at this stage.

Microservices may be considered later only if DueNest reaches clear scaling or organizational pressure, such as:

- heavy AI extraction workload
- high-volume document ingestion
- separate engineering teams
- independent scaling requirements
- enterprise integrations
- separate release cycles for major services

The correct strategy for this stage is:

> Build a clean modular monolith first. Extract services later only when there is evidence.

---

### 4.2 Django REST Framework for the Backend

Django REST Framework is selected because DueNest requires:

- authentication
- secure user-owned data
- relational data modeling
- file uploads
- admin management
- permissions
- serializers and validation
- background jobs
- mature security defaults
- fast development speed

DueNest is a document-heavy, workflow-driven SaaS product. Django provides a strong foundation for this type of system.

---

### 4.3 Next.js for the Frontend

Next.js is selected because DueNest needs:

- a polished SaaS landing page
- responsive dashboard
- reusable UI components
- strong routing structure
- TypeScript support
- future PWA support
- flexible deployment on Vercel
- clean separation between marketing pages and app pages

The product will start as a web app because document vaults, dashboards, application packs, file uploads, settings, and tables are easier to build and manage on web first.

---

### 4.4 PostgreSQL as the Primary Database

PostgreSQL is selected because DueNest requires structured relational data:

- users
- documents
- renewals
- reminders
- notifications
- application packs
- document-pack relationships
- AI extraction results later
- audit logs later

PostgreSQL provides relational integrity, indexing, transactions, constraints, and future support for advanced extensions if needed.

---

### 4.5 Celery + Redis for Background Jobs

DueNest will need background jobs for:

- reminder scheduling
- notification processing
- future email reminders
- future AI extraction tasks
- future OCR processing
- cleanup jobs
- future expiring share-link checks

Celery is a mature Python background job system, and Redis is a lightweight broker/cache suitable for early-stage development.

---

## 5. Repository Architecture

DueNest will use a monorepo structure.

```txt
duenest/
│
├── backend/
│   ├── config/
│   ├── apps/
│   │   ├── users/
│   │   ├── documents/
│   │   ├── renewals/
│   │   ├── reminders/
│   │   ├── notifications/
│   │   ├── application_packs/
│   │   └── ai_extraction/
│   ├── common/
│   ├── tests/
│   ├── requirements/
│   ├── manage.py
│   └── README.md
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── features/
│   ├── lib/
│   ├── hooks/
│   ├── types/
│   ├── public/
│   └── README.md
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
│   └── messaging/
│
├── .github/
│   ├── workflows/
│   └── ISSUE_TEMPLATE/
│
├── docker-compose.yml
├── README.md
└── .gitignore
```

### Why Monorepo?

A monorepo is appropriate because:

- the frontend and backend are tightly connected
- the project is currently developed by one person or a small team
- documentation and branding stay close to implementation
- pull requests can describe full product changes
- deployment and CI can be managed centrally
- recruiters can inspect the whole system from one place

The repo may be split later only if the project grows into separate teams, services, or deployment pipelines.

---

## 6. Backend Architecture

The backend will be organized around Django apps that map to product domains.

```txt
backend/
│
├── config/
│   ├── settings/
│   │   ├── base.py
│   │   ├── development.py
│   │   ├── production.py
│   │   └── testing.py
│   ├── urls.py
│   ├── asgi.py
│   ├── wsgi.py
│   └── celery.py
│
├── apps/
│   ├── users/
│   ├── documents/
│   ├── renewals/
│   ├── reminders/
│   ├── notifications/
│   ├── application_packs/
│   └── ai_extraction/
│
├── common/
│   ├── permissions.py
│   ├── pagination.py
│   ├── exceptions.py
│   ├── responses.py
│   ├── validators.py
│   └── utils.py
│
└── tests/
```

---

## 7. Backend App Responsibilities

| App | Responsibility |
| --- | --- |
| `users` | Custom user model, authentication, onboarding state, account settings, data/deletion request controls |
| `documents` | Document metadata, upload handling, categories, expiry status |
| `renewals` | Subscription and renewal tracking, costs, providers, recurring dates |
| `reminders` | Reminder records, reminder scheduling, reminder rules |
| `notifications` | In-app notification records and future email notification logic |
| `application_packs` | Document bundles for applications, ZIP export, pack metadata |
| `ai_extraction` | Future AI/OCR extraction jobs, extraction results, confidence scoring |
| `common` | Shared utilities, validators, response helpers, permissions, pagination |

---

## 8. Backend Layering Strategy

Each Django app should follow a layered structure when the domain logic is more than basic CRUD.

```txt
apps/documents/
│
├── models.py
├── serializers.py
├── views.py
├── urls.py
├── permissions.py
├── selectors.py
├── services.py
├── validators.py
├── tasks.py
└── tests/
```

### Layer Responsibilities

| Layer | Responsibility |
| --- | --- |
| `models.py` | Database structure and model-level constraints |
| `serializers.py` | Request/response validation and transformation |
| `views.py` | API endpoints and HTTP-level behavior |
| `permissions.py` | Access control rules |
| `selectors.py` | Read/query logic |
| `services.py` | Business operations and write workflows |
| `validators.py` | Domain-specific validation |
| `tasks.py` | Celery background jobs |
| `tests/` | Unit and API tests |

### Why Use Services and Selectors?

For simple CRUD endpoints, DRF views and serializers may be enough. However, DueNest will eventually include workflows such as reminders, AI extraction, application pack exports, secure sharing, file lifecycle management, and audit logs.

Using `services.py` and `selectors.py` helps keep complex business logic out of views and serializers.

Current example: `apps.users.services` owns onboarding state synchronization,
guided setup checklist computation, demo data creation/cleanup, trust summary,
and account-control orchestration. It reuses `apps.documents.services` for the
actual metadata export generation instead of duplicating export logic.

---

## 9. Frontend Architecture

The frontend will use Next.js with a feature-oriented structure.

```txt
frontend/
│
├── app/
│   ├── page.tsx
│   ├── layout.tsx
│   ├── auth/
│   ├── dashboard/
│   ├── documents/
│   ├── renewals/
│   ├── application-packs/
│   └── settings/
│
├── components/
│   ├── ui/
│   ├── layout/
│   ├── forms/
│   ├── charts/
│   └── shared/
│
├── features/
│   ├── auth/
│   ├── documents/
│   ├── renewals/
│   ├── reminders/
│   ├── notifications/
│   └── application-packs/
│
├── lib/
│   ├── api.ts
│   ├── auth.ts
│   ├── constants.ts
│   ├── utils.ts
│   └── validators.ts
│
├── hooks/
│
├── types/
│
└── public/
```

---

## 10. Frontend Responsibilities

The frontend should handle:

- routing
- responsive layouts
- forms
- client-side validation
- API communication
- dashboard visualization
- document upload UI
- authentication screens
- protected pages
- loading states
- empty states
- error states

The frontend should not contain sensitive business rules that must be enforced securely. All critical permissions and ownership checks must be enforced on the backend.

---

## 11. Runtime Request Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend as Next.js Frontend
    participant API as Django REST API
    participant DB as PostgreSQL
    participant Storage as File Storage

    User->>Frontend: Interacts with dashboard
    Frontend->>API: Sends authenticated API request
    API->>API: Validates token and permissions
    API->>DB: Reads or writes metadata
    API->>Storage: Stores or retrieves file when needed
    Storage-->>API: File reference or file response
    DB-->>API: Structured data response
    API-->>Frontend: JSON response
    Frontend-->>User: Updates UI
```

---

## 12. API Communication Strategy

The frontend will communicate with the backend through REST APIs.

Example API base path:

```txt
/api/v1/
```

Example endpoints:

```txt
/api/v1/auth/register/
/api/v1/auth/login/
/api/v1/auth/refresh/
/api/v1/users/me/

/api/v1/documents/
/api/v1/documents/{id}/
/api/v1/documents/attention-needed/
/api/v1/documents/{id}/reminder-rules/
/api/v1/documents/{id}/reminder-rules/{rule_id}/
/api/v1/documents/reminders/upcoming/

/api/v1/renewals/
/api/v1/renewals/{id}/

/api/v1/reminders/
/api/v1/notifications/

/api/v1/application-packs/
/api/v1/application-packs/{id}/
/api/v1/application-packs/{id}/export/
```

### API Design Principles

APIs should be:

- versioned
- consistent
- authenticated by default
- paginated for list endpoints
- validated with serializers
- documented in `docs/api-spec.md`
- tested with API tests
- explicit about error responses

---

## 13. Authentication Architecture

DueNest will use token-based authentication for the API.

Initial approach:

- User registers with email and password.
- User logs in and receives access and refresh tokens.
- Access token is used for authenticated API requests.
- Refresh token is used to obtain a new access token.
- Backend enforces user ownership on every protected resource.

Potential tools:

- Django REST Framework
- Django Simple JWT

### Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database

    User->>Frontend: Submit login form
    Frontend->>Backend: POST /api/v1/auth/login/
    Backend->>Database: Validate credentials
    Database-->>Backend: User found
    Backend-->>Frontend: Access token + refresh token
    Frontend-->>Backend: Authenticated requests with token
    Backend-->>Frontend: Protected resource response
```

### Security Notes

The backend must never trust the frontend for authorization. Every resource query must be scoped to the authenticated user.

Example rule:

```txt
A user can only access documents where document.user_id == request.user.id
```

---

## 14. Authorization Model

v0.1 will use simple ownership-based authorization.

### v0.1 Authorization

| Resource | Access Rule |
| --- | --- |
| Document | Only the owner can access |
| Renewal | Only the owner can access |
| Reminder | Only the owner can access |
| Notification | Only the owner can access |
| Application Pack | Only the owner can access |

### Future Authorization

Later versions may introduce:

- family workspace roles
- team workspace roles
- owner/admin/member/viewer permissions
- secure sharing links
- access logs
- document-level permissions

Role-based access control should not be implemented in v0.1 unless necessary.

---

## 15. Data Architecture

DueNest will use PostgreSQL as the source of truth for structured data.

Core entities:

- User
- Document
- Renewal
- Reminder
- Notification
- ApplicationPack
- ApplicationPackDocument
- AIExtractionResult later
- AuditLog later

The database stores metadata and relationships. Actual document files should be stored in the file storage layer.

### File Metadata vs File Content

| Type | Storage Location |
| --- | --- |
| Document metadata | PostgreSQL |
| File path / storage key | PostgreSQL |
| Actual uploaded file | Local storage in development, S3-compatible object storage in production |

The database should not store large binary document files directly.

### Implemented: local media storage (development)

The `DocumentFile` model stores uploaded blobs on local disk under
`MEDIA_ROOT` (`backend/media/`, git-ignored) using a structured, UUID-based
path: `media/documents/user_<id>/document_<id>/<uuid><ext>`. The database keeps
only metadata (original filename, content type, size, SHA-256 checksum) and the
storage reference.

Files are **not** served as public static media. They are returned only through
an authenticated, ownership-checked download endpoint
(`GET /api/v1/documents/:id/files/:file_id/download/`).

**TODO (production):** replace local disk with a private object-storage backend
(S3-compatible) and serve files via signed, time-limited URLs.

### Implemented: document intelligence and reminder rules

The documents app now derives smart document health in `apps.documents.services`
and exposes it through `DocumentSerializer` fields such as
`computed_status`, `status_reason`, `urgency_level`, `days_until_expiry`,
`has_file`, and `needs_attention`. This keeps intelligence read-only and avoids
storing duplicated status columns that could drift from source data.

`GET /api/v1/documents/` supports owner-scoped search, filtering, and sorting.
Some filters are database-backed (`search`, `status`, category/date fields);
computed-health filters are applied after calculating health for the
authenticated user's queryset.

`GET /api/v1/documents/attention-needed/` returns non-archived documents that
need action, sorted by urgency and dates.

`DocumentReminderRule` stores user-owned reminder preferences and calculates
upcoming reminder dates from `expiry_date` or `renewal_date`. This is a
foundation only: no Celery task, notification record, email, push, SMS, or
messaging delivery is sent by this branch.

---

## 16. File Storage Architecture

### Development

In development, files may be stored locally under Django media storage.

Example:

```txt
backend/media/documents/
```

### Production

In production, files should be stored in S3-compatible object storage.

Possible providers:

- AWS S3
- Cloudflare R2
- Supabase Storage
- DigitalOcean Spaces

### File Access Principles

Uploaded documents should be:

- private by default
- accessible only to the owner
- validated before storage
- referenced by storage key
- served through controlled backend routes or signed URLs
- protected from direct public listing

---

## 17. Background Job Architecture

DueNest will use Celery workers for asynchronous tasks.

```mermaid
flowchart LR
    API["Django API"] --> Redis["Redis Broker"]
    Redis --> Worker["Celery Worker"]
    Worker --> DB["PostgreSQL"]
    Worker --> Email["Email Provider Later"]
    Worker --> AI["AI / OCR Layer Later"]
```

### Background Jobs in v0.1

- Planned: create reminder/notification records when notification delivery is
  introduced.
- Current implementation: document reminder rules and upcoming reminder dates
  are calculated synchronously by authenticated API endpoints.

### Future Background Jobs

- Send email reminders
- Process uploaded PDFs
- Run OCR extraction
- Call AI extraction service
- Generate application pack ZIP files
- Expire secure sharing links
- Clean temporary files

---

## 18. Notification Architecture

v0.1 will start with in-app notifications.

Future notification channels:

- email
- push notifications
- WhatsApp
- Telegram
- calendar reminders

The notification system should be channel-agnostic over time.

Possible future model:

```txt
Notification
- user
- title
- message
- type
- channel
- status
- read_at
- sent_at
- created_at
```

---

## 19. AI Extraction Architecture

AI extraction is planned for v0.2 or later.

The AI layer should not be part of the first MVP because users should first validate the core manual workflow.

### Future AI Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Storage
    participant Worker
    participant AI

    User->>Frontend: Upload document
    Frontend->>Backend: POST /documents/
    Backend->>Storage: Store file
    Backend->>Worker: Queue extraction job
    Worker->>Storage: Read document
    Worker->>AI: Extract metadata
    AI-->>Worker: Structured result
    Worker->>Backend: Save extraction result
    Backend-->>Frontend: Show extracted data for confirmation
```

### AI Extraction Principles

- AI output must not be blindly trusted.
- Extraction results should include confidence scores.
- Users must confirm or correct extracted data.
- Original extracted text and metadata should be auditable where appropriate.
- AI failures should not block core document upload.
- AI tasks should run asynchronously.

---

## 20. Security Architecture

DueNest may eventually handle sensitive documents such as passports, visas, certificates, insurance policies, contracts, and IDs.

Security must be treated as a core architecture concern.

### Security Principles

- Private by default
- Least privilege
- Explicit ownership checks
- Secure authentication
- Environment-based secrets
- Validated file uploads
- No public document URLs by default
- No real sensitive files during development
- Clear separation between metadata and file storage
- Auditability for future sharing features

### Critical Security Controls

| Area | Control |
| --- | --- |
| Authentication | JWT-based API authentication |
| Authorization | User ownership checks |
| File access | Private storage and controlled access |
| Secrets | Environment variables |
| Uploads | MIME type and size validation |
| Sharing | Expiring links in later versions |
| Logs | Avoid logging sensitive file contents |
| AI | User confirmation required for extracted data |

---

## 21. Error Handling Strategy

The backend should return consistent error responses.

Example error format:

```json
{
  "error": {
    "code": "DOCUMENT_NOT_FOUND",
    "message": "The requested document was not found.",
    "details": {}
  }
}
```

Common error types:

- validation errors
- authentication errors
- permission errors
- not found errors
- file upload errors
- background job errors
- AI extraction errors later

Frontend should display errors clearly and avoid exposing technical stack traces to users.

---

## 22. Logging and Observability

In early development, basic logging is enough.

Later, production should include:

- structured backend logs
- request logging
- error tracking
- background job monitoring
- failed task alerts
- API performance metrics
- frontend error tracking

Possible tools later:

- Sentry
- Django logging
- Celery task monitoring
- platform logs from Render, Railway, Fly.io, or Vercel

Sensitive document content should never be logged.

---

## 23. Testing Strategy

Testing should be introduced progressively.

### Backend Tests

- model tests
- serializer validation tests
- permission tests
- API endpoint tests
- service tests
- Celery task tests later

### Frontend Tests

- component tests later
- form validation tests
- integration tests for critical flows
- end-to-end tests later

### Critical Test Cases

- users cannot access another user’s documents
- users cannot access another user’s renewals
- document expiry status calculates correctly
- renewal due dates calculate correctly
- application packs only include user-owned documents
- file upload validation works
- authentication protects private endpoints

---

## 24. Deployment Architecture

### Development

Local development will use:

- Django backend
- Next.js frontend
- PostgreSQL
- Redis
- Docker Compose later

### Production Candidate

| Layer | Candidate |
| --- | --- |
| Frontend | Vercel |
| Backend | Render, Railway, Fly.io |
| Database | Supabase PostgreSQL, Neon, Railway PostgreSQL |
| Redis | Upstash Redis, Railway Redis |
| File Storage | AWS S3, Cloudflare R2, Supabase Storage |
| Monitoring | Sentry |

### Deployment Principle

The production system should be simple enough to maintain but realistic enough to demonstrate production awareness.

---

## 25. Environment Configuration

The system should use environment variables for configuration.

Example variables:

```txt
DJANGO_SECRET_KEY=
DJANGO_DEBUG=
DATABASE_URL=
REDIS_URL=
ALLOWED_HOSTS=
CORS_ALLOWED_ORIGINS=
JWT_ACCESS_TOKEN_LIFETIME=
JWT_REFRESH_TOKEN_LIFETIME=
PRIVATE_BETA_ENABLED=
MEDIA_STORAGE_BACKEND=
S3_BUCKET_NAME=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
EMAIL_HOST=
EMAIL_PORT=
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
OPENAI_API_KEY=
```

No secrets should be committed to Git.

---

## 26. Performance Considerations

v0.1 does not require complex performance engineering, but the architecture should avoid obvious bottlenecks.

### Early Performance Practices

- paginate list endpoints
- index foreign keys
- index date fields used in dashboard queries
- avoid loading full file contents unnecessarily
- use background jobs for slow tasks
- optimize dashboard queries
- avoid N+1 queries using `select_related` and `prefetch_related`

### Future Performance Improvements

- caching dashboard summaries
- async document processing
- queue-based AI extraction
- CDN for static assets
- signed URL file delivery
- database query profiling

---

## 27. Scalability Strategy

DueNest should scale in stages.

### Stage 1: Local MVP

- PostgreSQL locally
- local file storage
- manual reminders
- minimal background jobs

### Stage 2: Production MVP

- hosted PostgreSQL
- hosted backend
- Vercel frontend
- object storage
- basic Celery worker
- email reminders

### Stage 3: SaaS-Ready Product

- background job monitoring
- production logging
- secure file access
- AI extraction workers
- billing system
- PWA support

### Stage 4: Advanced Scale

- separate AI worker service
- queue isolation
- object storage lifecycle rules
- team workspaces
- audit logs
- role-based access control
- advanced observability

---

## 28. Architecture Non-Goals

The following are intentionally not part of the first architecture:

- microservices
- Kubernetes
- complex event-driven infrastructure
- real-time collaboration
- bank transaction import
- native mobile app
- enterprise SSO
- multi-region deployment
- advanced analytics pipeline
- custom AI model training

These may be considered later only if the product need becomes clear.

---

## 29. Engineering Principles

DueNest should be built with the following engineering principles:

- Build useful core workflows before advanced automation.
- Keep architecture simple but not careless.
- Prefer clear domain boundaries over premature service splitting.
- Treat security as a product feature.
- Avoid storing sensitive data unnecessarily.
- Document decisions before implementation.
- Add tests around critical user-owned data flows.
- Use background jobs for slow or scheduled work.
- Make every major feature demoable.
- Optimize for long-term maintainability.

---

## 29.5 Document Vault Architecture Evolution

How the document vault evolves under the documents-first roadmap (see
[`document-vault-roadmap.md`](document-vault-roadmap.md)). The modular monolith
stays; capabilities are added as clear layers, not new services, until volume
justifies extraction.

### Current (implemented)

- **Frontend document UI** (Next.js): vault list, create/edit workspace, upload.
- **Backend document API** (DRF): documents + files CRUD, preview, share links,
  and activity logs, owner-scoped where private.
- **Private file storage:** local `MEDIA_ROOT` (dev), never served as public
  static media.
- **Controlled preview/download endpoints:** authenticated, ownership-checked
  streaming for owner access. Preview supports PDF/JPEG/PNG inline; DOC/DOCX
  remain download-only.
- **Share-link access layer:** token-gated public route for one file only, with
  server-side expiry, revocation, view-only/download permissions, optional
  hashed access codes, and owner-only share notes.
- **Owner-only activity log:** records upload, preview, download, share access,
  revocation, and access-code events without exposing logs to public viewers.
- **Vault lifecycle layer:** soft trash/restore for documents and files,
  metadata version snapshots, metadata restore, owner-only proof records,
  structured metadata exports, emergency access packs, and a document-wide
  activity timeline. These are implemented inside the existing documents app
  and storage layer; no separate service or worker is introduced.
- **Document onboarding and trust layer:** user-owned onboarding state,
  computed setup checklist, labeled demo data, Trust Center summary, public
  beta security/privacy/terms pages, and account data controls. Onboarding and
  account-control orchestration live in `apps.users`; document-derived progress
  is marked from document workflows and exports reuse the existing document
  export service.

### Implemented intelligence layers

- **Status & expiry intelligence:** server-side derivation of status, expiry
  urgency, and missing-information flags (pure functions over existing data —
  no new infrastructure).
- **Search/filter layer:** query params + indexing on the documents table.
- **Attention inbox:** a focused query endpoint composed from status intel.
- **Reminder rules:** owner-owned rule storage plus synchronous upcoming date
  calculation. No scheduled notification delivery yet.
- **Renewal workspace:** preparation checklists (with shared system templates),
  application/renewal bundles, and an aggregated timeline. Progress, readiness
  scoring, and timeline aggregation are all pure functions in the documents
  `services` layer — no new services or infrastructure. Checklist progress and
  bundle readiness are cached on the row and recalculated synchronously whenever
  a child item/requirement changes.
- **OCR-assisted extraction:** a synchronous, *review-gated* extraction built on
  a pluggable provider abstraction (`services.extract_file_details`). Two real
  providers run locally: `local_text` (PDF text layer via `pypdf`) and
  `local_ocr` (Tesseract via `pytesseract` for images and scanned PDFs, the
  latter rasterized with `pdf2image` + poppler). OCR is gated on the `tesseract`
  binary being installed and degrades to a graceful `needs_review` when it is
  not. Files are never sent to a third-party service, and document fields are
  only written after explicit owner review/apply. This deliberately reuses the
  existing request/response cycle so no queue or worker is introduced yet — the
  same provider seam can later be swapped for an async worker.

### Mid-term (Phase 3–4)

- **OCR worker/service:** the synchronous extraction foundation above can later
  be swapped for an async worker (queue) behind the same provider abstraction;
  it must remain *review-gated* and never write document fields directly.

### Later (Phase 5–6)

- **Notification service:** in-app → email → optional push.
- **Full archive export service:** file ZIP/full-archive generation, likely
  async when file volume grows.
- **Production storage:** S3-compatible private object storage with signed URLs.

### Current vs future at a glance

| Capability | Today | Future |
| --- | --- | --- |
| Document + file CRUD | ✅ Implemented | — |
| Private storage + controlled download | ✅ Implemented (local) | Object storage + signed URLs |
| In-app preview | ✅ Implemented for PDF/JPEG/PNG | More file types later |
| Status/expiry intelligence | ✅ Implemented | More document-type-specific rules later |
| Search/filter/sort | ✅ Implemented | Saved views / pagination UX later |
| Attention Needed | ✅ Implemented | Dedicated inbox/timeline later |
| Reminder rules | ✅ Implemented (calculated dates) | Notification service + scheduled jobs |
| Renewal checklists + templates | ✅ Implemented | More system templates, sharing later |
| Application/renewal bundles | ✅ Implemented (readiness score) | Auto-suggested requirements later |
| Timeline / calendar view | ✅ Implemented (aggregated list) | Full calendar component later |
| Sharing | ✅ Implemented file-level links | Email delivery, watermarking, redaction later |
| OCR-assisted extraction | ✅ Implemented (local PDF text + Tesseract OCR, sync, review-gated) | Async worker for large volumes |
| Audit / export | ✅ Document activity + metadata exports | Full archive/ZIP export later |
| Trash / restore | ✅ Implemented for documents/files | Retention windows and purge jobs later |
| Emergency packs / proof records | ✅ Implemented backend foundation | Trusted contacts and richer audit later |
| Onboarding / trust / data controls | ✅ Implemented | Legal review, retention automation, richer account settings later |

---

## 30. Future Evolution Path

The architecture should allow DueNest to evolve without a rewrite.

| Future Need | Possible Evolution |
| --- | --- |
| Heavy AI processing | Extract AI worker service |
| Large file volume | Move fully to S3-compatible storage with signed URLs |
| Team collaboration | Add workspace and RBAC modules |
| Secure sharing | Add share-token and audit-log modules |
| Billing | Add subscription and payment module |
| Mobile usage | Add PWA first, React Native later |
| Enterprise clients | Add organization, roles, audit logs, and compliance controls |

---

## 31. Architecture Acceptance Criteria

The architecture is acceptable for v0.1 if:

- frontend and backend run locally
- backend exposes versioned APIs
- users can authenticate securely
- user-owned resources are protected
- documents can be uploaded and stored safely
- metadata is stored in PostgreSQL
- file content is not stored directly in the database
- dashboard queries are possible
- background reminders can be introduced without redesign
- future AI extraction can be added asynchronously
- repository structure remains understandable
- documentation matches implementation decisions

---

## 32. Summary

DueNest will start as a modular monolith because that is the most practical and professional architecture for an early-stage SaaS product.

The system is designed to be:

- secure enough for sensitive workflows
- simple enough to build consistently
- modular enough to maintain
- extensible enough for AI, reminders, sharing, and integrations
- realistic enough to demonstrate senior-level product engineering judgment

The first goal is not to build a complex distributed system. The first goal is to build a clean, secure, reliable, and useful core product that can evolve into a serious SaaS platform.

---

## 33. Founder Console Architecture

Founder Console V1 is implemented as part of the modular monolith:

- Backend app: `apps.founder`
- Frontend routes: `/founder/*`, compatibility routes under
  `/dashboard/founder/*`, and `/dashboard/feedback`
- API prefix: `/api/v1/founder/`

The module owns internal operations models (`ProductEvent`, `FeedbackItem`,
`AppErrorLog`, `WaitlistEntry`, `InviteCode`, `InviteCodeUse`,
`FeatureCompletionItem`, `LaunchChecklistItem`, `BetaUserProfile`,
`FounderAuditLog`), the founder permission class, aggregate service functions,
serializers, views, URLs, admin registration, and tests.

It deliberately reuses existing document/user data instead of duplicating
private records. Metrics are built from aggregate queries over users,
documents, files, shares, reminders, checklists, bundles, exports, emergency
packs, proof records, product events, feedback, waitlist entries, invite-code
uses, beta metadata, launch checklist items, feature completion rows,
country-level product-event metadata, and error logs.

Charts use lightweight first-party SVG/CSS components. No background worker,
billing system, analytics vendor, heavy map dependency, or support-data access
service is introduced for Founder Console V1.

## 34. Private Beta Waitlist and Invite Architecture

Private beta access is implemented inside the existing modular monolith.

- Public routes: `/waitlist` and `/invite/:code`
- Registration route: `/register?invite=:code`
- Founder routes: `/founder/waitlist` and `/founder/invites`
- Public API: `/api/v1/waitlist/`, `/api/v1/invites/validate/`,
  `/api/v1/private-beta/status/`
- Founder API: `/api/v1/founder/waitlist/`, `/api/v1/founder/invites/`,
  and `/api/v1/founder/private-beta/`

`PRIVATE_BETA_ENABLED` controls whether new password registration and first-time
Google account creation require a valid invite code. Existing users can still
log in, and existing accounts can still be linked to Google.

Invite code enforcement happens on the backend. The frontend invite field is a
UX affordance only; the backend checks active status, expiry, and max-use limits
before creating the user account.
