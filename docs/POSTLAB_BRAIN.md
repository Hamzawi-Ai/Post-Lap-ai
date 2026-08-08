# PostLab Brain — Architectural Definition

**Status:** Implemented (2026-08-08)
**Canonical reference for:** how PostLab AI's product intelligence is separated from customer memory, conversation context, and code-enforced rules.

This document describes the **actual** architecture as implemented in the codebase. It is not a roadmap. If a layer described here is not present in code, this document must not claim it.

---

## 1. What PostLab Brain is

PostLab Brain is the **permanent product-intelligence layer** of the PostLab AI platform. It is the stable, product-level definition of:

- **Persona** — who PostLab AI is and how it presents itself.
- **Product Knowledge** — what the product actually does (capabilities, verified against code).
- **Product Rules** — how the AI must behave as the product.
- **Context Assembly** — how the above are orchestrated with authorized customer context into one system prompt.

It is a **coherent architecture that assembles the correct sources of truth for the current task** — the "Unified Brain". It is NOT one giant memory and NOT one giant prompt.

### Where it lives

```
artifacts/api-server/src/services/ai/postlab/
├── persona.ts      → re-exports the ONE authoritative identity (POSTLAB_IDENTITY)
├── knowledge.ts    → PRODUCT_KNOWLEDGE (capabilities + status) + renderProductKnowledge()
├── rules.ts        → PRODUCT_RULES (categorized product rules) + renderProductRules()
├── brain.ts        → composeSystemPrompt(): orchestration of all layers
└── index.ts        → public barrel
```

---

## 2. What PostLab Brain is NOT

- **NOT** a user/company/conversation memory — no customer data is stored in or by the Brain.
- **NOT** a database of customer information.
- **NOT** a single huge uncontrolled system prompt — it is a small set of focused, typed modules.
- **NOT** a replacement for authorization — it never enforces security.
- **NOT** a new agent framework, Prompt Studio, CMS, vector DB, permissions framework, or AI provider.

---

## 3. Persona (Layer 1)

