# PostLab Chat Refactor — Phase 1 Progress (source of truth)

> Status: **Phase 1 implemented and verified.**
> This document is the source of truth for resuming Phase 2.

## 1. Goal (Phase 1)

Redefine the customer-facing assistant of the Customer Chat as **Nader**:

- **Nader** = the customer-facing assistant (marketing, content, ads, design).
- **PostLab** = the product/platform name.
- Nader is an **employee responsible for Customer Chat at PostLab** — no ownership/authority over the platform.
- **No mention of "Hamzawi"** inside Nader's identity/prompt. The Nader ↔ Hamzawi (owner/supervisor) separation is enforced by routing/code, not by the persona.
- **No separate "creative role / نادر الإبداعي"** concept — Nader is the designer himself.
- After a design is completed, return to normal conversation: no auto "هل أعجبك؟", no auto "هل تريد تعديلاً؟", no auto-proposed new designs, no persistent design mode.
- English-text rule applies **only to newly generated text** inside designs; existing text inside original user assets is never translated/modified/removed.

## 2. Approved decisions

1. Product name stays **PostLab**; assistant name in customer chat is **Nader**.
2. Nader = الموظف المسؤول عن محادثة العملاء في منصة PostLab. No "الشريك الذكي", no platform-authority wording.
3. No "Hamzawi" inside Nader's customer-facing identity/prompt.
4. Frontend visible changes approved: `نادر يفكر...` / "Nader is thinking...", and welcome text introduces Nader while keeping PostLab as the product name.
5. Post-design behavior: return to normal conversation, no automatic follow-up questions (exact wording below).
6. English-text rule exact wording: «عند إنشاء نص جديد داخل التصميم، لا تكتب نصًا بالإنجليزية إلا إذا طلب المستخدم ذلك صراحةً.» — applies only to newly generated text; original asset text untouched.
7. Supervisor path unchanged; only verified as not broken.
8. Scope excludes: intent routing, funnel, onboarding, policy architecture, design-gen architecture, plans, memory, permissions, pricing. These are deferred to later phases.

## 3. Completed changes

| File | Change |
|---|---|
| `artifacts/api-server/src/services/ai/postlabPersona.ts` | Replaced `POSTLAB_IDENTITY` with new Nader identity (employee of PostLab, no Hamzawi, no separate creative role, execution-first behavior, honesty rails, reply-in-user-language, designer identity). |
| `artifacts/api-server/src/services/ai/postlab/rules.ts` | Rule 1 (`identity_postlab`): identity rewritten to Nader-as-employee; rationale updated. Rule 7 (`policy_intelligence`): removed "استدعِ دور نادر الإبداعي" → "نفّذ النسخة المناسبة بنفسك"; rationale updated. |
| `artifacts/api-server/src/services/ai/postlab/brain.ts` | `getDesignGenerationInstruction()`: renamed the creative block to "دور المصمم" (Nader executes designs himself, no role-switch); added **post-design conversation block** and **language-of-design-text block** (exact text below). |
| `artifacts/api-server/src/services/image-gen/brandedPost.ts` | Added language rule to the base image prompt (`[2. EXACT VISIBLE TEXT]`): newly generated text not in English unless explicitly requested; existing asset text preserved; numbers exempt. |
| `artifacts/api-server/src/services/ai/client.ts` | Dev stub now also matches `نادر` for identity detection; stub reply introduces Nader. |
| `artifacts/postlap-ai/src/components/HamzawiChat.tsx` | `thinking` ar/en → "نادر يفكر..." / "Nader is thinking..."; `welcome` ar/en introduces Nader, keeps PostLab as product. |

### 3.1 New identity literal (POSTLAB_IDENTITY)

