# AGENTS.md

This file provides instructions for AI coding agents working on the DueNest repository.

## Project Overview

DueNest is a SaaS platform for document renewals, subscriptions, reminders, deadlines, application packs, and life-admin management.

The project is being built as a production-minded full-stack application with:

- Django and Django REST Framework backend
- Simple JWT authentication
- Google authentication support
- Next.js frontend
- TypeScript
- Tailwind CSS
- shadcn/ui
- Clear documentation and professional Git workflow

## Repository Structure

```txt
duenest/
├── backend/        # Django REST API
├── frontend/       # Next.js frontend
├── docs/           # Product and technical documentation
├── brand/          # Brand assets and guidelines
├── .github/        # GitHub templates/workflows if present
├── README.md
└── AGENTS.md
```

## Core Rules

* Do not commit secrets.
* Do not commit `.env`, `.env.local`, database files, virtual environments, build folders, or dependency folders.
* Do not rewrite unrelated files.
* Keep pull requests focused.
* Preserve existing working functionality.
* Run relevant checks before committing.
* Prefer simple, maintainable code over over-engineering.
* Explain important changes clearly in commit/PR summaries.

## Backend Instructions

Backend location:

```bash
backend/
```

Common commands:

```bash
cd backend
source .venv/bin/activate
python manage.py check
python manage.py test
python manage.py runserver
```

Backend stack:

* Django
* Django REST Framework
* Simple JWT
* django-cors-headers
* python-decouple
* dj-database-url

Existing authentication endpoints include:

```txt
POST /api/v1/auth/register/
POST /api/v1/auth/login/
POST /api/v1/auth/refresh/
GET  /api/v1/users/me/
```

Google authentication should use the backend-owned JWT model:

```txt
Google ID token → backend verification → local DueNest user → DueNest JWT tokens
```

Do not replace Simple JWT with another authentication system unless explicitly requested.

## Frontend Instructions

Frontend location:

```bash
frontend/
```

Common commands:

```bash
cd frontend
npm install
npm run lint
npm run build
npm run dev
```

Frontend stack:

* Next.js
* TypeScript
* Tailwind CSS
* shadcn/ui

Frontend should use the backend API base URL from:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api/v1
```

Do not hardcode secrets in frontend code.

## Security Rules

Never commit:

```txt
.env
.env.local
db.sqlite3
.venv/
node_modules/
.next/
__pycache__/
*.pyc
```

Authentication-related work must:

* Avoid exposing passwords or tokens in logs.
* Hash passwords properly.
* Use backend verification for third-party identity tokens.
* Keep access to protected endpoints behind authentication.
* Include tests where practical.

## Git Workflow

Use focused branches such as:

```txt
backend/authentication
backend/google-auth
frontend/nextjs-setup
```

Before committing:

```bash
git status --short
```

Commit messages should be clear, for example:

```bash
git commit -m "docs: add AI agent repo instructions"
```

## Agent Behavior

When working in this repo:

1. Inspect before editing.
2. Make the smallest safe change.
3. Preserve existing architecture.
4. Run relevant checks.
5. Summarize changed files.
6. Mention any TODOs clearly.
7. Do not invent completed work.
