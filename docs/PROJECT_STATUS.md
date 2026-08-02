# PROJECT_STATUS.md

**Project:** PostLapAI — AI ad-compliance checker + Hamzawi assistant (Arabic, Meta/TikTok)
**Last updated:** 2026-08-02
**Branch:** `feature/mvp-launch` (remote: `origin` → `github.com/Hamzawi-Ai/Post-Lap-ai.git`)

---

## Current project state

Pre-launch (MVP). The full product loop is implemented and typechecks/builds, but
**no production secrets are configured** in this environment, so most AI / auth /
image features only run against the dev-only stubs. Frontend homepage redesign was
completed and committed today (2026-08-02). Integration audit done; its fixes are
still uncommitted (see Open issues / NEXT_SESSION).

Local dev environment as of today:
- Postgres 16 on `127.0.0.1:5432` (db `postlapai`, user `postgres`) — running.
- API server on port `5000` (log at `/tmp/api.log`) — running, do not kill.
- No `OPENAI_API_KEY` — dev-only AI stub active in `artifacts/api-server/src/services/ai/client.ts`.

## Completed phases

| Phase | Commit | What shipped |
|---|---|---|
| Task-13 | `f880dc6` | حمزاوي marketing funnel + content management (level 4) |
| Task-14 | `434cc75` | hero inline Hamzawi chat with scroll transition |
| Checkpoint | `7eb99e2` | pre-MVP baseline (`feature/mvp-launch` start) |
| Phase 0 | `2c6d178` | foundation hardening + build fixes |
| Phase 1 | `00edd96` | Guest experience: 3-scan cap + redacted safe/warn/risk results |
| Phase 2 | `26343e8` | Brand Repository + Brand Brain + route refactor + auto-create Company on registration |
| Phase 3 | `e01ed54` | Launch hardening: CORS, rate limiting, 401 handling, admin fixes, TOS/Privacy, quick wins |
| Homepage redesign | `2314303` | AI Post Generation as primary hero, embedded Hamzawi, new section order, floating Hamzawi removed |
| Integration audit | *uncommitted* | `INTEGRATION_REPORT.md`, `.env.example`, `VITE_API_BASE_URL` wiring, dev `/api` proxy |

## Working features

- Guest ad-check flow with 3-scan daily cap (`postlap_trials` localStorage) + redacted results for guests.
- Authenticated full check results (Arabic statuses `ممتاز` / `جيد` / `مرفوض`, violations, suggestions).
- AI text generation (`/api/generate-text`): level 3+ gated, dialect select (غربية / شرقية / جنوبية), image+description mode at level 4+.
- Embedded Hamzawi assistant chat in hero (`HamzawiChat embedded` prop, always-open inline).
- Brand memory upsert / onboarding (`/api/hamzawi/memory`, partial-save markers).
- Auto company creation on Google registration.
- Admin panel (`/api/admin/*`): user list, upgrade, activate, set-plan-by-email, unlimited, reset-limits, delete.
- Google OAuth login/registration (code-level; needs `GOOGLE_CLIENT_ID` to function).
- `pnpm run typecheck` + `pnpm run build` pass across all workspaces.
- Dev-only: `/api/dev/login` bypass (404 in production) and dev OpenAI stub (only when `NODE_ENV !== "production"` and no `OPENAI_API_KEY`).

## Broken features

- **Video analysis** — requires `ffmpeg` on the API host; not installed, silently degrades to empty result.
- **AI image generation** (`/api/image-gen`) — disabled (503) without `GEMINI_API_KEY` / `NANO_BANANA_API_KEY`.
- **Google login** — disabled without `GOOGLE_CLIENT_ID` (backend + frontend build).
- **Real AI analysis / text-gen / chat** — fail at request time without `OPENAI_API_KEY`.
- **Production startup** — throws without `DATABASE_URL` (server won't even start), `SESSION_SECRET`, `ADMIN_PASSWORD`.
- CORS in production only allows `postlapai.com` / `www.postlapai.com`; any other origin is rejected.

## Current priorities

1. Commit the uncommitted integration/verification changes (dev login, AI stub, `main.tsx` wiring, vite proxy, admin confirmations, `.env.example`, `INTEGRATION_REPORT.md`).
2. Configure production secrets (`DATABASE_URL`, `OPENAI_API_KEY`, `GOOGLE_CLIENT_ID`, `SESSION_SECRET`, `ADMIN_PASSWORD`, `PORT`).
3. Run `pnpm --filter @workspace/db run push` against the production database (schema: users, checks, hamzawi_messages, user_brand_memory, business_profiles, companies).
4. Ensure `/api/*` reaches the API server in production (reverse proxy or `VITE_API_BASE_URL`).
5. Install `ffmpeg` on the API host for video ad checks.
6. Apply remaining Phase 4 audit high-priority UX fixes (see OPEN issues).

## Open issues

From `artifacts/PHASE4_AUDIT_REPORT.md` (2026-07-25, launch readiness 8.5/10):

- **H1** Countdown state (`startCountdown()`) never rendered in hero JSX — users see only a spinner.
- **H2** Trial-block modal offers no direct Google sign-in path.
- **H4** Brand memory save button has no loading/disabled state (duplicate saves possible).
- **H5** Upgrade nudge in Hamzawi chat shown unconditionally to all plan levels (should be `level < 4`).
- **H6** Compliance badge "متوافق مع سياسات Meta ✓" is hardcoded regardless of API response.
- **M1** Hidden leftover div with testid in pricing section.
- **M4** Google OAuth — no visible retry on failure.
- **M5** No proactive token-expiry check on page load.
- **L1–L3** Cookie banner lacks reject option + privacy link; TOS lacks AI automated-decision clause.

*Fixed since audit (uncommitted):* M2 (admin delete confirm), M3 (secret-admin unlimited/reset confirms).

From `INTEGRATION_REPORT.md` (2026-08-02): every required secret is unset; migration is `drizzle-kit push` only (no versioned migrations — recommend `drizzle-kit generate` for prod); OpenAPI spec missing several admin routes.
