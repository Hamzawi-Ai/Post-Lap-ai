import type { ReactNode } from "react";

export const ADMIN_TOKEN_KEY = "postlap_admin_token";

export interface PlanOption {
  label: string;
  value: string;
  plan: string;
}

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  plan: string;
  subscription_label: string | null;
  subscription_expires_at: string | null;
  gender: string | null;
  is_active: boolean;
  trials_remaining: number;
  total_checks: number;
  last_check_at: string | null;
  created_at: string;
}

export interface OwnerInsights {
  ok: boolean;
  generated_at: string;
  users: {
    total: number;
    new_today: number;
    new_7d: number;
    active: number;
    inactive: number;
    paid_subscribers: number;
    expiring_7d: number;
    expired: number;
    brand_onboarded: number;
    by_plan: Record<string, number>;
    expiring_list: Array<{ email: string; plan: string; expires_at: string | null }>;
  };
  checks: {
    total: number;
    today: number;
    last_7d: number;
    approved: number;
    rejected: number;
    guest: number;
    avg_score: number | null;
  };
  conversations: { total: number; archived: number; today: number; last_7d: number };
  messages: {
    total: number;
    today: number;
    last_7d: number;
    user_messages: number;
    assistant_messages: number;
    guest: number;
    with_images: number;
  };
  media: { total: number; by_category: Record<string, number> };
  problems: Array<{ severity: "high" | "medium" | "low"; text: string }>;
}

// Fallback until /api/config loads — single source of truth is config.json.
export const DEFAULT_PLAN_OPTIONS: PlanOption[] = [
  { label: "احترافي (PRO) — 400 د.ل", value: "pro", plan: "pro" },
];

export const DURATION_OPTIONS = [
  { label: "30 يوماً", days: 30 },
  { label: "90 يوماً", days: 90 },
  { label: "سنة كاملة", days: 365 },
  { label: "مدى الحياة", days: 99999 },
];

export const PLAN_LABEL: Record<string, string> = {
  free: "مجاني (FREE)",
  pro: "احترافي (PRO)",
};

export const PAID_PLANS = ["pro"];

// Full plan list used by the quick plan-change controls.
export const ALL_PLAN_OPTIONS = [
  { label: "احترافي (PRO)", value: "pro" },
  { label: "مجاني (FREE)", value: "free" },
];

export const PLAN_COLORS: Record<string, string> = {
  free: "text-muted-foreground border-border",
  pro: "text-primary border-primary/50",
};

export function expiryBadge(expiresAt: string | null): ReactNode {
  if (!expiresAt) return null;
  const d = new Date(expiresAt);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days > 36500) return <span className="text-xs text-purple-400 border border-purple-400/30 px-2 py-0.5 rounded-full">مدى الحياة</span>;
  if (days < 0) return <span className="text-xs text-red-400 border border-red-400/30 px-2 py-0.5 rounded-full">منتهي</span>;
  if (days <= 7) return <span className="text-xs text-yellow-400 border border-yellow-400/30 px-2 py-0.5 rounded-full">{days} يوم</span>;
  return <span className="text-xs text-green-400 border border-green-400/30 px-2 py-0.5 rounded-full">{days} يوم</span>;
}
