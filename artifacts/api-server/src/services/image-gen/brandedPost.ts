import { db, usersTable, userBrandMemoryTable, mediaAssetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getImageProvider } from "./provider";
import { collectBrandAssets } from "../media/assetReader";
import { buildGeminiBrandContext } from "../brand/brain";
import { MediaService } from "../media/MediaService";
import { logger } from "../../lib/logger";
import { OperationalEvents } from "../operational/events";

/**
 * Save an AI-generated image buffer via MediaService and insert a media_assets
 * row.  Returns the public /uploads/… URL on success, or null on failure
 * (the caller should fall back to a data: URL so the user is never left empty).
 */
export async function saveGeneratedImage(
  userId: number,
  companyId: number | null,
  imageBuffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  const effectiveCompanyId = companyId ?? userId;
  try {
    const saved = await MediaService.saveFile(
      effectiveCompanyId,
      "generated",
      "generated.png",
      imageBuffer,
      mimeType,
    );
    try {
      await db.insert(mediaAssetsTable).values({
        user_id: userId,
        company_id: companyId,
        category: "generated",
        filename: saved.filename,
        relative_path: saved.relativePath,
        mime_type: mimeType,
        size: imageBuffer.byteLength,
      });
    } catch (dbErr) {
      // DB insert failed — clean up the orphaned file so storage stays consistent
      logger.error({ dbErr }, "Failed to record generated asset in DB; removing orphaned file");
      await MediaService.deleteFile(saved.relativePath).catch(() => {});
      return null;
    }
    return saved.publicUrl;
  } catch (err) {
    logger.error({ err }, "Failed to save generated image to disk");
    return null;
  }
}

export interface GenerateBrandedPostResult {
  url: string;
  dataUrl: string;
}

/**
 * Generate a branded social-media post image using the configured image
 * provider, the user's brand memory and the company's stored visual assets
 * (logo, design samples, product images). The generated image is persisted to
 * the media library (category "generated").
 *
 * This is the SINGLE shared image-generation path used by both /api/image-gen
 * and the Hamzawi assistant — never create a second flow.
 */
export async function generateBrandedPost(params: {
  userId: number;
  description: string;
  productImageBase64?: string;
  regenerateNote?: string;
}): Promise<GenerateBrandedPostResult | null> {
  const { userId, description, productImageBase64, regenerateNote } = params;

  const [userRow] = await db
    .select({ company_id: usersTable.company_id })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const companyId = userRow?.company_id ?? null;

  const [memory] = await db
    .select()
    .from(userBrandMemoryTable)
    .where(eq(userBrandMemoryTable.user_id, userId))
    .limit(1);

  const brandAssets = await collectBrandAssets({ userId, companyId, memory: memory ?? null });

  const brandContext = buildGeminiBrandContext(memory ?? null);

  // Layer 1 — BRAND HARD FACTS: official values from the saved brand memory,
  // passed verbatim. Lightweight validation only: facts that exist in memory
  // are asserted as immutable; nothing is fabricated and no blanket flags are
  // raised for optional/absent data (e.g. a missing activity dataset).
  const hardFacts: string[] = [];
  if (memory?.business_name?.trim()) hardFacts.push(`Business name: ${memory.business_name.trim()}`);
  if (memory?.phone?.trim()) hardFacts.push(`Phone: ${memory.phone.trim()}`);
  if (memory?.address?.trim()) hardFacts.push(`Address: ${memory.address.trim()}`);
  if (memory?.business_type?.trim()) hardFacts.push(`Business type: ${memory.business_type.trim()}`);
  if (memory?.primary_colors?.trim()) hardFacts.push(`Brand colors: ${memory.primary_colors.trim()}`);
  if (memory?.preferred_style?.trim()) hardFacts.push(`Design style: ${memory.preferred_style.trim()}`);
  const hardFactsBlock = hardFacts.length > 0
    ? `\n\n[BRAND HARD FACTS — use these values exactly as written; never alter, round, or substitute them:]\n${hardFacts.join("\n")}`
    : "";

  // Layer 3 — ORIGINAL ASSETS: name the attached images by their real category
  // so the model uses the relevant original (logo / product / sample) instead
  // of being told to force the first reference. Empty reference list → no line.
  const assetCategoryLabels: Array<[string, string]> = [
    ["logo", "Logo"],
    ["products", "Product image(s)"],
    ["portfolio", "Design sample(s)"],
    ["design_samples", "Reference sample(s)"],
    ["generated", "Generated design(s)"],
  ];
  const assetLabels = brandAssets.assetItems.map((item) => item.category);
  const attachedCategories = assetCategoryLabels
    .filter(([cat]) => assetLabels.includes(cat))
    .map(([, label]) => label);
  const assetsBlock = brandAssets.images.length > 0
    ? `\n\n[3. ORIGINAL ASSETS — attached in order: ${attachedCategories.join(", ")} or "mixed". Use the original attached assets (logo, product images, design samples) directly in the design — never rely on textual descriptions of them alone.]`
    : "";

  // Layered generation prompt: FACTS → TEXT → ASSETS → DIRECTION → LAYOUT →
  // FORMAT → CONSTRAINTS (per the design-generation protocol).
  let prompt = `Create a social media advertisement image for Meta (Facebook/Instagram) that is fully compliant with Meta advertising policies.

[1. BRAND FACTS]${hardFactsBlock || "\nNo brand identity saved — use professional defaults with a clean modern style."}

[2. EXACT VISIBLE TEXT] Only the text explicitly requested in the brief below may appear on the design. Do not add extra captions, contact details, prices, or claims that were not requested.${assetsBlock}

[4. CREATIVE DIRECTION]
${brandContext}

Brief: ${description}

[5. LAYOUT] Organise the design in clear layers: background, then text, then logo, then extra elements, then final touches.

[6. OUTPUT FORMAT] Social media post (1080x1350 unless another size is specified in the brief). High quality, scroll-stopping visual. Text overlays must not exceed 20% of the image.

[7. HARD CONSTRAINTS] Never alter any of the BRAND HARD FACTS above. No misleading claims and no before/after comparisons. Only the requested text appears on the design.`;
  if (regenerateNote) prompt += `\n\nAdditional note: ${regenerateNote}`;

  const referenceImages: Array<{ mimeType: string; data: string }> = [...brandAssets.images];

  if (productImageBase64) {
    const productMatch = productImageBase64.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    const mimeType = productMatch?.[1] ?? "image/jpeg";
    const data = productMatch?.[2] ?? productImageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    prompt += `\n\nA product image is also provided — feature it prominently in the advertisement.`;
    referenceImages.push({ mimeType, data });
  }

  const provider = getImageProvider();
  const generated = await provider.generate({ prompt, referenceImages });
  if (!generated) {
    await OperationalEvents.record({
      eventType: "image_generation_failure",
      userId,
      companyId,
      provider: provider.id,
      model: provider.modelId,
      success: false,
      quantity: 1,
      metadata: { source: "branded_post" },
    });
    return null;
  }

  const genBuffer = Buffer.from(generated.data, "base64");
  const dataUrl = `data:${generated.mimeType};base64,${generated.data}`;
  const publicUrl = await saveGeneratedImage(userId, companyId, genBuffer, generated.mimeType);

  await OperationalEvents.record({
    eventType: "image_generation",
    userId,
    companyId,
    provider: provider.id,
    model: provider.modelId,
    success: true,
    quantity: 1,
    metadata: { source: "branded_post", saved: !!publicUrl },
  });

  return { url: publicUrl ?? dataUrl, dataUrl };
}
