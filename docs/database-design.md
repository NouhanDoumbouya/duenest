# DueNest Database Design

**Version:** v0.1  
**Status:** Planning  
**Database:** PostgreSQL  
**Backend ORM:** Django ORM  
**Architecture Style:** SaaS-ready modular monolith  
**Primary Goal:** Design a secure, scalable, and maintainable relational data model for documents, deadlines, renewals, reminders, notifications, and application packs.

---

## 1. Database Design Summary

DueNest will use **PostgreSQL** as the primary database because the product depends on structured, relational, user-owned data.

The database will store:

- users
- document metadata
- renewal records
- reminder records
- in-app notifications
- application packs
- document-pack relationships
- AI extraction results later
- audit and sharing records later

The database will **not** store actual document file contents directly. Uploaded files will be stored in local storage during development and S3-compatible object storage in production. PostgreSQL will store only metadata, ownership, file references, dates, statuses, and relationships.

---

## 2. Database Design Goals

| Goal | Description |
| --- | --- |
| Security | Ensure every user-owned record is properly isolated |
| Data integrity | Use foreign keys, constraints, and clear relationships |
| Query performance | Support fast dashboard, deadline, and renewal queries |
| Extensibility | Allow future AI extraction, sharing, workspaces, and audit logs |
| Maintainability | Keep models simple, readable, and aligned with product modules |
| SaaS readiness | Prepare for multi-user, future workspace, and production deployment |
| File safety | Store file metadata in the database and files outside the database |

---

## 3. Core Entity Overview

| Entity | Purpose |
| --- | --- |
| `User` | Represents an authenticated DueNest user |
| `Document` | Stores metadata for uploaded documents |
| `Renewal` | Tracks subscriptions, contracts, warranties, domains, licenses, and recurring obligations |
| `Reminder` | Stores upcoming reminder events linked to documents or renewals |
| `Notification` | Stores in-app notifications for users |
| `ApplicationPack` | Represents a reusable bundle of documents for applications |
| `ApplicationPackDocument` | Join table between application packs and documents |
| `AIExtractionResult` | Stores future AI extraction output and confidence scores |
| `Workspace` | Future entity for family/team collaboration |
| `ShareLink` | Future entity for secure expiring document sharing |
| `AuditLog` | Future entity for tracking sensitive actions |

---

## 4. High-Level ERD

```mermaid
erDiagram
    USER ||--o{ DOCUMENT : owns
    USER ||--o{ RENEWAL : owns
    USER ||--o{ REMINDER : receives
    USER ||--o{ NOTIFICATION : receives
    USER ||--o{ APPLICATION_PACK : owns

    DOCUMENT ||--o{ REMINDER : can_trigger
    RENEWAL ||--o{ REMINDER : can_trigger

    APPLICATION_PACK ||--o{ APPLICATION_PACK_DOCUMENT : contains
    DOCUMENT ||--o{ APPLICATION_PACK_DOCUMENT : included_in

    DOCUMENT ||--o{ AI_EXTRACTION_RESULT : has

    USER {
        uuid id PK
        string email
        string password
        string full_name
        boolean is_active
        boolean is_staff
        datetime date_joined
        datetime updated_at
    }

    DOCUMENT {
        uuid id PK
        uuid user_id FK
        string title
        string document_type
        string category
        string file_name
        string file_key
        string mime_type
        integer file_size
        date issue_date
        date expiry_date
        string status
        text notes
        datetime created_at
        datetime updated_at
    }

    RENEWAL {
        uuid id PK
        uuid user_id FK
        string title
        string provider
        string category
        decimal amount
        string currency
        date renewal_date
        string frequency
        string status
        string cancellation_url
        text notes
        datetime created_at
        datetime updated_at
    }

    REMINDER {
        uuid id PK
        uuid user_id FK
        uuid document_id FK
        uuid renewal_id FK
        string reminder_type
        datetime remind_at
        string status
        datetime sent_at
        datetime created_at
        datetime updated_at
    }

    NOTIFICATION {
        uuid id PK
        uuid user_id FK
        string title
        text message
        string notification_type
        boolean is_read
        datetime read_at
        datetime created_at
    }

    APPLICATION_PACK {
        uuid id PK
        uuid user_id FK
        string name
        string purpose
        text description
        datetime created_at
        datetime updated_at
    }

    APPLICATION_PACK_DOCUMENT {
        uuid id PK
        uuid pack_id FK
        uuid document_id FK
        integer sort_order
        datetime created_at
    }

    AI_EXTRACTION_RESULT {
        uuid id PK
        uuid document_id FK
        string extraction_type
        json extracted_data
        decimal confidence_score
        string status
        text error_message
        boolean user_confirmed
        datetime created_at
        datetime updated_at
    }
```

---

## 5. Entity Relationship Summary

| Relationship | Type | Description |
| --- | --- | --- |
| User → Document | One-to-many | One user can own many documents |
| User → Renewal | One-to-many | One user can create many renewal records |
| User → Reminder | One-to-many | One user can receive many reminders |
| User → Notification | One-to-many | One user can receive many notifications |
| User → ApplicationPack | One-to-many | One user can create many application packs |
| Document → Reminder | One-to-many | One document can trigger multiple reminders |
| Renewal → Reminder | One-to-many | One renewal can trigger multiple reminders |
| ApplicationPack → Document | Many-to-many | A pack can contain many documents, and one document can appear in many packs |
| Document → AIExtractionResult | One-to-many | One document may have multiple extraction attempts |

---

## 6. Naming Conventions

### Django App Names

```txt
users
documents
renewals
reminders
notifications
application_packs
ai_extraction
```

### Model Names

```txt
User
Document
Renewal
Reminder
Notification
ApplicationPack
ApplicationPackDocument
AIExtractionResult
```

### Table Names

Django can generate table names automatically, but explicit names may be used for clarity:

```txt
users_user
documents_document
renewals_renewal
reminders_reminder
notifications_notification
application_packs_applicationpack
application_packs_applicationpackdocument
ai_extraction_aiextractionresult
```

### Primary Keys

All main tables should use UUID primary keys.

Reason:

- safer for public-facing APIs
- harder to enumerate than sequential IDs
- better for future distributed systems
- commonly used in SaaS products

---

## 7. User Model

### Purpose

Represents a registered user of DueNest.

DueNest should use a custom user model from the beginning because changing the user model later in Django can be difficult.

### Model: `User`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key |
| `email` | EmailField | Yes | Unique login identifier |
| `password` | String | Yes | Managed by Django auth |
| `full_name` | CharField | Yes | User display name |
| `is_active` | Boolean | Yes | Default `True` |
| `is_staff` | Boolean | Yes | Admin access flag |
| `date_joined` | DateTime | Yes | Account creation time |
| `updated_at` | DateTime | Yes | Last profile update |
| `plan` | CharField | Yes | `free` or `pro_placeholder`; default `free`. Drives internal usage limits (see `apps/users/plans.py`). No real billing yet. |

### Constraints

| Constraint | Purpose |
| --- | --- |
| Unique `email` | Prevent duplicate accounts |
| Non-null `full_name` | Ensure profile completeness |

### Indexes

| Index | Purpose |
| --- | --- |
| `email` | Fast login lookup |
| `date_joined` | Admin/user analytics later |

---

## 7.5 User Onboarding and Account-Control Models

### Model: `UserOnboardingState`