```text
أنت نادر، الموظف المسؤول عن محادثة العملاء في منصة PostLab. تساعد العملاء في التسويق والمحتوى والإعلانات والتصميم، وتفهم هوية نشاطهم التجاري وأصولهم وتستخدمها في كل مهمة. تعمل كخبير تسويق ومصمم إبداعي يفهم هدف المستخدم وسياق المحادثة قبل التنفيذ، وليس كروبوت ينفذ الطلب حرفيًا.

قدراتك الأساسية:
- **Policy Intelligence**: فحص الإعلانات وفق سياسات Meta وTikTok قبل النشر، وتحديد المشكلات وتقديم توصيات للتصحيح.
- **Brand Intelligence**: قراءة هوية النشاط (الشعار، الألوان، معلومات النشاط) والأصول المتاحة واستخدامها تلقائيًا في كل مهمة.
- **Creative Intelligence**: تطوير المحتوى والأفكار الإبداعية والتصاميم بما يعكس هوية النشاط ويخدم هدفه التسويقي.

أسلوب العمل:
- نفّذ الطلب مباشرة عندما تكون نية المستخدم واضحة والمعلومات المتاحة كافية لتنفيذ طلب مفيد.
- إذا نقصت معلومة لا تمنع تقديم نتيجة مفيدة، قدّم أفضل نتيجة ممكنة أولًا ولا توقف التنفيذ لمجرد جمع معلومات إضافية.
- إذا كانت معلومة أساسية تمنع فهم الطلب فعلًا، اسأل سؤالًا واحدًا قصيرًا فقط.
- لا تدّعِ قدرات أو نتائج غير موجودة، ولا تخترع معلومات تجارية أو حقائق غير موجودة.
- ردّ دائمًا بلغة المستخدم.

هويتك كمصمم:
أنت نادر نفسه، المصمم في منصة PostLab — تنفّذ التصاميم مباشرة بنفسك ولا تحوّل المستخدم إلى مصمم آخر أو إنسان. إذا طلب المستخدم التحدث مع مصمم، أخبره أنك أنت المصمم.
```

### 3.2 Post-design behavior block (design instruction)

```text
بعد إكمال التصميم:
- عُد مباشرةً إلى المحادثة الطبيعية.
- لا تسأل تلقائيًا "هل أعجبك التصميم؟" ولا "هل تريد تعديلاً؟".
- لا تقترح تلقائيًا تصميمًا آخر ولا تدخل في وضع تصميم مستمر.
- انتظر رسالة المستخدم التالية وتعامل معها حسب نيتها؛ فإن طلب تعديلًا أو تصميمًا جديدًا فتعامل معه كطلب جديد واضح.
```

### 3.3 Language rule block (design instruction + image prompt)

```text
لغة النص داخل التصميم:
- عند إنشاء نص جديد داخل التصميم، لا تكتب نصًا بالإنجليزية إلا إذا طلب المستخدم ذلك صراحةً.
- تنطبق هذه القاعدة فقط على النص الجديد الذي تنشئه أنت. لا تترجم ولا تعدّل ولا تحذف النصوص الموجودة أصلًا داخل الأصول المرفقة (صور المنتجات، صور المستخدم، الأغلفة والعبوات، الشعارات). الأرقام مستثناة من قاعدة اللغة.
```

Image prompt (English mirror): "When creating NEW visible text for the design, never write it in English unless the brief explicitly requests English. This applies only to newly generated text. Do not translate, modify, or remove existing text inside original user assets (product photos, user images, packaging, logos). Numbers are exempt from the language rule."

## 4. Behavior changes

1. Assistant presents as **Nader**; product stays **PostLab**.
2. No visible "two minds" / separate creative role; Nader is the designer.
3. Execution-first behavior promoted into the persona (execute → best-effort → one question only).
4. After design completion: return to normal conversation, **no auto follow-up questions** (approved wording).
5. New design text defaults to the user's language; original asset text preserved; numbers exempt.
6. Honesty rails (no invented facts/capabilities, reply in user language) are part of the identity.

## 5. Design conversation behavior (after Phase 1)

After a `%%GENERATE_POST%%` turn the assistant returns to normal text behavior in the same reply context. No auto "هل أعجبك؟" / "هل تريد تعديلاً؟" / new-design proposal / persistent design mode. The next user message is classified per its own intent and answered accordingly (edits/new designs handled as new clear requests). Marker protocol and generation pipeline structurally unchanged.

## 6. Tests run

> Populated during Phase 1 execution; results appended below.

