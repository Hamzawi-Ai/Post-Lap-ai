# Final Audit — External Senior Software Architect Review

Date: 2026-08-08
Mode: Read-only. No code was modified. This report is the Phase 6 deliverable.

## Launch Readiness Score

# **6.5 / 10 — "Conditionally ready"**

The product loop works end-to-end (AI chat, vision attachments, ad-check, image
generation, auth, conversations, branding) and the workspace typechecks and
builds cleanly. It is **not safe to launch publicly** until the 3 Critical
items are resolved, because two of them are active abuse/revenue vectors
reachable by anonymous users and one is a single misconfiguration away from
disabling every security control.

| Area | Score |
|---|---|
| Architecture | 7.5 |
| AI | 7.5 |
| Vision | 7 |
| Image generation | 7 |
| Upload pipeline | 5.5 |
| Security | 5.5 |
| UX | 6.5 |
| Performance | 6 |
| Database | 6 |
| Authentication | 6.5 |
| Branding | 7 |
| Conversations | 7 |
| Memory | 6.5 |
| Maintainability | 6 |
| **Overall** | **6.5** |

---

# CRITICAL

## C1 — No production guardrail: one misconfigured flag disables every security control

- **Description:** Five independent security behaviors are keyed to the single
  string `NODE_ENV === "production"`. The Replit deployment (`.replit`) does not
  set `NODE_ENV`, and there is no startup assertion that enforces it. If the
  deployed server runs with `NODE_ENV` unset or unset-to-anything-else:
  - `POST /api/dev/login` (auth.ts:112-115) stops returning 404 and creates an
    **agency-plan** user with `trials_remaining: 99999` plus a valid 7-day JWT →
    anonymous account creation / privilege escalation.
  - CORS allows **every origin** (app.ts:62) — no allowlist.
  - `SESSION_SECRET` falls back to the public value `dev-secret`
    (secrets.ts:18) → anyone can forge a JWT for any `userId` and the
    `role:"admin"` claim (auth.ts:98, admin.ts:69).
  - `ADMIN_PASSWORD` falls back to the public `admin123` (secrets.ts:19).
  - The guest session cookie is sent without `Secure` (hamzawi.ts:120).
  - OpenAI/Gemini are replaced by dev stubs returning fake answers
    (client.ts:74-75, provider.ts:44-46).
- **Root cause:** Environment-flag sprawl + secrets.ts (5-16) only rejects
  *missing* variables in production, never *placeholder* values, and nothing
  asserts `NODE_ENV=production` in the deployment.
- **Affected files:** `.replit`; `src/app.ts:62`; `src/routes/auth.ts:112`;
  `src/routes/hamzawi.ts:120`; `src/lib/secrets.ts:5-19`;
  `src/services/ai/client.ts:74`; `src/services/image-gen/provider.ts:44`.
- **Recommended fix:** (1) Set `NODE_ENV=production` in the Replit deployment
  env. (2) Make `resolveSecret` throw on placeholder values (`dev-secret`,
  `admin123`) in production. (3) Add a startup assertion in `index.ts` that
  `NODE_ENV === "production"` and that `SESSION_SECRET`/`ADMIN_PASSWORD` are
  non-placeholder. (4) Best-effort: mount `/dev/login` only when
  `NODE_ENV !== "production"` *and* an explicit `DEV_LOGIN=1` flag is set.
- **Estimated effort:** Small (½–1 day).

## C2 — Unbounded base64 attachment ingest, storage, and vision-model spend (anonymous abuse vector)

- **Description:** `resolveAttachment` (hamzawi.ts:461-464) accepts any
  `data:image/…;base64,…` string within the 20 MB JSON body limit (app.ts:78).
  The raw base64 is persisted **verbatim** inside `hamzawi_messages.content`
  via `buildAttachmentMarker` (hamzawi.ts:469-474, stored at 870-911), and is
  re-decoded and re-sent to the **gpt-4o** vision model on *every* subsequent
  turn of the conversation (`buildHistoryForAI`, hamzawi.ts:494-513, 517-524).
  This is reachable by **anonymous guests** (no auth required to POST
  `/hamzawi/chat`), at 30 msg/min (hamzawi.ts:42-48). A single guest can:
  (a) bloat the `hamzawi_messages` table by ~15 MB/min (messages are never
  pruned — see H1), and (b) burn unbounded gpt-4o vision tokens. There is no
  image count, per-message size, or per-conversation image cap, and no
  deduplication of repeatedly re-sent images.
- **Root cause:** No server-side size/count validation on attachment data
  beyond the coarse 20 MB body cap; images stored as inline base64 in a text
  column; images re-expanded from storage on every turn without a budget.
