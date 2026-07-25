import {
  findBrandMemoryByUserId,
  findBrandMemoryByCompanyId,
  parseDesignSamples,
  upsertBrandMemory,
  updateBrandMemory,
  appendDesignSample,
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

export interface BrandMemoryData {
  business_name?: string | null;
  business_type?: string | null;
  address?: string | null;
  phone?: string | null;
  logo_url?: string | null;
  primary_colors?: string | null;
  preferred_style?: string | null;
  notes?: string | null;
  design_samples?: string | null;
  brand_onboarded?: boolean;
}

/**
 * Build a human-readable brand memory block for AI system prompts.
 */
export function buildBrandMemoryBlock(memory: BrandMemoryData | null): string {
  if (!memory?.business_name) return "";

  const sampleCount = memory.design_samples
    ? (() => {
        try { return (JSON.parse(memory.design_samples) as unknown[]).length; }
        catch { return 0; }
      })()
    : 0;

  return `
معلومات النشاط التجاري المحفوظة لهذا المستخدم:
- اسم النشاط: ${memory.business_name}
- نوع النشاط: ${memory.business_type ?? "غير محدد"}
- العنوان: ${memory.address ?? "غير محدد"}
- الهاتف: ${memory.phone ?? "غير محدد"}
- الألوان: ${memory.primary_colors ?? "غير محدد"}
- الأسلوب المفضل: ${memory.preferred_style ?? "غير محدد"}
- ملاحظات: ${memory.notes ?? "لا يوجد"}
${memory.logo_url ? "- الشعار: محفوظ ✓" : "- الشعار: لم يُرفع بعد"}
${sampleCount > 0 ? `- نماذج تصاميم سابقة: ${sampleCount} مرفوعة ✓` : "- نماذج تصاميم سابقة: لا يوجد"}
`;
}

/**
 * Build Gemini brand context string for image generation prompts.
 */
export function buildGeminiBrandContext(memory: BrandMemoryData | null): string {
  if (!memory?.business_name) {
    return "No brand identity saved — use professional defaults with a clean modern style.";
  }
  return `Brand identity:\n- Business name: ${memory.business_name}\n- Business type: ${memory.business_type ?? "unspecified"}\n- Brand colors: ${memory.primary_colors ?? "professional defaults"}\n- Design style: ${memory.preferred_style ?? "professional and clean"}\n- Notes: ${memory.notes ?? "none"}`;
}

// ── Company Helpers ─────────────────────────────────────────────────────────

export async function autoCreateCompanyForUser(
  userId: number,
  userName: string,
): Promise<number> {
  const name = userName || `User ${userId}`;
  const company = await createCompany({ name, plan: "registered" });
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