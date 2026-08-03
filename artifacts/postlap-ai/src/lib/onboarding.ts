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
