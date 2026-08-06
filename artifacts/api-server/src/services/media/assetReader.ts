import { resolve, sep } from "path";
import { readFile } from "fs/promises";
import { db, mediaAssetsTable, type MediaAssetCategory } from "@workspace/db";
import { and, eq, inArray, or } from "drizzle-orm";

// Storage root is <api-server-root>/storage/ — same resolution used by MediaService.
const STORAGE_ROOT = resolve(__dirname, "../storage");

const CATEGORY_ORDER: MediaAssetCategory[] = ["logo", "portfolio", "products"];

export interface ImageData {
  mimeType: string;
  data: string;
}

export interface AssetItem {
  category: string;
  url: string;
}

export interface BrandAssets {
  images: ImageData[];
  summary: string;
  /** Structured listing of every asset, used to build explicit system-prompt blocks. */
  assetItems: AssetItem[];
  /** Counts per category across all assets (not just capped images). */
  categoryCounts: Record<string, number>;
}

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return map[ext] ?? "image/jpeg";
}

/**
 * Read an /uploads/… public URL from disk and return base64 image data.
 * Returns null if the path is missing or escapes the storage root.
 */
export async function uploadsUrlToBase64(
  publicUrl: string,
): Promise<ImageData | null> {
  if (!publicUrl.startsWith("/uploads/")) return null;
  const relativePath = publicUrl.slice("/uploads/".length);
  const absolutePath = resolve(STORAGE_ROOT, relativePath);
  // Containment check — prevent path-traversal
  const normalRoot = STORAGE_ROOT + sep;
  if (!absolutePath.startsWith(normalRoot) && absolutePath !== STORAGE_ROOT) return null;
  try {
    const buffer = await readFile(absolutePath);
    const ext = (absolutePath.split(".").pop() ?? "").toLowerCase();
    return { mimeType: mimeFromExt(ext), data: buffer.toString("base64") };
  } catch {
    return null;
  }
}

function parseDataUrl(dataUrl: string): ImageData | null {
  const m = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

async function toImageData(value: string): Promise<ImageData | null> {
  if (value.startsWith("data:")) return parseDataUrl(value);
  if (value.startsWith("/uploads/")) return uploadsUrlToBase64(value);
  return null;
}

interface MemoryLike {
  logo_url?: string | null;
  design_samples?: string | null;
}

function parseDesignSamples(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Collect a user's/company's brand visuals from the media library
 * (media_assets: logo, portfolio, products) merged with brand memory
 * (logo_url + design_samples), deduplicated, resolved to base64.
 * Returns the images plus a short human-readable summary of what exists.
 */
export async function collectBrandAssets(params: {
  userId?: number;
  companyId?: number | null;
  memory?: MemoryLike | null;
}): Promise<BrandAssets> {
  const { userId, companyId, memory } = params;

  // Track each candidate with its resolved category so we can build a structured listing.
  const candidateItems: AssetItem[] = [];

  if (memory?.logo_url?.trim()) {
    candidateItems.push({ url: memory.logo_url.trim(), category: "logo" });
  }
  for (const s of parseDesignSamples(memory?.design_samples ?? null)) {
    if (s.trim()) candidateItems.push({ url: s.trim(), category: "design_samples" });
  }

  if (userId) {
    try {
      const scope = companyId
        ? or(eq(mediaAssetsTable.user_id, userId), eq(mediaAssetsTable.company_id, companyId))
        : eq(mediaAssetsTable.user_id, userId);
      const rows = await db
        .select({ category: mediaAssetsTable.category, relative_path: mediaAssetsTable.relative_path })
        .from(mediaAssetsTable)
        .where(and(scope, inArray(mediaAssetsTable.category, [...CATEGORY_ORDER])))
        .orderBy(mediaAssetsTable.created_at)
        .limit(30);

      const ranked = rows.sort(
        (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
      );
      for (const row of ranked) {
        const url = `/uploads/${row.relative_path.replace(/\\/g, "/")}`;
        if (url.trim()) candidateItems.push({ url, category: row.category });
      }
    } catch {
      // Media library read failure should never break the chat — fall back to memory only.
    }
  }

  // Deduplicate (by exact URL) while preserving order.
  const seen = new Set<string>();
  const uniqueItems = candidateItems.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  const cap = 6;
  const images: ImageData[] = [];
  for (const item of uniqueItems.slice(0, cap)) {
    const img = await toImageData(item.url);
    if (img) images.push(img);
  }

  // Build category counts from the full (uncapped) unique list.
  const categoryCounts: Record<string, number> = {};
  for (const item of uniqueItems) {
    categoryCounts[item.category] = (categoryCounts[item.category] ?? 0) + 1;
  }

  const parts: string[] = [];
  if (categoryCounts.logo) parts.push(`الشعار (${categoryCounts.logo})`);
  if (categoryCounts.portfolio) parts.push(`نماذج تصميم (${categoryCounts.portfolio})`);
  if (categoryCounts.products) parts.push(`صور منتجات (${categoryCounts.products})`);
  if (categoryCounts.generated) parts.push(`تصاميم مولّدة (${categoryCounts.generated})`);
  if (categoryCounts.documents) parts.push(`مستندات (${categoryCounts.documents})`);
  if (categoryCounts.design_samples) parts.push(`أصول مرجعية (${categoryCounts.design_samples})`);
  const summary = parts.length > 0
    ? parts.join("، ") + (images.length < uniqueItems.length ? " (+ المزيد في مكتبة الوسائط)" : "")
    : "";

  return { images, summary, assetItems: uniqueItems, categoryCounts };
}
