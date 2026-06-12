# AGENTS.md

This file provides operating instructions for AI coding agents working on the DueNest repository.

AI agents must read and follow this file before making changes.

## Project Overview

DueNest is a production-minded SaaS platform for managing important life-admin tasks such as document renewals, subscriptions, deadlines, reminders, application packs, and AI-assisted document support.

The product goal is to help users avoid missed deadlines, expired documents, forgotten renewals, repeated form-filling work, and disorganized personal administration.

The engineering goal is to build a clean, secure, maintainable, portfolio-grade full-stack application that can evolve into a real SaaS product without unnecessary over-engineering.

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
├── README.md
├── AGENTS.md
└── CLAUDE.md
```

## Source of Truth

`AGENTS.md` defines how AI agents should work in this repository.

It should stay focused on stable repository rules, engineering standards, workflow, and architecture expectations.

Detailed implementation information should live in the relevant documentation files:

```txt
docs/api-spec.md          # API endpoints and contracts
docs/architecture.md      # System architecture
docs/database-design.md   # Models and relationships
docs/security-plan.md     # Authentication, authorization, data protection
docs/roadmap.md           # Sprint direction and project sequencing
docs/product-blueprint.md # Product scope and feature direction
```

When a stable engineering rule or major architecture expectation changes, update `AGENTS.md`.

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
* Treat authentication, user data, files, reminders, documents, and deadlines as security-sensitive areas.

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

Authentication-related work must:

* Never expose passwords or tokens in logs.
* Hash passwords properly.
* Use backend verification for third-party identity tokens.
* Keep protected endpoints behind authentication.
* Avoid storing sensitive tokens insecurely in production.
* Include tests where practical.

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
Username/password login → Django verifies credentials → DueNest JWT tokens
Google login → backend verifies Google ID token → local DueNest user → DueNest JWT tokens
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

Agents must preserve the existing design direction and avoid adding unrelated UI libraries unless explicitly requested.

### Testing and Quality

Agents may work on:

* Adding or updating tests when behavior changes
* Running backend checks before backend commits
* Running frontend lint/build checks before frontend commits
* Fixing errors properly instead of disabling checks

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

Documentation must remain clear, practical, and aligned with the actual codebase.

### Security Review

Agents may work on:

* Checking accidentally staged secrets or local files
* Protecting authentication flows
* Reviewing token handling
* Reviewing environment configuration
* Reviewing file upload/document handling when implemented

Agents must treat authentication, user data, uploaded documents, reminders, and personal information as sensitive.

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

### Frontend UI Agent

Use for:

* Next.js pages
* React components
* Tailwind CSS styling
* shadcn/ui integration
* Responsive SaaS layouts
* Loading, empty, error, and success states

Must prioritize:

* Clean visual hierarchy
* Accessibility
* Mobile responsiveness
* Strong TypeScript types
* DueNest brand consistency

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

Must not claim tests, lint, or builds passed unless they were actually run.

### Documentation Agent

Use for:

* README updates
* API documentation
* Architecture documentation
* Security documentation
* Database design documentation
* Roadmap alignment

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

### Product/UX Agent

Use for:

* Dashboard UX
* Onboarding flows
* Form flows
* Empty states
* Deadline/reminder user experience
* Reducing user anxiety around important documents and renewals

Must keep DueNest calm, trustworthy, organized, modern, helpful, professional, and reliable.

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

A strong backend change should answer:

```txt
What data is being modeled?
Who owns this data?
Who is allowed to access it?
What validation is required?
What tests prove it works?
What security risk exists?
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
* Professional SaaS UI patterns
* Simple state management unless complexity requires more
* Clean API integration through shared helpers
* No hardcoded secrets or environment-specific values

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

A strong frontend change should answer:

```txt
Is the UI clear?
Is it responsive?
Is it accessible?
Does it handle loading and errors?
Is the API integration typed and maintainable?
Does it match the DueNest brand?
```

### UI/UX Product Standard

DueNest should feel:

* Calm
* Trustworthy
* Organized
* Modern
* Helpful
* Professional
* Reliable

Agents should design interfaces that reduce user anxiety around deadlines, documents, renewals, subscriptions, and important life-admin tasks.

Every important screen should make the next action obvious.

## Documentation Alignment

When a change affects architecture, API behavior, authentication, security, database design, setup instructions, environment variables, or project roadmap, agents must check and update the relevant documentation.

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
```

Agents must keep documentation aligned with the actual codebase.

Examples:

* If a new API endpoint is added, update `docs/api-spec.md` and any relevant README.
* If authentication changes, update `docs/security-plan.md`, `docs/api-spec.md`, and backend documentation.
* If models or database relationships change, update `docs/database-design.md`.
* If frontend setup or environment variables change, update `frontend/README.md` and root setup notes.
* If architecture decisions change, update `docs/architecture.md`.
* If project priorities or sprint order change, update `docs/roadmap.md`.

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
```

## Pull Request Expectations

Each PR should include:

* Clear summary
* Files or areas changed
* Tests/checks run
* Documentation updated or explicitly confirmed as not required
* Any known limitations
* Any follow-up TODOs

Do not mix unrelated work in one PR.

Good examples:

```txt
frontend: connect authentication flows
backend: add document models
backend: add renewal reminder model
docs: update setup instructions
```

Bad examples:

```txt
update stuff
fix things
backend and frontend changes
```

## Definition of Done

A task is not complete until:

1. The intended feature works.
2. Existing functionality still works.
3. Relevant tests/checks pass.
4. No secrets or local files are staged.
5. Related documentation has been checked and updated if the change affects architecture, API behavior, authentication, security, database design, setup, environment variables, or roadmap.
6. The change is committed with a clear message.
7. The branch is pushed.
8. The final summary explains what changed.

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

DueNest should remain focused on:

* Document renewal tracking
* Subscription reminders
* Deadline management
* Application packs
* Form-filling support
* AI-assisted document polishing
* Personal life-admin organization

Do not add unrelated features such as payments, social feeds, chat apps, marketplaces, or complex AI systems unless explicitly requested.

## Final Rule

When uncertain, preserve the existing architecture, avoid risky changes, and ask for clarification.