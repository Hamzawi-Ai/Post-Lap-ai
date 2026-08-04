import { pgTable, serial, integer, text, bigint, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const mediaAssetCategoryEnum = pgEnum("media_asset_category", [
  "logo",
  "portfolio",
  "generated",
  "products",
  "documents",
]);

export const mediaAssetProviderEnum = pgEnum("media_asset_provider", [
  "replit",
  "supabase",
  "r2",
]);

export const mediaAssetsTable = pgTable("media_assets", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  company_id: integer("company_id"),
  category: mediaAssetCategoryEnum("category").notNull().default("portfolio"),
  filename: text("filename").notNull(),
  relative_path: text("relative_path").notNull(),
  mime_type: text("mime_type").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  storage_provider: mediaAssetProviderEnum("storage_provider").notNull().default("replit"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export type MediaAsset = typeof mediaAssetsTable.$inferSelect;
export type InsertMediaAsset = typeof mediaAssetsTable.$inferInsert;
export type MediaAssetCategory = (typeof mediaAssetCategoryEnum.enumValues)[number];
export type MediaAssetProvider = (typeof mediaAssetProviderEnum.enumValues)[number];