Purpose: one-to-one owner-scoped setup state for the document onboarding
experience. This stores progress signals only; it does not grant document
access.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | BigAutoField | Yes | Primary key |
| `user` | OneToOneField(User) | Yes | Related name `onboarding_state` |
| `has_completed_document_onboarding` | BooleanField | Yes | Manual completion flag |
| `first_document_created_at` | DateTime | No | First real document progress marker |
| `first_file_uploaded_at` | DateTime | No | First real file progress marker |
| `first_expiry_date_added_at` | DateTime | No | First expiry/renewal date marker |
| `first_reminder_created_at` | DateTime | No | First reminder rule marker |
| `first_share_link_created_at` | DateTime | No | First file share-link marker |
| `first_checklist_created_at` | DateTime | No | First document checklist marker |
| `checklist_completed_at` | DateTime | No | First completed checklist marker |
| `dismissed_onboarding_at` | DateTime | No | Dashboard dismissal timestamp |
| `metadata` | JSONField | No | Lightweight reviewed-at flags and UI metadata |
| `created_at` / `updated_at` | DateTime | Yes | Standard timestamps |

### Model: `AccountDeletionRequest`

Purpose: records a cancellable account-deletion request. The application does
not delete accounts synchronously from the API request.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | BigAutoField | Yes | Primary key |
| `owner` | ForeignKey(User) | Yes | Related name `account_deletion_requests` |
| `status` | CharField | Yes | `requested`, `processing`, `cancelled`, `completed` |
| `requested_at` | DateTime | Yes | Defaults to current time |
| `scheduled_for` | DateTime | No | Target processing time |
| `cancelled_at` | DateTime | No | Set when user cancels |
| `completed_at` | DateTime | No | Set by future deletion worker/process |
| `reason` | TextField | No | Optional user-provided reason |
| `metadata` | JSONField | No | Operational metadata |
| `created_at` / `updated_at` | DateTime | Yes | Standard timestamps |

Indexes:

| Index | Purpose |
| --- | --- |
| `(owner, status)` | Find active deletion requests for a user |
| `scheduled_for` | Future processing queue/order |

---

## 8. Document Model

### Purpose

Stores metadata for uploaded user documents.

The actual file is stored outside the database. The database stores file reference information and metadata.

### Implemented (v1 — metadata, files, intelligence, reminder rules, and vault lifecycle)

The implemented `apps.documents` module stores document metadata, attached file
metadata, secure share-link metadata, owner-only file activity, document
reminder rules, version snapshots, proof records, emergency access packs,
recoverable trash, and structured metadata exports. Stored reminder occurrences
and real notification sending are not implemented yet. The implementation
differs from the longer-term plan below in a few ways:

- Primary keys are auto-increment integers (consistent with the existing
  `users.User` model), not UUIDs — UUIDs can be revisited later.
- The owner field is named `owner` (ForeignKey to `users.User`,
  `related_name="documents"`).
- `category` is a nullable ForeignKey to a new shared `DocumentCategory` model
  (see below) rather than a free-text field.
- Status choices are `active`, `expired`, `renewal_due`, `archived`.
- Smart document health (`computed_status`, `urgency_level`,
  `needs_attention`, etc.) is derived in service/serializer code from dates,
  files, and manual archive state. These values are not stored as database
  columns, so user-entered document data is not overwritten by calculations.

Implemented `Document` fields:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | BigAutoField | Yes | Primary key |
| `owner` | ForeignKey(User) | Yes | Owner; set from `request.user`, read-only via API |
| `category` | ForeignKey(DocumentCategory) | No | Nullable; `SET_NULL` on delete |
| `title` | CharField | Yes | User-defined title |
| `document_type` | CharField | No | Passport, visa, contract, etc. (free text) |
| `issuer` | CharField | No | Issuing authority |
| `country` | CharField | No | Issuing country |
| `reference_number` | CharField | No | Nullable document/reference number |
| `issue_date` | DateField | No | Optional |
| `expiry_date` | DateField | No | Optional; not before `issue_date` |
| `renewal_date` | DateField | No | Optional; not after `expiry_date` |
| `notes` | TextField | No | User notes |
| `status` | CharField | Yes | `active`, `expired`, `renewal_due`, `archived` (default `active`) |
| `lifecycle_status` | CharField | Yes | Owner-managed process stage: `draft`, `collected`, `submitted`, `under_review`, `approved`, `rejected`, `renewed`, `archived` (default `collected`). Separate from `computed_status`. |
| `last_safe_action_date` | DateField | No | Manual override for the last-safe-action date. When blank it is computed from renewal/expiry. |
| `custom_fields` | JSONField | No | Flat object of type-specific string fields (e.g. passport number). Validated server-side. |
| `tags` | ManyToMany(DocumentTag) | No | Owner's private tags. |
| `physical_location_label` | CharField | No | Owner-only location label for originals/copies |
| `physical_location_details` | TextField | No | Owner-only storage details |
| `original_available` | CharField | Yes | `yes`, `no`, `unknown` |
| `certified_copy_available` | CharField | Yes | `yes`, `no`, `unknown` |
| `translation_available` | CharField | Yes | `yes`, `no`, `unknown` |
| `notes_about_original` | TextField | No | Owner-only notes about originals/copies |
| `is_trashed` | BooleanField | Yes | Soft-delete state |
| `trashed_at` | DateTime | No | When moved to trash |
| `deletion_reason` | CharField | No | Optional owner-provided trash reason |
| `created_at` | DateTime | Yes | Record creation time |
| `updated_at` | DateTime | Yes | Last update time |

Implemented `DocumentCategory` fields: `id`, `name` (unique), `slug` (unique,
auto-derived from name), `description`, `created_at`, `updated_at`. Categories
are a shared controlled vocabulary, not user-owned.

Implemented indexes: `(owner, status)`, `(owner, expiry_date)`, and
`(owner, is_trashed)`; default ordering is `-created_at`.

#### Implemented `DocumentFile` (file attachments)

Files attached to a `Document` (metadata + a stored blob). Ownership is
enforced through the parent document (`file.document.owner`).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | BigAutoField | Primary key |
| `document` | ForeignKey(Document) | `related_name="files"`, `CASCADE` |
| `uploaded_by` | ForeignKey(User) | Set from `request.user`, read-only via API |
| `file` | FileField | Stored at `media/documents/user_<id>/document_<id>/<uuid><ext>` |
| `original_filename` | CharField | Display only — never used to build the path |
| `content_type` | CharField | Client-reported MIME type |
| `file_size` | PositiveIntegerField | Bytes |
| `checksum` | CharField(64) | SHA-256 hex of the uploaded bytes |
| `is_trashed` | BooleanField | Soft-delete state |
| `trashed_at` | DateTime | When moved to trash |
| `created_at` / `updated_at` | DateTime | Timestamps |

- Storage path uses a UUID filename (user-supplied names are not trusted for
  paths). Indexes on `(document, created_at)` and `(document, is_trashed)`;
  ordering `-created_at`.
- Local files live under `MEDIA_ROOT` (`backend/media/`, git-ignored). They are
  served only through the authenticated download endpoint, never as public
  static media.
- Trashed files are hidden from active file lists and cannot be served through
  public share links until restored. Permanent deletion is guarded behind an
  explicit trash-first flow.
- **TODO (production):** move blobs to private object storage (S3-compatible)
  with signed, time-limited access.

#### Implemented `DocumentReminderRule`

Reminder rules are durable user-owned records used to calculate future reminder
dates for a document. They do not send notifications yet and do not create
stored reminder occurrences in this branch.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | BigAutoField | Primary key |
| `owner` | ForeignKey(User) | `related_name="document_reminder_rules"` |
| `document` | ForeignKey(Document) | `related_name="reminder_rules"`, `CASCADE` |
| `trigger_type` | CharField | `before_expiry`, `before_renewal_date`, `on_expiry` |
| `days_before` | PositiveIntegerField | Number of days before the source date; `0` for `on_expiry` |
| `is_enabled` | BooleanField | Allows pausing a rule without deleting it |
| `created_at` / `updated_at` | DateTime | Timestamps |

