# Phase 4 Report — Security Stabilization

Date: 2026-08-08
Scope: **Stabilize the existing authentication — no redesign.** No database,
API, service, internal class, route, URL, endpoint, or file names were changed;
no redirects, file moves, or refactors. The token-based auth design is
preserved; only security defects in it were fixed.

## Current architecture (unchanged)

- **Authenticated users:** stateless JWT (HS256, `SESSION_SECRET`, 7-day expiry)
  stored in `localStorage`, sent as `Authorization: Bearer <token>`. Verified by
  `getUserFromToken()` (`artifacts/api-server/src/middleware/auth.ts`).
- **Guests:** a signed `hamzawi_session` cookie (HMAC over `SESSION_SECRET`)
  carries an `anon_*` session id so guest chat history is scoped and persists
  across requests. HttpOnly, SameSite=Lax.
- **Admin:** separate `role: "admin"` JWT protected by `ADMIN_PASSWORD`.

## Findings & fixes

### 1. CRITICAL — stale cookie leaked authenticated data into guest sessions
**Finding:** the chat route signed a `user_<id>` value into `hamzawi_session`
for every authenticated request. Logout was client-side only (`localStorage`),
so the HttpOnly cookie persisted after logout. A subsequent *guest* request
still carried `hamzawi_session=user_<id>.<sig>`; `getVerifiedSessionId()`
accepted it, so the guest's chat was scoped to `user_<id>` — exposing the
previous user's messages. On a shared browser this was a **cross-user data
leak**.

**Fixes (`routes/hamzawi.ts`):**
- `getVerifiedSessionId()` now accepts **only `anon_*` sessions** — any
  `user_*` value is rejected, so a stale cookie can never scope a guest to an
  authenticated user's data (defense-in-depth even if a legacy cookie exists).
- Authenticated requests no longer set the cookie and now **delete** any stale
  `hamzawi_session` cookie (`clearSessionCookie()`). The JWT is the sole
  credential — a clean token-based flow.
- Guest sessions keep the signed `anon_*` cookie (required for history
  continuity); it now also carries the `Secure` flag in production.

### 2. Logout / session cleanup
**Finding:** there was no server-side logout; the guest cookie could outlive the
session.

**Fixes:**
- Added `POST /api/auth/logout` (`routes/auth.ts`) — clears the
  `hamzawi_session` cookie. Idempotent, token-optional.
- Frontend `logout()` (`pages/home.tsx`) and `clearAuth()` (`lib/utils.ts`,
  used on 401 in company/brand/onboarding) now fire-and-forget this endpoint,
  so every auth-teardown path clears the cookie.

### 3. Deactivated accounts kept session access
**Finding:** `getUserFromToken()` returned users regardless of `is_active`.
Admin-deactivated accounts could keep using chat/check/upload endpoints until
token expiry. `is_active` was only honored by the image-gen tool gate.

**Fixes:**
- `getUserFromToken()` now returns `null` when `!user.is_active` — the token is
  treated as invalid everywhere the shared middleware is used.
- `GET /api/users/me` returns `401` for inactive users, so the frontend
  auto-logs them out (existing 401 handling).

### 4. Minor — `/api/stats` was anonymously readable
**Finding:** aggregate usage stats (checks/users counts) were served without any
auth, although the only consumer is the admin panel (which already sends the
admin token).

**Fix:** `/api/stats` is now behind `requireAdmin` (`routes/admin.ts`).

## Verification matrix

| Item | Result |
| --- | --- |
| Login | JWT issued by `/auth/google`, `/dev/login`; `GET /users/me` validates it; deactivated accounts rejected with 401. No auth cookie set — token-only |
| Logout | Client clears `postlap_token`/`postlap_user` and calls `/auth/logout`, which clears the guest cookie |
| Session cleanup | Authenticated requests delete stale cookies; guests get a fresh signed `anon_*` session; logout clears it; 30-day expiry + `Secure` (prod) |
| Upload isolation | Uploads keyed by `company_id` folder under `storage/companies/{id}/`; opaque random filenames; MIME-allowlist extension derivation; path-traversal containment checks on save/read/delete |
| User isolation | Chat messages/conversations/brand memory/media assets are all queried by `user_id`/ownership; conversation ownership enforced server-side; guest history scoped to signed `anon_*` session id only |
| No cross-user data leakage | Stale `user_*` cookies rejected for guests (fix 1); deactivated users blocked (fix 3); admin-only stats (fix 4); brand-identity write guard on `/hamzawi/memory`; IDOR guards on conversation messages |

## Known limitations (not changed — by design / would be a redesign)

- **JWT in `localStorage`** — XSS-sensitive by nature. Mitigations in place:
  uploaded files are served with `Content-Security-Policy: default-src 'none'`
  and `X-Content-Type-Options: nosniff`; cookies used by the app are HttpOnly.
  Moving tokens to cookies would be an auth redesign and is out of scope.
- **No server-side JWT revocation** — tokens are stateless with 7-day expiry;
  revocation is approximated by the `is_active` check (fix 3).
- **`/uploads/*` is publicly served** (opaque random filenames) because the
  public URL is used directly in `<img>` tags; folder-per-company isolation is
  retained. Adding signed URLs would be a redesign.

## Verification

- `pnpm typecheck` — passed (api-server and postlap-ai)
- `pnpm build` — passed (api-server and postlap-ai)
- `git diff` reviewed: 6 files changed, 61 insertions, 13 deletions
