import path from "path";
import { readdir, access } from "fs/promises";
import {
  db,
  usersTable,
  companiesTable,
  checksTable,
  hamzawiConversationsTable,
  hamzawiMessagesTable,
  userBrandMemoryTable,
  businessProfilesTable,
  mediaAssetsTable,
  operationalEventsTable,
} from "@workspace/db";
import { and, count, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { MediaService } from "../media/MediaService";
import { parseDesignSamples } from "../brand/repository";
import { logger } from "../../lib/logger";

export type AccountDeletionResult =
  | { status: "deleted"; deleted: true; companyId: number | null; companyShared: boolean }
  | { status: "not_found"; deleted: false }
  | { status: "partial_failure"; deleted: false; failedFiles: string[] };

export interface OrphanReport {
  generated_at: string;
  orphan_companies: number;
  orphan_checks: number;
  orphan_media_rows: number;
  media_rows_missing_files: number;
  files_without_db_record: string[];
}

const UPLOADS_PREFIX = "/uploads/";

function uploadUrlToRelative(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v.startsWith(UPLOADS_PREFIX)) return null;
  return v.slice(UPLOADS_PREFIX.length);
}

/**
 * Complete, permanent account deletion for the current beta.
 *
 * One customer account represents one company. Deleting the account removes:
 *   - the user row
 *   - the owned company row (only when no other account references it)
 *   - brand memory, business profiles, conversations, messages, checks
 *   - media DB rows AND the physical files they reference
 *   - brand logo/design-sample files referenced as /uploads/… URLs
 *
 * Files are collected and deleted BEFORE any DB record is touched, and every
 * path is validated against the storage root. If any physical file cannot be
 * removed the operation aborts before deleting DB rows, so the record (which
 * holds the path) is preserved for safe remediation and nothing is silently
 * reported as complete.
 *
 * No soft-delete, no retention period — permanent deletion only.
 */
export class AccountDeletionService {
  static async deleteAccount(userId: number): Promise<AccountDeletionResult> {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user) {
      return { status: "not_found", deleted: false };
    }

    const companyId: number | null = user.company_id ?? null;
    const companyShared = await this.isCompanyShared(userId, companyId);

    // 1. Collect every customer-owned file path BEFORE any deletion.
    const paths = await this.collectFilePaths(userId, companyId, companyShared);

    // 2. Delete physical files. Fail safely: any failure aborts the DB step so
    //    the record (and its path) survives for remediation.
    const failed: string[] = [];
    for (const p of paths) {
      try {
        await MediaService.deleteStoredAsset(p);
      } catch (err) {
        logger.error({ err, relativePath: p }, "Account deletion: file removal failed");
        failed.push(p);
      }
    }
    if (failed.length > 0) {
      return { status: "partial_failure", deleted: false, failedFiles: failed };
    }

    // 3. Remove now-empty company storage directories (fully-owned only).
    if (!companyShared) {
      await MediaService.removeEmptyCompanyStorage(companyId ?? userId);
    }