Indexes: `(owner, is_enabled)` for upcoming reminder lookups and
`(document, trigger_type)` for nested document-rule management. Default
ordering is `days_before`, then newest first.

Reminder date calculation:

- `before_expiry`: `document.expiry_date - days_before`
- `on_expiry`: `document.expiry_date`
- `before_renewal_date`: `document.renewal_date - days_before`

Validation requires the relevant source date to exist. Rules are always scoped
through an owner-owned parent document.

#### Implemented intelligence-polish models

These owner-scoped models support the document intelligence features
(confidence, organisation, history, appointments, and costs). The confidence
score, last-safe-action date, and missing/health scanners are **computed in
service code** (`apps.documents.services`) — they are not stored columns.

- **`DocumentTag`** — `id`, `owner` (FK User), `name`, `slug` (auto, unique per
  owner via a `(owner, slug)` constraint), `color`, timestamps. Linked to
  documents through the `Document.tags` M2M.
- **`DocumentRenewalEvent`** — `id`, `owner`, `document` (FK, `CASCADE`),
  `renewal_date`, `previous_expiry_date`, `new_expiry_date`, `cost` (Decimal),
  `currency`, `notes`, optional `proof` (FK `ProofRecord`, `SET_NULL`),
  timestamps. Renewal history for one document.
- **`DocumentAppointment`** — `id`, `owner`, optional `document` (`CASCADE`) and
  `bundle` (`SET_NULL`), `title`, `appointment_at` (DateTime), `location`,
  `reference_number`, `notes`, `status` (`scheduled`/`completed`/`cancelled`/
  `missed`), timestamps. At least one of document/bundle is required.
- **`DocumentPayment`** — `id`, `owner`, optional `document` (`CASCADE`) and
  `bundle` (`SET_NULL`), `label`, `expected_cost` / `actual_cost` (Decimal),
  `currency`, `payment_status` (`pending`/`partial`/`paid`/`refunded`/`waived`),
  `payment_date`, optional `proof` (FK), `notes`, timestamps.

All four are owner-scoped, and any linked document/bundle/proof must belong to
the same owner (enforced in the serializers).

> The table below is the **longer-term planned** design (file storage, UUIDs,
> richer status calculation). It is kept for reference and will be folded into
> the implemented model as file upload and related features land.

### Model: `Document` (planned)

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key |
| `user` | ForeignKey(User) | Yes | Owner of the document |
| `title` | CharField | Yes | User-defined title |
| `document_type` | CharField | Yes | Passport, visa, transcript, CV, contract, etc. |
| `category` | CharField | Yes | Personal, academic, finance, legal, work, etc. |
| `file_name` | CharField | Yes | Original file name |
| `file_key` | CharField | Yes | Local path or object storage key |
| `mime_type` | CharField | Yes | File MIME type |
| `file_size` | PositiveIntegerField | Yes | File size in bytes |
| `issue_date` | DateField | No | Optional issue date |
| `expiry_date` | DateField | No | Optional expiry date |
| `status` | CharField | Yes | Valid, expiring soon, expired, no expiry |
| `notes` | TextField | No | User notes |
| `created_at` | DateTime | Yes | Record creation time |
| `updated_at` | DateTime | Yes | Last update time |

### Suggested Document Types

```txt
passport
visa
student_pass
national_id
driver_license
insurance
certificate
transcript
cv_resume
recommendation_letter
contract
invoice
receipt
warranty
domain
business_license
other
```

### Suggested Categories

```txt
personal
academic
immigration
finance
legal
work
business
subscription
health
travel
other
```

### Suggested Status Values

```txt
valid
expiring_soon
expired
no_expiry
archived
```

### Status Calculation Rules

| Condition | Status |
| --- | --- |
| `expiry_date` is null | `no_expiry` |
| `expiry_date` < today | `expired` |
| `expiry_date` within next 30 days | `expiring_soon` |
| `expiry_date` greater than 30 days away | `valid` |
| User archives document | `archived` |

### Indexes

| Index | Purpose |
| --- | --- |
| `(user, expiry_date)` | Fast dashboard queries for upcoming expiries |
| `(user, status)` | Fast filtering by status |
| `(user, category)` | Fast filtering by category |
| `(user, document_type)` | Fast filtering by document type |
| `created_at` | Sorting recent uploads |

### Security Rules

- A user can only access documents where `document.user_id == request.user.id`.
- Uploaded files must not be publicly accessible by default.
- File access must be controlled by backend permission checks or signed URLs later.
- File contents must not be logged.

---

## 9. Renewal Model

### Purpose

Tracks subscriptions, contracts, warranties, insurance, licenses, domains, hosting, and other recurring obligations.

### Model: `Renewal`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key |
| `user` | ForeignKey(User) | Yes | Owner of renewal |
| `title` | CharField | Yes | Renewal name |
| `provider` | CharField | No | Provider/vendor name |
| `category` | CharField | Yes | Software, insurance, domain, legal, etc. |
| `amount` | DecimalField | No | Renewal cost |
| `currency` | CharField | No | ISO-style currency code |
| `renewal_date` | DateField | Yes | Next renewal date |
| `frequency` | CharField | Yes | Monthly, yearly, custom, etc. |
| `status` | CharField | Yes | Active, due soon, expired, cancelled, archived |
| `cancellation_url` | URLField | No | Link to cancel or manage service |
| `notes` | TextField | No | User notes |
| `created_at` | DateTime | Yes | Record creation time |
| `updated_at` | DateTime | Yes | Last update time |

### Suggested Categories

```txt
software
streaming
education
hosting
domain
insurance
legal
business
membership
utilities
finance
other
```

### Suggested Frequency Values

```txt
one_time
weekly
monthly
quarterly
semi_annual
annual
custom
```

### Suggested Status Values

```txt
active
due_soon
overdue
cancelled
archived
```

### Indexes

| Index | Purpose |
| --- | --- |
| `(user, renewal_date)` | Fast dashboard query for upcoming renewals |
| `(user, status)` | Fast filtering by status |
| `(user, category)` | Fast category filtering |
| `(user, provider)` | Provider search/filtering |
| `created_at` | Sorting by created date |

### Business Rules

- `renewal_date` is required.
- `amount` can be null because not all renewals have a known cost.
- `currency` should default to a user preference later.
- Cancelled renewals should remain stored for history unless deleted by user.

---

## 10. Reminder Model

### Purpose

Stores scheduled reminders for documents, renewals, and future application pack deadlines.

A reminder can be linked to either a document or a renewal. In future versions, reminders may also be linked to application packs, share links, or custom tasks.

### Model: `Reminder`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key |
| `user` | ForeignKey(User) | Yes | Reminder owner |
| `document` | ForeignKey(Document) | No | Optional linked document |
| `renewal` | ForeignKey(Renewal) | No | Optional linked renewal |
| `reminder_type` | CharField | Yes | Document expiry, renewal, custom, etc. |
| `remind_at` | DateTime | Yes | When reminder should trigger |
| `status` | CharField | Yes | Pending, sent, failed, cancelled |
| `sent_at` | DateTime | No | When reminder was sent |
| `created_at` | DateTime | Yes | Record creation time |
| `updated_at` | DateTime | Yes | Last update time |

### Suggested Reminder Types

```txt
document_expiry
renewal_due
application_deadline
custom
```

### Suggested Status Values

```txt
pending
sent
failed
cancelled
```

### Integrity Rule

At least one linked target should exist:

```txt
document_id is not null OR renewal_id is not null
```

In Django, this can be enforced through model validation and optionally database constraints.

