# AGENTS.md

This file provides operating instructions for AI coding agents working on the CertaNest repository.

AI agents must read and follow this file before making changes.

## Project Overview

CertaNest is a production-minded SaaS platform focused on life-document readiness.

Core sentence:

> CertaNest is where important documents become ready.

Primary promise:

> Important documents, ready when life asks.

CertaNest helps people and organizations store, scan, organize, prepare, convert, fill/sign, track, generate, understand, request, and safely share important documents before deadlines, applications, renewals, and emergencies.

The product goal is to help users avoid scattered documents, missed deadlines, expired documents, incomplete application packs, repeated form-filling work, unsafe sharing, and confusion around important life-document moments.

The engineering goal is to build a clean, secure, maintainable, portfolio-grade full-stack application that can evolve into a real SaaS product without unnecessary over-engineering.

CertaNest must remain document-readiness-centered. It must not become a generic cloud drive, generic PDF utility, finance app, subscription tracker, job board, social app, or workforce-management platform.

## Tech Stack

Backend:

* Django
* Django REST Framework
* Simple JWT
* Google authentication support
* django-cors-headers
* python-decouple
* dj-database-url
* SQLite for local development
* PostgreSQL-ready configuration for production

Frontend:

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui
* App Router
* Backend-owned JWT authentication

Documentation and project assets:

* Product documentation in `docs/`
* Brand assets in `brand/`
* GitHub workflows/templates in `.github/` if present

## Repository Structure

```txt
duenest/
├── backend/        # Django REST API
├── frontend/       # Next.js frontend
├── docs/           # Product and technical documentation
├── brand/          # Brand assets and guidelines
├── .github/        # GitHub templates/workflows if present
├── .claude/        # Claude rules and reusable skills if present
├── README.md
├── AGENTS.md
└── CLAUDE.md
```

## Source of Truth

`AGENTS.md` defines how AI agents should work in this repository.

It should stay focused on stable repository rules, engineering standards, workflow, architecture expectations, and product direction.

Detailed implementation information should live in the relevant documentation files:

```txt
docs/api-spec.md          # API endpoints and contracts
docs/architecture.md      # System architecture
docs/database-design.md   # Models and relationships
docs/security-plan.md     # Authentication, authorization, data protection
docs/roadmap.md           # Sprint direction and project sequencing
docs/product-blueprint.md # Product scope and feature direction
```

Detailed premium UI/UX design rules should live in:

```txt
.claude/skills/premium-product-design/SKILL.md
.claude/rules/frontend-design.md
docs/design/
```

When a stable engineering rule, product direction, or major architecture expectation changes, update `AGENTS.md`.

When a specific endpoint, model, UI screen, setup step, or implementation detail changes, update the relevant documentation file instead.

## Core Engineering Principles

* Keep changes focused and reviewable.
* Preserve existing working functionality.
* Prefer simple, explicit, maintainable code.
* Avoid unnecessary abstraction and premature over-engineering.
* Do not rewrite unrelated files.
* Do not silently change architecture decisions.
* Do not invent completed work.
* Explain important changes clearly.
* Add or update tests when behavior changes.
* Run relevant checks before committing.
* Keep documentation aligned with the actual implementation.
* Treat authentication, user data, files, reminders, documents, deadlines, sharing, AI, emergency access, and organization/portal workflows as security-sensitive areas.
* Do not fake features, fake tests, fake security, fake compliance, fake testimonials, fake metrics, or fake working states.

## Security Rules

Never commit:

```txt
.env
.env.local
*.env
db.sqlite3
.venv/
node_modules/
.next/
dist/
build/
coverage/
.pytest_cache/
__pycache__/
*.pyc
.DS_Store
```

Never hardcode:

* API keys
* Secret keys
* Passwords
* JWT secrets
* OAuth client secrets
* Production credentials
* Private tokens
* AI provider keys
* Payment provider keys
* Email provider keys
* Storage credentials

Authentication-related work must:

