import {
  findBrandMemoryByUserId,
  findBrandMemoryByCompanyId,
  parseDesignSamples,
  upsertBrandMemory,
  updateBrandMemory,
  appendDesignSample,
  appendMarketingNote,
  createBrandMemory,
  findCompanyByUserId,
  createCompany,
  linkUserToCompany,
  findBusinessProfilesByUserId,
  createBusinessProfile,
  updateBusinessProfile,
  deleteBusinessProfile,
} from "./repository";

export interface BrandContext {
  businessName: string | null;
  businessType: string | null;
  address: string | null;
  phone: string | null;
  hasLogo: boolean;
  logoDataUrl: string | null;
  primaryColors: string | null;
  preferredStyle: string | null;
  notes: string | null;
  designSampleCount: number;
  designSampleDataUrls: string[];
  brandOnboarded: boolean;
}

export async function getBrandContext(params: { userId?: number; companyId?: number }): Promise<BrandContext | null> {
  const memory = params.companyId
    ? await findBrandMemoryByCompanyId(params.companyId)
    : params.userId
      ? await findBrandMemoryByUserId(params.userId)
      : null;

  if (!memory) return null;

  const samples = parseDesignSamples(memory.design_samples);

  return {
    businessName: memory.business_name,
    businessType: memory.business_type,
    address: memory.address,
    phone: memory.phone,
    hasLogo: !!memory.logo_url,
    logoDataUrl: memory.logo_url,
    primaryColors: memory.primary_colors,
    preferredStyle: memory.preferred_style,
    notes: memory.notes,
    designSampleCount: samples.length,
    designSampleDataUrls: samples,
    brandOnboarded: memory.brand_onboarded,
  };
}

// ── Brand Memory Helpers ────────────────────────────────────────────────────

const ALLOWED_BRAND_FIELDS = new Set([
  "business_name", "business_type", "address", "phone",
  "primary_colors", "preferred_style", "notes",
]);

export async function applyPartialBrandSave(
  userId: number,
  partialData: Array<Record<string, string>>,
) {
  const mergedFields: Record<string, string> = {};
  for (const chunk of partialData) {
    for (const [k, v] of Object.entries(chunk)) {
      if (ALLOWED_BRAND_FIELDS.has(k)) {
        mergedFields[k] = v;
      }
    }
  }
  if (Object.keys(mergedFields).length > 0) {
    await upsertBrandMemory(userId, mergedFields);
  }
}

export async function markBrandOnboardingComplete(userId: number) {
  await upsertBrandMemory(userId, { brand_onboarded: true });
}

/**
 * Determine whether a brand profile is complete enough that onboarding is done.
 * Uses the `brand_onboarded` flag BUT also verifies core data actually exists,
 * so a lost flag during a migration never forces re-onboarding.
 */
export function isBrandProfileComplete(memory: BrandMemoryData | null | undefined): boolean {
  if (!memory) return false;
  const hasCoreData = Boolean(
    memory.business_name?.trim() && memory.business_type?.trim(),
  );
  return memory.brand_onboarded === true || hasCoreData;
}

/** Core fields required for the first-time onboarding to be considered done. */
export function hasCoreBrandData(memory: BrandMemoryData | null | undefined): boolean {
  if (!memory) return false;
  return Boolean(memory.business_name?.trim() && memory.business_type?.trim());
}

export interface BrandMemoryData {
  business_name?: string | null;
  business_type?: string | null;
  address?: string | null;
  phone?: string | null;
  logo_url?: string | null;
  primary_colors?: string | null;
  preferred_style?: string | null;
  notes?: string | null;
  hamzawi_notes?: string | null;
  marketing_notes?: string | null;
  design_samples?: string | null;
  brand_onboarded?: boolean;
}

/**
 * Build a human-readable brand memory block for AI system prompts.
 * Only fields with actual (non-empty) values are included.
 */
export function buildBrandMemoryBlock(memory: BrandMemoryData | null): string {
  if (!memory?.business_name?.trim()) return "";

  const sampleCount = memory.design_samples
    ? (() => {
        try { return (JSON.parse(memory.design_samples) as unknown[]).length; }
        catch { return 0; }
      })()
    : 0;

  const lines: string[] = [`- اسم النشاط: ${memory.business_name.trim()}`];
  if (memory.business_type?.trim()) lines.push(`- نوع النشاط: ${memory.business_type.trim()}`);
  if (memory.address?.trim()) lines.push(`- العنوان: ${memory.address.trim()}`);
  if (memory.phone?.trim()) lines.push(`- الهاتف: ${memory.phone.trim()}`);
  if (memory.primary_colors?.trim()) lines.push(`- الألوان: ${memory.primary_colors.trim()}`);
  if (memory.preferred_style?.trim()) lines.push(`- الأسلوب المفضل: ${memory.preferred_style.trim()}`);
  if (memory.notes?.trim()) lines.push(`- النبذة: ${memory.notes.trim()}`);
  if (memory.hamzawi_notes?.trim()) lines.push(`- وصفك الداخلي للعميل: ${memory.hamzawi_notes.trim()}`);
  if (memory.marketing_notes?.trim()) lines.push(`- ملاحظات العميل الدائمة (التسويق): ${memory.marketing_notes.trim()}`);
  if (memory.logo_url?.trim()) lines.push("- الشعار: محفوظ ✓");
  if (sampleCount > 0) lines.push(`- نماذج تصاميم سابقة: ${sampleCount} مرفوعة ✓`);

  return `
معلومات النشاط التجاري المحفوظة لهذا المستخدم:
${lines.join("\n")}
`;
}

/**
 * Build Gemini brand context string for image generation prompts.
 * Only fields with actual (non-empty) values are included.
 */
export function buildGeminiBrandContext(memory: BrandMemoryData | null): string {
  if (!memory?.business_name?.trim()) {
    return "No brand identity saved — use professional defaults with a clean modern style.";
  }
  const lines: string[] = [`- Business name: ${memory.business_name.trim()}`];
  if (memory.business_type?.trim()) lines.push(`- Business type: ${memory.business_type.trim()}`);
  if (memory.primary_colors?.trim()) lines.push(`- Brand colors: ${memory.primary_colors.trim()}`);
  if (memory.preferred_style?.trim()) lines.push(`- Design style: ${memory.preferred_style.trim()}`);
  if (memory.notes?.trim()) lines.push(`- Notes: ${memory.notes.trim()}`);
  return `Brand identity:\n${lines.join("\n")}`;
}

// ── Company Helpers ─────────────────────────────────────────────────────────

export async function autoCreateCompanyForUser(
  userId: number,
  userName: string,
): Promise<number> {
  const name = userName || `User ${userId}`;
  const company = await createCompany({ name, plan: "free" });
  await linkUserToCompany(userId, company.id);
  return company.id;
}

// ── Business Profiles (Agency) ──────────────────────────────────────────────

export {
  findBrandMemoryByUserId,
  findBrandMemoryByCompanyId,
  upsertBrandMemory,
  updateBrandMemory,
  appendDesignSample,
  appendMarketingNote,
  createBrandMemory,
  findCompanyByUserId,
  createCompany,
  linkUserToCompany,
  findBusinessProfilesByUserId,
  createBusinessProfile,
  updateBusinessProfile,
  deleteBusinessProfile,
  parseDesignSamples,
};