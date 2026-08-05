/**
 * Validator (P1) — permission matrix for tool use.
 *
 * Checks, in order: auth requirement → plan level → quota → account state
 * (is_active / subscription_expires_at). This is the single authority the
 * Reasoner/Executor consult before acting on a tool. In P1 it backs the chat
 * routing (upsell gating) only; the legacy endpoints keep their own checks
 * until the orchestrator fully takes over execution.
 */
import type { HamzawiTool, ToolAuthRequirement } from "./tools";

export type AccessDenyReason =
  | "auth"
  | "plan"
  | "quota"
  | "account"
  | "feature_disabled";

export interface ToolAccessCheck {
  allowed: boolean;
  reason?: AccessDenyReason;
  /** Human-readable guidance for the deny case (Arabic, for the reply). */
  message?: string;
  requiredLevel?: number;
}

export interface AccessPrincipal {
  user: { id: number; is_active: boolean; subscription_expires_at?: Date | string | null } | null;
  level: number;
  /** Calls already counted against the quota this cycle. */
  quotaUsed?: number;
  /** Max allowed calls per cycle for this tool (undefined = unlimited). */
  quotaLimit?: number;
  quotaRemaining?: number;
}

function hasValidSubscription(p: AccessPrincipal): boolean {
  const expiresAt = p.user?.subscription_expires_at;
  if (!expiresAt) return true;
  const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) return true;
  return exp.getTime() > Date.now();
}

export function evaluateToolAccess(
  tool: Pick<HamzawiTool, "id" | "requiredLevel" | "requireAuth">,
  principal: AccessPrincipal,
): ToolAccessCheck {
  const { user, level } = principal;

  // Auth requirement
  if (tool.requireAuth === "jwt" && !user) {
    return {
      allowed: false,
      reason: "auth",
      message: "تحتاج لتسجيل الدخول للوصول لهذه الميزة.",
      requiredLevel: tool.requiredLevel,
    };
  }

  // Plan level
  if (level < tool.requiredLevel) {
    return {
      allowed: false,
      reason: "plan",
      message: `هذه الميزة متاحة من المستوى ${tool.requiredLevel} فأعلى. ترقَّ خطتك للاستفادة منها.`,
      requiredLevel: tool.requiredLevel,
    };
  }

  // Quota (only applies to tools that declare a limit)
  const quotaRemaining = principal.quotaRemaining ?? principal.quotaLimit;
  if (quotaRemaining !== undefined && (principal.quotaUsed ?? 0) >= quotaRemaining) {
    return {
      allowed: false,
      reason: "quota",
      message: "استنفدت رصيد الاستخدام المتاح لهذه الميزة لهذه الفترة. جرّب لاحقاً أو ترقَّ.",
      requiredLevel: tool.requiredLevel,
    };
  }

  // Account state
  if (user && user.is_active === false) {
    return {
      allowed: false,
      reason: "account",
      message: "حسابك غير نشط حالياً. يرجى تفعيل اشتراكك للمتابعة.",
      requiredLevel: tool.requiredLevel,
    };
  }
  if (user && !hasValidSubscription(principal)) {
    return {
      allowed: false,
      reason: "account",
      message: "انتهى اشتراكك. جدّد اشتراكك لمواصلة استخدام هذه الميزة.",
      requiredLevel: tool.requiredLevel,
    };
  }

  return { allowed: true, requiredLevel: tool.requiredLevel };
}
