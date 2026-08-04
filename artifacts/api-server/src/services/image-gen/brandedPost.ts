import { db, usersTable, userBrandMemoryTable, mediaAssetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getImageProvider } from "./provider";
import { collectBrandAssets } from "../media/assetReader";
import { buildGeminiBrandContext } from "../brand/brain";
import { MediaService } from "../media/MediaService";
import { logger } from "../../lib/logger";

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

  let prompt = `Create a professional social media advertisement image for Meta (Facebook/Instagram) that is fully compliant with Meta advertising policies.\n\n${brandContext}\n\nProduct/Service: ${description}\n\nRequirements:\n- Professional design matching the brand identity\n- Clean layout with brand colors and style\n- Visually appealing composition for social media\n- No text overlays exceeding 20% of the image\n- No misleading claims or before/after comparisons\n- High quality, scroll-stopping visual`;
  if (regenerateNote) prompt += `\n\nAdditional note: ${regenerateNote}`;

  const referenceImages: Array<{ mimeType: string; data: string }> = [...brandAssets.images];

  if (brandAssets.images.length > 0) {
    prompt += `\n\nProvided brand references (logo, design samples, product images) — use the logo in the design and draw inspiration from the style and layout of the design samples.`;
  }

  if (productImageBase64) {
    const productMatch = productImageBase64.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    const mimeType = productMatch?.[1] ?? "image/jpeg";
    const data = productMatch?.[2] ?? productImageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
    prompt += `\n\nA product image is also provided — feature it prominently in the advertisement.`;
    referenceImages.push({ mimeType, data });
  }

  const provider = getImageProvider();
  const generated = await provider.generate({ prompt, referenceImages });
  if (!generated) return null;

  const genBuffer = Buffer.from(generated.data, "base64");
  const dataUrl = `data:${generated.mimeType};base64,${generated.data}`;
  const publicUrl = await saveGeneratedImage(userId, companyId, genBuffer, generated.mimeType);

  return { url: publicUrl ?? dataUrl, dataUrl };
}
