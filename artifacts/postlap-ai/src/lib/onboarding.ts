// ── First-time brand onboarding helpers ─────────────────────────────────────

// Post-onboarding destination.
// Currently the homepage (embedded Hamzawi in the hero) — change to a dedicated
// Hamzawi AI page route later (e.g. "/chat") WITHOUT touching page logic.
export const POST_ONBOARDING_REDIRECT = "/";

export interface BrandProfileData {
  business_name?: string | null;
  business_type?: string | null;
  address?: string | null;
  phone?: string | null;
  notes?: string | null;
  logo_url?: string | null;
  primary_colors?: string | null;
  preferred_style?: string | null;
  hamzawi_notes?: string | null;
  marketing_notes?: string | null;
  design_samples?: string | null;
  brand_onboarded?: boolean;
}

// Core fields required for onboarding to be considered complete.
// Mirrors the backend `hasCoreBrandData` in services/brand/brain.ts
export function hasCoreBrandData(memory: BrandProfileData | null | undefined): boolean {
  if (!memory) return false;
  return Boolean(memory.business_name?.trim() && memory.business_type?.trim());
}

// Complete = onboarded flag OR core data present — a lost flag during migration
// never forces re-onboarding. Mirrors backend `isBrandProfileComplete`.
export function isBrandProfileComplete(memory: BrandProfileData | null | undefined): boolean {
  if (!memory) return false;
  return memory.brand_onboarded === true || hasCoreBrandData(memory);
}

// ── Profile completeness ─────────────────────────────────────────────────────

const COMPLETION_FIELDS: Array<{ key: keyof BrandProfileData; label: string }> = [
  { key: "business_name", label: "اسم النشاط" },
  { key: "business_type", label: "مجال النشاط" },
  { key: "notes", label: "النبذة عن النشاط" },
  { key: "phone", label: "رقم الهاتف" },
  { key: "address", label: "العنوان" },
  { key: "logo_url", label: "شعار الشركة" },
  { key: "design_samples", label: "تصاميم مرجعية" },
];

function parseDesignSamples(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Completion score for the brand profile (0-100).
 * Missing items are returned with Arabic labels to encourage completion.
 */
export function brandProfileCompletion(memory: BrandProfileData | null | undefined): {
  percent: number;
  filled: number;
  total: number;
  missing: string[];
} {
  if (!memory) {
    return { percent: 0, filled: 0, total: COMPLETION_FIELDS.length, missing: COMPLETION_FIELDS.map((f) => f.label) };
  }
  const filled: string[] = [];
  for (const field of COMPLETION_FIELDS) {
    const value = memory[field.key];
    if (field.key === "design_samples") {
      if (parseDesignSamples(memory.design_samples).length > 0) filled.push(field.label);
    } else if (typeof value === "string" && value.trim()) {
      filled.push(field.label);
    }
  }
  const total = COMPLETION_FIELDS.length;
  const missing = COMPLETION_FIELDS.filter((f) => !filled.includes(f.label)).map((f) => f.label);
  return {
    percent: Math.round((filled.length / total) * 100),
    filled: filled.length,
    total,
    missing,
  };
}
