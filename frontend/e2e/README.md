# End-to-end tests (Playwright)

These drive the real app in a browser. They need the full stack running with a
seeded test user.

## Local run

From the repo root, start the backend (same-origin proxy target) and a
seeded user, then the frontend in same-origin mode, then run the tests:

```bash
# 1) Backend (separate shell), with a seeded user:
cd backend && source .venv/bin/activate
python manage.py migrate
python manage.py shell -c "from django.contrib.auth import get_user_model as U; u,_=U().objects.get_or_create(email='verify@example.com', defaults={'username':'verify','is_staff':True,'is_superuser':True}); u.username='verify'; u.is_active=True; u.set_password('VerifyPass123!');
[setattr(u,f,True) for f in ['email_verified'] if hasattr(u,f)]; u.save()"
python manage.py runserver 127.0.0.1:8010

# 2) Frontend (separate shell), same-origin so cookie auth works:
cd frontend
NEXT_PUBLIC_API_BASE_URL=/api/v1 BACKEND_ORIGIN=http://127.0.0.1:8010 npm run dev -- -p 3010

# 3) Tests:
cd frontend
E2E_BASE_URL=http://localhost:3010 npm run test:e2e
```

Override the seeded credentials with `E2E_USERNAME` / `E2E_PASSWORD`.

## Notes
- Use `localhost` (not `127.0.0.1`) for `E2E_BASE_URL` — Next dev blocks
  cross-origin access to its dev resources on bare IPs, which breaks hydration.
- `public` specs (`*.public.spec.ts`) need no auth; `authed` specs
  (`*.authed.spec.ts`) reuse the login captured in `global-setup`.
