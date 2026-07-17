import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const checkStatusEnum = pgEnum("check_status", ["ممتاز", "جيد", "مرفوض"]);

export const checksTable = pgTable("checks", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id"),
  status: checkStatusEnum("status").notNull(),
  reason: text("reason").notNull().default(""),
  score: integer("score").notNull().default(0),
  // Phase 1 guest tracking: guest scans are counted server-side by IP so the
  // 3-scan cap cannot be bypassed by clearing localStorage.
  guest_ip: text("guest_ip"),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertCheckSchema = createInsertSchema(checksTable).omit({ id: true, created_at: true });
export type InsertCheck = z.infer<typeof insertCheckSchema>;
export type Check = typeof checksTable.$inferSelect;