- [x] `pnpm --filter @workspace/api-server build` (esbuild) — **PASS**
- [x] `pnpm --filter @workspace/api-server typecheck` — **PASS for changed files** (pre-existing plan-type errors only in `auth.ts`, `owner.ts`, `ads.ts`, `brand/brain.ts`, untouched)
- [x] `pnpm --filter @workspace/postlap-ai typecheck` — **PASS**
- [x] `pnpm --filter @workspace/postlap-ai build` — **PASS** (472 kB JS, tooltip sourcemap warning pre-existing/non-fatal)
- [x] Prompt-layer assertion bundle (18 checks) — **PASS**: persona is Nader-as-employee, no حمزاوي / الشريك الذكي / نادر الإبداعي, Nader-is-the-designer block, execution-first, honesty rails, rule 1 + rule 7 updated, `دور المصمم` block + post-design behavior + language rule present in shipped bundle, old role title gone from bundle, marker intact
- [x] Dev-stub assertion bundle — **PASS**: stub detects `نادر` branch and returns the Nader reply
- [x] Live HTTP chat (real server vs Postgres) — **NOT RUN** (no local Postgres / Docker in this environment)

### Results

Prompt and stub layers verified via bundle assertions against the built `dist/index.mjs`
(esbuild output escaped as ASCII → tests decode `\uXXXX` before asserting Arabic strings).

Full end-to-end HTTP chat (identity → design marker → natural reply) needs a running
Postgres; the route handlers are unchanged, so the remaining risk is purely plumbing
documented in code. Re-run `pnpm --filter @workspace/api-server dev` + curl `/api/hamzawi/chat`
in an environment with the DB up to close this gap.

Deferred-track plan-type errors (`"pro"`/`"free"` vs union) are **pre-existing and unrelated**
to this refactor; they live in plan/status code slated for the later plan-logic phase.

## 6.1 Re-verification (resumed session)

Re-ran the verifiable suite after the previous session stopped before finishing:

- [x] `pnpm --filter @workspace/api-server build` (esbuild) — **PASS**
- [x] `pnpm --filter @workspace/api-server typecheck` — **PASS for changed files** (only pre-existing plan-type errors in `auth.ts`, `owner.ts`, `brand/brain.ts`, untouched; none in Phase 1 files)
- [x] `pnpm --filter @workspace/postlap-ai typecheck` — **PASS**
- [x] `pnpm --filter @workspace/postlap-ai build` — **PASS** (472 kB JS)
- [x] Bundle assertion (14 checks on `dist/index.mjs`) — **PASS**: Nader identity, Nader-is-the-designer, no `نادر الإبداعي`/`الشريك الذكي`, `دور المصمم` block, post-design behavior block, language rule block, Rule 1 + Rule 7 updated, image-prompt language rule, marker intact, dev-stub Nader branch.

Route handler `hamzawi.ts` (routing/Supervisor/marker pipeline) confirmed **unchanged** — no Phase 1 diff touches it.

## 7. Phase 2 — Conversation Priority & Flow (implemented)

> Status: **Implemented and verified.** Nader remains the only customer-facing identity; Hamzawi remains bound to owner/admin/supervisor technical paths.

### 7.1 Goal
Re-order conversation priority so the current user request wins over prior modes (onboarding / funnel / persistent design mode). Upsell becomes contextual only (triggered by an actual plan limitation). Onboarding can be served around and cleanly ended. Design-edit intent after a prior design is correctly classified.

### 7.2 Files changed
| File | Change |
|---|---|
| `services/ai/postlab/brain.ts` | **Removed** `getFunnelInstruction` (function + both call sites + doc comment). **Rewrote** `getOnboardingInstruction` as the single authoritative onboarding block: added (a) priority clause — serve a clear other request first, no onboarding question in the same reply; (b) explicit-end clause emitting `%%ONBOARDING_COMPLETE%%` on clear skip/end intent, with the `خلاص صمملي البوست` counterexample so a generic word does not end onboarding. |
| `services/ai/postlab/rules.ts` | Added `conversation_priority` rule (the single priority ordering). Rewrote `upsell_once` as the **only** upsell rule: contextual, once, only when the user requests an out-of-plan feature — replacing the old automatic per-turn funnel behavior. |
| `services/ai/postlab/knowledge.ts` | Fixed stale plan statements: `creative_text` runtimeNotes `3+` → `2` (PRO); `creative_image` runtimeNotes now state PRO plan requirement. No capability is promised that code does not grant. |
| `services/ai/reasoner.ts` | Context-aware `classifyIntent(message, { prevAssistantContent })`: (a) extended dialect imperative suffix (`صمملي`) and design-noun list (`الخلفية`, `الستايل`, `اللون`, …); (b) added context-aware edit resolution — a bare/pronominal edit after a prior generated design → `generate_image`, while `كابشن`/`caption` → `generate_text`; (c) extended `GENERATE_TEXT_PATTERNS` so caption/text requests classify as text. |
| `routes/hamzawi.ts` | Passes the previous assistant message content (`recentMessages` last `assistant`) into `classifyIntent` as `prevAssistantContent`. Supervisor/admin path untouched. |
| `docs/POSTLAB_CHAT_REFACTOR_PROGRESS.md` | This section. |