* Never expose passwords or tokens in logs.
* Hash passwords properly.
* Use backend verification for third-party identity tokens.
* Keep protected endpoints behind authentication.
* Avoid storing sensitive tokens insecurely in production.
* Include tests where practical.

Document/file-related work must:

* Enforce user ownership and permissions.
* Avoid raw public storage URLs for private documents.
* Validate file type and size.
* Preserve original files when preparing edited/signed/converted copies.
* Avoid accidental public sharing.
* Use clear trust copy for sensitive user actions.

AI-related work must:

* Be opt-in or user-triggered where appropriate.
* Avoid sending unnecessary document context.
* Scope AI to selected documents/packs where possible.
* Show review-before-save behavior.
* Never auto-share, auto-delete, auto-submit, or auto-apply sensitive AI output without confirmation.
* Handle provider-not-configured states honestly.

## Backend Instructions

Backend location:

```bash
backend/
```

Common backend commands:

```bash
cd backend
source .venv/bin/activate
python manage.py check
python manage.py test
python manage.py runserver
```

Run app-specific tests when possible:

```bash
python manage.py test apps.users
```

Backend API base path:

```txt
/api/v1/
```

Current authentication endpoints include:

```txt
POST /api/v1/auth/register/
POST /api/v1/auth/login/
POST /api/v1/auth/refresh/
POST /api/v1/auth/google/
GET  /api/v1/users/me/
```

For the latest complete API contract, agents must check:

```txt
docs/api-spec.md
```

If API behavior changes, agents must update `docs/api-spec.md` and any relevant README files in the same PR.

Authentication architecture:

```txt
Username/password login → Django verifies credentials → CertaNest JWT tokens
Google login → backend verifies Google ID token → local CertaNest user → CertaNest JWT tokens
```

Do not replace Simple JWT unless explicitly requested.

Do not introduce `django-allauth`, `dj-rest-auth`, or another authentication framework unless explicitly requested and justified.

## Frontend Instructions

Frontend location:

```bash
frontend/
```

Common frontend commands:

```bash
cd frontend
npm install
npm run lint
npm run build
npm run dev
```

Frontend environment variable:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

Frontend authentication rules:

* The Django backend owns authentication.
* Do not use Auth.js/NextAuth unless explicitly requested.
* Frontend should call the Django API directly.
* For development, localStorage token handling is acceptable only with a clear TODO.
* For production, prefer a safer HttpOnly cookie strategy.
* Do not fake Google authentication.
* Do not hardcode Google client secrets in frontend code.
* Do not expose refresh tokens unnecessarily.
* Do not claim protected routes are production-secure until server-side protection or cookie-based protection is implemented.

Frontend design rules:

* Apply `.claude/skills/premium-product-design/SKILL.md` for major UI/UX work.
* Apply `.claude/rules/frontend-design.md` when editing frontend screens/components.
* Do not show every file, action, setting, and tool at once.
* Use progressive disclosure for complex flows.
* Every screen needs one obvious next action.
* Mobile must feel intentionally designed, not like desktop squeezed down.
* Sensitive actions must include clear trust copy.

## Agent Task Modes

AI agents may assist with the following task types.

### Backend Engineering

Agents may work on:

* Django and Django REST Framework feature implementation
* API endpoint design
* Serializer, model, view, URL, and test updates
* Authentication and permission logic
* Database migrations
* Backend service/helper layers
* Backend documentation updates

Agents must preserve the existing backend architecture and avoid replacing Simple JWT or the custom user model unless explicitly requested.

### Frontend Engineering

Agents may work on:

* Next.js page and component implementation
* TypeScript types and utility functions
* Tailwind CSS and shadcn/ui-based UI development
* API client integration
* Authentication flow integration
* Responsive SaaS interface improvements
* Loading, empty, error, and success states
* Premium UI/UX improvements
* Mobile/PWA interaction polish

Agents must preserve the existing product direction and avoid adding unrelated UI libraries unless explicitly requested.