- **Affected files:** `src/routes/hamzawi.ts:434,453-474,494-524,870-911`;
  `src/app.ts:78`; `artifacts/postlap-ai/src/components/HamzawiChat.tsx:441-443`.
- **Recommended fix:** (1) Enforce a per-attachment size cap (e.g. 4 MB) and a
  per-turn image count in `resolveAttachment`. (2) On the frontend, always
  upload via `/upload-asset` and pass the URL form instead of raw `dataUrl`
  (URL markers stay small). (3) Store only the upload URL marker; reject inline
  base64 for authenticated users. (4) Cap the number of image-bearing history
  rows re-sent to the model (e.g. most recent 3) and dedupe identical markers.
  (5) Require an authenticated session for chat attachment turns.
- **Estimated effort:** Medium (1–2 days).

## C3 — Monetization/entitlement is not enforced server-side (free paid plan, free checks)

- **Description:** Three separate bypasses make the billing model ineffective:
  1. `POST /api/auth/subscribe` (auth.ts:232-263) upgrades **any authenticated
     user** to the paid `content` plan (`trials_remaining: 9999`, `is_active:
     true`) with no payment verification — the comment states payment is
     settled "out-of-band" but access is granted immediately.
  2. The guest 3-scan trial cap lives only in **localStorage**
     (home.tsx:12-14, 34-41) — clearing storage restores it; the server never
     tracks or blocks guests (`/api/check` accepts guests, ads.ts:165).
  3. `trials_remaining` is decremented but **never gates**: `GREATEST(trials_remaining - 1, 0)` (ads.ts:235-238) lets registered users on `visitor`/`registered`
     plans check ads an unlimited number of times.
- **Root cause:** Trial/entitlement modeled as a client-side counter plus a
  trust-the-user subscribe endpoint; no server-side entitlement authority.
- **Affected files:** `src/routes/auth.ts:232-263`;
  `src/routes/ads.ts:154-241`; `artifacts/postlap-ai/src/pages/home.tsx:12-41,358-363`.
- **Recommended fix:** (1) Move the guest cap server-side (count guest checks by
  session id/IP; return 403 when exhausted). (2) Enforce `trials_remaining > 0`
  before running `/api/check` for visitor/registered plans (return a clear
  upsell). (3) Gate `/api/auth/subscribe` behind an admin-confirmed payment
  flag or a real payment webhook; at minimum require a nonce generated by the
  admin flow. (4) Add rate limiting to subscribe.
- **Estimated effort:** Medium (1–2 days; payment integration may extend).

---

# HIGH

## H1 — Database indexes, unbounded growth, and archive-only deletion

- **Description:** Only two indexes exist in the entire schema (unique on
  `users.email`, unique on `user_brand_memory.user_id`). There is **no index**
  on `hamzawi_conversations.user_id` / `archived_at` / `last_message_at`,
  `hamzawi_messages.user_id` / `session_id` / `conversation_id` / `created_at`,
  `media_assets.user_id` / `company_id` / `category`, or `checks.user_id`. The
  conversation list endpoint (hamzawi.ts:949-963) is **unpaged** (`SELECT`
  without `.limit()`) and sorts on unindexed columns → seq scan + in-memory sort
  per request. `DELETE /conversations/:id` only sets `archived_at`
  (hamzawi.ts:1057-1066) — rows and messages are never removed; there is no
  retention/TTL job. Guest messages (`user_id` NULL) and guest `checks` rows
  persist forever. All of this grows unboundedly and slows down as it grows.
- **Root cause:** Schema designed for correctness, not query access paths;
  soft-delete chosen without a lifecycle job; no pagination on list endpoints.
- **Affected files:** `lib/db/src/schema/*.ts`; `src/routes/hamzawi.ts:949-963,1043-1078`;
  `src/routes/ads.ts:219-227`; `src/routes/admin.ts:280-293`.
- **Recommended fix:** Add indexes on the hot FK/order columns (conversations
  `(user_id, archived_at, last_message_at)`, messages `(conversation_id,
  created_at)`, media_assets `(user_id, category)`). Add `.limit()`/cursor
  pagination to the conversations list. Add a retention job (or DB-level
  `ON DELETE` + periodic sweep) for archived conversations and guest data
  older than 30 days.
- **Estimated effort:** Medium (1–2 days).

## H2 — Vision/context cost: assets and images are re-read and re-encoded every turn

- **Description:** `collectBrandAssets` (contextBuilder.ts:101-103) reads up to
  `asset_cap` (default 6) image files from disk and base64-encodes them on
  **every authenticated turn**, including plain text turns where the images are
  never sent to the model (brand images are only attached when `intentVision`,
  hamzawi.ts:742, 756-763). Separately, `buildHistoryForAI` re-reads each
  URL-form image marker from disk and re-encodes it on every turn
  (hamzawi.ts:494-513). `memory_window` (default 10) limits message **rows**,
  not tokens — a conversation dense with images multiplies per-turn vision
  tokens. `getConfig()` performs a synchronous `readFileSync` (config.ts:100-111)
  and is called twice per turn (contextBuilder.ts:133, hamzawi.ts:292).
