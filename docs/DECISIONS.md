# DECISIONS.md

Chronological record of important product and technical decisions.

---

## 2026-07 (approx., task-13 / task-14 era)

1. **Hamzawi as a marketing funnel + content-management assistant (level 4).**
   The assistant is the centerpiece, with a graduated subscription funnel and
   content-management flows. Commits `f880dc6` (task-13), `434cc75` (task-14).
2. **Floating Hamzawi chat widget.** Hamzawi was initially presented as a
   floating assistant bubble on the homepage (with a toggle).

## 2026-07-25 — Phase 4 audit

3. **Launch readiness accepted at 8.5/10.** Audit found 0 critical, 6 high,
   5 medium, 3 low, 5 deferred issues. Decision: proceed toward launch with the
   high-priority UX fixes (30 min estimated).
4. **V2 scope explicitly deferred:** dedicated brand-management page, in-app
   payments, multi-language admin, email notifications, password login — none are
   launch blockers.

## 2026-08-02 — Homepage redesign (commit `2314303`)

5. **AI Post Generation becomes the primary hero experience.**
   New fixed section order: AI Post Generation (hero) → AI Image Generation →
   Existing Post Check → Features → Pricing → secondary sections.
6. **Floating Hamzawi removed; embedded only.** The floating widget is deleted
   from the homepage. Hamzawi now lives only inside the hero as an always-open
   inline chat (`HamzawiChat embedded` prop; 640px vs 520px height; no bubble,
   no toggle, auto-open/forceOpen effects disabled).
7. **Embed Hamzawi in the AI Post Gen hero** (not the Check section) so the
   assistant directly supports the primary generative task.
8. **AI Image Generation ships as a level-4+ gated feature** calling
   `/api/image-gen` (`POST { mode, productDescription, productImageBase64?,
   regenerateNote? }`; 401 without login, 403 below level 4, returns `{ url }`).
   Non-level-4 users see a gated card.
9. **Existing Post Check is demoted to a dedicated section** (dropzone +
   inline Arabic-only result card + WhatsApp Smart Fix upsell for non-paid users).
10. **Secondary sections demoted visually.** How-it-works, Trust badges, Stats,
    Agents, FAQ kept but clearly secondary (muted headings, smaller titles,
    `opacity-90`). Primary CTAs stay in hero / image-gen / check / pricing.
11. **Check results render Arabic-only statuses** (`"ممتاز" | "جيد" | "مرفوض"`,
    keyed on `t.checkResult.status === "ممتاز"`), fixing typecheck errors from
    English status literals.

## 2026-08-02 — Current pricing decisions (frontend `home.tsx`)

12. **Three paid plans, monthly LYD, pay via WhatsApp + bank transfer**
    (WhatsApp default `218915811115`, override via `config.whatsapp`):
    - Smart Fix — 400 LYD/mo (individual advertisers).
    - إدارة المحتوى (Content Management) — 800 LYD/mo, **highlighted as "الأكثر طلباً"** (companies/stores).
    - خطة الوكالة (Agency) — 1000 LYD/mo + 400 LYD per additional project.
13. **50% launch discount exists in code but is currently OFF** —
    `isDiscountActive()` returns `false`; banner text reads "عرض مايو ويونيو 2026 فقط".
14. **Plan levels** (frontend `planLevelFrontend`): visitor=1, registered=2,
    professional/smart_fix=3, content=4, agency=5. Text generation = level 3+;
    image generation + image-aware text = level 4+.

## 2026-08-02 — Integration audit (`a27777a`)

15. **Frontend must be able to reach a separately-hosted API.** Added
    `setBaseUrl(import.meta.env.VITE_API_BASE_URL)` in `main.tsx`; same-origin
    `/api/*` remains the default when unset.
16. **Dev-only, never-in-production helpers:**
    - `/api/dev/login` returns 404 when `NODE_ENV=production`; grants an `agency`
      dev user for testing without Google OAuth.
    - OpenAI dev stub in `services/ai/client.ts` activates only when
      `NODE_ENV !== "production"` and `OPENAI_API_KEY` is unset; production keeps
      real-client behavior (requests fail without a key, as before).
    - Vite dev proxy `/api` → `http://127.0.0.1:5000` (configurable via `API_TARGET`).