### Testing and Quality

Agents may work on:

* Adding or updating tests when behavior changes
* Running backend checks before backend commits
* Running frontend lint/build checks before frontend commits
* Fixing errors properly instead of disabling checks
* Testing loading, empty, error, success, mobile, and sensitive states

Agents must not claim that tests, lint, or build passed unless they were actually run.

### Documentation

Agents may work on:

* README updates
* API notes
* Setup instructions
* Technical documentation
* Product documentation alignment
* Architecture documentation
* Security documentation
* Roadmap updates when project direction changes
* Design documentation under `docs/design/`

Documentation must remain clear, practical, and aligned with the actual codebase.

### Security Review

Agents may work on:

* Checking accidentally staged secrets or local files
* Protecting authentication flows
* Reviewing token handling
* Reviewing environment configuration
* Reviewing file upload/document handling
* Reviewing SafeSend, emergency access, AI, and portal permissions

Agents must treat authentication, user data, uploaded documents, reminders, personal information, AI context, and public share links as sensitive.

## Recommended Specialist Roles

When the coding tool supports specialist agents or subagents, agents may delegate focused work to the appropriate specialist role.

These roles are recommended behavior patterns. They do not replace the rules in this file.

### Backend API Agent

Use for:

* Django/DRF models, serializers, views, viewsets, URLs, and permissions
* API endpoint implementation
* Database migrations
* Backend service/helper layers
* Backend tests

Must prioritize:

* Secure user-owned data access
* Clear validation
* Proper permissions
* Stable `/api/v1/` conventions
* Tests for important behavior
* No sensitive fields returned accidentally

### Frontend UI Agent

Use for:

* Next.js pages
* React components
* Tailwind CSS styling
* shadcn/ui integration
* Responsive SaaS layouts
* Loading, empty, error, and success states
* Premium visual hierarchy
* Mobile/PWA layouts

Must prioritize:

* Clean visual hierarchy
* Accessibility
* Mobile responsiveness
* Strong TypeScript types
* CertaNest brand consistency
* Progressive disclosure
* One obvious next action per screen
* Smooth and restrained interactions

Must apply:

```txt
.claude/skills/premium-product-design/SKILL.md
.claude/rules/frontend-design.md
```

### Auth and Security Agent

Use for:

* Login/register flows
* JWT handling
* Google authentication
* Protected routes
* Token storage review
* Permission checks
* Secret/configuration review

Must prioritize:

* No token/password leaks
* Backend-owned authentication
* Secure third-party identity verification
* No fake auth behavior
* Clear production TODOs where development shortcuts exist

### Testing and QA Agent

Use for:

* Backend test coverage
* Frontend lint/build validation
* Edge case review
* Regression checks
* Error-state verification
* Sensitive-flow verification
* Mobile/PWA checks where practical

Must not claim tests, lint, or builds passed unless they were actually run.

### Documentation Agent

Use for:

* README updates
* API documentation
* Architecture documentation
* Security documentation
* Database design documentation
* Roadmap alignment
* Design system documentation
* Product/UX documentation

Must ensure documentation matches the actual codebase and does not describe outdated behavior.

### Code Review Agent

Use before merging important branches.

Must review:

* Scope creep
* Security risks
* Broken architecture assumptions
* Missing tests
* Missing documentation updates
* Accidentally staged secrets or local files
* Over-engineering
* Unclear code
* Fake or misleading product claims
* UI/UX clutter
* Mobile regressions
* Sensitive-flow ambiguity

### Product/UX Agent

Use for:

* Landing page UX
* Dashboard UX
* Navigation and sidebar structure
* Onboarding flows
* Vault and File Inbox UX
* File picker flows
* Document Tools UX
* Application Pack UX
* SafeSend and QR UX
* AI Assistant UX
* Fill & Sign UX
* Document Requests UX
* Portals UX
* Empty, loading, error, and success states
* Mobile/PWA experience
* Reducing user anxiety around important documents and deadlines