- **Root cause:** No caching/contextualization of asset bytes; per-turn
  filesystem I/O and base64 work; context budgeted in rows rather than tokens.
- **Affected files:** `src/services/ai/contextBuilder.ts:101-103`;
  `src/routes/hamzawi.ts:482-527`; `src/services/media/assetReader.ts:44-60`;
  `src/lib/config.ts:100-111`.
- **Recommended fix:** (1) Resolve brand assets only when the turn actually
  needs vision (defer `collectBrandAssets` until `needsVision`). (2) Cache
  resolved asset base64 (in-memory, keyed by file mtime) and/or send image
  URLs via a signed `/uploads` proxy instead of re-encoding. (3) Cap the number
  of image-bearing history rows forwarded to the model. (4) Cache `getConfig()`
  (60 s TTL like `getAgentConfig`).
- **Estimated effort:** Medium (1–2 days).

## H3 — Rate limits are IP-keyed and bypassable; several auth endpoints have none

- **Description:** `app.set("trust proxy", true)` (app.ts:10) combined with
  `express-rate-limit` default keying means a client can rotate
  `X-Forwarded-For` to bypass **all** IP rate limits (chat 30/min, upload
  10/min, check 10/min, admin login 5/min) unless the fronting proxy strips
  that header. There is **no rate limit** on `POST /auth/google` (repeated DB
  upserts + token issuance), `/auth/subscribe`, `/users/me`,
  `/hamzawi/conversations`, or `/hamzawi/memory`.
- **Root cause:** `trust proxy` set to boolean true (trusts every hop) +
  limiter keyed on IP only; limits not applied to auth surface.
- **Affected files:** `src/app.ts:10`; `src/routes/auth.ts:39,232`;
  `src/routes/hamzawi.ts:42-58`.
- **Recommended fix:** Restrict `trust proxy` to a specific number of hops or
  the known proxy IP; key rate limits on a composite (IP + user id / session);
  add limiters to the auth endpoints.
- **Estimated effort:** Small (½–1 day).

## H4 — JWT hardening: no algorithm pinning, role-only admin token, no revocation

- **Description:** `jwt.verify(token, SESSION_SECRET)` (middleware/auth.ts:10,
  auth.ts:174/212, admin.ts:28) does not pin `algorithms: ["HS256"]`. The admin
  token carries only `{ role: "admin" }` (admin.ts:69) — no user binding, so a
  leaked admin token cannot be attributed and there is no per-user revocation;
  expiry is 1 day with no denylist/jti. The admin password is compared in
  plaintext against a static shared secret (admin.ts:65). One secret
  (`SESSION_SECRET`) signs user JWTs, admin JWTs, and the guest-cookie HMAC
  (hamzawi.ts:79) — compromise of one forges all three. No token revocation
  exists for users either (only `is_active` is checked).
- **Root cause:** Symmetric-secret design with no key hierarchy, no algorithm
  pinning, no token lifecycle management.
- **Affected files:** `src/middleware/auth.ts:10`; `src/routes/auth.ts:98-100,174,212`;
  `src/routes/admin.ts:28-37,65-70`; `src/lib/secrets.ts:18`.
- **Recommended fix:** Pin `algorithms: ["HS256"]` on all `jwt.verify` calls.
  Add a `jti`/`sub` claim and an in-memory or DB denylist on logout; use a
  separate secret (or asymmetric signing) for admin tokens; store a hash of
  the admin password rather than plaintext comparison.
- **Estimated effort:** Medium (1 day).

## H5 — Frontend has no error boundary and re-renders the whole chat on every keystroke

- **Description:** There is no React error boundary anywhere (no
  `componentDidCatch`/`getDerivedStateFromError`). A render crash (e.g. `null`
  deref on loosely-typed API data: home.tsx:129, HamzawiChat.tsx:249-252,
  admin.tsx:118) unmounts the entire tree → blank white screen with no recovery.
  The chat body re-renders every bubble on each keystroke because no bubble uses
  `React.memo`, `renderCtx` is a fresh object per render (HamzawiChat.tsx:709-721),
  and messages use `key={i}` (HamzawiChat.tsx:765) on an unbounded, unvirtualized
  list. Combined with JWT in localStorage (utils.ts:8-9) and **no CSP on the
  main app** (CSP exists only on `/uploads`, app.ts:88), an XSS anywhere
  exfiltrates the bearer token.
- **Root cause:** No error boundary pattern; chat state updates (input) drive a
  full subtree re-render; token in storage with no CSP defense-in-depth.
