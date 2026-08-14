# Prompt Studio — Backend Handoff Document

## Agent Philosophy

Hamzawi is a **Multimodal AI Marketing Agent** — not a text chatbot. Before
modifying any prompt config field, read `docs/HAMZAWI_AGENT.md` for the
governing definition.

The seven architectural principles that must be preserved across all prompt
changes:

1. **Multimodal First** — image understanding is a core capability, always on.
2. **Native Image Generation** — visual-asset creation is a primary responsibility.
3. **Context-Aware Reasoning** — every turn loads all seven context sources
   (User Profile, Company Profile, Brand Brain, Uploaded Assets, Media Library,
   Active Conversation, Previous Conversations) via `contextBuilder.ts`.
4. **Asset Awareness** — stored logos, products, and design references are part
   of working memory; Hamzawi references them automatically.
5. **No Fake Capabilities** — if a tool is unavailable, report the failure
   explicitly; never fabricate results.
6. **Tool Selection Policy** — the correct tool for the user's intent is always
   chosen; the ToolRegistry in `tools/index.ts` is the canonical list.
7. **Product Vision** — Hamzawi evolves toward a complete AI Marketing Assistant;
   every config change should deepen multimodal capability, not reduce it.

This document describes the `hamzawi_agent_config` schema, which fields are
already wired into the hot path, and where the remaining TODO wiring points are
for the post-beta integration pass.

---

## Config shape (`AgentConfig` interface)

Defined in `agentConfig.ts`. The canonical type and `DEFAULT_AGENT_CONFIG` live
there; the DB table mirrors this shape.

| Field | Type | Default | Description |
|---|---|---|---|
| `agent_name` | `string` | `"PostLab AI"` | Display name of the agent |
| `agent_role_description` | `string` | (see default) | One-line role injected at top of system prompt |
| `system_prompt_prefix` | `string` | `""` | Freeform text prepended to the generated system prompt |
| `personality_notes` | `string` | `""` | Extra tone/personality instructions |
| `behavior_rules` | `string[]` | `[]` | Ordered extra instruction strings for the behavior section |
| `knowledge_priorities` | `Record<string, number>` | `{}` | Source → priority weight for retrieval ordering |
| `tool_policies` | `Record<string, {enabled, required_level, notes?}>` | `{}` | Per-tool overrides for ToolRegistry registrations |
| `memory_window` | `number` | **10** | Recent messages passed to the model per turn ✅ **wired** |
| `asset_cap` | `number` | **6** | Max brand images resolved to base64 per turn ✅ **wired** |
| `safety_rules` | `string[]` | `[]` | Forbidden topic/content rules |
| `retrieval_config` | `{top_k, similarity_threshold}` | `{5, 0.7}` | Retrieval tuning for future vector-search |

---

## Already wired (this task)

### `memory_window` → `contextBuilder.ts`

```ts
// Before (hardcoded):
.limit(10)

// After (config-driven):
const agentConfig = await getAgentConfig();
.limit(agentConfig.memory_window)
```

### `asset_cap` → `assetReader.ts` (via `contextBuilder.ts`)

```ts
// Before (hardcoded in assetReader.ts):
const cap = 6;

// After (passed from contextBuilder.ts):
const agentConfig = await getAgentConfig();
const brandAssets = await collectBrandAssets({ ..., cap: agentConfig.asset_cap });
```

`collectBrandAssets` now accepts an optional `cap` parameter (defaults to `6`
when omitted, so all other call sites are unaffected).

---

## Remaining TODO wiring points (post-beta integration pass)

Search for `// TODO(prompt-studio):` across the codebase to find all locations.
Current list:

### `artifacts/api-server/src/routes/hamzawi.ts`

| Location | Field(s) |
|---|---|
| `VISION_MODEL = "gpt-4o"` | `vision_model` (future) |
| `TEXT_MODEL = "gpt-4o-mini"` | `text_model` (future) |
| `buildSystemPrompt()` body | `system_prompt_prefix`, `agent_name`, `agent_role_description`, `personality_notes`, `behavior_rules`, `safety_rules` |
| `getFunnelInstruction()` | removed in Phase 2 — funnel copy is no longer injected into the prompt |
| `getOnboardingInstruction()` | `behavior_rules` (onboarding steps override) |
| `getPermissionsInstruction()` | `behavior_rules` (permissions block override) |

### `artifacts/api-server/src/services/ai/reasoner.ts`

| Location | Field(s) |
|---|---|
| `TEXT_MODEL = "gpt-4o-mini"` | `text_model` (future, disambiguation model) |
| `disambiguateWithLLM` prompt | `agent_name`, `agent_role_description` |

### `artifacts/api-server/src/services/ai/tools/index.ts`

| Location | Field(s) |
|---|---|
| Each `toolRegistry.register(...)` call | `tool_policies[toolId].enabled`, `tool_policies[toolId].required_level` |

---

## DB migration

`lib/db/migrations/add_hamzawi_agent_config.sql`

Single-row design — only one row is ever read (the one with the highest `id`).
The table is intentionally empty after migration; `AgentConfigService` falls back
to `DEFAULT_AGENT_CONFIG` until the Studio UI writes a row.

---

## Caching

`getAgentConfig()` in `agentConfig.ts` caches the result for **60 seconds** in
process memory. Call `invalidateAgentConfigCache()` after a Studio write to
immediately reflect changes in the next request.

---

## Single source of truth

`DEFAULT_AGENT_CONFIG` in `agentConfig.ts` is the canonical reference for all
default values. When adding new config fields:
1. Add the column to `lib/db/src/schema/hamzawi.ts`
2. Add the field to `AgentConfig` interface in `agentConfig.ts`
3. Add the default value to `DEFAULT_AGENT_CONFIG`
4. Add the mapping in `rowToConfig()`
5. Wire the field where needed and remove its `TODO(prompt-studio)` comment
6. Document the new field in this file