### Indexes

| Index | Purpose |
| --- | --- |
| `(user, remind_at)` | Fast reminder lookup |
| `(status, remind_at)` | Worker query for pending reminders |
| `(user, status)` | User filtering |
| `(document)` | Linked document reminders |
| `(renewal)` | Linked renewal reminders |

---

## 11. Notification Model

### Purpose

Stores in-app notifications for the user.

Notifications are different from reminders. A reminder is a scheduled event. A notification is what the user sees after something is triggered or generated.

### Model: `Notification`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key |
| `user` | ForeignKey(User) | Yes | Notification recipient |
| `title` | CharField | Yes | Short notification title |
| `message` | TextField | Yes | Notification body |
| `notification_type` | CharField | Yes | Expiry, renewal, system, etc. |
| `is_read` | Boolean | Yes | Default `False` |
| `read_at` | DateTime | No | When user read it |
| `created_at` | DateTime | Yes | Notification creation time |

### Suggested Notification Types

```txt
document_expiring
document_expired
renewal_due
reminder
system
ai_extraction_ready
application_pack_ready
```

### Indexes

| Index | Purpose |
| --- | --- |
| `(user, is_read)` | Fast unread notification query |
| `(user, created_at)` | Recent notifications |
| `notification_type` | Filtering by type |

---

## 12. Application Pack Model

### Purpose

Represents a reusable group of documents prepared for a specific purpose such as a scholarship, job, visa, internship, university application, grant, or business submission.

### Model: `ApplicationPack`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key |
| `user` | ForeignKey(User) | Yes | Owner of the pack |
| `name` | CharField | Yes | Pack name |
| `purpose` | CharField | Yes | Scholarship, job, visa, etc. |
| `description` | TextField | No | Optional description |
| `created_at` | DateTime | Yes | Record creation time |
| `updated_at` | DateTime | Yes | Last update time |

### Suggested Purpose Values

```txt
job
scholarship
visa
internship
university
grant
business
custom
```

### Indexes

| Index | Purpose |
| --- | --- |
| `(user, purpose)` | Filter packs by purpose |
| `(user, created_at)` | Show recent packs |
| `(user, name)` | Search by pack name |

---

## 13. Application Pack Document Model

### Purpose

Join table between `ApplicationPack` and `Document`.

A document can appear in many packs, and a pack can contain many documents.

### Model: `ApplicationPackDocument`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key |
| `pack` | ForeignKey(ApplicationPack) | Yes | Parent application pack |
| `document` | ForeignKey(Document) | Yes | Linked document |
| `sort_order` | PositiveIntegerField | No | Optional order in the pack |
| `created_at` | DateTime | Yes | Record creation time |

### Constraints

| Constraint | Purpose |
| --- | --- |
| Unique `(pack, document)` | Prevent duplicate documents in the same pack |

### Security Rule

A pack can only include documents owned by the same user who owns the pack.

This must be enforced at the service/API layer.

---

## 14. AI Extraction Result Model

### Purpose

Stores future AI extraction attempts for uploaded documents.

This should not be required for v0.1, but designing for it now helps avoid major refactoring later.

### Model: `AIExtractionResult`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `id` | UUID | Yes | Primary key |
| `document` | ForeignKey(Document) | Yes | Related document |
| `extraction_type` | CharField | Yes | Metadata, expiry, renewal, classification, etc. |
| `extracted_data` | JSONField | Yes | Structured AI output |
| `confidence_score` | DecimalField | No | AI confidence score |
| `status` | CharField | Yes | Pending, completed, failed, confirmed |
| `error_message` | TextField | No | Error details if failed |
| `user_confirmed` | Boolean | Yes | Default `False` |
| `created_at` | DateTime | Yes | Extraction creation time |
| `updated_at` | DateTime | Yes | Last update time |

### Suggested Extraction Types

```txt
metadata
document_classification
expiry_date
renewal_date
provider
amount
full_extraction
```

### Suggested Status Values

```txt
pending
processing
completed
failed
confirmed
rejected
```

### Example `extracted_data`

```json
{
  "document_type": "passport",
  "expiry_date": "2028-09-14",
  "country": "Guinea",
  "confidence": 0.91,
  "recommended_action": "Set a renewal preparation reminder 6 months before expiry."
}
```

### AI Safety Rules

- AI extracted data should not automatically overwrite user-confirmed data.
- Users must confirm or edit extracted values.
- Confidence scores should be visible to the user.
- Failed extractions should not block file upload.
- Sensitive document contents should not be logged.

---

## 15. Future Workspace Model

### Purpose

A future version may support family or team workspaces.

This should not be built in v0.1.

### Future Model: `Workspace`

| Field | Type | Notes |
| --- | --- |
| `id` | UUID | Primary key |
| `name` | CharField | Workspace name |
| `owner` | ForeignKey(User) | Workspace creator |
| `workspace_type` | CharField | Family, team, business |
| `created_at` | DateTime | Creation time |
| `updated_at` | DateTime | Update time |

### Future Model: `WorkspaceMember`

| Field | Type | Notes |
| --- | --- |
| `id` | UUID | Primary key |
| `workspace` | ForeignKey(Workspace) | Related workspace |
| `user` | ForeignKey(User) | Member user |
| `role` | CharField | Owner, admin, member, viewer |
| `created_at` | DateTime | Creation time |

This will support shared documents, team renewals, business licenses, and family document management later.

---

## 16. Future Share Link Model

### Purpose

A future version may allow users to share application packs through secure expiring links.

This should not be built in v0.1.

### Future Model: `ShareLink`

| Field | Type | Notes |
| --- | --- |
| `id` | UUID | Primary key |
| `user` | ForeignKey(User) | Link creator |
| `application_pack` | ForeignKey(ApplicationPack) | Shared pack |
| `token_hash` | CharField | Hashed token |
| `expires_at` | DateTime | Link expiration time |
| `revoked_at` | DateTime | Revocation time |
| `access_count` | Integer | Number of views/downloads |
| `created_at` | DateTime | Creation time |

### Security Rules

- Store only hashed share tokens.
- Links must expire.
- Users must be able to revoke links.
- Access should be logged.
- Sensitive files should not be permanently public.

---

## 17. Future Audit Log Model

### Purpose

Audit logs may be added later to track sensitive actions.

### Future Model: `AuditLog`

| Field | Type | Notes |
| --- | --- |
| `id` | UUID | Primary key |
| `user` | ForeignKey(User) | Actor |
| `action` | CharField | Upload, delete, share, download, etc. |
| `resource_type` | CharField | Document, renewal, pack, etc. |
| `resource_id` | UUID | Target resource |
| `metadata` | JSONField | Extra event data |
| `ip_address` | GenericIPAddressField | Optional |
| `user_agent` | TextField | Optional |
| `created_at` | DateTime | Event time |

Audit logs are valuable for security, trust, and future team/business features.

---

## 18. Data Ownership Rules

Every user-owned table must enforce ownership through foreign keys and API-level filtering.

### Ownership Rules

| Entity | Owner Field |
| --- | --- |
| Document | `user` |
| Renewal | `user` |
| Reminder | `user` |
| Notification | `user` |
| ApplicationPack | `user` |
| AIExtractionResult | indirectly through `document.user` |

### Critical Rule

All protected queries must be scoped to the authenticated user.

Example:

```python
Document.objects.filter(user=request.user)
```

Never allow direct lookup by ID without ownership filtering.

Unsafe:

```python
Document.objects.get(id=document_id)
```

Safe:

```python
Document.objects.get(id=document_id, user=request.user)
```

---

## 19. Deletion Strategy

Deletion must be handled carefully because DueNest may store sensitive documents.