17. **Destructive admin actions need confirmation** — `window.confirm` added to
    admin delete and secret-admin unlimited/reset.

## 2026-08-02 — Replit → GitHub migration notes

18. **Project originated on Replit** (`.replit` present: nodejs-24 + python-3.11,
    deployment target autoscale, postBuild `pnpm store prune`, postMerge
    `scripts/post-merge.sh` which runs `pnpm --filter db push`). Earlier commits
    include Replit "Published your App" auto-commits.
19. **Now hosted on GitHub** at `github.com/Hamzawi-Ai/Post-Lap-ai.git` (remote
    `origin`). Branches: `main` (stable), `feature/mvp-launch` (active), and
    `audit/project-foundation`. No README yet.
20. **Production topology decision:** same-origin reverse proxy of `/api/*` to the
    API server is recommended; cross-origin requires `VITE_API_BASE_URL` and CORS
    allowlist expansion. Production CORS currently allows only `postlapai.com` /
    `www.postlapai.com` (www 301-redirects to apex).
21. **DB migrations are `drizzle-kit push`** (applied automatically on merge via
    `scripts/post-merge.sh`). Decision: acceptable for MVP; switch to versioned
    SQL migrations (`drizzle-kit generate`) for production.

## 2026-08-03 — In-app Professional plan + brand identity (`241945f`, `eeab99b`)

22. **In-app Professional plan replaces the WhatsApp-only upgrade path.**
    New `POST /api/auth/subscribe` self-upgrades any logged-in user to the
    `content` plan (Professional — 800 د.ل/شهر, `trials_remaining: 9999`,
    `is_active: true`). Payment remains out-of-band (bank transfer); access is
    granted immediately. **Known risk:** nothing verifies payment server-side and
    the route has no rate limit (audit R4).
23. **Plan levels** (server `planLevel`): visitor=1, registered=2,
    professional/smart_fix=3, content=4, agency=5. Matches frontend
    `planLevelFrontend`.
24. **Brand identity page (`/brand`) added in-app** — dedicated brand-management
    page (previously deferred to V2), smart welcome flow, Hamzawi
    profile-permission notes, and a brand completion score. Brand partial saves
    (`hamzawi_notes`/`marketing_notes`) are consent-gated.
25. **Image generation moved to `gemini-2.5-flash-image`** via GoogleGenAI
    (requires `GEMINI_API_KEY` at runtime).

## 2026-08-06 — Hamzawi canonical definition

29. **Hamzawi officially defined as a Multimodal AI Marketing Agent.**
    Hamzawi is not a text chatbot. It is the primary AI agent of PostLap AI,
    operating across text, uploaded images, brand assets, company knowledge,
    conversation history, and generated designs. Seven architectural principles
    adopted: Multimodal First, Native Image Generation, Context-Aware Reasoning,
    Asset Awareness, No Fake Capabilities, Tool Selection Policy, and Product Vision.
    `docs/HAMZAWI_AGENT.md` is the canonical reference; all future development
    decisions about the agent must be reconciled against it.

## 2026-08-03 — Launch Readiness Audit (`docs/LAUNCH_READINESS_AUDIT.md`)

26. **All Phase-4 high-priority UX fixes (H1, H2, H4, H5) now confirmed fixed**
    in `main`; H6 (bilingual compliance badge) and L1–L3 remain open.
27. **Server-side enforcement gaps identified (not yet fixed):** guest cap is
    client-only (R1); `trials_remaining` decrements but never gates (R2);
    `is_active`/`subscription_expires_at` written but never enforced (R3);
    `/auth/subscribe` self-grants paid access without verification or rate limit
    (R4). Decision pending user review.
28. **Go-live is blocked on production secrets** — `.env` holds only dev
    placeholder values, and `lib/secrets.ts` does not reject placeholders in prod.

