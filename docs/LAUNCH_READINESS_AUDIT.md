# Launch Readiness Audit — PostLapAI MVP

Date: 2026-08-03
Branch: `main` @ `eeab99b`
Supersedes: `artifacts/PHASE4_AUDIT_REPORT.md`, `INTEGRATION_REPORT.md`
Status: **AUDIT COMPLETE — NO FIXES APPLIED** (fix decisions pending user review)

This audit verifies the MVP for deployment to Replit. It re-verifies all Phase-4 findings
against the current code, audits the new in-app Professional plan and brand-identity work,
and assesses production-readiness. No code was changed.

---

## 1. Verified baseline

| Check | Result |
| --- | --- |
| Git state | `main` @ `eeab99b`, clean tree, `feature/mvp-launch` merged |
| TypeScript | `pnpm run typecheck` → exit 0 |
| Production build | `pnpm run build` → exit 0 (API bundle `dist/index.mjs` 3.8 MB; only a harmless sourcemap warning for `ui/tooltip.tsx`) |
| Vite bundle | 461 KB JS / 117 KB CSS |
| DB | **DOWN locally** (`ECONNREFUSED 127.0.0.1:5432`); schema pushed to Replit Postgres via commit `4557c48` but unreachable from this local env |
| API server | Not running locally (no listener on 5000) |
| E2E | Suite exists but **not runnable locally** (needs API + DB); Playwright chromium-1223 installed |

### Environment (`.env`, not git-tracked — dev values only)
- `NODE_ENV=development`, `SESSION_SECRET=dev-secret`, `ADMIN_PASSWORD=admin123`
- `GOOGLE_CLIENT_ID=dev-client-id`, `OPENAI_API_KEY=` (empty)
- `DATABASE_URL=postgres://postgres@127.0.0.1:5432/postlap`

> **GO-LIVE BLOCKER**: `.env` is entirely dev values. Before deploying, Replit env must set real
> `DATABASE_URL` (Replit Postgres), `SESSION_SECRET`, `ADMIN_PASSWORD`, `GOOGLE_CLIENT_ID`,
> `OPENAI_API_KEY`. `lib/secrets.ts` throws in production when `SESSION_SECRET`/`ADMIN_PASSWORD`
> are missing, but it does **not** reject the dev placeholder values (`dev-secret`/`admin123`) —
> a prod deploy copying this `.env` would silently accept weak secrets.

---

## 2. Phase-4 findings re-verified

| # | Finding | Status now |
| --- | --- | --- |
| H1 | Countdown state defined (8s) but never rendered | **FIXED** — `{countdown !== null && <span>{countdown}s</span>}` at home.tsx:839 |
| H2 | Trial-block modal lacked Google sign-in | **FIXED** — Google button ref renders in both login modal and trial modal (home.tsx:783, 1181) |
| H4 | Brand-save had no saving/disabled state | **FIXED** — saving + disabled states in HamzawiChat `saveBrandMemory` and `BrandSetupForm` |
| H5 | Upgrade nudge not level-aware | **FIXED** — `getFunnelInstruction(level)` (hamzawi.ts:110): 1→register, 2→smart_fix, 3→content, 4+→none; WhatsApp upsell gated `level < 4` |
| H3 / M2 | Admin destructive actions need confirm | **FIXED** — `window.confirm` on delete/activate in admin + secret-admin |
| M5 | Proactive token-expiry check on load | **FIXED** — home refreshes `/users/me` on mount and logs out on 401 |
| M1 | Leftover hidden testid div | **FIXED** — remaining `hidden` usages are legit responsive classes / file inputs |
| H6 | Compliance badge hardcoded | **NOT FIXED** — "متوافق مع سياسات Meta ✓" still hardcoded at home.tsx:631,752 (visually inconsistent across languages; line 752 has AR/EN switch, 631 does not) |
| L1 | Cookie banner accept-only, no reject | **NOT FIXED** — accept-only (design decision, acceptable for MVP) |
| L2 | TOS lacked automated-decision / refund clauses | **NOT FIXED** (see §6) |
| L3 | Cookie banner missing privacy link | **NOT FIXED** (minor) |

---

## 3. New-feature audit (since Phase-4)

### In-app Professional plan — commit `241945f`
- `POST /api/auth/subscribe` upgrades any **logged-in user** to `content` plan, sets
  `trials_remaining: 9999`, `is_active: true`, label "Professional — 800 د.ل/شهر".
- **Revenue/abuse risk**: payment is out-of-band (bank transfer); nothing verifies payment, and
  the route self-grants full level-4+ access. Mitigated by: requires login, rate limit? — **none on
  this route**. Anyone who creates an account gets paid-level access for free.
- Frontend pricing cards: Smart Fix 400 د.ل, Content 800 د.ل, Agency 1000 د.ل.
- `config.json` `pro_price` is **"400 د.ل"** but `DEFAULT_CONFIG` fallback still says **"200 د.ل"**
  (drift — fix or remove fallback).

