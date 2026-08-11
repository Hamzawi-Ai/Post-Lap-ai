import { pgTable, serial, text, integer, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const planEnum = pgEnum("plan", ["free", "pro"]);

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  plan: planEnum("plan").notNull().default("free"),
  company_id: integer("company_id"),
  gender: text("gender"),
  is_active: boolean("is_active").notNull().default(true),
  // Temporary Beta-access flag: grants PRO capability to active Google
  // users while the product is in open beta (gated by BETA_ACCESS_ENABLED).
  // When BETA_ACCESS_ENABLED=true, new registrations receive plan='pro' directly.
  // This flag is kept for backward compatibility and removed when beta ends.
  beta_access: boolean("beta_access").notNull().default(false),
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

export type Plan = "free" | "pro";

/**
 * Maps plans to capability levels:
 * 1 = free (check content, view analysis, view violations, fix posts/images)
 * 2 = pro  (everything in free + text gen, image gen, post gen, Brand Brain)
 */
export function planLevel(plan: Plan | string | null | undefined): number {
  const levels: Record<string, number> = {
    free: 1,
    pro: 2,
  };
  return levels[(plan ?? "free") as string] ?? 1;
}
