import { mkdir, writeFile, unlink, access, readFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

// Storage root is <api-server-root>/storage/ — resolves correctly from both
// the compiled dist/ bundle (dist/../storage) and dev source.
const STORAGE_ROOT = path.resolve(__dirname, "../storage");

import type { MediaAssetCategory } from "@workspace/db";

/** Permitted category values — must stay in sync with mediaAssetCategoryEnum. */
const ALLOWED_CATEGORIES = new Set<MediaAssetCategory>([
  "logo",
  "portfolio",
  "generated",
  "products",
  "documents",
]);

/**
 * Allowlisted MIME type → canonical extension map.
 * Extensions are derived ONLY from the validated MIME type, never from the
 * original filename, to prevent XSS via extension spoofing.
 */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/webp": ".webp",
};

export interface SavedFile {
  filename: string;
  relativePath: string;
  publicUrl: string;
}

/**
 * Assert that the resolved path stays inside the expected root.
 * Throws if a traversal attack is detected.
 */
function assertContained(resolvedPath: string, expectedRoot: string): void {
  const normalRoot = path.resolve(expectedRoot) + path.sep;
  const normalPath = path.resolve(resolvedPath);
  if (!normalPath.startsWith(normalRoot) && normalPath !== path.resolve(expectedRoot)) {
    throw new Error(`Path traversal detected: ${resolvedPath}`);
  }
}

export class MediaService {
  /**
   * Validate and normalise a category value.
   * Returns the sanitised category or throws if it is not in the allowlist.
   */
  static validateCategory(raw: string): MediaAssetCategory {
    const candidate = raw.trim().toLowerCase() as MediaAssetCategory;
    if (!ALLOWED_CATEGORIES.has(candidate)) {
      throw new Error(
        `Invalid category "${raw}". Allowed: ${[...ALLOWED_CATEGORIES].join(", ")}`,
      );
    }
    return candidate;
  }

  /**
   * Ensure the directory for a company/category combination exists.
   * Creates all intermediate directories as needed.
   */
  static async ensureDir(companyId: number, category: string): Promise<string> {
    const validCategory = MediaService.validateCategory(category);
    const dir = path.join(STORAGE_ROOT, "companies", String(companyId), validCategory);
    assertContained(dir, STORAGE_ROOT);
    await mkdir(dir, { recursive: true });
    return dir;
  }

  /**
   * Read a file from tmpPath into a buffer and delete the temp file.
   * Centralises temp-file I/O so the route layer never touches fs directly.
   */
  static async consumeTempFile(tmpPath: string): Promise<Buffer> {
    const buffer = await readFile(tmpPath);
    try {
      await unlink(tmpPath);
    } catch {
      // Best-effort cleanup — don't fail the upload if unlink fails
    }
    return buffer;
  }

  /**
   * Save a file buffer to disk and return its metadata.
   * Never stores or returns Base64.
   * Extension is derived from the validated MIME type — never from the original
   * filename — to prevent stored-XSS via extension spoofing.
   */
  static async saveFile(
    companyId: number,
    category: string,
    _originalName: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<SavedFile> {
    const validCategory = MediaService.validateCategory(category);

    // Derive extension from the MIME allowlist; reject unknown types.
    const ext = MIME_TO_EXT[mimeType];
    if (!ext) {
      throw new Error(`Unsupported MIME type: ${mimeType}`);
    }

    const dir = await MediaService.ensureDir(companyId, validCategory);

    // Build a collision-safe, opaque filename — no user-controlled components.
    const unique = `${Date.now()}_${randomBytes(8).toString("hex")}`;
    const filename = `${unique}${ext}`;

    const absolutePath = path.join(dir, filename);
    // Final containment check before writing
    assertContained(absolutePath, STORAGE_ROOT);

    await writeFile(absolutePath, buffer);

    const relativePath = path
      .join("companies", String(companyId), validCategory, filename)
      .replace(/\\/g, "/");
    const publicUrl = `/uploads/${relativePath}`;

    return { filename, relativePath, publicUrl };
  }

  /**
   * Delete a file given its relative path (relative to STORAGE_ROOT).
   * Swallows ENOENT — idempotent.
   */
  static async deleteFile(relativePath: string): Promise<void> {
    const absolutePath = path.join(STORAGE_ROOT, relativePath);
    // Containment check before deletion
    assertContained(absolutePath, STORAGE_ROOT);
    try {
      await access(absolutePath);
      await unlink(absolutePath);
    } catch {
      // File already gone or never existed — treat as success
    }
  }
}