- **Affected files:** `artifacts/postlap-ai/src/App.tsx`;
  `src/components/HamzawiChat.tsx:125-126,709-721,761-780`;
  `src/lib/utils.ts:8-9`; `src/app.ts:86-90`.
- **Recommended fix:** Add an error boundary wrapper with a styled fallback;
  wrap chat bubbles in `React.memo`, memoize `renderCtx`, use stable
  conversation-message keys, and add virtualization or message caps for very
  long threads; set a `Content-Security-Policy` on the SPA responses.
- **Estimated effort:** Medium (1 day).

## H6 — Google OAuth does not require `email_verified`

- **Description:** After `verifyIdToken`, `payload.email` is used as identity
  without inspecting `payload.email_verified` (auth.ts:52-81). An attacker with
  an unverified Google email can register a normal account; if the product later
  treats email ownership as authoritative (e.g. password reset, admin ops), this
  becomes an account-takeover path.
- **Root cause:** Missing claim check on the OAuth payload.
- **Affected files:** `src/routes/auth.ts:52-56`.
- **Recommended fix:** Reject logins where `payload.email_verified === false`
  (or `=== undefined` for consumer Google accounts).
- **Estimated effort:** Trivial (<1 hour).

## H7 — Structured ad-check result is never shown; large ad-checks can fail in chat

- **Description:** The homepage builds a rich `checkResult` (score, violations,
  suggestions — home.tsx:73) but the UI never renders it as a structured card:
  the `CheckCard` renderer is registered yet explicitly "NOT emitted yet"
  (CheckCard.tsx:10-15) and the result is only forwarded to the AI as a text
  prompt (HamzawiChat.tsx:427-450). Separately, `/api/check` accepts up to
  50 MB (ads.ts:31); the follow-up chat turn re-attaches that image as an inline
  base64 `dataUrl` (HamzawiChat.tsx:441-443) which can exceed the 20 MB JSON
  body cap (app.ts:78) → the chat follow-up fails with a 4xx and the ad-check
  result is lost.
- **Root cause:** Check-in-chat deferred (P2); attachment re-sent as base64
  instead of uploaded once and referenced by URL.
- **Affected files:** `src/components/chat/CheckCard.tsx:10-15`;
  `artifacts/postlap-ai/src/pages/home.tsx:73`; `src/components/HamzawiChat.tsx:427-450`;
  `src/routes/ads.ts:31`; `src/app.ts:78`.
- **Recommended fix:** Emit the check result as a structured chat block and
  render it with `CheckCard`; always route the checked media through
  `/upload-asset` and reference the URL in the follow-up turn.
- **Estimated effort:** Medium (½–1 day).

---

# MEDIUM

## M1 — No transactions around the multi-write chat turn
- **Description:** A turn performs multiple DB writes (user + assistant message
  inserts, conversation `updated_at`/`last_message_at` update, upsell-gate
  writes) with no transaction (hamzawi.ts:704-724, 869-921); the conversation
  update is `.catch()`-swallowed (hamzawi.ts:920). An interruption leaves a user
  message without an assistant reply or an out-of-sync timestamp.
- **Affected files:** `src/routes/hamzawi.ts:704-724,869-921`.
- **Fix:** Wrap the turn's writes in a transaction; propagate update failures.
- **Effort:** Small (½ day).

## M2 — Significant dead/unreachable code
- **Description:** `countdown`/`countdownRef` state machine runs but the value is
  never rendered (home.tsx:71-72, 331-346); `isDiscountActive()` is hardcoded
  `false` (home.tsx:58-60) leaving the discount UI and expired promo string dead
  (home.tsx:582-634); the entire floating-chat subsystem (`heroVisible`,
  `forceOpen`, `unread`, `SESSION_OPENED_KEY`, toggle bubble, auto-open effects
  HamzawiChat.tsx:261-297) can never activate because both usages pass
  `embedded`; `loadingConversations` is set but never read (hamzawi.tsx:37);
  `CheckCard`/`CopyBlock` renderers are registered but never emitted
  (chat/index.ts:16-19); the `.dark` CSS block duplicates `:root`
  (index.css:138-188) with no `.dark` class anywhere.
- **Affected files:** home.tsx, HamzawiChat.tsx, hamzawi.tsx, index.css,
  chat/CheckCard.tsx, chat/CopyBlock.tsx.
- **Fix:** Delete unreachable branches/state and the dead CSS; activate or
  remove the dormant renderers.
- **Effort:** Small (½–1 day).