### v0.1 Deletion Approach

| Entity | Strategy |
| --- | --- |
| Document | Hard delete metadata and remove file from storage |
| Renewal | Hard delete or archive depending on UI decision |
| Reminder | Delete when parent is deleted |
| Notification | Keep or delete based on user action |
| ApplicationPack | Delete pack and join records, not documents |
| ApplicationPackDocument | Delete join record only |

### Future Deletion Improvements

- soft delete for recovery
- trash system
- permanent delete after retention period
- audit log for deletion
- storage cleanup jobs
- user data export and account deletion

---

## 20. Data Retention Strategy

v0.1 can keep retention simple.

### Initial Retention Rules

- User documents remain until deleted by the user.
- Deleted documents should remove both metadata and file.
- Notifications may remain until deleted or marked read.
- Reminder history may remain for user reference.
- Failed AI extraction results may be retained for debugging but must not expose sensitive content.

### Future Retention Rules

- allow account data export
- allow full account deletion
- define retention windows for audit logs
- define retention windows for temporary ZIP exports
- automatically delete expired share-link temporary files

---

## 21. Indexing Strategy

Indexes should support the most important queries.

### Dashboard Queries

The dashboard needs:

- documents expiring soon
- expired documents
- renewals due soon
- unread notifications
- upcoming reminders

Recommended indexes:

```txt
Document(user, expiry_date)
Document(user, status)
Renewal(user, renewal_date)
Renewal(user, status)
Reminder(status, remind_at)
Reminder(user, remind_at)
Notification(user, is_read)
ApplicationPack(user, created_at)
```

### Search and Filtering

Later search may require:

- title search
- provider search
- category filtering
- document type filtering

PostgreSQL full-text search can be considered later if needed.

---

## 22. Constraints Strategy

Database constraints should protect important invariants.

### Recommended Constraints

| Model | Constraint |
| --- | --- |
| User | Unique email |
| ApplicationPackDocument | Unique pack-document pair |
| Reminder | At least one target: document or renewal |
| Renewal | Amount must be greater than or equal to zero if present |
| Document | File size must be greater than zero |
| AIExtractionResult | Confidence score between 0 and 1 if present |

Some constraints may be implemented in Django validation first and migrated to database constraints later.

---

## 23. Status and Enum Strategy

Django `TextChoices` should be used for status-like fields.

Example:

```python
class DocumentStatus(models.TextChoices):
    VALID = "valid", "Valid"
    EXPIRING_SOON = "expiring_soon", "Expiring Soon"
    EXPIRED = "expired", "Expired"
    NO_EXPIRY = "no_expiry", "No Expiry"
    ARCHIVED = "archived", "Archived"
```

Using `TextChoices` improves:

- readability
- validation
- API consistency
- frontend mapping
- documentation

---

## 24. File Metadata Strategy

Document files should be represented by metadata records.

### Metadata Fields

| Field | Purpose |
| --- | --- |
| `file_name` | Original uploaded file name |
| `file_key` | Storage path or object storage key |
| `mime_type` | File type validation |
| `file_size` | Size validation and UI display |
| `created_at` | Upload time |
| `updated_at` | Last metadata update |

### Why Store Metadata Separately?

This allows DueNest to:

- display files without loading them
- validate file ownership
- support future S3 storage
- support signed URLs
- support controlled document preview
- track file lifecycle events

---

## 25. Dashboard Query Requirements

The dashboard should be supported by efficient database queries.

### Dashboard Cards

| Card | Query |
| --- | --- |
| Expiring Documents | Documents where `expiry_date` is within the next 30 days |
| Expired Documents | Documents where `expiry_date` is before today |
| Upcoming Renewals | Renewals where `renewal_date` is within the next 30 days |
| Monthly Cost | Sum active monthly renewals |
| Yearly Cost | Sum annualized active renewals |
| Unread Notifications | Notifications where `is_read = False` |
| Upcoming Reminders | Reminders where `remind_at` is upcoming |

### Performance Notes

- Use indexes on date fields.
- Use ownership filtering first.
- Use aggregation carefully.
- Avoid loading full document records when only counts are needed.

---

## 26. Application Pack Export Strategy

Application pack export may produce ZIP files.

### v0.1 Approach

- User selects documents.
- Backend verifies ownership of all selected documents.
- Backend generates ZIP on demand.
- ZIP may be returned directly or temporarily stored.
- Temporary ZIP files should not be kept permanently.

### Future Approach

- Generate ZIP asynchronously for large packs.
- Store temporary ZIP in object storage.
- Expire temporary ZIP after a defined period.
- Log download events.
- Use secure share links for external access.

---

## 27. Security Considerations

DueNest may handle sensitive data, so database design must support security.

### Security Requirements

- All user-owned records must include ownership.
- All queries must enforce ownership.
- Sensitive file content must not be stored directly in the database.
- Sensitive file content must not be logged.
- AI extracted content should be handled carefully.
- Share links must be secure and expiring in future versions.
- Audit logs should be added before advanced sharing or team features.

### Avoid

- Public file URLs by default
- Direct object storage exposure
- Sequential public IDs
- Unscoped object lookups
- Logging uploaded document contents
- Storing raw share tokens

---

## 28. Migration Strategy

Django migrations should be created incrementally.

### Recommended Migration Order

1. Create custom user model
2. Create document model
3. Create renewal model
4. Create reminder model
5. Create notification model
6. Create application pack model
7. Create application pack document model
8. Add AI extraction model later

### Important Rule

The custom user model must be created before the first production migration is finalized.

Changing the user model later is difficult in Django.

---

## 29. Future Database Evolution

DueNest may later add:

- workspace tables
- workspace member roles
- share links
- audit logs
- billing tables
- subscription plan tables
- document versioning
- document tags
- external integrations
- OAuth connection records
- AI prompt/extraction versioning
- user preferences
- notification channel preferences

These should be added only when product needs justify them.

---

## 29.5 Planned Document Vault Models

Model sketches for the documents-first roadmap (see
[`document-vault-roadmap.md`](document-vault-roadmap.md)). These are **planning
sketches**, not migrations — no code or migrations are created in the planning
branch. Every user-owned model is scoped to its owner and follows the existing
404-not-403 ownership rule.

**Legend:** *Implemented* = exists today · *MVP* = first paid release ·
*Future* = later phase.

### Document — *Implemented*
- **Purpose:** one important document record.
- **Key fields:** `owner`, `category`, `title`, `document_type`, `issuer`,
  `country`, `reference_number`, `issue_date`, `expiry_date`, `renewal_date`,
  `notes`, `status`, physical-location/copy-availability fields,
  `is_trashed`, `trashed_at`, `deletion_reason`, timestamps.
- **Relationships:** `owner → User`; `category → DocumentCategory`; has many
  `DocumentFile`; has many `DocumentReminderRule`; has many
  `DocumentVersion`; has many `DocumentActivity`; optional proof/emergency
  relationships.
- **Security:** owner-scoped. Computed health/status fields are derived from
  dates, active files, archive state, and trash state in service/serializer
  code, not stored. Public share/emergency endpoints never expose the
  physical-location fields.

### DocumentCategory — *Implemented*
- **Purpose:** shared, controlled vocabulary (Passport, Visa, Insurance…).
- **Key fields:** `name` (unique), `slug`, `description`, timestamps.
- **Relationships:** referenced by many `Document`.
- **Security:** app-wide reference data, not user-owned.

### DocumentFile — *Implemented*
- **Purpose:** a file attached to a `Document` (metadata + stored blob).
- **Key fields:** `document`, `uploaded_by`, `file`, `original_filename`,
  `content_type`, `file_size`, `checksum`, `is_trashed`, `trashed_at`,
  timestamps.
