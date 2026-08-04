# SESSION_HANDOFF.md

Single source of truth for the next development session. Last updated: 2026-08-04.

## Current commit & branch

- **Branch:** `main`
- **Commit:** `eeab99b` — "Add brand identity page, smart welcome, and Hamzawi profile-permission notes"
- **Working tree:** NOT clean — uncommitted docs only (see below). No code changes pending.

Uncommitted (docs refreshed in this session):
- `docs/PROJECT_STATUS.md`, `docs/DECISIONS.md`, `docs/MVP_SCOPE.md`, `docs/NEXT_SESSION.md`, `docs/HOMEPAGE_SPEC.md` — updated to reflect commits `4557c48`→`eeab99b`
- `docs/LAUNCH_READINESS_AUDIT.md` — new audit report (uncommitted)
- `docs/SESSION_HANDOFF.md` — this file (uncommitted)

## What was completed

- **Launch Readiness Audit** (`docs/LAUNCH_READINESS_AUDIT.md`): full re-verification of Phase-4 findings (H1/H2/H4/H5/M1/M2/M3/M5 confirmed fixed; H6/L1–L3 open), new-feature audit (in-app Professional plan `241945f`, brand identity `eeab99b`, Gemini image model `e21574b`, Replit Postgres `4557c48`), server-side enforcement gaps, prioritized fix list §7. **No fixes applied** — awaiting user review.
- **Professional (800) subscription flow audited end-to-end** (code review): UI entry points, `handleSubscribe`, `POST /api/auth/subscribe`, DB update, onboarding redirect, feature gates. Functional; commercial gaps documented (no payment verification, no rate limit, `is_active`/`subscription_expires_at` never enforced).
- **Manual QA of the Professional journey** (test harness in `/tmp/opencode/qa`, real Postgres + API + Chromium): **9/10 steps pass** — register→login→subscribe→DB update→onboarding→brand profile→text gen→gates all work. Image generation FAILS only due to missing `GEMINI_API_KEY` (503). Test users cleaned up; no repo code touched.
- **Full local stack bootstrapped** (Postgres 16.14 via extracted debs in `/tmp/opencode/pg`, schema pushed, API on :5000, Vite on :8080) — still running; see Deployment status.

## What was intentionally postponed

- All fixes in audit §7 (Must-fix: secrets, R2/R3 enforcement, R1 visitor cap, R4 subscribe rate limit, H6 badge; Should-fix: config drift, OpenAPI spec, www-redirect, docs; Nice-to-have: versioned migrations, TOS clause, cookie-banner link, R5 check).
- Google OAuth live testing (no real `GOOGLE_CLIENT_ID`).
- E2E Playwright suite run (config points at a stale Nix chromium path; not run).
- Payment verification / subscription expiry / renewal / cancel flows (out of scope for this audit session).

## Known issues

1. **Go-live blocker:** `.env` is all dev placeholders (`dev-secret`, `admin123`, `dev-client-id`, empty `OPENAI_API_KEY`, localhost `DATABASE_URL`). `lib/secrets.ts` does not reject placeholders in prod.
2. **R2:** `trials_remaining` decrements but never blocks at 0.
3. **R3:** `is_active`/`subscription_expires_at` written by admin but never enforced at runtime.
4. **R1:** guest 3-scan cap is client-side only (`postlap_trials` localStorage).
5. **R4:** `/api/auth/subscribe` self-grants paid access; no rate limit, no payment check.
6. **H6:** bilingual compliance badge hardcoded inconsistently (home.tsx:631 vs 752).
7. **config.json vs DEFAULT_CONFIG drift:** `pro_price` 400 vs 200.
8. **OpenAPI spec stale:** missing `/users/me/gender`, `/auth/subscribe`, `dev/login`, admin routes.
9. **Image generation** disabled locally/on Replit without `GEMINI_API_KEY` or `NANO_BANANA_API_KEY`.
10. **No versioned migrations** (drizzle-kit push only).

## Next recommended task

1. User reviews `docs/LAUNCH_READINESS_AUDIT.md` and picks which §7 items to fix.
2. Commit the pending docs refresh as one clean commit ("Refresh project docs to current MVP state").
3. Implement approved fixes (start with §7.1 production-secrets guard in `lib/secrets.ts`), verifying with `pnpm run typecheck` + `pnpm run build` after each.

## Deployment status

- **Local:** Full stack running (dev values): Postgres 16.14 at `127.0.0.1:5432` (db `postlap`, trust auth, socket `/tmp/opencode`), API at `:5000`, Vite dev at `:8080` (proxies `/api`→`:5000`). Logs in `/tmp/opencode/{api,vite}.log`. Postgres binaries from extracted debs in `/tmp/opencode/pg`; chromium libs in `/tmp/opencode/chromelibs`. These are ephemeral — they will not survive a reboot.
- **GitHub:** origin `github.com/Hamzawi-Ai/Post-Lap-ai.git`, `main` at `eeab99b`. Docs diff uncommitted.
- **Replit:** NOT deployed. `.replit` + artifact tomls + post-merge (`pnpm install --frozen-lockfile` + `db push`) configured. Awaiting fix approval + real secrets before push.

## Required environment variables

Replit (production) — set before deploy:
- `DATABASE_URL` (Replit Postgres)
- `SESSION_SECRET` (`openssl rand -hex 32`)
- `ADMIN_PASSWORD` (`openssl rand -base64 24`)
- `GOOGLE_CLIENT_ID` (Google Cloud Console)
- `OPENAI_API_KEY`
- `GEMINI_API_KEY` (optional; enables `/api/image-gen`, falls back to `NANO_BANANA_API_KEY`)
- `NODE_ENV=production`

Optional: `PORT` (host-provided), `CORS_ORIGINS`, `LOG_LEVEL`, `VITE_API_BASE_URL` (if frontend served cross-origin), `VITE_GOOGLE_CLIENT_ID`.

## Estimated remaining work

- Docs commit: ~10 min.
- §7.1 secrets guard + §7.5 H6 badge: ~1–2 h.
- §7.2/§7.3/§7.4 server-side enforcement (R2/R3/R1/R4): ~3–5 h + tests.
- §7.6–§7.9 (config drift, OpenAPI refresh, www-redirect, doc refresh): ~2–3 h.
- E2E suite fix + run against live stack: ~1–2 h.
- Total to a defensible staging/limited launch on Replit: roughly 1–1.5 focused days, excluding user review time.
