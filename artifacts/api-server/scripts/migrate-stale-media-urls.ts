/**
 * One-time migration: clean up stale logo_url and design_samples values
 * that were stored as bare filenames before the /uploads/ pipeline was established.
 *
 * Safe to run multiple times (idempotent).
 *
 * What it does:
 *   1. NULLs any logo_url that is a bare filename (no protocol, not /uploads/).
 *      Preserves: /uploads/... paths, data:image/... URIs, http(s):// external URLs.
 *   2. For each design_samples JSON array, removes bare-filename entries only.
 *      Preserves /uploads/... and data:image/... entries.
 *      If the resulting array is empty, sets design_samples to NULL.
 *
 * Run with:
 *   cd artifacts/api-server && npx tsx scripts/migrate-stale-media-urls.ts
 */

import { db, userBrandMemoryTable } from "@workspace/db";
import { sql, not, like, isNull, and } from "drizzle-orm";

function isValidImageRef(s: string): boolean {
  return (
    s.startsWith("/uploads/") ||
    s.startsWith("data:image/") ||
    s.startsWith("http://") ||
    s.startsWith("https://")
  );
}

async function run() {
  console.log("=== Stale media URL migration ===");

  // --- 1. NULL out logo_url bare filenames (not any recognisable URL format) ---
  const logoResult = await db
    .update(userBrandMemoryTable)
    .set({ logo_url: null })
    .where(
      and(
        not(isNull(userBrandMemoryTable.logo_url)),
        not(like(userBrandMemoryTable.logo_url, "/uploads/%")),
        not(like(userBrandMemoryTable.logo_url, "data:image/%")),
        not(like(userBrandMemoryTable.logo_url, "http://%")),
        not(like(userBrandMemoryTable.logo_url, "https://%")),
      ),
    )
    .returning({ id: userBrandMemoryTable.id });

  console.log(`NULLed ${logoResult.length} stale bare-filename logo_url rows`);

  // --- 2. Clean design_samples JSON arrays (remove bare filenames only) ---
  const rows = await db
    .select({
      id: userBrandMemoryTable.id,
      design_samples: userBrandMemoryTable.design_samples,
    })
    .from(userBrandMemoryTable)
    .where(not(isNull(userBrandMemoryTable.design_samples)));

  let samplesUpdated = 0;
  for (const row of rows) {
    if (!row.design_samples) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.design_samples);
    } catch {
      // Unparseable JSON — NULL it out
      await db
        .update(userBrandMemoryTable)
        .set({ design_samples: null })
        .where(sql`${userBrandMemoryTable.id} = ${row.id}`);
      samplesUpdated++;
      continue;
    }
    if (!Array.isArray(parsed)) {
      await db
        .update(userBrandMemoryTable)
        .set({ design_samples: null })
        .where(sql`${userBrandMemoryTable.id} = ${row.id}`);
      samplesUpdated++;
      continue;
    }
    // Keep entries that are a recognisable image reference; discard bare filenames
    const valid = (parsed as unknown[]).filter(
      (s): s is string => typeof s === "string" && isValidImageRef(s),
    );
    if (valid.length === parsed.length) continue; // nothing to clean
    const newValue = valid.length > 0 ? JSON.stringify(valid) : null;
    await db
      .update(userBrandMemoryTable)
      .set({ design_samples: newValue })
      .where(sql`${userBrandMemoryTable.id} = ${row.id}`);
    samplesUpdated++;
  }

  console.log(`Cleaned design_samples on ${samplesUpdated} rows`);
  console.log("Migration complete.");
  process.exit(0);
}

run().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
