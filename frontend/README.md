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
│   ├── (dashboard)/dashboard/documents/      # /dashboard/documents (list)
│   │   ├── page.tsx                           #   list + delete
│   │   ├── new/page.tsx                       #   /dashboard/documents/new
│   │   └── [id]/edit/page.tsx                 #   /dashboard/documents/:id/edit
│   ├── layout.tsx                            # Root layout + fonts + metadata
│   └── globals.css                          # Tailwind + DueNest theme tokens
├── components/
│   ├── layout/                              # logo, site-header, dashboard-shell
│   ├── marketing/                           # app-preview, feature-card
│   ├── auth/                                # auth-shell, google-button
│   ├── dashboard/                           # stat-card, user-context
│   ├── documents/                           # document-card, document-form, status-badge
│   └── ui/                                  # shadcn/ui primitives (+ textarea, confirm-dialog)
├── lib/
│   ├── api.ts                               # fetch wrapper + ApiError
│   ├── auth.ts                              # login/register/logout + token helpers
│   ├── documents.ts                         # documents API + date/status helpers
│   └── utils.ts                             # cn()
└── types/
    ├── auth.ts                              # User / token / payload types
    └── documents.ts                         # DocumentRecord / requests / category
```

## Documents management

- Routes live under `/dashboard/documents` (list, `new`, `[id]/edit`).
- All document calls go through `src/lib/documents.ts`, which uses the shared
  `apiFetch` with `auth: true` (so the access token + error handling stay in one
  place). Endpoints: `GET/POST/PATCH/DELETE /api/v1/documents/`.
- The `(dashboard)/layout.tsx` performs the client-side auth gate once and
  exposes the user via `useDashboardUser()`; pages no longer re-check auth.
- The dashboard summary cards are computed from real `GET /documents/` data.
- Category selection is not yet available (the backend exposes no categories
  list endpoint); `category_name` is shown read-only when present.

## Design system

- **Fonts:** Inter (body) + Sora (display/headings), loaded via `next/font`.
- **Brand tokens:** defined in `globals.css` from `brand/` — Trust Blue
  (`--primary`), Nest Teal, Due Amber, Soft Mint (`--accent`), Midnight Navy
  text, plus `brand-*` color utilities (e.g. `text-brand-teal`).
- **Components:** shadcn/ui "base-nova" primitives (built on `@base-ui`). Use
  `buttonVariants()` on `next/link` for link-styled buttons.
- **Patterns:** reusable section/card components live under `components/marketing`,
  `components/dashboard`, and `components/auth` to keep pages thin.

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