Must prioritize:

* Premium visual hierarchy
* Progressive disclosure
* One obvious next action per screen
* Clean mobile-first layouts
* Trust and privacy clarity
* Fast repeated actions
* Minimal clutter
* Clear status states
* Strong emotional relevance
* CertaNest brand consistency

Must avoid:

* Feature dumping
* Showing every action at once
* Generic SaaS dashboards
* Cheap-looking cards
* Excessive badges
* Random gradients
* Fake testimonials
* Fake trust claims
* Unclear sharing states
* AI without scope labels
* Mobile screens that feel like squeezed desktop layouts

Must apply:

```txt
.claude/skills/premium-product-design/SKILL.md
```

## Engineering Quality Standards

### Backend Engineering Standard

Backend work must be production-minded, secure, and maintainable.

For Django/DRF work, agents should prioritize:

* Clear model design with sensible relationships and constraints
* Explicit serializers with validation
* Clean views/viewsets with appropriate permissions
* Consistent URL structure under `/api/v1/`
* Proper authentication and authorization checks
* Secure password/token handling
* Environment-based configuration
* Database migrations that are safe and explainable
* Tests for important behavior and edge cases
* Clear API responses and error handling
* Minimal business logic inside views when a service/helper layer is more appropriate

Backend agents should avoid:

* Over-engineering with unnecessary microservices
* Adding heavy frameworks without approval
* Bypassing permissions
* Returning sensitive fields in API responses
* Writing fragile code that only works for the happy path
* Changing authentication architecture without explicit instruction
* Adding background jobs, queues, payments, or AI services unless the task explicitly asks for them
* Auto-sharing, auto-deleting, or auto-submitting document data without user confirmation

A strong backend change should answer:

```txt
What data is being modeled?
Who owns this data?
Who is allowed to access it?
What validation is required?
What tests prove it works?
What security risk exists?
Does it support document readiness?
```

### Frontend Engineering Standard

Frontend work must be polished, responsive, accessible, and product-quality.

For Next.js/TypeScript/Tailwind/shadcn work, agents should prioritize:

* Clean component structure
* Strong TypeScript types
* Reusable UI components
* Responsive layouts for mobile, tablet, and desktop
* Clear loading, empty, error, and success states
* Accessible forms, labels, buttons, and navigation
* Consistent spacing, typography, and visual hierarchy
* Premium SaaS UI patterns
* Simple state management unless complexity requires more
* Clean API integration through shared helpers
* No hardcoded secrets or environment-specific values
* Progressive disclosure for complex flows
* Recent-first and search-first file selection
* Review-before-sharing for SafeSend
* Review-before-saving for AI
* Original-preserved copy for document preparation
* Mobile-first interaction patterns where appropriate

Frontend agents should avoid:

* Messy one-file pages with too much logic
* Unnecessary UI libraries
* Inconsistent styling
* Fake functionality presented as working
* Ignoring loading/error states
* Breaking existing routes or layouts
* Adding complex animations that hurt usability
* Using `any` unnecessarily
* Adding Redux, Zustand, or other state libraries unless explicitly requested
* Showing every action, file, tool, and setting at once
* Generic dashboard cards with no clear next action
* Fake testimonials, fake metrics, or fake trust claims

A strong frontend change should answer:

```txt
Is the UI clear?
Is it responsive?
Is it accessible?
Does it handle loading and errors?
Is the API integration typed and maintainable?
Does it match the CertaNest brand?
Does it reduce friction?
Does it hide complexity until needed?
Does it make sensitive document actions safer and clearer?
Does it support “important documents, ready when life asks”?
```

### UI/UX Product Standard

CertaNest must feel:

* Premium
* Clean
* Calm
* Trustworthy
* Fast
* Focused
* Emotionally clear
* Mobile-first
* Frictionless
* Document-centered
* Serious but human
* Modern
* Useful without feeling complicated

CertaNest must not feel:

* Generic
* Crowded
* Cheap
* Noisy
* Like a student project
* Like a random dashboard
* Like a feature dump
* Like a basic file manager clone
* Like a PDF utility website
* Like a squeezed desktop app on mobile

Agents should design interfaces that reduce user anxiety around important documents, deadlines, applications, renewals, sharing, AI, and emergency access.

Every important screen must make the next action obvious.

Agents must use progressive disclosure:

* Do not show every file, action, tool, and setting at once.
* Show the most important action first.
* Hide advanced options until needed.
* Use review steps before sensitive actions.
* Use recent-first and search-first file selection.
* Use mobile bottom sheets or focused flows where appropriate.

Sensitive flows must include clear trust copy:

* Private until shared.
* No public link has been created yet.
* Original file preserved.
* Review AI suggestions before saving.
* Review before sharing.
* This QR follows your SafeSend access rules.
* Requirements vary. Verify with the official source.
* Legal acceptance may depend on the recipient and jurisdiction.

Agents must not create:

* Fake testimonials
* Fake user numbers
* Fake ratings
* Fake awards
* Fake security claims
* Fake compliance claims
* Fake legal e-signature claims
* Fake AI outputs
* Fake working features

For major UI/UX work, agents must read and apply:

```txt
.claude/skills/premium-product-design/SKILL.md
```

## Documentation Alignment

When a change affects architecture, API behavior, authentication, security, database design, setup instructions, environment variables, project roadmap, product direction, or design system, agents must check and update the relevant documentation.

Important documentation files may include:

```txt
README.md
backend/README.md
frontend/README.md
docs/architecture.md
docs/database-design.md
docs/api-spec.md
docs/security-plan.md
docs/roadmap.md
docs/product-blueprint.md
docs/design/
```

Agents must keep documentation aligned with the actual codebase.

Examples:

* If a new API endpoint is added, update `docs/api-spec.md` and any relevant README.
* If authentication changes, update `docs/security-plan.md`, `docs/api-spec.md`, and backend documentation.
* If models or database relationships change, update `docs/database-design.md`.
* If frontend setup or environment variables change, update `frontend/README.md` and root setup notes.
* If architecture decisions change, update `docs/architecture.md`.
* If project priorities or sprint order change, update `docs/roadmap.md`.
* If product direction changes, update `docs/product-blueprint.md`.
* If design system rules change, update `docs/design/` and `.claude/skills/premium-product-design/SKILL.md`.

Documentation updates should be included in the same PR when they are directly related to the code change.

Agents must not leave documentation claiming outdated behavior.

## Current Development Flow

Use focused branches such as:

```txt
backend/authentication
backend/google-auth
frontend/nextjs-setup
frontend/auth-integration
backend/documents-models
frontend/dashboard-documents
backend/reminders
frontend/reminders-ui
feature/premium-product-experience-reconstruction
feature/premium-uiux-product-feel-pass
feature/safesend-progressive-flow
feature/vault-premium-redesign
```

Before editing:

```bash
git status --short
git branch --show-current
```

Before committing:

```bash
git status --short
```

Commit messages should be clear and scoped:

```bash
git commit -m "backend: add authentication API"
git commit -m "backend: add Google authentication API"
git commit -m "frontend: add Next.js foundation"
git commit -m "frontend: connect authentication flows"
git commit -m "docs: update project instructions"
git commit -m "frontend: refine premium dashboard UX"
git commit -m "docs: add premium product design skill"
```

## Pull Request Expectations

Each PR should include:

* Clear summary
* Files or areas changed
* Tests/checks run
* Documentation updated or explicitly confirmed as not required
* Any known limitations
* Any follow-up TODOs
* Any security-sensitive behavior changed
* Any UI/UX flows changed

Do not mix unrelated work in one PR.

Good examples:

```txt
frontend: connect authentication flows
backend: add document models
backend: add renewal reminder model
frontend: rebuild SafeSend progressive flow
frontend: redesign Vault document cards
docs: update project instructions
```

