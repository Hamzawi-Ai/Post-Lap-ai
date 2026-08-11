import { planLevel, type Plan } from "@workspace/db";

/**
 * Beta access mechanism (open access without a paid subscription).
 *
 * While PostLab is in beta, every new user automatically receives plan='pro'
 * when BETA_ACCESS_ENABLED=true (the default). When the flag is off, new
 * registrations receive plan='free'.
 *
 * Toggling BETA_ACCESS_ENABLED is the only change needed to switch behavior
 * — no other code changes required.
 *
 * BETA_LEVEL matches the PRO level (2) for backward compatibility with the
 * beta_access flag that may still be set on existing user rows.
 */
export const BETA_LEVEL = 2; // PRO capability level

/** Feature toggle. Defaults to ON when the env var is absent/empty. */
export function isBetaEnabled(): boolean {
  const v = process.env.BETA_ACCESS_ENABLED;
  if (v === undefined || v === "") return true;
  return !["0", "false", "no", "off"].includes(v.trim().toLowerCase());
}

/**
 * @deprecated beta_access is no longer used to override plan level. With the
 * two-tier system, plan='pro' grants PRO access and plan='free' grants FREE
 * access. BETA_ACCESS_ENABLED only controls the plan assigned at registration
 * — it does NOT elevate runtime capability for existing users.
 */
export function hasBetaAccess(
  user: { beta_access?: boolean | null } | null | undefined,
): boolean {
  // Preserved for system-prompt injection (beta mode note in hamzawi.ts).
  // Does NOT affect capability level — use effectiveLevel() for that.
  return isBetaEnabled() && !!user?.beta_access;
}

/**
 * Capability level actually granted to this user.
 * Uses plan field only — beta_access no longer overrides plan level.
 * BETA_ACCESS_ENABLED controls the plan assigned at registration, not runtime level.
 */
export function effectiveLevel(
  user:
    | { plan?: Plan | string | null; beta_access?: boolean | null }
    | null
    | undefined,
): number {
  return planLevel(user?.plan ?? null);
}