## M3 — Missing/inconsistent loading and error states (UX)
- **Description:** Google login has no spinner and no retry if the GIS script
  loads late or `VITE_GOOGLE_CLIENT_ID` is empty (home.tsx:88-119, empty div at
  :902). Several failures are silent (gender save home.tsx:161, conversation
  fetch home.tsx:194-196, stats admin.tsx:131 → console only). Ad-check
  `await res.json()` runs **before** the `401` check (home.tsx:378-381) — a
  401 without a JSON body surfaces the wrong "connection error" message.
  Home-page toasts are hardcoded Arabic even when `lang=en` (home.tsx:351-391).
- **Affected files:** home.tsx, hamzawi.tsx, admin.tsx.
- **Fix:** Add spinners/retry for Google login; guard `res.status` before
  parsing; route errors through `handleAuthError` and the language table.
- **Effort:** Small (½ day).

## M4 — Accessibility gaps
- **Description:** ~10 icon-only buttons lack accessible names (chat close X,
  send button HamzawiChat.tsx:748-750, 875-881; sidebar rename/delete use
  `title` only); form inputs are placeholder-only (admin/secret-admin);
  modals are non-semantic `<div>`s with no `role="dialog"`, no Escape-to-close,
  no focus trap (home.tsx:787-943); `maximum-scale=1` blocks pinch-zoom
  (index.html:5); clickable images open via non-focusable `<img>`.
