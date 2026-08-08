/**
 * AgentConfigService — loads the global Hamzawi agent configuration from
 * the `hamzawi_agent_config` table with a 60 s in-process cache.
 *
 * When no config row exists (e.g. before the Studio UI is used), the service
 * falls back to DEFAULT_AGENT_CONFIG, which exactly matches today's hardcoded
 * values. This keeps existing behaviour byte-for-byte identical.
 *
 * Only two fields are currently wired into the hot path:
 *   - memory_window  → contextBuilder.ts (history LIMIT)
 *   - asset_cap      → contextBuilder.ts (brand image cap)
 *
 * All other fields are defined here and marked with TODO comments in the files
 * that will consume them during the post-beta Prompt Studio integration pass.
 */
import { db, hamzawiAgentConfigTable } from "@workspace/db";
import { desc } from "drizzle-orm";

// ── Typed config interface ────────────────────────────────────────────────────

export interface AgentConfig {
  /** Display name of the agent (currently hardcoded as "حمزاوي"). */
  agent_name: string;
  /** One-line role description injected at the top of the system prompt. */
  agent_role_description: string;
  /**
   * Optional freeform text prepended to the generated system prompt.
   * Empty string means "no prefix" (default).
   */
  system_prompt_prefix: string;
  /** Additional personality/tone notes appended to the identity block. */
  personality_notes: string;
  /** Ordered list of extra instruction strings added to the behavior section. */
  behavior_rules: string[];
  /**
   * Knowledge source priority map.
   * Keys are source identifiers (e.g. "brand_memory", "uploaded_assets"),
   * values are numeric weights for retrieval ordering.
   */
  knowledge_priorities: Record<string, number>;
  /**
   * Per-tool policy overrides.
   * Keys are tool IDs from the ToolRegistry.
   * Values control enablement and level gating per tool.
   */
  tool_policies: Record<
    string,
    { enabled: boolean; required_level: number; notes?: string }
  >;
  /**
   * Number of recent conversation messages passed to the model per turn.
   * Currently wired: contextBuilder.ts replaces the hardcoded LIMIT 10.
   */
  memory_window: number;
  /**
   * Maximum number of brand asset images resolved to base64 per turn.
   * Currently wired: assetReader.ts replaces the hardcoded cap of 6.
   */
  asset_cap: number;
  /** Ordered list of safety/content rules enforced in the system prompt. */
  safety_rules: string[];
  /** Retrieval tuning parameters for future vector-search integration. */
  retrieval_config: {
    top_k: number;
    similarity_threshold: number;
  };
}

// ── Default config (matches all current hardcoded values exactly) ─────────────

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  // Identity — mirrors the hardcoded identity strings in buildSystemPrompt()
  // TODO(prompt-studio): consume AgentConfig — agent_name, agent_role_description
  agent_name: "PostLab AI",
  agent_role_description:
    "مساعد تسويقي ذكي مصمم لمساعدة الأنشطة التجارية العربية والليبية على إنشاء إعلانات متوافقة وفعّالة عبر Policy Intelligence وBrand Intelligence وCreative Intelligence.",
  system_prompt_prefix: "",
  personality_notes: "",
  behavior_rules: [],
  knowledge_priorities: {},
  tool_policies: {},
  // ✅ Wired: contextBuilder.ts history LIMIT
  memory_window: 10,
  // ✅ Wired: assetReader.ts base64 image cap
  asset_cap: 6,
  safety_rules: [],
  retrieval_config: {
    top_k: 5,
    similarity_threshold: 0.7,
  },
};

// ── 60 s in-process cache ────────────────────────────────────────────────────

interface CacheEntry {
  config: AgentConfig;
  expiresAt: number;
}

let _cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60_000;

// ── DB → AgentConfig mapper ──────────────────────────────────────────────────

function rowToConfig(row: {
  agent_name: string | null;
  agent_role_description: string | null;
  system_prompt_prefix: string | null;
  personality_notes: string | null;
  behavior_rules: unknown;
  knowledge_priorities: unknown;
  tool_policies: unknown;
  memory_window: number;
  asset_cap: number;
  safety_rules: unknown;
  retrieval_config: unknown;
}): AgentConfig {
  const d = DEFAULT_AGENT_CONFIG;

  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

  const asRecord = <V>(v: unknown): Record<string, V> =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, V>)
      : {};

  const retrieval = asRecord<unknown>(row.retrieval_config);
  const top_k =
    typeof retrieval.top_k === "number" ? retrieval.top_k : d.retrieval_config.top_k;
  const similarity_threshold =
    typeof retrieval.similarity_threshold === "number"
      ? retrieval.similarity_threshold
      : d.retrieval_config.similarity_threshold;

  return {
    agent_name: row.agent_name ?? d.agent_name,
    agent_role_description: row.agent_role_description ?? d.agent_role_description,
    system_prompt_prefix: row.system_prompt_prefix ?? d.system_prompt_prefix,
    personality_notes: row.personality_notes ?? d.personality_notes,
    behavior_rules: asStringArray(row.behavior_rules),
    knowledge_priorities: asRecord<number>(row.knowledge_priorities),
    tool_policies: asRecord<{
      enabled: boolean;
      required_level: number;
      notes?: string;
    }>(row.tool_policies),
    memory_window: row.memory_window,
    asset_cap: row.asset_cap,
    safety_rules: asStringArray(row.safety_rules),
    retrieval_config: { top_k, similarity_threshold },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load the global agent config with a 60 s in-process cache.
 * Returns DEFAULT_AGENT_CONFIG when no row exists in the DB.
 * Never throws — falls back to DEFAULT_AGENT_CONFIG on any DB error.
 */
export async function getAgentConfig(): Promise<AgentConfig> {
  const now = Date.now();
  if (_cache && now < _cache.expiresAt) {
    return _cache.config;
  }

  try {
    const rows = await db
      .select()
      .from(hamzawiAgentConfigTable)
      .orderBy(desc(hamzawiAgentConfigTable.id))
      .limit(1);

    const config = rows.length > 0 ? rowToConfig(rows[0]) : DEFAULT_AGENT_CONFIG;
    _cache = { config, expiresAt: now + CACHE_TTL_MS };
    return config;
  } catch {
    // DB unavailable — return defaults so the chat path never breaks.
    return DEFAULT_AGENT_CONFIG;
  }
}

/** Bust the cache (useful after a Studio write; not exposed via HTTP in this phase). */
export function invalidateAgentConfigCache(): void {
  _cache = null;
}
