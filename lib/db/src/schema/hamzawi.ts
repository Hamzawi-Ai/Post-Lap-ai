import { pgTable, serial, integer, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const hamzawiMessagesTable = pgTable("hamzawi_messages", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  session_id: text("session_id").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertHamzawiMessageSchema = createInsertSchema(hamzawiMessagesTable).omit({
  id: true,
  created_at: true,
});
export type InsertHamzawiMessage = z.infer<typeof insertHamzawiMessageSchema>;
export type HamzawiMessage = typeof hamzawiMessagesTable.$inferSelect;

/**
 * user_brand_memory: Primary/single brand profile per user (levels 2-4).
 * Unique per user — for single-business plans.
 * brand_onboarded: true once the level-4 guided onboarding session completes.
 */
export const userBrandMemoryTable = pgTable("user_brand_memory", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  company_id: integer("company_id"),
  business_name: text("business_name"),
  business_type: text("business_type"),
  address: text("address"),
  phone: text("phone"),
  logo_url: text("logo_url"),
  primary_colors: text("primary_colors"),
  preferred_style: text("preferred_style"),
  liked_posts: jsonb("liked_posts"),
  notes: text("notes"),
  design_samples: text("design_samples"),
  brand_onboarded: boolean("brand_onboarded").notNull().default(false),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserBrandMemorySchema = createInsertSchema(userBrandMemoryTable).omit({
  id: true,
  updated_at: true,
});
export type InsertUserBrandMemory = z.infer<typeof insertUserBrandMemorySchema>;
export type UserBrandMemory = typeof userBrandMemoryTable.$inferSelect;

/**
 * business_profiles: One-to-many business profiles per user (level 5 — agency).
 * Allows agency users to manage multiple businesses with separate identities.
 * No unique constraint on user_id — multiple rows per user allowed.
 */
export const businessProfilesTable = pgTable("business_profiles", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  profile_name: text("profile_name").notNull(),
  business_name: text("business_name"),
  business_type: text("business_type"),
  logo_url: text("logo_url"),
  primary_colors: text("primary_colors"),
  preferred_style: text("preferred_style"),
  notes: text("notes"),
  is_primary: boolean("is_primary").notNull().default(false),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const insertBusinessProfileSchema = createInsertSchema(businessProfilesTable).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertBusinessProfile = z.infer<typeof insertBusinessProfileSchema>;
export type BusinessProfile = typeof businessProfilesTable.$inferSelect;
