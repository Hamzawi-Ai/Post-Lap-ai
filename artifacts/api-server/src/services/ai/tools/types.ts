/**
 * Tool contracts for the Hamzawi orchestrator.
 *
 * Beta scope: these types describe Hamzawi's *capabilities* (consumed by the
 * Reasoner so it knows what Hamzawi can do). Tool *execution* wiring arrives
 * later, when the frontend flows migrate into the orchestrator — by design no
 * execute() implementation exists yet.
 *
 * Kept dependency-free: the input validator is a minimal structural shape so
 * this module does not need to import zod directly.
 */

export type ToolAuthRequirement = "none" | "jwt";

/** Minimal structural shape of a parameter validator (deliberately not zod). */
export interface ToolInputValidator {
  safeParse(value: unknown): {
    success: boolean;
    data?: unknown;
    error?: { message?: string };
  };
}

export interface ToolContext {
  userId: number | null;
  sessionId: string;
  plan: string;
  level: number;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface HamzawiTool {
  id: string;
  description: string;
  requiredLevel: number;
  requireAuth: ToolAuthRequirement;
  inputValidator?: ToolInputValidator;
  enabled(): boolean;
  /** Not wired yet in the beta — flows still run on their original endpoints. */
  execute?(ctx: ToolContext, params: unknown): Promise<ToolResult>;
}