Bad examples:

```txt
update stuff
fix things
backend and frontend changes
new design and random fixes
```

## Definition of Done

A task is not complete until:

1. The intended feature or improvement works.
2. Existing functionality still works.
3. Relevant tests/checks pass.
4. No secrets or local files are staged.
5. Related documentation has been checked and updated if the change affects architecture, API behavior, authentication, security, database design, setup, environment variables, product direction, design system, or roadmap.
6. The change is committed with a clear message when requested.
7. The branch is pushed when requested.
8. The final summary explains what changed.
9. Known limitations are stated honestly.
10. Any unfinished or weak UI/UX areas are identified honestly.

For UI/UX tasks, a task is not complete until:

1. Desktop and mobile layouts are checked.
2. Loading, empty, error, and success states are handled.
3. The next action is obvious.
4. Sensitive actions include trust copy.
5. The UI does not show unnecessary complexity at once.
6. Accessibility basics are preserved.
7. No fake claims or fake functionality were introduced.

## Agent Behavior

When working in this repo, AI agents must:

1. Inspect before editing.
2. Understand the current architecture.
3. Make the smallest safe change.
4. Preserve existing functionality.
5. Avoid unrelated refactors.
6. Run relevant checks.
7. Check whether documentation needs updating.
8. Summarize changed files.
9. Mention TODOs clearly.
10. Never claim something passed unless it was actually run.
11. Ask for clarification if a requested change conflicts with existing architecture.
12. Use specialist agents or subagents for focused backend, frontend, security, testing, documentation, code review, or product/UX work when the tool supports it.
13. For UI/UX tasks, apply the premium product design skill.
14. For sensitive document flows, prefer explicit review/confirmation over hidden automation.
15. When uncertain, preserve user trust and simplify.

## Learning Context

The project owner is actively learning and wants to understand the implementation.

When making changes, explain:

* What was changed
* Why it was changed
* Which files were touched
* Which commands were run
* What passed
* What failed, if anything
* Whether documentation was updated or not required
* What the next step should be

Prefer clear, educational explanations over unexplained large code dumps.

## Important Product Direction

CertaNest must remain focused on one core promise:

> CertaNest is where important documents become ready.

Primary product promise:

> Important documents, ready when life asks.

CertaNest is a private life-document readiness platform.

CertaNest helps people and organizations:

* Store important documents
* Scan documents
* Organize documents
* Prepare documents
* Convert files
* Compress files
* Fill and sign prepared copies
* Track deadlines and renewals
* Build application packs
* Generate document drafts with AI
* Ask questions about selected documents
* Request missing documents
* Share documents safely
* Prepare emergency access
* Collect and review documents through portals

CertaNest should focus on:

* Vault
* File Inbox
* Scanner
* Document Tools
* Convert & Export
* Fill & Sign
* Deadlines & Renewals
* Application Packs
* SafeSend
* Custom QR
* Emergency Access
* AI Smart Intake
* Chat with Documents / RAG
* Document Generation
* Document Requests
* CertaNest Portals
* Founder/Admin Console
* Premium mobile/PWA experience

CertaNest must not become:

* A finance app
* A budgeting app
* A subscription tracker as a core product
* A generic cloud drive
* A generic scanner
* A generic AI PDF chatbot
* A job board
* A full career platform
* A workforce management app
* A social network
* A marketplace
* A legal e-signature enterprise clone

Manual recurring reminders may exist under Deadlines & Renewals, but subscription tracking must not dominate the product identity.

Every product, design, frontend, backend, and documentation decision should support document readiness.

When uncertain, ask:

```txt
Does this make important documents more ready, complete, trackable, understandable, or safely shareable?
```

If the answer is no, simplify, hide, defer, or remove it.

## Final Rule

When uncertain, preserve the existing architecture, avoid risky changes, reduce complexity, protect user trust, and keep CertaNest focused on document readiness.