- **Affected files:** HamzawiChat.tsx, HamzawiSidebar.tsx, admin.tsx,
  secret-admin.tsx, home.tsx, index.html, chat/*.
- **Fix:** Add `aria-label`/`title` consistently, real `<label>`s, dialog
  semantics + focus management, allow zoom.
- **Effort:** Medium (1 day).

## M5 — Duplication and i18n sprawl
- **Description:** Four parallel i18n systems (`lib/i18n.ts`, `useLanguage.ts`,
  HamzawiChat inline object, CheckCard inline labels) with duplicate keys and
  two independent language detectors that both write `postlap_lang`
  (useLanguage.ts:7-14 vs HamzawiChat.tsx:14-22) and can disagree, producing
  mixed RTL/LTR and an `ar` RTL flash for English users. Conversation CRUD is
  duplicated verbatim (home.tsx:183-252 ≈ hamzawi.tsx:43-120); `getToken`/
  `getStoredUser` are re-implemented (home.tsx:42-47, hamzawi.tsx:20-26) despite
  `lib/utils.ts` exports; `parseDesignSamples` is copied 3×; `LocalUser`/
  `MemoryResponse` interfaces duplicated.
- **Affected files:** home.tsx, hamzawi.tsx, lib/i18n.ts, lib/useLanguage.ts,
  HamzawiChat.tsx, brand.tsx, BrandSetupForm.tsx, lib/onboarding.ts.
- **Fix:** Consolidate into one i18n module + one language hook; extract shared
  conversation hooks; import the utils helpers.
- **Effort:** Medium (1–2 days).

## M6 — Schema migrations are not reproducible
- **Description:** `drizzle-kit push` diffs the live DB against the schema file
  at deploy (post-merge.sh → `pnpm --filter db push`); the `lib/db/migrations`
  folder contains only 3 SQL files and most tables have **no migration SQL**. A
  fresh DB cannot be built from the migrations; drift between environments is
  invisible; the 20 s postMerge timeout (`.replit:43`) can fail an interrupted
  push and `set -e` fails the deploy.
- **Affected files:** `lib/db/migrations/*`, `lib/db/drizzle.config.ts`,
  `scripts/post-merge.sh`, `.replit`.
- **Fix:** Switch to `drizzle-kit generate` + versioned migrations and run
  `migrate` at deploy; or keep `push` but accept its operational risk
  (documented). Increase the postMerge timeout.
- **Effort:** Medium (1 day).

## M7 — Non-deterministic memory window; conversations created per message
- **Description:** `created_at` is second-precision with no tiebreaker
  (contextBuilder.ts:85-86); rapid inserts in one turn (multiple rows per
  request) can be arbitrarily kept/dropped by the LIMIT. Clients that omit
  `conversationId` auto-create a new conversation per message
  (hamzawi.ts:605-620), fragmenting history.
- **Affected files:** `src/services/ai/contextBuilder.ts:72-86`;
  `src/routes/hamzawi.ts:605-620`.
- **Fix:** Order by `(created_at, id)`; require/persist `conversationId` on the
  client and reject legacy anonymous turns.
- **Effort:** Small (½ day).

## M8 — Guest info leak in rejected-ad message
- **Description:** The guest-facing `message` field embeds the first violation
  reason even though `reason`/`violations` are blanked for guests
  (ads.ts:214, 247-252) — a rejected ad leaks its analysis to anonymous users.
- **Affected files:** `src/routes/ads.ts:214,243-253`.
- **Fix:** Use a generic message for guests or blank `message` for the rejected
  case.
- **Effort:** Trivial (<1 hour).

## M9 — Response payloads serialize base64-bearing content
- **Description:** `/hamzawi/messages` and `/hamzawi/chat` return stored
  `content` including multi-MB base64 markers (hamzawi.ts:1147, 923-929); DB
  bloat propagates directly into response size and client memory.
- **Affected files:** `src/routes/hamzawi.ts:923-929,1147`.
- **Fix:** Strip/expand markers in responses (return the persisted URL form, not
  inline base64).
- **Effort:** Small (½ day).

## M10 — `checks` and guest rows grow without retention; stats do full counts
- **Description:** `checks` records every ad check including guests
  (`user_id` NULL, ads.ts:222) with no retention; admin `/stats` does full-table
  `count()` (admin.ts:280-293); no index on `checks.user_id`.
- **Affected files:** `src/routes/ads.ts:219-227`; `src/routes/admin.ts:280-293`;
  `lib/db/src/schema/checks.ts`.
- **Fix:** Add retention; aggregate counts from a summary or indexed column.
- **Effort:** Small (½ day).

---

# LOW

- **L1 — Logout/clear cookies omit `Secure`:** `Set-Cookie` for logout
  (auth.ts:156-162) and `clearSessionCookie` (hamzawi.ts:128-131) never set
  `Secure` even in production. Also, `cookie-parser` is a declared dependency
  that is never imported. *Fix:* mirror the `secure` flag; drop the unused dep.
  *Effort:* trivial.
- **L2 — `window.open` on image URLs, images not keyboard-accessible:**
  `GeneratedImageCard.tsx:16-17` / `MediaBubble.tsx:15-16`. Low risk (browsers
  apply implicit noopener to `window.open`); add keyboard handler + `rel`. *Effort:* trivial.
- **L3 — Duplicate font load + hardcoded lang/dir/SEO:** Cairo loaded via both
  `@import` (index.css:1) and `<link>` (index.html:72); `index.html` hardcodes
  `lang="ar" dir="rtl"` and Arabic-only SEO regardless of user language.
  *Effort:* small.
- **L4 — Config/build leftovers:** `@assets` alias (vite.config.ts:45) is
  unused; `dist/` is committed to the repo. *Effort:* trivial.
- **L5 — Inconsistent navigation:** `window.location.href` full reloads
  (home.tsx:263, onboarding.tsx:29, brand.tsx:30) vs `wouter navigate`
  elsewhere. *Effort:* small.
- **L6 — Minor frontend perf:** toast listener re-subscribes on every state
  change (`[state]` dep, use-toast.ts:182); `URL.createObjectURL` previews are
  only revoked on unmount (HamzawiChat.tsx:172-175). *Effort:* trivial.
- **L7 — Missing FK constraints / soft links:** `users.company_id`,
  `user_brand_memory.company_id`, `media_assets.company_id`,
  `business_profiles.user_id`, `checks.user_id` lack FKs; guest rows with NULL
  `user_id` have no cleanup path. *Effort:* small (schema hygiene).
- **L8 — Dead promo/discount:** `isDiscountActive()` returns `false` and the
  "عرض مايو ويونيو 2026 فقط!" text (home.tsx:584) is unreachable.
  *Effort:* trivial.
- **L9 — Upload trusts client `mimetype`:** `/upload-asset` accepts by
  client-declared MIME (hamzawi.ts:64-68); a polyglot file is stored under a
  `.png` name. Mitigated by `X-Content-Type-Options: nosniff` + CSP on `/uploads`
  (app.ts:86-90). *Fix:* sniff magic bytes. *Effort:* small.

---

# Architecture summary (dimension-by-dimension)

- **Architecture:** Clean pnpm workspace (`artifacts/{api-server,postlap-ai,
  mockup-sandbox}`, `lib/{db,api-spec,api-client-react,api-zod}`, `e2e`). The
  api-server is a single large `hamzawi.ts` route (~1,400 lines) mixing HTTP,
  AI orchestration, DB writes, and session logic — works, but the Reasoner/
  ToolRegistry (P1) is half-migrated and the `brand_memory` intent is classified
  and then unused (reasoner.ts:109-114 → hamzawi.ts uses only `needsVision` and
  `generate_image`). Memory is injected unconditionally via system prompt, not
  intent-driven.
- **AI:** Rule-first intent classification with LLM fallback; upsell gating via
  `evaluateToolAccess`; dev stubs keyed to NODE_ENV. Solid basics; token budget
  is the weak point (H2).
- **Vision:** The attached image *does* reach the vision model (Phase 3 fix,
  hamzawi.ts:747-764); the residual risk is silent degradation on resolution
  failure and cost/abuse (C2).
- **Image generation:** Gemini `gemini-2.5-flash-image` with dev stub; output
  persisted and referenced by URL marker. Works; no rate/cost cap surfaced for
  generation beyond the upsell gate.
- **Upload pipeline:** `/upload-asset` (auth-gated, 10 MB, MIME allowlist,
  opaque filenames, path-traversal safe) and `/check` (50 MB, guests). Solid
  containment; the gap is the base64 re-attachment path (C2/H7).
- **Security:** Strong fundamentals (HttpOnly+SameSite cookies, timing-safe
  HMAC, anon-only guest isolation, IDOR guards, no SQL injection, no
  dangerouslySetInnerHTML). Weaknesses are the NODE_ENV guardrail (C1),
  entitlement enforcement (C3), JWT lifecycle (H4), rate-limit bypass (H3).
- **UX:** Chat-first experience is solid with Arabic/English; weaknesses are the
  dormant structured results (H7), dead code (M2), and loading/error gaps (M3).
- **Performance:** Correct async patterns, no N+1 DB loops, agent-config caching;
  but unbounded payloads, per-turn disk/base64 work, unpaged lists, and full-chat
  re-renders are the hotspots (C2, H2, H1, H5).
- **Database:** Clean Drizzle schema, cascade deletes for users; missing indexes,
  unpaged lists, no transactions on multi-writes, non-reproducible migrations
  (H1, M1, M6).
- **Authentication:** Google OAuth verified server-side (audience pinned);
  JWT stateless with `is_active` enforcement; gaps are algorithm pinning, admin
  token binding, revocation, `email_verified` (H4, H6).
- **Branding:** PostLab-facing UI (Phase 1) is consistent; residual mixed
  Arabic/English status strings, hardcoded WhatsApp number (home.tsx:411), and
  Arabic-only SEO remain.
- **Conversations:** Ownership enforced on every endpoint (IDOR-safe); soft-delete
  archive works but accumulates; unpaged list; per-message auto-create for
  legacy clients (H1, M7).
- **Memory:** `user_brand_memory` is the single persistent memory; `memory_window`
  and `asset_cap` are wired from AgentConfig; vector retrieval config is
  explicitly unwired. Budget is rows-not-tokens and asset resolution runs
  unconditionally (H2).
- **Maintainability:** Good workspace hygiene and typecheck/build wiring; drags
  are the giant `hamzawi.ts`, dormant renderers, dead branches, four i18n
  systems, and duplicated CRUD/hooks (M2, M5).

---

# Reclassification by launch priority

## 1. MUST FIX BEFORE FIRST PRODUCTION LAUNCH

| ID | Why it must be fixed before launch |
|---|---|
| **C1** — No production guardrail | A single misconfiguration silently disables every security control (dev-login, open CORS, forgeable JWT, `admin123`), so launch is unsafe until `NODE_ENV` and placeholder secrets are asserted. |
| **C2** — Unbounded base64 attachment ingest | Anonymous users can bloat the DB and burn unbounded gpt-4o vision spend with no size/count cap, so the cost/abuse vector is live from day one. |
| **C3** — Entitlement not server-side | The revenue model is ineffective on day one (free paid plan, unlimited checks) because the trial gates live on the client and subscribe self-grants the paid plan. |
| **H6** — `email_verified` not checked | It is a ~1-hour, near-zero-risk identity hardening that prevents a future account-takeover path, so there is no reason to ship without it. |

## 2. SHOULD FIX SOON AFTER LAUNCH

| ID | Why it belongs here |
|---|---|
| **H1** — DB indexes / unbounded growth | Tables are small at launch so queries stay fast, but the degradation becomes painful as users and archived conversations accumulate, so it must be addressed early in growth. |
| **H2** — Vision/context cost | It wastes tokens and I/O per turn and raises operating cost, but it does not break functionality or open an abuse path once C2's caps are in place. |
| **H3** — Rate-limit bypass / missing limits | It amplifies abuse vectors rather than causing one itself, and the correct fix depends on the production proxy topology, so it is a short-post-launch hardening. |
| **H4** — JWT hardening | With a strong secret (guaranteed by C1) the current HS256 design is functional and secure, so algorithm pinning, admin-token binding, and revocation are defense-in-depth, not blockers. |
| **H5** — No error boundary / chat re-render | A render crash blanks the app and long chats get janky, but both are rare at launch scale and degrade UX rather than integrity. |
| **H7** — Structured ad-check never shown | The core check already works; showing structured results and fixing the >20 MB follow-up edge case are UX promises to honor right after launch. |
| **M1** — No transactions on chat turn | An interrupted turn can drop an assistant reply, a low-probability, recoverable gap that grows with traffic. |
| **M3** — Loading/error-state gaps | Silent failures and the 401-before-json bug surface wrong or no feedback, which harms user trust but does not block the product. |
| **M4** — Accessibility gaps | It is an inclusion/compliance concern (WCAG) that should be addressed early, but it does not block a functional launch. |
| **M6** — Migrations not reproducible | `drizzle-kit push` works for the single live DB today, but drift/deploy-failure risk rises with every schema change, so versioned migrations should land soon after launch. |
| **M8** — Guest info leak in rejected-ad message | It leaks a limited ad-analysis reason to anonymous users, a trivial business-logic fix that is not a launch blocker. |
| **M9** — Responses serialize base64 | Response bloat tracks usage and is largely cured by the C2 fix, so it is best handled together with the root cause after launch. |

## 3. TECHNICAL DEBT / FUTURE IMPROVEMENT

| ID | Why it belongs here |
|---|---|
| **M2** — Dead/unreachable code | Unreachable branches and dead CSS add maintenance cost and confusion but have zero runtime impact. |
| **M5** — Duplication and i18n sprawl | Consolidation is a pure maintainability win with no user-visible behavior change. |
| **M7** — Non-deterministic memory window / per-message conversations | Current clients always pass `conversationId` and the tiebreaker issue is cosmetic, so it only affects AI-context quality marginally. |
| **M10** — Checks/guest rows growth | It is a scaling concern visible only in slow admin counts as data accumulates. |
| **L1** — Logout cookie Secure flag / unused dep | The cookie being cleared anyway and the unused `cookie-parser` make this hygiene, not security impact. |
| **L2** — `window.open` on images / keyboard access | Browsers already apply implicit noopener and the URLs are server-controlled, leaving only an a11y nicety. |
| **L3** — Duplicate font load / hardcoded lang/SEO | Cosmetic performance and localization polish with no functional impact. |
| **L4** — Unused `@assets` alias / committed dist | Build hygiene only. |
| **L5** — Inconsistent navigation | Full-page reloads are a UX inconsistency, not a defect. |
| **L6** — Minor frontend perf | Re-subscription and unreleased object URLs are negligible at current scale. |
| **L7** — Missing FKs / soft links | The app always sets these columns consistently today, so it is schema hygiene rather than a correctness risk. |
| **L8** — Dead promo/discount | The discount is intentionally disabled; the dead text is cosmetic. |
| **L9** — Upload trusts client MIME | Already mitigated by `nosniff` + CSP on `/uploads`, so magic-byte sniffing is defense-in-depth. |

---

# Priority roadmap (recommended order)

1. **C1** — production guardrails (½–1 day): NODE_ENV assertion + placeholder-secret rejection.
2. **C3** — server-side entitlement (1–2 days): guest cap, trials gating, subscribe verification.
3. **C2** — attachment size/count caps + URL-form persistence (1–2 days).
4. **H3, H4** — rate-limit hardening + JWT pinning/admin binding (1 day).
5. **H5** — error boundary + chat render memoization + CSP (1 day).
6. **H1, H2** — indexes, pagination, asset caching, token-budgeted context (2 days).
7. **H7, M2-M5** — structured results, dead-code removal, a11y, i18n consolidation (2–3 days).
8. **M1, M6-M10, L1-L9** — transactions, migrations, hygiene (2 days).

After the Critical and High items are closed, re-run this audit: target ≥ 8.5/10
before public launch.

---

# Implementation status (Phase 6, 2026-08-08)

MUST FIX items implemented in Phase 6 (see `docs/PHASE6_REPORT.md`):

| ID | Status | Notes |
|---|---|---|
| **C1** | ✅ Implemented | `index.ts` NODE_ENV startup assertion (explicit `production`/`development`/`test` only); `secrets.ts` throws on placeholder secrets (`dev-secret`, `admin123`, `change-me-in-production`) in production; `/dev/login` requires `NODE_ENV !== "production"` **and** `DEV_LOGIN=1`. |
| **C2** | 🔶 Partial | Server-side caps added: 4 MiB per-attachment decoded limit and 6-image per-vision-turn budget (both `/uploads/` URL and inline base64 forms). **Not done:** URL-form-only persistence / reject inline base64 for auth'd users (attachment-architecture change, out of phase scope). |
| **C3** | 🔶 Partial | Subscribe self-grant removed → controlled `501` "Not Available Yet"; frontend surfaces it via existing toast path. **Not done:** server-side guest cap and `trials_remaining` gating of `/api/check` (per phase instruction, payment gateway / server-side trial authority deferred). |
| **H6** | ✅ Implemented | Google OAuth rejects `payload.email_verified !== true`. |

Residual MUST-FIX gaps (C2 URL-form persistence; C3 guest cap + trials gating)
remain open and should be closed before public launch. All SHOULD FIX and TECH
DEBT items above are unchanged. Re-run the audit after closing the remaining
Critical gaps.
