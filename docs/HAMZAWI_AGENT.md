# Hamzawi — Canonical Architecture Definition

**Status:** Beta  
**Last updated:** 2026-08-06  
**Canonical reference for:** all future development decisions about the Hamzawi agent.

---

## What Hamzawi Is

Hamzawi is the primary AI agent of PostLap AI. It is a **Multimodal AI Marketing Agent**, not a text chatbot.

Hamzawi understands and works with:

- Text messages (Arabic / English, auto-detected)
- Uploaded images (logos, product photos, ad creatives, design references)
- Brand assets (company identity, visual style, stored in the brand brain)
- Company knowledge (business name, type, address, colours, style preferences)
- Conversation history (recent turns scoped per user or session)
- Generated designs (AI-created images returned inline in chat)

This definition is authoritative. Any capability, prompt, or architectural decision that conflicts with it must be reconciled against this document, not the other way around.

---

## Principle 1 — Multimodal First

Image understanding is a **core capability**, not an optional feature.

Hamzawi must always be capable of:

- Understanding uploaded logos and brand marks
- Analysing product photos for content-policy compliance
- Reviewing advertisement creatives against Meta / TikTok policies
- Interpreting design references uploaded by the user
- Incorporating visual context (uploaded or stored) into every relevant response

**Current Beta implementation:**

- The vision model (`gpt-4o`, constant `VISION_MODEL` in `artifacts/api-server/src/routes/hamzawi.ts`) is selected whenever the intent router detects an image-related request.
- Vision routing is determined by `detectImageIntent()` in `artifacts/api-server/src/services/ai/reasoner.ts` — a pattern-based classifier that promotes the request to the vision model path.
- Brand-owned assets are loaded as base64 via `collectBrandAssets()` in `artifacts/api-server/src/services/media/assetReader.ts` and injected into the model context automatically.

**Environment requirement:** Image analysis via `gpt-4o` requires `OPENAI_API_KEY`.

---

## Principle 2 — Native Image Generation

Whenever a user's intent is to create a visual asset, Hamzawi uses the image-generation pipeline directly. Generating images is one of Hamzawi's primary responsibilities.

Covered visual-asset types include:

- Social media posts (منشور / بوست / ستوري)
- Advertisements and ad creatives
- Product banners and promotional graphics
- Branded marketing materials
- Flyers and posters

**Current Beta implementation:**

- Image generation is gated at plan level ≥ 3 (smart_fix+) on both backend and frontend.
- Hamzawi level 4+ (Content / Agency) generates images inline via the `%%GENERATE_POST%%{"description":"..."}%%END%%` marker protocol in `hamzawi.ts → buildSystemPrompt → getDesignGenerationInstruction`.
- The server parses the marker (`parseGeneratePost()`) and calls `generateBrandedPost()` from `artifacts/api-server/src/services/image-gen/brandedPost.ts`.
- The underlying model is `gemini-2.5-flash-image` accessed via GoogleGenAI, routed through `/api/image-gen`.
- Fallback: if `GEMINI_API_KEY` is absent, `NANO_BANANA_API_KEY` is tried; if both are absent, the endpoint returns 503.

**Environment requirement (Beta):** `GEMINI_API_KEY` (or `NANO_BANANA_API_KEY` as fallback) required. Without it, image generation is disabled.

---

## Principle 3 — Context-Aware Reasoning

Before composing a response, Hamzawi reasons using every available context source. Responses must never ignore project knowledge that is present and accessible.

Context sources assembled per turn by `buildChatContext()` in `artifacts/api-server/src/services/ai/contextBuilder.ts`:

| Source | Where it comes from |
|---|---|
| **User Profile** | `usersTable` — plan, name, company_id |
| **Company Profile** | `companiesTable` — business name, linked by `user.company_id` |
| **Brand Brain** | `userBrandMemoryTable` — business_name, business_type, address, phone, primary_colors, preferred_style, notes, hamzawi_notes, marketing_notes |
| **Uploaded Assets** | `collectBrandAssets()` — logos, portfolio, products, generated designs, documents, design samples; base64-encoded up to `asset_cap` (default 6, configurable via `AgentConfig`) |
| **Media Library** | Assets stored under `mediaAssetsTable`, resolved in `assetReader.ts` |
| **Active Conversation** | Recent `hamzawi_messages` rows — up to `memory_window` turns (default 10, configurable via `AgentConfig`) |
| **Previous Conversations** | Per-conversation scoping via `hamzawi_conversations.conversation_id` when supplied; falls back to full user history |

**Future (not yet implemented):** vector-search retrieval across historical content using `retrieval_config` (`top_k`, `similarity_threshold`) from `AgentConfig`. The field exists in the config schema but is not wired to any retrieval backend. It is documented here as future scope.

---

## Principle 4 — Asset Awareness

If the user has uploaded logos, product photos, advertisements, or branding material, Hamzawi treats them as part of its working memory and references them naturally without being asked.

**Current Beta implementation:**

- `collectBrandAssets()` in `assetReader.ts` resolves assets by category: `logo`, `portfolio`, `products`, `generated`, `documents`, `design_samples`.
- The resolved asset list is injected into the system prompt as a categorised inventory (`assetContext` block in `buildSystemPrompt`).
- `asset_cap` (default: 6 assets per turn) controls how many files are base64-encoded and passed to the model. Configurable via `AgentConfig.asset_cap`.
- The system prompt instructs Hamzawi to use stored assets automatically and never ask the user to re-upload assets that are already saved.
- Hamzawi explicitly names which asset it will use (e.g. "سأستخدم الشعار الذي رفعته").

---

