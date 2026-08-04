# MVP_SCOPE.md

What belongs in the MVP and what is intentionally postponed. Based on completed
work (`feature/mvp-launch`), the Phase 4 audit, and the integration report.

---

## In scope (MVP)

### Core product
- Guest ad-compliance check with 3-scan daily cap (`postlap_trials` localStorage).
- Redacted guest results (safe / warn / risk) + full Arabic results for logged-in
  users (`ممتاز` / `جيد` / `مرفوض` with violations and suggestions).
- AI text generation (`/api/generate-text`) — Libyan dialect text (غربية/شرقية/جنوبية),
  Meta-compliant; level 3+ gated; image-aware mode at level 4+.
- Embedded Hamzawi assistant (hero, always-open inline chat) with brand-memory
  persistence and onboarding flow.

### Monetization
- 3 paid tiers: Smart Fix (400), إدارة المحتوى (800, highlighted), Agency (1000)
  LYD/mo.
- WhatsApp + bank-transfer checkout, plus **in-app Professional self-upgrade**
  via `POST /api/auth/subscribe` (payment still settled out-of-band).
- Level gates: 3+ = text generation; 4+ = image generation + image-aware text.

### Accounts & admin
- Google OAuth login/registration; auto-create linked Company on first sign-up.
- Daily trial reset at UTC midnight.
- Admin panel + secret-admin (upgrade, activate, set-plan, unlimited, reset-limits,
  delete — with confirmation dialogs).
- Agent/sales-partner WhatsApp contacts (static list).

### Platform & trust pages
- Landing page per HOMEPAGE_SPEC.md (generation-first order).
- **Dedicated brand identity page (`/brand`)** with brand completion score and
  Hamzawi profile-permission notes (added `eeab99b`).
- TOS + Privacy pages.
- Cookie consent banner.
- Rate limiting on `/check`, `/hamzawi/chat`, `/admin/login`; CORS allowlist;
  www→apex redirect.

## Explicitly postponed (V2 — intentionally not in MVP)

From `artifacts/PHASE4_AUDIT_REPORT.md` (V2 items) and integration notes:

1. ~~**Dedicated brand-management page**~~ — **NOW IN SCOPE** (shipped `eeab99b` as
   the `/brand` page; brand memory also lives in the assistant).
2. **In-app payment / subscription management** (all billing stays on WhatsApp +
   bank transfer; `auth/subscribe` grants access immediately, verified later).
3. **Multi-language admin panels** (admin/secret-admin are Arabic-only).
4. **Email notifications** (welcome, expiry warnings, result delivery).
5. **Password-based login** (Google-only auth).
6. **Versioned DB migrations** (currently `drizzle-kit push`; switch to
   `drizzle-kit generate` before long-running production).
7. **Object storage for uploads** (temp-dir + base64-in-DB is the deliberate MVP
   design; revisit if files grow).
8. **Video analysis hardening** — `/api/check` supports MP4, but `ffmpeg` must be
   installed on the host; acceptable to ship image-first.
9. **Optional Gemini image generation** is in scope only if a key is provided;
   otherwise the feature is disabled (503) and the UI shows the gate.

## Definition of done (MVP launch)

Reflects the 2026-08-03 Launch Readiness Audit (§7) — items marked `[ ]` are open
and pending user review/fix:

- [ ] All production secrets configured on Replit (`DATABASE_URL`, `OPENAI_API_KEY`,
      `GEMINI_API_KEY`, `GOOGLE_CLIENT_ID`, `SESSION_SECRET`, `ADMIN_PASSWORD`).
- [ ] `lib/secrets.ts` rejects dev placeholder secrets in production.
- [ ] `is_active` / `subscription_expires_at` enforced in the check route (R3).
- [ ] Registered users blocked once `trials_remaining` reaches 0 (R2).
- [ ] Server-side visitor cap (R1) or documented client-only tradeoff.
- [ ] `/api/auth/subscribe` rate-limited (R4).
- [ ] Bilingual compliance badge unified (H6).
- [ ] `config.json` vs `DEFAULT_CONFIG` pro_price drift resolved.
- [ ] OpenAPI spec refreshed for `/users/me/gender`, `/auth/subscribe`,
      `dev/login`, admin routes.
- [ ] `/api/*` routed to the API server in production (proxy or `VITE_API_BASE_URL`).
- [ ] `ffmpeg` installed on the API host (for MP4 video checks).
- [ ] Homepage order + embedded-chat contract verified (see HOMEPAGE_SPEC.md §5).
