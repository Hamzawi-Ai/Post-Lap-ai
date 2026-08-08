/**
 * PostLab Operational Intelligence — centralized pricing registry.
 *
 * This registry holds ESTIMATED list prices used ONLY to compute approximate
 * AI costs for operational visibility. These are configurable estimates — they
 * are NEVER the provider's actual invoice. When provider pricing changes,
 * update the entries here in one place.
 *
 * Rules enforced by consumers (see costs.ts):
 *   - Unknown provider/model  → estimated cost is null ("cost unavailable").
 *   - Token pricing applies to text/vision completions (input+output tokens).
 *   - Per-image pricing applies to image generation, multiplied by quantity.
 *
 * No secrets live here — only public list prices (estimates).
 */

export interface ModelPricing {
  provider: string;
  model: string;
  /** Approximate USD per 1,000,000 input tokens. Null when not token-based. */
  inputPerMillion?: number | null;
  /** Approximate USD per 1,000,000 output tokens. Null when not token-based. */
  outputPerMillion?: number | null;
  /** Approximate USD per generated image. Null when unknown. */
  perImage?: number | null;
  note?: string;
}

/**
 * Estimated list prices — treat as estimates, update when provider pricing
 * changes. Values are USD.
 */
export const PRICING_REGISTRY: ModelPricing[] = [
  {
    provider: "openai",
    model: "gpt-4o",
    inputPerMillion: 2.5,
    outputPerMillion: 10.0,
    note: "Vision + text; input tokens include image tokens reported by OpenAI usage.",
  },
  {
    provider: "openai",
    model: "gpt-4o-mini",
    inputPerMillion: 0.15,
    outputPerMillion: 0.6,
  },
  {
    provider: "gemini",
    model: "gemini-2.5-flash-image",
    perImage: 0.039,
    note: "Per generated image estimate (Gemini 2.5 Flash Image).",
  },
  {
    provider: "openai",
    model: "gpt-image-1",
    perImage: 0.04,
    note: "Per generated image estimate (gpt-image-1, medium quality, 1024×1024).",
  },
  {
    provider: "openai",
    model: "gpt-image-1-mini",
    perImage: 0.02,
    note: "Per generated image estimate (gpt-image-1-mini, medium quality, 1024×1024). Cost-optimised Beta model.",
  },
];

/** Look up configured pricing for a provider/model pair. */
export function getModelPricing(
  provider: string | null | undefined,
  model: string | null | undefined,
): ModelPricing | null {
  if (!provider || !model) return null;
  const p = provider.trim().toLowerCase();
  const m = model.trim().toLowerCase();
  return (
    PRICING_REGISTRY.find(
      (entry) => entry.provider.toLowerCase() === p && entry.model.toLowerCase() === m,
    ) ?? null
  );
}

/**
 * Estimate the cost of a token-based completion.
 * Returns null when token counts are unavailable or pricing is unknown —
 * a cost is NEVER invented.
 */
export function estimateTokenCost(
  provider: string | null | undefined,
  model: string | null | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number | null {
  if (
    inputTokens == null ||
    outputTokens == null ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    return null;
  }
  const pricing = getModelPricing(provider, model);
  if (!pricing || pricing.inputPerMillion == null || pricing.outputPerMillion == null) {
    return null;
  }
  const cost =
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion;
  return Number(cost.toFixed(6));
}

/**
 * Estimate the cost of image generation.
 * Returns null when the per-image price is unknown — never invented.
 */
export function estimateImageCost(
  provider: string | null | undefined,
  model: string | null | undefined,
  quantity: number,
): number | null {
  if (!Number.isFinite(quantity) || quantity < 0) return null;
  const pricing = getModelPricing(provider, model);
  if (!pricing || pricing.perImage == null) return null;
  return Number((pricing.perImage * quantity).toFixed(6));
}
