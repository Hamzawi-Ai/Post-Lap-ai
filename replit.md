# PostLapAI

PostLapAI هو منصة ذكاء اصطناعي لفحص الإعلانات ومطابقتها مع سياسات Meta، مع مساعد ذكي (حمزاوي) يتذكر هوية النشاط التجاري لكل مستخدم.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `OPENAI_API_KEY` — for ad checking and Hamzawi AI chat
- Optional env: `GEMINI_API_KEY` or `NANO_BANANA_API_KEY` — for AI image generation (plan level 3+)

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

- Plan system uses 5 levels: visitor=1, registered=2, professional=3(legacy alias for smart_fix), smart_fix=3, content=4, agency=5. The old `professional` enum value is kept for backward compat and treated as level 3. `planLevel()` in `lib/db/src/schema/users.ts` is the single source of truth.
- Feature gating by level: ad check (all); brand memory (2+); text generation (3+, level 4+ gets image+description mode); image generation via Gemini (3+); full content/post management (4+); multi-business agency (5).
- Hamzawi uses HMAC-signed cookies (`hamzawi_session`) for anonymous visitors (signed with SESSION_SECRET) and JWT auth for registered users, so conversation history persists across page loads. Cookie tampering is rejected server-side.
- The `/check` endpoint returns structured violations JSON `{ violations: [{type, reason, severity}], suggestions[] }` which is passed directly to Hamzawi's system prompt for contextual responses.
- Language auto-detection: frontend reads `navigator.language`, stores in `localStorage` (`postlap_lang`), and applies Arabic/English UI via `src/lib/useLanguage.ts` + `src/lib/i18n.ts`. Hamzawi replies in the user's message language automatically via OpenAI.
- Gemini image generation is gated behind plan level 3 (smart_fix+). Falls back to NANO_BANANA_API_KEY if GEMINI_API_KEY is not set.

## Product

- **فحص الإعلانات**: رفع صورة أو فيديو يحصل المستخدم على تقرير مفصّل مع نقاط ومخالفات وفق سياسات Meta
- **حمزاوي AI**: مساعد ذكي يرد بالذكاء الاصطناعي، يتذكر هوية النشاط التجاري، ويفتح تلقائياً للزوار الجدد
- **ذاكرة النشاط**: المستخدمون المشتركون (مستوى 2+) يحفظون هوية نشاطهم التجاري وحمزاوي يستخدمها في كل محادثة
- **توليد الصور**: خطة content/agency تولّد صوراً إعلانية بديلة عبر Gemini
- **توليد النصوص**: نصوص إعلانية باللهجة الليبية عبر OpenAI

## Gotchas

- After schema changes, always run `pnpm --filter @workspace/db run push` before restarting the API server. In production deployments, this must be run explicitly before releasing — the Hamzawi endpoints depend on `hamzawi_messages`, `user_brand_memory`, and the expanded `plan` enum.
- After OpenAPI spec changes, run `pnpm --filter @workspace/api-spec run codegen` to regenerate hooks
- Do NOT add new enum values to the `plan` enum without considering backward compat — PostgreSQL doesn't allow removing enum values easily
- The `planLevel()` function is the single source of truth for plan-based feature gating — use it everywhere instead of comparing plan strings directly
- Image generation (`/api/image-gen`) is gated at plan level ≥ 3 (smart_fix+) on both backend and frontend — OpenAPI spec, error messages, and UI copy must all reflect "smart_fix+" not "content+"

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