### 7.3 Obsolete prompt logic removed (verified, not merely disabled)
- `getFunnelInstruction` function deleted entirely — no dead/disabled funnel code remains.
- Old automatic upsell ("بعد الإجابة على أي طلب مكتمل") removed; only the unified `upsell_once` rule remains.
- Onboarding rewrite replaces the old block in place (no duplicate/stacked instruction).

### 7.4 New behavior (per scenario A–I)
- **A** (onboarding + "صمملي بوست"): priority clause → Nader executes the design, no onboarding question.
- **B** (post-design + "اكتبلي كابشن"): already covered by Phase 1 design instruction (no permanent mode).
- **C** (post-design + "ما عجبني، عدله"): context-aware classifier → `generate_image` → marker + execution.
- **D** (FREE normal question): no upsell (funnel removed).
- **E** (FREE blocked feature): validator gate returns contextual upsell (`upsell: true`) — code decides access.
- **F** ("تخطّ"): skip to next step; "تخطّ الكل/إنهاء" → `%%ONBOARDING_COMPLETE%%`.
- **G** (partial onboarding + topic change): priority clause serves the new topic.
- **H** (clarifying question after ad check): no upsell, normal reply.
- **I** (full topic switch): no permanent mode (Phase 1) + priority rule.

### 7.5 Tests run
- [x] `pnpm --filter @workspace/api-server build` (esbuild) — **PASS**
- [x] `pnpm --filter @workspace/api-server typecheck` — only pre-existing plan-type errors in `auth.ts`/`owner.ts`/`brand/brain.ts` (untouched; unrelated)
- [x] `pnpm --filter @workspace/postlap-ai typecheck` + `build` — **PASS**
- [x] Bundle assertion (19 checks on `dist/index.mjs`) — **PASS**: funnel function + text removed; `conversation_priority`, onboarding priority/end clauses, `upsell_once` contextual, knowledge PRO-level fixes present; **Phase 1 strings preserved** (Nader identity, post-design block, language rule, no `نادر الإبداعي`/`الشريك الذكي`).
- [x] Classifier unit test (9 cases, bundled from source) — **PASS**: `عدّل التصميم`, `غيّر الخلفية`, `صمملي البوست`, `عدّل الكابشن`→text, bare `عدّل` (prev design)→image, `خلاص صمملي البوست`→image, `ساعدني أكتب كابشن`→text, `ما عجبني التصميم، عدله`→image, `كيف أحسّن مبيعاتي؟`→general.
- [x] Hamzawi boundary verified at source: prompt-feeding modules (`postlab/*.ts`, `postlabPersona.ts`) contain **no** Arabic `حمزاوي` and no presented Hamzawi identity.

## 8. Remaining / Deferred — Phase 3+

- Policy Intelligence architecture.
- Design-generation architecture (provider choice, aspect ratio, token budget).
- Permissions architecture (incl. `permissionsInstruction` gated on `brand_onboarded` while `isBrandProfileComplete` keys off core data).
- Plan/knowledge cleanup الشامل — **note**: `config.ts` PRO feature copy still contains `"ذاكرة دائمة — حمزاوي يتذكر نشاطك"`; it is **not** rendered into the customer prompt (the pricing line uses only name/price/currency), so Nader stays the sole customer identity — but the leftover `حمزاوي` copy and the `hamzawi_notes` DB field name remain deferred cleanup.
- Memory architecture; AdminLayout nav label `حمزاوي`.
- Wiring `agentConfig` prompt fields (agent_name / role description / prefixes) — defined but not consumed.

## 9. Note

This file is the canonical progress tracker. Update it at the end of each phase before starting the next.