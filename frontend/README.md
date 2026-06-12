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
│   ├── (marketing)/page.tsx        # Landing page (/)
│   ├── (auth)/login/page.tsx       # /login
│   ├── (auth)/register/page.tsx    # /register
│   ├── (dashboard)/dashboard/...   # /dashboard (auth-gated, preview state)
│   ├── layout.tsx                  # Root layout + fonts + metadata
│   └── globals.css                 # Tailwind + DueNest theme tokens
├── components/
│   ├── layout/
│   │   ├── logo.tsx                # Shared brand mark + wordmark
│   │   ├── site-header.tsx         # Marketing top nav
│   │   └── dashboard-shell.tsx     # Authenticated app chrome (sidebar)
│   ├── marketing/
│   │   ├── app-preview.tsx         # Decorative hero dashboard mock
│   │   └── feature-card.tsx        # Reusable feature highlight
│   ├── auth/
│   │   ├── auth-shell.tsx          # Two-panel auth layout
│   │   └── google-button.tsx       # Honest disabled Google CTA
│   ├── dashboard/
│   │   └── stat-card.tsx           # Reusable dashboard metric card
│   └── ui/                         # shadcn/ui primitives
├── lib/
│   ├── api.ts                      # fetch wrapper + ApiError
│   ├── auth.ts                     # login/register/logout + token helpers
│   └── utils.ts                    # cn()
└── types/
    └── auth.ts                     # User / token / payload types
```

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
