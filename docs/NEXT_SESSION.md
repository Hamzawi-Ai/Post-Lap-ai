# NEXT_SESSION.md

**Date:** 2026-08-03 · **Branch:** `main` @ `eeab99b` · **Repo:** `github.com/Hamzawi-Ai/Post-Lap-ai.git`

---

## Completed since the last session (2026-08-02)

1. **Integration audit work committed** (`a27777a`, merged into `main`): dev-only
   `/api/dev/login`, dev OpenAI stub, `VITE_API_BASE_URL` wiring, vite dev proxy,
   admin/secret-admin `window.confirm`, `.env.example`, `INTEGRATION_REPORT.md`.
2. **Replit Postgres** (`4557c48`) — Replit PostgreSQL service wired; drizzle schema
   pushed via post-merge `db push`. No versioned migrations (push-only).
3. **Gemini image model** (`e21574b`) — `/api/image-gen` on `gemini-2.5-flash-image`.
4. **In-app Professional plan** (`241945f`) — pricing/content gates in UI,
   `/api/auth/subscribe`, onboarding for new users. WhatsApp sub removed in favor of
   in-app plan.
5. **Brand identity page** (`eeab99b`) — `/brand` route, smart welcome, Hamzawi
   profile-permission notes, brand completion score, consent-gated partial brand saves.
6. **Launch Readiness Audit finished** — `docs/LAUNCH_READINESS_AUDIT.md`. Re-verified
   all Phase-4 items (H1/H2/H4/H5/M1/M2/M3/M5 fixed; H6/L1/L2/L3 open), audited new
   features, and produced a prioritized fix list (§7). **No fixes applied.**

## Environment state (dev)

- Postgres **down** locally (`ECONNREFUSED 127.0.0.1:5432`). Schema lives on Replit
  Postgres (unreachable from here). Start `pg_ctl`/service before running the API.
- API server not running locally (start with `pnpm --filter api-server dev`, needs DB).
- `.env` is dev-only (untracked): `NODE_ENV=development`, `SESSION_SECRET=dev-secret`,
  `ADMIN_PASSWORD=admin123`, `GOOGLE_CLIENT_ID=dev-client-id`, empty `OPENAI_API_KEY`.
- Headless Chromium under `~/.cache/ms-playwright/` (chromium-1223). E2E suite
  (`e2e/tests/login-modal.spec.ts`) is runnable once the API + DB are up.

## Remaining work — in priority order

Follow `docs/LAUNCH_READINESS_AUDIT.md` §7. **User has NOT yet reviewed/approved fixes.**

### Must-fix before go-live
1. **Production secrets** on Replit (`DATABASE_URL`, `OPENAI_API_KEY`, `GEMINI_API_KEY`,
   `GOOGLE_CLIENT_ID`, `SESSION_SECRET`, `ADMIN_PASSWORD`) + reject dev placeholder
   secrets in prod (`lib/secrets.ts`).
2. **Server-side enforcement** in the check route:
   - block registered users when `trials_remaining` reaches 0 (R2);
   - enforce `is_active` / `subscription_expires_at` (R3).
3. **Visitor cap server-side** (R1) or document client-only as accepted MVP tradeoff.
4. **Rate-limit `/api/auth/subscribe`** (R4).
5. **H6** — unify bilingual compliance badge (home.tsx:631 vs 752).

### Should-fix
6. `config.json` vs `DEFAULT_CONFIG` pro_price drift (400 vs 200).
7. Refresh OpenAPI spec (`/users/me/gender`, `/auth/subscribe`, `dev/login`, admin routes).
8. Decide www-redirect for Replit interim host.
9. Re-run e2e suite once DB/API are up.

### Nice-to-have
10. Versioned DB migrations (`drizzle-kit generate`).
11. TOS automated-decision clause (L2); privacy link in cookie banner (L3).
12. Verify R5 guest reason leak.

## Exact next task

Wait for the user to review `docs/LAUNCH_READINESS_AUDIT.md` and pick which §7 items to
fix before deploying. Then implement each fix on `main` (or a `feature/` branch), verifying
with `pnpm run typecheck` + `pnpm run build` after every change. Do not deploy to Replit
until §7.1 (production secrets) is resolved.
