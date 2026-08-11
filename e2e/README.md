# E2E Smoke Tests (Playwright)

Critical pre-launch regression coverage for:

1. **auth-guard.spec.ts** — protected routes redirect unauthenticated users to `/auth`.
2. **cron-hooks.spec.ts** — `/api/public/hooks/*` cron endpoints reject unauthenticated calls (401/403).
3. **contracts-sign.spec.ts** — the contract sign page rejects a bogus contract id.

## Run

```bash
bun add -D @playwright/test
bunx playwright install --with-deps chromium
bunx playwright test
```

Set `E2E_BASE_URL` to point at a deployed preview (defaults to `http://localhost:8080`).

## Authenticated flows

Full punch/payroll/contract-sign happy paths need a seeded test user. Add credentials
via env (`E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`) and extend these specs — the current
suite only covers the security-critical unauthenticated boundary.