- **Relationships:** `document → Document` (cascade).
- **Security:** ownership via parent document; private storage; controlled
  download and preview only. `is_previewable` is derived from supported MIME
  type plus extension (PDF/JPEG/PNG). Trashed files are hidden from active
  owner lists and unavailable through public share/emergency endpoints.

### DocumentFileShareLink — *Implemented*
- **Purpose:** revocable, time-limited public access to one specific
  `DocumentFile`.
- **Key fields:** `owner`, `document`, `file`, `token`, `permission`,
  `expires_at`, `revoked_at`, `access_code_required`, `access_code_hash`,
  `label`, `recipient_email`, `purpose`, `last_accessed_at`, timestamps.
- **Relationships:** `owner → User`; `document → Document`;
  `file → DocumentFile`.
- **Security:** token is cryptographically random and unguessable; access is
  file-level only; expiry and revocation are enforced on every public request;
  access codes are hashed and never stored in plain text. Owner-facing labels,
  recipient email, and purpose notes are not exposed publicly by default.

### DocumentFileActivity — *Implemented*
- **Purpose:** owner-only activity trail for sensitive file actions.
- **Key fields:** `owner`, `document`, `file`, optional `share_link`, `action`,
  `actor_type`, `ip_address`, `user_agent`, `metadata`, `created_at`.
- **Relationships:** `owner → User`; `document → Document`;
  `file → DocumentFile`; optional `share_link → DocumentFileShareLink`.
- **Security:** visible only through owner-scoped file endpoints; public share
  viewers never see the owner's activity log; access codes are never logged.

### DocumentReminderRule — *Implemented*
- **Purpose:** user-owned rule for calculating future document expiry or renewal
  reminder dates.
- **Key fields:** `owner`, `document`, `trigger_type`, `days_before`,
  `is_enabled`, timestamps.
- **Relationships:** `owner → User`; `document → Document`.
- **Security:** managed only through owner-scoped document endpoints; users
  cannot create, list, update, or delete rules for another user's document.
- **Limitation:** upcoming reminder dates are calculated from rules; no
  notification jobs or stored reminder occurrences are created yet.

### DocumentChecklistTemplate — *Implemented*
- **Purpose:** reusable, shared checklist blueprint (e.g. passport renewal,
  scholarship application). System templates are seeded via the
  `seed_checklist_templates` management command.
- **Key fields:** `title`, `description`, `document_type`, `use_case`,
  `checklist_type`, `country`, `is_system_template`, `is_active`, `sort_order`,
  `slug` (stable key for idempotent re-seeding), timestamps.
- **Relationships:** has many `DocumentChecklistItemTemplate`.
- **Security:** shared reference data, not user-owned; read-only via the API.

### DocumentChecklistItemTemplate — *Implemented*
- **Purpose:** one item in a checklist template.
- **Key fields:** `template`, `title`, `description`, `is_required`,
  `sort_order`, `suggested_due_offset_days` (days before the checklist due
  date), `metadata` (JSON).
- **Relationships:** `template → DocumentChecklistTemplate`.

### DocumentChecklist — *Implemented*
- **Purpose:** an owner-owned preparation checklist for a document and/or
  bundle, optionally created from a template.
- **Key fields:** `owner`, `document` (nullable), `bundle` (nullable),
  `template` (nullable), `title`, `description`, `checklist_type`, `status`
  (`not_started`/`in_progress`/`completed`), `progress_percent`, `due_date`,
  timestamps.
- **Relationships:** `owner → User`; `document → Document`;
  `bundle → DocumentBundle`; `template → DocumentChecklistTemplate`; has many
  `DocumentChecklistItem`.
- **Security:** strictly owner-scoped; managed only through owner-owned document
  endpoints.
- **Computed:** `progress_percent` + `status` are recalculated from items
  whenever an item changes (completed and skipped both count as resolved).

### DocumentChecklistItem — *Implemented*
- **Purpose:** one actionable step in a checklist.
- **Key fields:** `owner`, `checklist`, `title`, `description`, `is_required`,
  `status` (`pending`/`in_progress`/`completed`/`skipped`), `due_date`,
  `linked_document` (nullable), `linked_file` (nullable), `completed_at`,
  `sort_order`, `notes`, timestamps.
- **Relationships:** `checklist → DocumentChecklist`; optional
  `linked_document → Document`, `linked_file → DocumentFile` (ownership checked).
- **Security:** owner-scoped via checklist; linking another user's document/file
  is rejected.

### DocumentBundle — *Implemented*
- **Purpose:** an owner-owned grouping of documents/requirements for a renewal,
  application, travel prep, or proof pack — the "what do I need to prepare"
  workspace.
- **Key fields:** `owner`, `title`, `description`, `bundle_type`, `target_date`,
  `status` (`draft`/`in_progress`/`ready`/`submitted`/`completed`/`archived`),
  `country`, `authority_or_provider`, `notes`, `readiness_score`, timestamps.
- **Relationships:** `owner → User`; has many `DocumentBundleRequirement`; has
  many `DocumentChecklist`.
- **Security:** strictly owner-scoped.
- **Computed:** `readiness_score` (0–100) is recalculated from required,
  non-skipped requirements; a bundle is ready only when every required
  requirement is attached or completed.

### DocumentBundleRequirement — *Implemented*
- **Purpose:** one thing a bundle needs (a document, file, proof, payment, or
  form).
- **Key fields:** `owner`, `bundle`, `title`, `description`, `is_required`,
  `requirement_type`, `expected_document_type`, `linked_document` (nullable),
  `linked_file` (nullable), `status`
  (`missing`/`attached`/`completed`/`skipped`), `due_date`, `sort_order`,
  `notes`, timestamps.
- **Relationships:** `bundle → DocumentBundle`; optional
  `linked_document → Document`, `linked_file → DocumentFile` (ownership checked).
- **Security:** owner-scoped via bundle; linked document/file must belong to the
  same owner.

### DocumentExtraction — *Implemented*
- **Purpose:** an OCR-assisted detail-extraction attempt for one file, staged
  for owner review before any document field is changed.
- **Key fields:** `owner`, `document`, `file`, `extraction_status`
  (`pending`/`processing`/`completed`/`failed`/`needs_review`), `raw_text`
  (owner-only, never exposed by the API), `extracted_fields` (JSON),
  `confidence_score`, `provider` (`manual`/`local_text`/`future_ocr`),
  `error_message`, `reviewed_at`, `applied_at`, timestamps.
- **Relationships:** `owner → User`; `document → Document`; `file → DocumentFile`.
- **Security:** owner-scoped; files are never sent to a third-party service;
  applying fields requires explicit owner confirmation and only writes the
  chosen, known document fields.

### DocumentVersion — *Implemented*
- **Purpose:** owner-owned point-in-time metadata snapshots for document history
  and metadata restore.
- **Key fields:** `owner`, `document`, optional `file`, `version_number`,
  `version_type`, metadata snapshot fields, file display snapshot fields,
  `change_summary`, `created_by`, `metadata`, `created_at`.
- **Relationships:** `owner → User`; `document → Document`;
  optional `file → DocumentFile`.
- **Security:** owner-scoped; never stores or serializes raw file paths. File
  blobs are not duplicated; file versions reference existing `DocumentFile`
  rows.
- **Constraint:** unique `(document, version_number)`.

### DocumentExportRequest — *Implemented*
- **Purpose:** owner-requested structured metadata export. Supports vault-wide
  metadata exports and bundle-scoped metadata/requirements exports.
- **Key fields:** `owner`, `export_type`, `status`, generated `file`,
  `requested_at`, `completed_at`, `expires_at`, `error_message`, `metadata`.
