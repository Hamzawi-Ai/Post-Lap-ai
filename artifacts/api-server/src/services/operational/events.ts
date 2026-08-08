/**
 * PostLab Operational Intelligence — event recorder.
 *
 * Records safe, non-sensitive operational facts into operational_events.
 * This is observation only — recording NEVER throws and NEVER changes product
 * behavior (checks, gating, subscriptions, limits are untouched).
 *
 * Privacy guarantees enforced here:
 *   - Never stores prompts, image contents, AI responses, API keys, or secrets.
 *   - metadata is sanitized before insert (sensitive keys / large payloads dropped).
 *   - Token usage (input/output) is stored only as integers, never as text.
 *
 * Event types correspond to real implemented capabilities:
 *   policy_check                — ad inspection (/api/check) completed
 *   text_generation             — an LLM text/vision completion (success or failure)
 *   image_generation            — image generation succeeded
 *   image_generation_failure    — image generation failed
 *   provider_error              — a provider returned/errored (reliability signal)
 */
import { db, operationalEventsTable } from "@workspace/db";
import { logger } from "../../lib/logger";
import { estimateTokenCost, estimateImageCost } from "./pricing";

export type OperationalEventType =
  | "policy_check"
  | "text_generation"
  | "image_generation"
  | "image_generation_failure"
  | "provider_error";

export interface RecordEventInput {
  eventType: OperationalEventType;
  userId?: number | null;
  companyId?: number | null;
  provider?: string | null;
  model?: string | null;
  success?: boolean | null;
  quantity?: number;
  /** Input/output tokens from the provider response when available. */
  inputTokens?: number | null;
  outputTokens?: number | null;
  /** Explicit override for estimated cost (e.g. from a provider that reports exact usage). */
  estimatedCost?: number | null;
  /** Safe, non-sensitive metadata — sanitized before insert. */
  metadata?: Record<string, unknown>;
}

// Keys never allowed in stored metadata.
const SENSITIVE_KEYS = new RegExp(
  /prompt|content|message|text|data|base64|secret|token|key|api[_-]?key|password|image|body|reply/i,
);

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    // Drop anything that looks like a payload (base64 / long text).
    if (value.length > 200) return "[truncated]";
    if (/^[A-Za-z0-9+/]{40,}={0,2}$/.test(value)) return "[opaque]";
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return value;
  }
  return "[filtered]";
}

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, unknown> | null {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEYS.test(key)) continue;
    out[key] = sanitizeValue(value);
  }
  return Object.keys(out).length > 0 ? out : null;
}

export class OperationalEvents {
  /**
   * Record one operational event. Never throws — failures are logged and
   * swallowed so instrumentation can never break a product flow.
   */
  static async record(input: RecordEventInput): Promise<void> {
    let estimatedCost: number | null = null;

    if (input.eventType === "text_generation") {
      estimatedCost = estimateTokenCost(
        input.provider,
        input.model,
        input.inputTokens,
        input.outputTokens,
      );
    } else if (input.eventType === "image_generation") {
      estimatedCost = estimateImageCost(
        input.provider,
        input.model,
        input.quantity ?? 1,
      );
    }

    const cost = estimatedCost ?? input.estimatedCost ?? null;

    try {
      await db.insert(operationalEventsTable).values({
        user_id: input.userId ?? null,
        company_id: input.companyId ?? null,
        event_type: input.eventType,
        provider: input.provider ?? null,
        model: input.model ?? null,
        success: input.success ?? null,
        quantity: input.quantity ?? 1,
        estimated_cost: cost,
        metadata: sanitizeMetadata(input.metadata),
      });
    } catch (err) {
      // Recording must never break the product flow.
      logger.error({ err, eventType: input.eventType }, "Operational event recording failed");
    }
  }
}