    // 4. Database deletion.
    //    Company-owned records are only removed when the company is not shared.
    if (companyId && !companyShared) {
      await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.company_id, companyId));
      await db
        .delete(userBrandMemoryTable)
        .where(eq(userBrandMemoryTable.company_id, companyId));
      await db.delete(companiesTable).where(eq(companiesTable.id, companyId));
    }

    // User-owned records — explicit deletes so correctness never depends on
    // DB-level cascade enforcement existing in the production schema.
    const convs = await db
      .select({ id: hamzawiConversationsTable.id })
      .from(hamzawiConversationsTable)
      .where(eq(hamzawiConversationsTable.user_id, userId));
    const convIds = convs.map((c) => c.id);
    if (convIds.length > 0) {
      await db
        .delete(hamzawiMessagesTable)
        .where(inArray(hamzawiMessagesTable.conversation_id, convIds));
    }
    await db.delete(hamzawiMessagesTable).where(eq(hamzawiMessagesTable.user_id, userId));
    await db.delete(hamzawiConversationsTable).where(eq(hamzawiConversationsTable.user_id, userId));
    await db.delete(businessProfilesTable).where(eq(businessProfilesTable.user_id, userId));
    await db.delete(userBrandMemoryTable).where(eq(userBrandMemoryTable.user_id, userId));
    await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.user_id, userId));
    await db.delete(checksTable).where(eq(checksTable.user_id, userId));
    await db.delete(operationalEventsTable).where(eq(operationalEventsTable.user_id, userId));
    await db.delete(usersTable).where(eq(usersTable.id, userId));

    logger.info({ userId, companyId, companyShared }, "Account permanently deleted");

    return { status: "deleted", deleted: true, companyId, companyShared };
  }

  /**
   * A company is "shared" when ANY other account (active or not) still
   * references it. Shared companies are preserved — never deleted, and their
   * storage directories are never removed.
   */
  private static async isCompanyShared(
    userId: number,
    companyId: number | null,
  ): Promise<boolean> {
    if (companyId == null) return false;
    const [others] = await db
      .select({ n: count() })
      .from(usersTable)
      .where(and(eq(usersTable.company_id, companyId), ne(usersTable.id, userId)));
    return (others?.n ?? 0) > 0;
  }

  private static async collectFilePaths(
    userId: number,
    companyId: number | null,
    companyShared: boolean,
  ): Promise<string[]> {
    const set = new Set<string>();

    // media_assets.relative_path — the authoritative file list. When the
    // company is fully owned, include company-scoped rows for complete cleanup.
    const mediaScope =
      companyId && !companyShared
        ? or(eq(mediaAssetsTable.user_id, userId), eq(mediaAssetsTable.company_id, companyId))
        : eq(mediaAssetsTable.user_id, userId);
    const mediaRows = await db
      .select({ relative_path: mediaAssetsTable.relative_path })
      .from(mediaAssetsTable)
      .where(mediaScope);
    for (const row of mediaRows) {
      if (row.relative_path?.trim()) set.add(row.relative_path.trim());
    }

    // Brand memory logo + design samples may reference files via /uploads/….
    const memoryScope =
      companyId && !companyShared
        ? or(eq(userBrandMemoryTable.user_id, userId), eq(userBrandMemoryTable.company_id, companyId))
        : eq(userBrandMemoryTable.user_id, userId);
    const memories = await db
      .select({ logo_url: userBrandMemoryTable.logo_url, design_samples: userBrandMemoryTable.design_samples })
      .from(userBrandMemoryTable)
      .where(memoryScope);
    for (const m of memories) {
      const rel = uploadUrlToRelative(m.logo_url);
      if (rel) set.add(rel);
      for (const sample of parseDesignSamples(m.design_samples)) {
        const relSample = uploadUrlToRelative(sample);
        if (relSample) set.add(relSample);
      }
    }

    // Business profiles (agency) may hold logo file references too.
    const profiles = await db
      .select({ logo_url: businessProfilesTable.logo_url })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.user_id, userId));
    for (const p of profiles) {
      const rel = uploadUrlToRelative(p.logo_url);
      if (rel) set.add(rel);
    }

    return [...set];
  }

  /**
   * READ-ONLY orphan audit — reports, never deletes. Used by the admin panel to
   * surface leftovers from legacy/partial deletions. No automatic cleanup.
   */
  static async auditOrphans(): Promise<OrphanReport> {
    // Orphan companies: not referenced by any user.
    const [orphanCompanies] = await db
      .select({ n: count() })
      .from(companiesTable)
      .leftJoin(usersTable, eq(companiesTable.id, usersTable.company_id))
      .where(isNull(usersTable.id));

    // Orphan checks: carry a user_id that no longer exists.
    const [orphanChecks] = await db
      .select({ n: count() })
      .from(checksTable)
      .leftJoin(usersTable, eq(checksTable.user_id, usersTable.id))
      .where(and(isNotNull(checksTable.user_id), isNull(usersTable.id)));

    // Orphan media rows: reference a user that no longer exists.
    const [orphanMedia] = await db
      .select({ n: count() })
      .from(mediaAssetsTable)
      .leftJoin(usersTable, eq(mediaAssetsTable.user_id, usersTable.id))
      .where(isNull(usersTable.id));

    // Media rows whose physical file is missing on disk.
    const mediaRows = await db
      .select({ relative_path: mediaAssetsTable.relative_path })
      .from(mediaAssetsTable);
    let mediaRowsMissingFiles = 0;
    const presentFiles = new Set<string>();
    for (const row of mediaRows) {
      const relative = (row.relative_path ?? "").replace(/\\/g, "/").trim();
      if (!relative) continue;
      presentFiles.add(relative);
      try {
        await access(path.join(MediaService.storageRoot, relative));
      } catch {
        mediaRowsMissingFiles += 1;
      }
    }

    // Files on disk with no corresponding DB record (under storage/companies/).
    const filesWithoutDbRecord: string[] = [];
    await this.walkStorage((relative) => {
      if (!presentFiles.has(relative)) filesWithoutDbRecord.push(relative);
    });

    return {
      generated_at: new Date().toISOString(),
      orphan_companies: orphanCompanies?.n ?? 0,
      orphan_checks: orphanChecks?.n ?? 0,
      orphan_media_rows: orphanMedia?.n ?? 0,
      media_rows_missing_files: mediaRowsMissingFiles,
      files_without_db_record: filesWithoutDbRecord.slice(0, 200),
    };
  }

  private static async walkStorage(cb: (relativePath: string) => void): Promise<void> {
    const root = MediaService.storageRoot;
    let companiesDir: string[];
    try {
      companiesDir = await readdir(path.join(root, "companies"), { withFileTypes: true })
        .then((entries) => entries.filter((e) => e.isDirectory()).map((e) => e.name));
    } catch {
      return;
    }
    for (const companyDir of companiesDir) {
      const companyBase = path.join(root, "companies", companyDir);
      let categories: string[];
      try {
        categories = await readdir(companyBase, { withFileTypes: true })
          .then((entries) => entries.filter((e) => e.isDirectory()).map((e) => e.name));
      } catch {
        continue;
      }
      for (const category of categories) {
        const categoryBase = path.join(companyBase, category);
        let files: string[];
        try {
          files = await readdir(categoryBase).then((list) =>
            list.map((f) => `companies/${companyDir}/${category}/${f}`),
          );
        } catch {
          continue;
        }
        for (const f of files) cb(f);
      }
    }
  }
}