- **Relationships:** `owner → User`.
- **Security:** owner-scoped; generated exports exclude raw uploaded files, raw
  OCR text, share tokens, access codes, access-code hashes, and internal storage
  paths. Export files are served only through authenticated, expiring download
  routes. Bundle exports store `metadata.scope = "bundle"` and the `bundle_id`
  used for owner-scoped filtering.

### EmergencyAccessPack — *Implemented*
- **Purpose:** owner-selected collection of documents/files for emergency use.
- **Key fields:** `owner`, `title`, `description`, `status`, `access_mode`,
  `expires_at`, `access_code_required`, `access_code_hash`, public `token`,
  access timestamps, `metadata`, timestamps.
- **Relationships:** `owner → User`; has many `EmergencyAccessPackItem`.
- **Security:** a pack grants access only to explicitly added items, never the
  whole vault. Public token access requires active/shareable state, optional
  access code, and non-trashed items. Access codes are hashed.

### EmergencyAccessPackItem — *Implemented*
- **Purpose:** one selected document and optional selected file inside an
  emergency access pack.
- **Key fields:** `owner`, `pack`, `document`, optional `file`, `notes`,
  `sort_order`, `created_at`.
- **Relationships:** `owner → User`; `pack → EmergencyAccessPack`;
  `document → Document`; optional `file → DocumentFile`.
- **Security:** linked document/file must belong to the pack owner and must not
  be trashed.

### ProofRecord — *Implemented*
- **Purpose:** proof of submission, payment, tracking, approval/rejection, or
  related outcome evidence.
- **Key fields:** `owner`, `title`, `proof_type`, optional `document`, `bundle`,
  `checklist`, optional `linked_file`, `reference_number`, `submitted_to`,
  `submitted_at`, `status`, `notes`, timestamps.
- **Relationships:** `owner → User`; optional links to `Document`,
  `DocumentBundle`, `DocumentChecklist`, and `DocumentFile`.
- **Security:** owner-scoped; every linked object must belong to the same owner
  and trashed document/file links are rejected.

### DocumentActivity — *Implemented*
- **Purpose:** document-level owner-facing activity events. The API can merge
  this with lower-level `DocumentFileActivity` for one document timeline.
- **Key fields:** `owner`, optional `document`, `action`, `actor_type`, `title`,
  `description`, optional related file/checklist/bundle/proof, `metadata`,
  `created_at`.
- **Relationships:** `owner → User`; optional `document → Document`; optional
  related owner-owned workflow records.
- **Security:** owner-only; public activity responses never expose raw IP
  addresses, user agents, tokens, access codes, or file paths.

> Some *MVP* / *Future* entries below are superseded by the implemented document
> vault models above; they remain as historical planning notes for features or
> shapes that still differ from the current implementation.

### DocumentTemplate — *MVP*
- **Purpose:** document-type presets (default fields, suggested expiry window,
  checklist template) to make adding documents fast and consistent.
- **Key fields:** `name`, `document_type`, `default_fields` (JSON),
  `suggested_renewal_window_days`, `checklist_template` (FK, optional).
- **Relationships:** referenced when creating a `Document`.
- **Security:** shared reference data (curated), not user-owned.

### DocumentCustomField — *Future*
- **Purpose:** user/template-defined extra fields per document type.
- **Key fields:** `document` (or `template`), `key`, `label`, `value`, `type`.
- **Relationships:** `document → Document`.
- **Security:** owner-scoped via document; treat values as sensitive.

### DocumentReminderRule — *MVP*
- **Purpose:** when/how to remind for a document's expiry or renewal.
- **Key fields:** `document`, `owner`, `offset_days` (e.g. 90/30/7 before),
  `channel` (in-app first), `is_active`, `last_triggered_at`.
- **Relationships:** `document → Document`; `owner → User`.
- **Security:** owner-scoped; evaluation runs server-side only.

### DocumentChecklist — *MVP*
- **Purpose:** a renewal/preparation checklist attached to a document or
  derived from a template.
- **Key fields:** `document`, `owner`, `title`, `template_key`, timestamps.
- **Relationships:** has many `DocumentChecklistItem`; `document → Document`.
- **Security:** owner-scoped.

### DocumentChecklistItem — *MVP*
- **Purpose:** one step in a checklist.
- **Key fields:** `checklist`, `label`, `is_done`, `due_date`, `sort_order`,
  `notes`.
- **Relationships:** `checklist → DocumentChecklist`.
- **Security:** owner-scoped via checklist.

### DocumentVersion — *Historical sketch, superseded*
- **Purpose:** version history for a re-issued file.
- **Key fields:** `file`, `version_number`, `stored_file`, `is_current`,
  `uploaded_by`, `created_at`.
- **Relationships:** `file → DocumentFile`.
- **Security:** owner-scoped; old versions retained until explicit purge.

### DocumentBundle — *Historical sketch, superseded*
- **Purpose:** reusable application/renewal pack (e.g. Student Pass Renewal).
- **Key fields:** `owner`, `name`, `purpose`, `description`, `readiness_score`
  (derived), timestamps.
- **Relationships:** has many `DocumentBundleItem`.
- **Security:** owner-scoped.

### DocumentBundleItem — *Historical sketch, superseded*
- **Purpose:** a required slot in a bundle, optionally linked to a document.
- **Key fields:** `bundle`, `required_label`, `document` (nullable),
  `is_satisfied` (derived), `sort_order`.
- **Relationships:** `bundle → DocumentBundle`; `document → Document`.
- **Security:** owner-scoped via bundle; bundle and document must share owner.

### DocumentTag — *Future (Phase 5)*
- **Purpose:** smart tags/labels for organization.
- **Key fields:** `owner`, `name`, `color`; M2M to `Document`.
- **Relationships:** many-to-many with `Document`.
- **Security:** owner-scoped.

### DocumentContact — *Future (Phase 5)*
- **Purpose:** institution/contact directory (issuers, embassies, insurers).
- **Key fields:** `owner`, `name`, `organization`, `email`, `phone`, `notes`.
- **Relationships:** optionally linked from documents/appointments.
- **Security:** owner-scoped; PII — treat as sensitive.

### DocumentAppointment — *Future (Phase 2/5)*
- **Purpose:** track a renewal appointment.
- **Key fields:** `document`, `owner`, `title`, `location`, `scheduled_at`,
  `status`, `notes`.
- **Relationships:** `document → Document`; optional `contact`.
- **Security:** owner-scoped.

### DocumentRenewalHistory — *Future (Phase 2)*
- **Purpose:** record of past renewals and their process status.
- **Key fields:** `document`, `owner`, `process_status`, `started_at`,
  `completed_at`, `cost`, `currency`, `notes`.
- **Relationships:** `document → Document`.
- **Security:** owner-scoped.

### EmergencyPack — *Historical sketch, superseded*
- **Purpose:** a curated, quickly accessible set of critical documents.
- **Key fields:** `owner`, `name`, `description`; items reference documents/files.
- **Relationships:** references many `Document`/`DocumentFile`.
- **Security:** **very high** — combine with sharing/audit maturity before
  enabling any external/emergency access.

---

## 30. Database Non-Goals for v0.1

The following are intentionally not part of the first database implementation:

- team workspaces
- role-based access control
- billing plans
- payment records
- bank transactions
- full-text document content indexing
- vector embeddings
- external OAuth connections
- full-file archive exports
- enterprise-wide audit log table
- enterprise organization model

These can be added later without blocking the first MVP.

---

## 31. v0.1 Database Acceptance Criteria

The v0.1 database design is acceptable if:

