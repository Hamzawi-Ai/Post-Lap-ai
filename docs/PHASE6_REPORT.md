# Phase 6 Report — Production-Launch Security Fixes (C1, C2, C3, H6)

Date: 2026-08-08
Scope: Implement **only** the audit findings classified
"MUST FIX BEFORE FIRST PRODUCTION LAUNCH" in `docs/FINAL_AUDIT_REPORT.md`:
**C1** (production guardrail), **C2** (unbounded attachment ingest),
**C3** (entitlement self-grant), **H6** (`email_verified` not checked).

No new features, no UI/conversation/branding/prompt/memory changes, no database
rename, no API/route/URL/endpoint changes (endpoints are unchanged; only the
responses of the existing `/api/auth/subscribe` endpoint changed), no redirects
or file moves, and no redesign of the attachment architecture. Changes are
minimal, production-safe, and target root causes.

## Implemented fixes

### C1 — Production guardrail (`artifacts/api-server/src/index.ts`, `src/lib/secrets.ts`, `src/routes/auth.ts`)

- **`src/index.ts`** — new startup assertion: the server refuses to boot unless
  `NODE_ENV` is explicitly set to one of `production | development | test`
  (previously an unset `NODE_ENV` silently ran in "not-production" mode, which
  disabled the CORS allowlist, Secure cookie flag, and AI integrations while
  leaving the dev-login endpoint mounted). The resolved `nodeEnv` is now logged
  at startup so the boot mode is always observable.
- **`src/lib/secrets.ts`** — `resolveSecret` now **throws** in production when
  an explicitly-provided value is one of the public placeholders
  `dev-secret` / `admin123` / `change-me-in-production` (previously only
  *missing* variables were rejected in production, never *placeholder* values,
  so a deployment could start with a forgeable `SESSION_SECRET` and the default
  admin password).
- **`src/routes/auth.ts`** — `POST /dev/login` now returns 404 unless
  `NODE_ENV !== "production"` **and** `DEV_LOGIN=1` is explicitly set, so the
  bypass endpoint can never be silently active even in a misconfigured
  non-production deployment.

### C2 — Attachment size/count caps (`artifacts/api-server/src/routes/hamzawi.ts`)

Within the "no attachment-architecture redesign" constraint, the unbounded
anonymous ingest/cost vector is closed with server-side resource limits:

- **Per-attachment size cap (4 MiB decoded).** `resolveAttachment` now measures
  the approximate decoded byte length of the base64 (`approximateBase64Bytes`,
  a safe upper bound) and rejects attachments (both `/uploads/` URL form and
  inline `data:image/…` form) that exceed `MAX_ATTACHMENT_BYTES = 4 MiB`.
  This bounds what is persisted in `hamzawi_messages.content` and what is sent
  to the gpt-4o vision model, independent of the coarse 20 MB JSON body cap.
- **Per-turn vision budget (max 6 images).** `buildHistoryForAI` counts the
  image parts it re-expands from stored history into a single vision turn and
  stops at `MAX_VISION_IMAGES_PER_TURN = 6` (newest first), bounding per-turn
  OpenAI vision spend; each re-expanded image is also subject to the same
  4 MiB size cap. Text-only turns are unaffected (no images → no budget hit).
- The `/upload-asset` upload path (10 MB, auth-gated, MIME allowlist) is
  unchanged.

### C3 — Remove entitlement self-grant (`artifacts/api-server/src/routes/auth.ts`)

Per instruction, no payment gateway was added. The server-side self-grant is
removed: `POST /api/auth/subscribe` previously upgraded **any authenticated
user** to the paid `content` plan (`trials_remaining: 9999`, `is_active: true`)
with no payment verification. It now returns a controlled
`501 Not Available Yet` response with
`{ ok: false, error: "الاشتراك غير متاح حالياً — سيتم تفعيله قريباً" }`.
The endpoint name, route, and auth requirement are unchanged; no plan is
granted, no user row is written.

The frontend (`home.tsx` `handleSubscribe`) already throws on `!res.ok` with
the server error message and surfaces it via a destructive toast — so the 501
is shown cleanly with **no UI change** required and no crash.

### H6 — Google OAuth requires `email_verified` (`artifacts/api-server/src/routes/auth.ts`)

`POST /auth/google` now rejects login when `payload.email_verified !== true`,
closing the account-takeover path that would exist if email ownership were ever
treated as authoritative (password reset, admin ops).

## Verification

- `pnpm run typecheck` → exit 0 (libs via `tsc --build`; api-server, postlap-ai,
  mockup-sandbox via `tsc --noEmit`).
- `pnpm run build` → exit 0 (api-server dist + postlap-ai dist/public).
- `pnpm --filter @workspace/e2e run test` → **could not run in this environment**:
  the Playwright webServer (postlap-ai dev server bound to `:80`) fails to boot
  and the Nix Chromium binary is absent. This is a pre-existing environment
  limitation, not a regression: the only e2e test (`login-modal.spec.ts`)
  exercises the frontend login modal and touches none of the changed API files
  or endpoints.

## Files changed (4, plus this report)

| File | Change |
|---|---|
| `artifacts/api-server/src/index.ts` | NODE_ENV startup guardrail; log nodeEnv |
| `artifacts/api-server/src/lib/secrets.ts` | Reject placeholder secrets in production |
| `artifacts/api-server/src/routes/auth.ts` | `email_verified` check; `DEV_LOGIN=1` opt-in; subscribe → 501 "Not Available Yet" |
| `artifacts/api-server/src/routes/hamzawi.ts` | 4 MiB attachment cap; 6-image vision-turn budget |

## Intentionally NOT fixed (remaining issues)

### Residual MUST-FIX gaps (kept in scope by phase constraints)

- **C2 — URL-form persistence:** inline base64 is still accepted (now capped at
  4 MiB). Persisting the URL marker form and rejecting inline base64 for
  authenticated users is part of C2's recommended fix but constitutes an
  attachment-architecture change, explicitly out of scope this phase.
- **C3 — Guest trial cap and `trials_remaining` gating:** the guest 3-scan cap
  remains client-side (localStorage) and `trials_remaining` still never gates
  `/api/check`. This phase removed only the subscribe self-grant per
  instruction ("remove self-grant, disable self-service subscribe").

### Not implemented (SHOULD FIX / TECH DEBT — `docs/FINAL_AUDIT_REPORT.md`)

- **H1** DB indexes / pagination / retention, **H2** vision/context cost,
  **H3** rate-limit hardening (X-Forwarded-For, missing auth limiters),
  **H4** JWT hardening, **H5** error boundary / chat memoization / SPA CSP,
  **H7** structured ad-check output, **M1** chat-turn transactions,
  **M2-M10**, **L1-L9** (full list with rationale in the audit report's
  reclassification tables).
