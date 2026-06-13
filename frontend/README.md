# DueNest Frontend

The web client for **DueNest** — a secure workspace for documents, deadlines,
renewals, subscriptions, and application packs.

Built with **Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui**.

## Stack

- Next.js 16 (App Router, `src/` directory)
- TypeScript
- Tailwind CSS v4
- shadcn/ui components (`@base-ui` based "base-nova" style)
- DueNest brand palette + Inter / Sora fonts

## Getting started

```bash
cd frontend
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_BASE_URL
npm install
npm run dev
```

Open http://localhost:3000.

The backend (Django REST API) is expected at the URL in
`NEXT_PUBLIC_API_BASE_URL` (default `http://127.0.0.1:8000/api/v1`).

## Environment variables

| Variable                   | Description                     | Example                        |
| -------------------------- | ------------------------------- | ------------------------------ |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL of the DueNest backend | `http://127.0.0.1:8000/api/v1` |

`.env.local` is git-ignored. Only `.env.local.example` is committed.

## Project structure

```txt
src/
├── app/
│   ├── (marketing)/page.tsx                  # Landing page (/)
│   ├── (auth)/login/page.tsx                 # /login
│   ├── (auth)/register/page.tsx              # /register
│   ├── (dashboard)/layout.tsx                # Auth gate + shell + user context
│   ├── (dashboard)/dashboard/page.tsx        # /dashboard (real document summary)
│   ├── (dashboard)/dashboard/onboarding/     # setup checklist + demo controls
│   ├── (dashboard)/dashboard/documents/      # /dashboard/documents (list)
│   │   ├── page.tsx                           #   list + delete
│   │   ├── new/page.tsx                       #   /dashboard/documents/new
│   │   └── [id]/edit/page.tsx                 #   workspace: metadata form + attached files
│   ├── (dashboard)/dashboard/trust/page.tsx   # Trust Center
│   ├── (dashboard)/dashboard/settings/data/   # data export + deletion request controls
│   ├── demo/page.tsx                          # public demo overview
│   ├── security/page.tsx                      # public beta security draft
│   ├── privacy/page.tsx                       # public beta privacy draft
│   ├── terms/page.tsx                         # public beta terms draft
│   ├── share/files/[token]/page.tsx          # Public shared-file viewer
│   ├── layout.tsx                            # Root layout + fonts + metadata
│   └── globals.css                          # Tailwind + DueNest theme tokens
├── components/
│   ├── layout/                              # logo, site-header, dashboard-shell
│   ├── marketing/                           # app-preview, feature-card
│   ├── auth/                                # auth-shell, google-button
│   ├── dashboard/                           # stat-card, user-context
│   ├── documents/                           # document-card/form/status-badge,
│   │                                        #   file UI, share dialog, reminder rules
│   ├── onboarding/                          # setup checklist card
│   └── ui/                                  # shadcn/ui primitives (+ textarea, confirm-dialog)
├── lib/
│   ├── api.ts                               # fetch wrapper + ApiError (JSON + FormData)
│   ├── auth.ts                              # login/register/logout + token helpers
│   ├── documents.ts                         # documents API, search, attention, reminders
│   ├── document-files.ts                    # files, preview, sharing, activity helpers
│   ├── onboarding.ts                        # onboarding, demo, trust, data-control API helpers
│   └── utils.ts                             # cn()
└── types/
    ├── auth.ts                              # User / token / payload types
    ├── documents.ts                         # DocumentRecord / requests / category
    ├── document-files.ts                    # file/share/activity/public-share types
    └── onboarding.ts                        # setup/trust/account-control types
```

## Documents management

- Routes live under `/dashboard/documents` (list, `new`, `[id]/edit`).
- All document calls go through `src/lib/documents.ts`, which uses the shared
  `apiFetch` with `auth: true` (so the access token + error handling stay in one
  place). Endpoints: `GET/POST/PATCH/DELETE /api/v1/documents/`, plus
  `/documents/attention-needed/`, nested reminder-rule endpoints, and
  `/documents/reminders/upcoming/`.
- The `(dashboard)/layout.tsx` performs the client-side auth gate once and
  exposes the user via `useDashboardUser()`; pages no longer re-check auth.
- The dashboard summary cards and Needs attention panel are computed from real
  document-intelligence API responses (`GET /documents/` with computed filters
  and `GET /documents/attention-needed/`).
- The documents page supports backend-owned search, quick status filters,
  type/country/issuer filters, expiry range filters, sorting, clearing filters,
  and a no-results state. Frontend filters are UX only; the backend remains the
  security boundary and scopes every query to the authenticated owner.
- Document cards and the edit workspace show backend-computed health fields:
  `computed_status`, `status_reason`, `urgency_level`, `days_until_expiry`,
  `has_file`, `missing_file`, `missing_expiry_date`, and `needs_attention`.
- Category selection is not yet available (the backend exposes no categories
  list endpoint); `category_name` is shown read-only when present.

### Onboarding, trust, and data controls

- The dashboard can show a `SetupChecklistCard` backed by
  `GET /api/v1/onboarding/document-setup-checklist/` and
  `GET /api/v1/onboarding/state/`.