## Principle 5 — No Fake Capabilities

Hamzawi must never pretend to generate images, analyse images, or use uploaded assets if the required tool is unavailable or fails. Trustworthiness is more important than appearing capable.

**Policy:**

- If `OPENAI_API_KEY` is missing in production, AI calls fail explicitly (no silent stub). The dev stub in `services/ai/client.ts` is only active when `NODE_ENV !== "production"` and the key is absent — it is never active in production.
- If `GEMINI_API_KEY` and `NANO_BANANA_API_KEY` are both absent, `/api/image-gen` returns 503 with a clear error — it does not synthesise a fake image URL.
- The `%%GENERATE_POST%%` marker instructs the server to attempt generation and return the result or surface the failure inline in chat.
- `evaluateToolAccess()` in `artifacts/api-server/src/services/ai/validator.ts` gates tool usage against the user's plan level and returns an explicit denial when access is not permitted.

---

## Principle 6 — Tool Selection Policy

Hamzawi selects the most appropriate capability for each user intent. The wrong tool must never be used when a better one exists.

**Intent → Tool mapping (current Beta):**

| User intent | Tool selected |
|---|---|
| Generate a marketing image / visual asset | Image Generation (`/api/image-gen` → `gemini-2.5-flash-image`) |
| Analyse an uploaded design / logo / photo | Vision model path (`gpt-4o`) via `detectImageIntent()` |
| Review an advertisement for policy compliance | Ad Check (`/api/check`) |
| Write marketing copy / ad text | Text Generation (`/api/generate-text`, `gpt-4o-mini`) |
| Recall previous work / conversation context | Conversation memory (`hamzawi_messages`, `memory_window`) |
| Reference an uploaded logo or brand asset | Asset Library (`collectBrandAssets`, `assetReader.ts`) |
| Onboard a new Content/Agency user | Onboarding mode (`getOnboardingInstruction()` in `hamzawi.ts`) |

**Implementation:**

- `classifyIntent()` in `artifacts/api-server/src/services/ai/reasoner.ts` is the entry point.
- Rule-first: deterministic regex patterns for each intent category; no per-message LLM cost for clear requests.
- LLM disambiguation (`disambiguateWithLLM()`) is invoked only for ambiguous or compound requests where multiple patterns match.
- The `ToolRegistry` in `artifacts/api-server/src/services/ai/tools/index.ts` maintains the canonical list of available tools. The registry is consulted by the LLM disambiguator so newly registered tools are automatically announced to the model.
- Tool access is validated against plan level by `evaluateToolAccess()` before execution.

---

## Principle 7 — Product Vision

Hamzawi is intended to evolve into a complete AI Marketing Assistant for the MENA market — comparable in interaction quality to modern AI assistants — with native support for:

- **Multimodal conversations** — text, images, documents, and brand assets in one thread
- **Persistent memory** — brand brain retained across sessions; per-conversation scoping for focused threads
- **Brand intelligence** — deep understanding of each business's visual identity, tone, and marketing history
- **Image understanding** — analyse any visual asset in context
- **Image generation** — produce production-ready marketing creatives on demand
- **Marketing reasoning** — policy checking, copy writing, brand alignment review

This vision guides all future feature decisions. New capabilities should extend the multimodal agent model; they should not regress Hamzawi toward a plain text chatbot.

**Future capabilities (not yet implemented in Beta):**

- Vector-search retrieval over historical conversations and uploaded documents (`retrieval_config` in `AgentConfig` — schema exists, retrieval backend not built)
- Persistent memory across all conversations (current implementation is per-conversation or per-session)
- Multi-business agency context switching for Agency plan users
- Video understanding (requires `ffmpeg` on the API host — not currently installed)

---

## Environment Requirements Summary

| Capability | Required env var | Beta status |
|---|---|---|
| AI chat (text) | `OPENAI_API_KEY` | ✅ Active (dev stub when missing in dev only) |
| Vision / image analysis | `OPENAI_API_KEY` | ✅ Active |
| Image generation | `GEMINI_API_KEY` | ✅ Active (plan level 3+, 503 if key absent) |
| Image generation fallback | `NANO_BANANA_API_KEY` | ✅ Active (fallback only) |
| Brand memory / assets | `DATABASE_URL` | ✅ Active |
| Vector search retrieval | _(future)_ | 🔮 Future — not implemented |
| Video analysis | `ffmpeg` system dep | ❌ Not installed — silently degrades |

---

## Related Files

| File | Role |
|---|---|
| `artifacts/api-server/src/routes/hamzawi.ts` | Main chat route; system prompt assembly; marker parsing |
| `artifacts/api-server/src/services/ai/contextBuilder.ts` | Per-turn context assembly (all seven context sources) |
| `artifacts/api-server/src/services/ai/reasoner.ts` | Intent classification and tool selection |
| `artifacts/api-server/src/services/media/assetReader.ts` | Brand asset resolution and base64 encoding |
| `artifacts/api-server/src/services/ai/tools/index.ts` | ToolRegistry — canonical list of available tools |
| `artifacts/api-server/src/services/ai/validator.ts` | Plan-level tool access enforcement |
| `artifacts/api-server/src/services/ai/agentConfig.ts` | `AgentConfig` interface and `DEFAULT_AGENT_CONFIG` |
| `artifacts/api-server/src/services/ai/PROMPT_STUDIO.md` | Config schema reference for developers modifying agent config |
| `artifacts/api-server/src/services/image-gen/brandedPost.ts` | Branded post image generation pipeline |
| `lib/db/src/schema/` | Database schema: users, hamzawi_messages, hamzawi_conversations, user_brand_memory |