- **File:** `services/ai/postlab/persona.ts` → re-exports `POSTLAB_IDENTITY` from `services/ai/postlabPersona.ts` (Task #42).
- **Rule:** there is exactly **ONE** authoritative PostLab identity. `postlabPersona.ts` is the source; `postlab/persona.ts` only re-exports it. Editing the persona means editing `postlabPersona.ts`.
- The persona defines who PostLab AI is, its role/mission, tone, and the capabilities it is allowed to describe of itself. It does not contain the full product-knowledge inventory.

## 4. Product Knowledge (Layer 2)

- **File:** `services/ai/postlab/knowledge.ts` → `PRODUCT_KNOWLEDGE` + `renderProductKnowledge()`.
- Each capability is tagged with a runtime status:
  - **A** — Implemented and operational (verified in code).
  - **B** — Architecturally present, runtime availability NOT confirmed (provider/env-dependent, must not be promised).
  - **C** — Planned / future (documented intent, not built).
  - **D** — Not implemented.
- Currently documented (status from code):
  - Policy Intelligence (ad checking) — **A**
  - Brand Intelligence (brand identity memory) — **A**
  - Asset Library (media uploads) — **A**
  - Creative Intelligence — text generation — **A**
  - Creative Intelligence — image/design generation — **B** (pipeline exists; provider availability unconfirmed until Task #43 is validated)
  - Conversation memory — **A**
  - Video analysis — **D** (ffmpeg not installed)
  - Vector search retrieval — **C**
  - Publishing / scheduling / analytics — **D**
- **Image generation is deliberately NOT represented as a guaranteed operational capability** until Task #43 is validated. The AI is told not to promise image generation when unavailable.

## 5. Product Rules (Layer 3)

- **File:** `services/ai/postlab/rules.ts` → `PRODUCT_RULES` + `renderProductRules()`.
- Rules are extracted from the existing system prompt **after classification**: only true, global, product-level behaviour is promoted. Context-specific instructions (onboarding steps, design-marker protocol, permissions, funnel copy) intentionally remain in `brain.ts`, not here.
- Categories currently present:
  - **identity** — always operate as PostLab AI inside PostLab; never claim to be Hamzawi; language; directness; domain focus.
  - **product_truthfulness** — no fake capabilities; never claim an action completed unless the system did it; don't promise image generation if unavailable.
  - **customer_isolation** — never use another company's memory; never expose customer data outside its authorized scope.
  - **brand_context** — use the current company's saved data automatically; don't ask to re-upload saved assets.
  - **policy_intelligence** — derive policy conclusions from the check report, not invention.
  - **creative_behavior** — use available creative capabilities; upsell once without pressure.
  - **uncertainty** — say so / ask one clarifying question instead of fabricating.

## 6. Context Assembly (Orchestration)

- **File:** `services/ai/postlab/brain.ts` → `composeSystemPrompt(plan, memory, isOnboarding, assetContext, userName, companyName)`.
- Signature is identical to the former `buildSystemPrompt()` in the chat route, so the route call site is unchanged.
- It composes, in order:
  1. **PostLab Brain** — persona + product knowledge + product rules (global, stable).
  2. **Identity header** — current user / company names (authorized context).
  3. **Plan/capability context** — per-user level text (from `planLevel()`).
  4. **Company/Brand Memory + asset inventory** — via `buildBrandMemoryBlock()` and `assetContext` (authorized customer data).
  5. **Context-specific instructions** — pricing line, funnel, onboarding, design generation, permissions.
- `brain.ts` performs **no database access**. Data retrieval stays in `contextBuilder.ts`; the Brain assembles and organizes already-authorized context.

## 7. Company / Brand Memory boundary

- **Source of truth:** `userBrandMemoryTable` (per user, unique `user_id`), `companiesTable` via `user.company_id`, media via `mediaAssetsTable`.
- **Assembly:** `contextBuilder.ts` → `buildChatContext()` fetches memory, company, recent messages, and brand assets per authorized user/session.
- **Injection into the prompt:** `buildBrandMemoryBlock()` (in `services/brand/brain.ts`), called from `composeSystemPrompt()`.
- **Boundary:** Brand Memory is **customer-specific** and is injected ONLY for the current authorized account. The PostLab Brain never stores customer data, and customer memory never modifies the Brain. This design is intentionally unchanged in this task.

## 8. Conversation context boundary

- **Source of truth:** `hamzawi_messages` / `hamzawi_conversations`, scoped per user / session / conversation.
- **Assembly:** `contextBuilder.ts` (`memory_window` recent rows) → history re-expansion in the chat route.
- **Boundary:** conversation context is short-term interaction context, assembled per turn. It is NOT persisted into the Brain. No new conversation→Brain persistence mechanism was added in this task.

## 9. Runtime / code-enforced rules

The following remain enforced **by code, never by prompt** (unchanged by this task):

- Authentication (JWT) and guest session HMAC cookies.
- Authorization / account ownership (`getUserFromToken`, conversation ownership checks).
- Plan/level gating (`validator.ts` → `evaluateToolAccess`, per-endpoint level checks).
- Account state (`is_active`, subscription expiry).
- Rate limits (`express-rate-limit`).
- Upload / storage permissions, path-traversal guards, MIME filters.
- Secrets handling (`lib/secrets.ts`).
- Protected routes (admin/owner).

The Brain may **describe** how the AI should behave around these capabilities, but it is never the enforcement mechanism.

## 10. Hamzawi's supervisory relationship to PostLab Brain

- **Current state:** Hamzawi is the underlying AI/supervisory **infrastructure**: the route (`/api/hamzawi/chat`), session/auth plumbing, `hamzawi_*` tables, the AI client, the Reasoner, the ToolRegistry, and the chat history. PostLab Brain is the product intelligence that runs on top of it. The route delegates prompt assembly to the Brain via `composeSystemPrompt()`.
- **Relationship to document (not implemented, by design):** Hamzawi may, in the future, have authorized supervisory access to inspect / monitor / guide / maintain PostLab-level instructions.
- **Correct extension point (do not build speculative permissions):** the existing `hamzawi_agent_config` table + `AgentConfigService` (`services/ai/agentConfig.ts`) is the natural surface for maintaining agent-level configuration. A future, explicitly authorized supervisory mechanism would operate through that surface — no new permission framework was added here.

## 11. Future extension points

- **Add a capability:** edit `PRODUCT_KNOWLEDGE.capabilities` in `knowledge.ts` and set the correct status (A/B/C/D).
- **Add a global rule:** append a `ProductRule` in `PRODUCT_RULES` in `rules.ts`.
- **Add a context-specific instruction** (funnel/onboarding/design/permissions-style): add it to the composition in `brain.ts`, scoped to the relevant mode/level.
- **Wire Prompt Studio fields:** `agentConfig.ts` fields (`behavior_rules`, `safety_rules`, `system_prompt_prefix`, `personality_notes`) remain unwired TODOs; wiring them is a separate, explicitly-scoped task, not part of the Brain.
- **Supervisory control of the Brain:** extend via `hamzawi_agent_config` when an explicitly authorized mechanism is approved.

## 12. Where future PostLab product rules should be added

In `services/ai/postlab/rules.ts` (`PRODUCT_RULES`), **only if** the rule is global, product-level behaviour. If the rule is tied to a specific mode (onboarding, brand-setup permissions), a plan level, or an implementation marker, it belongs in `brain.ts` (or the chat route) instead — keeping the Brain free of context-specific noise.

## 13. Where customer-specific memory should NOT be added

- **Not** in `POSTLAB_KNOWLEDGE`, `PRODUCT_RULES`, or the persona.
- **Not** in a shared/unified table that combines all companies.
- Customer-specific information belongs in the existing customer-memory system: `userBrandMemoryTable`, `companiesTable`, `mediaAssetsTable`, and per-user/per-conversation `hamzawi_messages`. The Brain consumes it as **authorized context only**.

---

## Layer model (conceptual)

```
HAMZAWI  (AI / supervisory infrastructure)
   │  authorized supervisory access (future, via hamzawi_agent_config)
   ▼
POSTLAB BRAIN  (global product intelligence: persona + knowledge + rules)
   │
   ▼
POSTLAB AI  (product-facing assistant)
   ▲  │
   │  │  authorized customer context
   │  ▼
   COMPANY / BRAND MEMORY  +  CONVERSATION CONTEXT  +  ACCOUNT/PLAN CONTEXT
   │
   ▼
RUNTIME ENFORCEMENT (code: auth, plan, ownership, rate limits) — never the prompt

=  POSTLAB AI RESPONSE
```

---

## Related files

| File | Role |
|---|---|
| `artifacts/api-server/src/services/ai/postlab/brain.ts` | Orchestration (`composeSystemPrompt`) |
| `artifacts/api-server/src/services/ai/postlab/knowledge.ts` | Product knowledge (capabilities + status) |
| `artifacts/api-server/src/services/ai/postlab/rules.ts` | Product rules |
| `artifacts/api-server/src/services/ai/postlab/persona.ts` | Re-export of the authoritative persona |
| `artifacts/api-server/src/services/ai/postlabPersona.ts` | **The** authoritative PostLab identity (Task #42) |
| `artifacts/api-server/src/routes/hamzawi.ts` | Chat route — delegates to the Brain; owns markers/session/history |
| `artifacts/api-server/src/services/ai/contextBuilder.ts` | Customer/conversation context retrieval (unchanged) |
| `artifacts/api-server/src/services/brand/brain.ts` | Brand memory helpers (unchanged) |
| `docs/HAMZAWI_AGENT.md` | Hamzawi infrastructure definition |
