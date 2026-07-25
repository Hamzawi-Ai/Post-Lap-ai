import { pgTable, serial, text, integer, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const planEnum = pgEnum("plan", [
  "visitor",
  "registered",
  "professional",
  "smart_fix",
  "content",
  "agency",
]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  plan: planEnum("plan").notNull().default("registered"),
  company_id: integer("company_id"),
  gender: text("gender"),
  is_active: boolean("is_active").notNull().default(true),
  trials_remaining: integer("trials_remaining").notNull().default(6),
  total_checks: integer("total_checks").notNull().default(0),
  last_check_at: timestamp("last_check_at"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  subscription_label: text("subscription_label"),
  subscription_expires_at: timestamp("subscription_expires_at"),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, created_at: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export type Plan = "visitor" | "registered" | "professional" | "smart_fix" | "content" | "agency";

/**
 * Maps plans to capability levels 1–5:
 * 1 = visitor (reveal only — basic check results)
 * 2 = registered (suggest alternatives — detailed suggestions)
 * 3 = smart_fix (generate clean image via Gemini)
 * 4 = content (create posts from description + image)
 * 5 = agency (multiple business profiles)
 */
export function planLevel(plan: Plan | string | null | undefined): number {
  const levels: Record<Plan, number> = {
    visitor: 1,
    registered: 2,
    professional: 3, // legacy — maps to smart_fix level
    smart_fix: 3,
    content: 4,
    agency: 5,
  };
  return levels[(plan ?? "visitor") as Plan] ?? 1;
}