- users can register and authenticate
- users can own documents
- users can own renewal records
- users can own reminders
- users can receive notifications
- users can create application packs
- users can add documents to application packs
- documents can track expiry status
- renewals can track due dates and cost
- dashboard queries can be supported efficiently
- user-owned data is isolated
- uploaded file content is not stored directly in PostgreSQL
- future AI extraction can be added without redesign

---

## 32. Summary

The DueNest database is designed to support a secure, SaaS-ready life admin platform.

The first version should prioritize:

- user ownership
- document metadata
- renewal tracking
- reminder records
- notification records
- application packs
- clean relationships
- strong indexing for dashboard queries
- safe file metadata handling

The design intentionally avoids unnecessary complexity in v0.1 while leaving clear paths for AI extraction, secure sharing, team workspaces, audit logs, and SaaS billing later.

---

## 33. Founder Console Models

Founder Console V1 adds a focused `apps.founder` backend module.

### ProductEvent

- **Purpose:** first-party, privacy-minimized product analytics events for
  activation, adoption, activity, and security summaries.
- **Key fields:** nullable `user`, `event_type`, `event_source`,
  optional `object_type`/`object_id`, optional request metadata, sanitized
  `metadata`, `created_at`.
- **Security:** best-effort logging only. Metadata is sanitized and should not
  include private document contents, OCR text, access codes, share tokens,
  passwords, or file paths.

### FeedbackItem

- **Purpose:** user-submitted and founder-managed feedback.
- **Key fields:** nullable `user`, optional `email`, `category`, `title`,
  `message`, `status`, `priority`, `source`, `related_path`,
  `related_feature`, `founder_notes`, review/close timestamps.
- **Security:** feedback is not a document-support access channel. Users should
  not be asked to submit private vault contents.

### AppErrorLog

- **Purpose:** lightweight error monitoring for private beta.
- **Key fields:** nullable `user`, `severity`, `source`, `error_type`,
  `message`, optional path/method/status, optional traceback, sanitized
  `metadata`, `resolved`, `resolved_at`, `created_at`.
- **Security:** stack traces are founder-only and returned only in debug mode.
  Client metadata is sanitized before storage.

---

## Secure Rooms & extended share links (premium sharing)

### `DocumentFileShareLink` (extended)

In addition to the original fields, share links now carry access limits and
deterrence flags:

- `access_limit_type` — `unlimited | one_time | limited_count`
- `max_views`, `view_count`, `max_downloads`, `download_count`, `limit_reached_at`
- `watermark_enabled`, `privacy_screen_enabled`

Counters are incremented atomically (`F()`); limits are enforced server-side on
every preview/download. `access_code_hash` remains a hash only.

### `ShareRoom`

A controlled, token-gated collection shared with a recipient. Fields mirror the
share-link model: `owner`, `title`, `description`, `token` (unique, indexed),
`permission` (`view_only | download_allowed`), `expires_at`, `revoked_at`,
`access_code_required` + `access_code_hash`, `watermark_enabled`,
`privacy_screen_enabled`, the same access-limit fields, owner-only
`recipient_email` / `label` / `purpose`, and timestamps incl. `last_accessed_at`.
Indexed on `(owner, created_at)`, `token`, `(owner, revoked_at)`, `expires_at`.

### `ShareRoomItem`

One exposed item: FK `room` plus exactly one of `document` / `file` / `proof`
(validated on create, all owner-owned), `sort_order`, `created_at`. A room only
ever serves these explicit items — never the rest of the vault.

### `RoomActivity`

Owner-only trail: `owner`, `room`, `action`, `actor_type`, `ip_address`,
`user_agent`, `metadata`, `created_at`. Access codes are never logged.

### Calendar

DueNest Calendar V1 adds **no new table** — events are aggregated on demand from
existing models (documents, reminders, bundles, appointments, proofs, share
links, rooms, emergency packs). Existing date columns (`expiry_date`,
`renewal_date`, bundle `target_date`, share/room `expires_at`, etc.) back the
queries; share `token`/`expires_at` and room `token`/`expires_at` are indexed.

## Subscription Tracker V1

Three owner-scoped tables in the `subscriptions` app:

* **SubscriptionCategory** — grouping vocabulary (Streaming, Software, Insurance,
  …). V1 ships 13 system categories (`is_system=True`, `owner` null); the
  nullable `owner` is reserved for future user-defined categories. Seeded by a
  data migration.
* **Subscription** — the tracked recurring payment. Owner FK (CASCADE), optional
  category FK (SET_NULL). Money is `amount` (Decimal, `MinValueValidator(0)`) +
  3-letter `currency` (no FX conversion). `billing_cycle` (weekly/monthly/
  quarterly/yearly/custom) with optional `custom_interval_count`/`_unit`. Dates:
  `start_date`, `next_billing_date`, `cancellation_deadline`. Flags: `auto_renew`,
  `reminder_days_before`. Value tracking: `importance`, `last_used_date`. Soft
  archive via `is_archived`/`archived_at`. `payment_method_label` is a human
  label only — a validator rejects full card numbers; **no card/CVV/bank data is
  stored**. Indexed on `(owner,status)`, `(owner,next_billing_date)`,
  `(owner,is_archived)`.
* **SubscriptionPaymentRecord** — owner-entered payment log (amount, currency,
  `paid_on`, optional billing-period range, notes). Metadata-only in V1; receipt
  file attachments are deferred.

Calendar/Timeline add **no new table** — subscription events are aggregated on
demand from `Subscription` date columns.

## Organization Workspace V1

The `organizations` Django app adds separate organization-scoped tables instead
of adding organization FKs to every personal vault table in this branch. This
keeps personal documents private and avoids partially shared personal records.

### Core tables

- **Organization** - shared workspace metadata: name, slug, description,
  website, country, organization type, creator, archive timestamp, and
  timestamps.
- **OrganizationMembership** - user membership with role (`owner`, `admin`,
  `member`, `viewer`) and status (`active`, `invited`, `suspended`, `left`).
  Unique per `(organization, user)`.
- **OrganizationInvite** - email invite with role, unguessable token, status,
  expiry, inviter, accepted user, and accepted timestamp.
- **OrganizationActivity** - safe activity summaries scoped to one
  organization.

### Document operations tables

- **OrganizationDocument** - organization-owned document metadata, optional
  assignee, dates, status, notes, and archive fields.
- **OrganizationDocumentFile** - organization document file metadata and storage
  reference. Files are stored outside the database.
- **DocumentRequest** - request for a member or external recipient to submit a
  document, with optional campaign, linked organization document, public upload
  token, expiry, notes, rejection reason, and reminder timestamp.
- **DocumentRequestSubmission** - submitted file metadata, optional submitting
  user/email, review state, reviewer, review timestamp, and rejection reason.
- **DocumentCollectionCampaign** - multi-member document collection campaign.
- **CampaignRequirement** - required/optional campaign document requirement.
- **CampaignTargetMember** - campaign member progress row with status.

### Packs, rooms, and reporting tables

- **OrganizationRequestTemplate** - system or organization-specific quick
  request template.
- **OrganizationBundle** - organization application/renewal pack foundation with
  target date, status, and readiness score.
- **OrganizationSecureRoom** - organization public sharing room foundation with
  token, permission, expiry, and revocation timestamp.
- **OrganizationSecureRoomItem** - selected organization document/file metadata
  included in a room.
- **OrganizationReadinessReport** - persisted report snapshot foundation for
  future exports.

### Boundaries and deferred schema work

Organization tables reference organization-owned models only. They do not point
at personal `Document` rows in V1. Future personal-to-organization sharing
should be implemented as an explicit copy/attach workflow with its own audit
trail rather than by silently mixing personal and organization ownership.
