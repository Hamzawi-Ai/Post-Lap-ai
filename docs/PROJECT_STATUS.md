# PROJECT_STATUS.md

**Project:** PostLapAI — AI ad-compliance checker + Hamzawi assistant (Arabic, Meta/TikTok)
**Last updated:** 2026-08-03
**Branch:** `main` @ `eeab99b` (remote: `origin` → `github.com/Hamzawi-Ai/Post-Lap-ai.git`)

---

## Current project state

Pre-launch (MVP). The full product loop is implemented, typechecks, and builds cleanly
(`pnpm run typecheck` + `pnpm run build` → exit 0). A **complete Launch Readiness Audit**
was finished on 2026-08-03 — see `docs/LAUNCH_READINESS_AUDIT.md`. **No fixes have been
applied**; the fix list in §7 of that report is awaiting user review before deployment.

Replit deployment is configured (`.replit`, artifact tomls for API :5000 / web :8080 /
mockup :8081, `db push` in post-merge, `replit.md` runbook), but **production secrets are
not configured**, so live AI / auth / image features only run against dev stubs locally.

Local dev environment as of today:
- Postgres **down** (`ECONNREFUSED 127.0.0.1:5432`) — `.env` points at `postlap` db but no server is listening. Schema is pushed to Replit Postgres (commit `4557c48`), unreachable from here.
- API server not running locally.
- No `OPENAI_API_KEY` / `GEMINI_API_KEY` — dev-only stubs active (`artifacts/api-server/src/services/ai/client.ts`).
- `.env` is dev-only: `NODE_ENV=development`, `SESSION_SECRET=dev-secret`, `ADMIN_PASSWORD=admin123`, `GOOGLE_CLIENT_ID=dev-client-id`. Not git-tracked.

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
| Integration audit | `a27777a` | `INTEGRATION_REPORT.md`, `.env.example`, `VITE_API_BASE_URL` wiring, dev `/api` proxy, admin confirmations (M2/M3) |
| Replit Postgres | `4557c48` | Replit PostgreSQL service + drizzle schema push in post-merge |
| Gemini image model | `e21574b` | image-gen on `gemini-2.5-flash-image` via GoogleGenAI |
| In-app Professional plan | `241945f` | pricing/content gates, `/auth/subscribe`, onboarding for new users |
| Brand identity page | `eeab99b` | `/brand` page, smart welcome, Hamzawi profile-permission notes, brand completion score |

## Working features

- Guest ad-check flow with 3-scan daily cap (`postlap_trials` localStorage) + redacted results for guests.
- Authenticated full check results (Arabic statuses `ممتاز` / `جيد` / `مرفوض`, violations, suggestions).
- AI text generation (`/api/generate-text`): level 3+ gated, dialect select (غربية / شرقية / جنوبية), image+description mode at level 4+.
- Embedded Hamzawi assistant chat in hero (`HamzawiChat embedded` prop, always-open inline).
- Brand memory upsert / onboarding (`/api/hamzawi/memory`, partial-save markers, consent-gated), brand completion score.
- Auto company creation on Google registration.
- Admin panel (`/api/admin/*`): user list, upgrade, activate, set-plan-by-email, unlimited, reset-limits, delete.
- In-app plans: visitor / registered / professional / smart_fix / content / agency; `planLevel` 1–5; `/auth/subscribe` self-upgrade (Professional — 800 د.ل/شهر).
- Google OAuth login/registration (code-level; needs `GOOGLE_CLIENT_ID` to function).
- `pnpm run typecheck` + `pnpm run build` pass across all workspaces.
- Dev-only: `/api/dev/login` bypass (404 in production) and dev OpenAI stub (only when `NODE_ENV !== "production"` and no `OPENAI_API_KEY`).

## Broken / gated features

- **Video analysis** — requires `ffmpeg` on the API host; not installed, silently degrades to empty result.
- **AI image generation** (`/api/image-gen`) — disabled (503) without `GEMINI_API_KEY` / `NANO_BANANA_API_KEY`.
- **Google login** — disabled without `GOOGLE_CLIENT_ID` (backend + frontend build).
- **Real AI analysis / text-gen / chat** — fail at request time without `OPENAI_API_KEY`.
- **Production startup** — throws without `DATABASE_URL` (server won't even start), `SESSION_SECRET`, `ADMIN_PASSWORD`. Does **not** reject dev placeholder values.
- CORS in production only allows `postlapai.com` / `www.postlapai.com` / same-origin; the Replit `*.replit.app` host is only covered by same-origin, not by the www→apex redirect.

## Current priorities

Per `docs/LAUNCH_READINESS_AUDIT.md` §7 — awaiting user decision, none applied yet:

1. **Configure production secrets** on Replit (`DATABASE_URL`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `SESSION_SECRET`, `ADMIN_PASSWORD`); reject dev placeholder secrets in prod.
2. **Server-side enforcement**: gate on `is_active` / `subscription_expires_at`; block registered users when `trials_remaining` hits 0; add server-side visitor cap.
3. **Rate-limit `/api/auth/subscribe`**.
4. Fix bilingual compliance badge (H6).
5. Fix `config.json` vs `DEFAULT_CONFIG` pro_price drift (400 vs 200).
6. Refresh OpenAPI spec for `/users/me/gender`, `/auth/subscribe`, `dev/login`, admin routes.
7. Decide www-redirect handling for Replit interim host.
8. Optional: versioned migrations, TOS automated-decision clause, cookie-banner privacy link.

## Open issues

See `docs/LAUNCH_READINESS_AUDIT.md` for the full, current audit (2026-08-03). Key status vs
the old `artifacts/PHASE4_AUDIT_REPORT.md`:

- **Fixed:** H1 (countdown rendered), H2 (Google sign-in in trial modal), H4 (brand-save states), H5 (level-aware upsell), M1 (hidden testid div), M2, M3, M5 (token-expiry check).
- **Not fixed:** H6 (compliance badge hardcoded), L1 (cookie banner accept-only), L2 (TOS automated-decision clause), L3 (privacy link in banner).

New findings in the launch audit (none fixed yet): R1 guest cap client-only; R2 `trials_remaining`
decrements but never gates; R3 `is_active`/`subscription_expires_at` never enforced; R4
`/auth/subscribe` unauthenticated-rate-limited; R5 potential guest reason leak in message text.
