# PostLapAI

**Hamzawi is a Multimodal AI Marketing Agent — not a text chatbot.**  
حمزاوي وكيل تسويقي ذكي متعدد الوسائط، يعمل مع النصوص والصور ومقومات العلامة التجارية ومعرفة النشاط التجاري وسجل المحادثات والتصاميم المولّدة بالذكاء الاصطناعي.

PostLapAI is an AI platform that combines Meta/TikTok ad-policy compliance checking with Hamzawi — a multimodal marketing agent that understands images, generates branded creatives, and retains each user's complete brand identity across sessions. See `docs/HAMZAWI_AGENT.md` for the full architectural definition.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `OPENAI_API_KEY` — for ad checking and Hamzawi AI chat
- Optional env: `GEMINI_API_KEY` or `NANO_BANANA_API_KEY` — for AI image generation (PRO plan)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- AI: OpenAI gpt-4o (ad checking), gpt-4o-mini (Hamzawi chat, text gen), Google Gemini (image gen)

## Where things live

- DB schema: `lib/db/src/schema/` — users, checks, hamzawi_messages, user_brand_memory
- API contract: `lib/api-spec/openapi.yaml`
- API routes: `artifacts/api-server/src/routes/` — ads, auth, admin, config, health, hamzawi
- Frontend: `artifacts/postlap-ai/src/`
- Hamzawi chat UI: `artifacts/postlap-ai/src/components/HamzawiChat.tsx`

## Architecture decisions

- Plan system: two tiers — **FREE** (level 1) and **PRO** (level 2). `planLevel()` in `lib/db/src/schema/users.ts` is the single source of truth.
- Feature gating by level: ad check/analysis/repair (FREE, level 1); text generation, image generation, post design, Brand Brain (PRO, level 2).
- `BETA_ACCESS_ENABLED` env var controls new user registration: `true` (default) = new users get `plan='pro'`; `false` = new users get `plan='free'`. Toggling this flag is the only change needed.
- Beta provenance: users who receive PRO via beta registration get `beta_access=true`. Manually admin-provisioned PRO users have `beta_access=false`. When beta ends, only beta-granted PRO accounts are lazily downgraded to FREE.
- Hamzawi uses HMAC-signed cookies (`hamzawi_session`) for anonymous visitors (signed with SESSION_SECRET) and JWT auth for registered users, so conversation history persists across page loads. Cookie tampering is rejected server-side.
- The `/check` endpoint returns structured violations JSON `{ violations: [{type, reason, severity}], suggestions[] }` which is passed directly to Hamzawi's system prompt for contextual responses.
- Language auto-detection: frontend reads `navigator.language`, stores in `localStorage` (`postlap_lang`), and applies Arabic/English UI via `src/lib/useLanguage.ts` + `src/lib/i18n.ts`. Hamzawi replies in the user's message language automatically via OpenAI.

## Product

- **فحص الإعلانات**: رفع صورة أو فيديو يحصل المستخدم على تقرير مفصّل مع نقاط ومخالفات وفق سياسات Meta
- **حمزاوي AI**: مساعد ذكي يرد بالذكاء الاصطناعي، يتذكر هوية النشاط التجاري، ويفتح تلقائياً للزوار الجدد
- **ذاكرة النشاط**: المستخدمون المشتركون (PRO) يحفظون هوية نشاطهم التجاري وحمزاوي يستخدمها في كل محادثة
- **توليد الصور**: خطة PRO تولّد صوراً إعلانية بديلة عبر Gemini
- **توليد النصوص**: نصوص إعلانية باللهجة الليبية عبر OpenAI (PRO فقط)

## Gotchas

- After schema changes, always run `pnpm --filter @workspace/db run push` before restarting the API server. In production deployments, run the migration SQL from `lib/db/migrations/plan_enum_free_pro.sql` to migrate legacy plan enum values.
- After OpenAPI spec changes, run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks
- Do NOT add new enum values to the `plan` enum without running the migration — the enum is now strictly `['free', 'pro']`
- The `planLevel()` function is the single source of truth for plan-based feature gating — use it everywhere instead of comparing plan strings directly
- Image generation (`/api/image-gen`) default fix mode is FREE; `new_post` mode (branded post generation) requires PRO

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
