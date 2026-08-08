import { planLevel, type Plan } from "@workspace/db";

/**
 * Temporary Beta-access mechanism (open access without a paid subscription).
 *
 * While PostLab is in beta, every active Google user (registered plan) gets
 * full product capability — ad checks, text generation, image generation and
 * branded posts — without subscribing.
 *
 * This NEVER fakes a paid plan: the user's `plan` stays "registered" and all
 * existing usage/cost tracking (OperationalEvents, trials counters) keeps
 * running untouched. Instead it elevates the *effective capability level* used
 * by the feature gates to BETA_LEVEL.
 *
 * Disabling before commercial launch is a one flag flip (BETA_ACCESS_ENABLED=0):
 * `effectiveLevel()` falls back to the plan-based level immediately and the
 * lazy grant in the auth routes stops writing the flag.
 */
export const BETA_LEVEL = 4; // content-plan capability: text gen + image gen + branded posts

/** Feature toggle. Defaults to ON when the env var is absent/empty. */
export function isBetaEnabled(): boolean {
  const v = process.env.BETA_ACCESS_ENABLED;
  if (v === undefined || v === "") return true;
  return !["0", "false", "no", "off"].includes(v.trim().toLowerCase());
}

export function hasBetaAccess(
  user: { beta_access?: boolean | null } | null | undefined,
): boolean {
  return isBetaEnabled() && !!user?.beta_access;
}

/** Capability level actually granted to this user (beta-aware). */
export function effectiveLevel(
  user:
    | { plan?: Plan | string | null; beta_access?: boolean | null }
    | null
    | undefined,
): number {
  return hasBetaAccess(user) ? BETA_LEVEL : planLevel(user?.plan ?? null);
}