- `/dashboard/onboarding` provides a focused setup flow, plus fake/labeled demo
  data controls using `/demo/create-document-demo-data/` and
  `/demo/clear-document-demo-data/`.
- `/dashboard/trust` renders the backend security capability summary and marks
  Trust Center review for onboarding progress.
- `/dashboard/settings/data` shows owner-scoped account data counts, creates a
  metadata export request, and records/cancels account deletion requests.
- Public `/demo`, `/security`, `/privacy`, and `/terms` pages are beta-ready
  product drafts. Privacy and terms copy should receive legal review before
  public launch.

### Document files

- The document workspace (`/dashboard/documents/[id]/edit`) holds both the
  metadata form **and** an **Attached files** section (upload, list, download,
  preview, share, delete) on one page. Creating a document redirects straight
  here so a file can be attached immediately — no extra navigation.
- File calls go through `src/lib/document-files.ts`. Uploads send `FormData`
  via `apiFetch` (which omits `Content-Type` for multipart so the browser sets
  the boundary). Preview and download use authenticated blob fetches because
  controlled file endpoints require the `Authorization` header.
- Endpoints: `GET/POST /api/v1/documents/:id/files/`,
  `DELETE /api/v1/documents/:id/files/:file_id/`,
  `GET /api/v1/documents/:id/files/:file_id/preview/`,
  `GET /api/v1/documents/:id/files/:file_id/download/`.
- The in-app viewer supports PDF, JPG, and PNG previews. DOC/DOCX files show a
  download fallback.
- Share management lives in `DocumentFileShareDialog`: owners can create
  time-limited file-level links, choose view-only or download-allowed access,
  require an access code, copy the generated link/code, revoke active links, and
  view owner-only activity.
- Public shared links render at `/share/files/[token]` without the dashboard
  shell. Access-code-protected files keep the code in component state only and
  pass it to the backend via `X-Access-Code`; codes are not stored in
  `localStorage`.
- Client-side validation (type + 10 MB) is UX-only; the backend remains the
  source of truth.

### Document reminder rules

- Reminder rules live on the document workspace
  (`/dashboard/documents/[id]/edit`) below the file section.
- Users can create, pause/enable, and delete rules such as 90, 60, 30, or 7
  days before expiry, on expiry day, or before renewal date when that source
  date exists.
- The backend calculates `upcoming_reminder_date`; this frontend does not send
  email, push, SMS, WhatsApp, Telegram, or in-app notifications yet.

## Design system

- **Fonts:** Inter (body) + Sora (display/headings), loaded via `next/font`,
  with refined font-feature-settings and antialiasing for crisp type.
- **Surfaces:** a soft cool-neutral canvas (`--background`) with white cards and
  a white command sidebar, so surfaces layer with calm, premium depth.
- **Brand tokens:** defined in `globals.css` from `brand/` — Trust Blue
  (`--primary`), Nest Teal, Due Amber, Soft Mint (`--accent`), Midnight Navy
  text, plus `brand-*` color utilities (e.g. `text-brand-teal`).
- **Shadow scale:** `shadow-card` (resting surfaces), `shadow-elevated`
  (hover / dialogs), `shadow-floating` (hero/marketing CTA) — defined as theme
  tokens in `globals.css`. Prefer these over ad-hoc `shadow-*`.
- **Background utilities:** `bg-grid` (subtle technical grid) and `mask-fade-b`
  (fade an element toward its bottom edge) for hero/section backdrops.
- **Components:** shadcn/ui "base-nova" primitives (built on `@base-ui`). Use
  `buttonVariants()` on `next/link` for link-styled buttons. The `Card`
  primitive uses border + `shadow-card`; buttons have a 3-tier size scale
  (`sm` / default / `lg`) and tinted primary shadow.
- **Patterns:** reusable section/card components live under `components/marketing`,
  `components/dashboard`, and `components/auth` to keep pages thin.
- **Authenticated app conventions:** forms group fields into labelled sections
  (a two-column `label / fields` layout) rather than a flat list; document
  status uses `DocumentStatusBadge` (calm → urgent ring-tinted pills), and
  date-derived urgency ("Expires in N days" / "Expired N days ago") is shown
  on document cards and the dashboard "Needs attention" panel.

## Authentication (current state)

- Login → `POST /api/v1/auth/login/`, then redirect to `/dashboard`.
- Register → `POST /api/v1/auth/register/`, then redirect to `/login` (the
  backend does not return tokens on register yet).
- Tokens are stored in `localStorage` **for development only**.

### Known TODOs

- **Token storage:** move from `localStorage` to HttpOnly cookies before
  production (see `src/lib/auth.ts`).
- **Protected routes:** `/dashboard` is currently open; add middleware to
  redirect unauthenticated users to `/login`.
- **Google sign-in:** the "Continue with Google" buttons are present but
  disabled until `POST /api/v1/auth/google/` is confirmed on the backend.

## Scripts

```bash
npm run dev     # start dev server
npm run build   # production build
npm run lint    # eslint
npm run start   # serve production build
```