### Brand identity page + smart welcome + Hamzawi profile perms — commit `eeab99b`
- `/api/hamzawi/onboard`, brand completion score, `applyPartialBrandSave` restricted to
  `hamzawi_notes`/`marketing_notes` markers; consent-gated. Good.
- `planLevel`: visitor=1, registered=2, professional/smart_fix=3, content=4, agency=5. Coherent.

### Geminii image model — commit `e21574b`
- `gemini-2.5-flash-image` via `GoogleGenAI`; requires `GEMINI_API_KEY` at runtime. `.env.example`
  documents it. **GEMINI_API_KEY is not set locally.**

### Replit Postgres — commit `4557c48`
- Postgres service + `db push` in post-merge. No versioned migrations (drizzle-kit push only) —
  acceptable for MVP, flag for scale.

---

## 4. Runtime enforcement gaps (server-side)

| # | Gap | Impact |
| --- | --- | --- |
| R1 | **Visitor trial cap is client-side only** — server never blocks guests; `MAX_VISITOR_TRIALS=3` enforced in localStorage (`postlap_trials`). | Bypassable by clearing localStorage / direct API. Server does not even track guest counts. |
| R2 | **`trials_remaining` decrements but never gates** — check route decrements via `GREATEST(-1,0)` but **does not block when it reaches 0** for registered users. | Registered users can check unlimited times server-side. |
| R3 | **`is_active` / `subscription_expires_at` never enforced at runtime** — only written by admin routes; check/chat/subscribe do not read them. | Deactivated/expired accounts keep working. `subscription_expires_at` set by admin but never checked. |
| R4 | **`/api/auth/subscribe` unauthenticated-rate-limited** — self-grants paid plan; no rate limit. | Abuse risk (see §3). |
| R5 | **Guest `reason` is blanked** but `messageMap` builds `reason` server-side from violations and could leak violation text into the message field for guests (message text may expose the reason). | Minor info leak — verify guest response path. |

---

## 5. Security / ops verified (good)

- JWT auth (`getUserFromToken`), admin via `role === "admin"` JWT claim.
- Rate limits: admin login 5/min, chat 30/min, check 10/min.
- Upload limits: check 50 MB (png/jpg/mp4), hamzawi asset 10 MB (png/jpeg/webp).
- CORS: same-origin host check + allowlist `[postlapai.com, www.postlapai.com]` + `CORS_ORIGINS`.
- www→apex 301 for `www.postlapai.com` only — **does not cover the Replit `*.replit.app` host**
  (apps will run on Replit domain until custom domain is added).
- `devStubOpenAI()` active only when `NODE_ENV !== "production"` && no `OPENAI_API_KEY`.
- Guest results redacted server-side (empty violations/suggestions, blank reason).
- 401 → `clearAuth`/redirect handled in `lib/utils.ts`.
- Cookie banner (`data-testid=banner-cookie`) + compliance badge present.
- No secrets in git; `.env` untracked.

---

## 6. Documentation / spec drift

- **OpenAPI spec (`lib/api-spec/openapi.yaml`, 767 lines, 15 paths) is out of date** — missing:
  `/users/me/gender`, `/auth/subscribe`, `dev/login`, admin `delete`/batch/stats-by-email.
- `docs/*`, `INTEGRATION_REPORT.md`, `artifacts/PHASE4_AUDIT_REPORT.md` predate commits
  `4557c48`, `ce99ed3`, `e21574b`, `241945f`, `eeab99b` — stale.
- TOS: last updated يوليو 2026; has subscription/refund/liability sections but **no explicit
  automated-decision-making clause** (Art. 22 GDPR-adjacent) — low priority for MVP.

---

## 7. Prioritized fix list (for user review — NOT applied)

### Must-fix before go-live
1. **Env/secrets**: set real Replit env vars; reject dev placeholder secrets in prod.
2. **R2/R3**: enforce `is_active`/`subscription_expires_at` and a server-side trial gate in the
   check route (registered users past quota → 402/403 with upsell).
3. **R1**: add a server-side visitor cap (e.g. signed guest counter or IP-based limit) or accept
   client-only cap as a documented MVP tradeoff.
4. **R4**: add rate limit to `/api/auth/subscribe`.
5. **H6**: fix bilingual compliance badge (unify AR/EN at line 631).

### Should-fix
6. **config.json vs DEFAULT_CONFIG drift** (400 vs 200 pro_price).
7. **OpenAPI spec** regenerate/add new endpoints.
8. **www-redirect** for Replit host during interim domain.
9. **Update docs** to current state (§6).

### Nice-to-have
10. Versioned DB migrations.
11. TOS automated-decision clause.
12. Cookie-banner privacy link.
13. Verify R5 guest message leak.

---

## 8. Verdict

Codebase is coherent, typechecks, builds clean, Phase-4 items are substantially resolved, and the
new features are well-structured. **Not ready for paid go-live** until: real env secrets (§7.1),
server-side plan/trial enforcement (§7.2–7.4), and doc/spec refresh (§7.6–7.9). Ready for a
**staging/limited launch** on Replit immediately after §7.1.
