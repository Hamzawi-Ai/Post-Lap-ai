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
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const insertCheckSchema = createInsertSchema(checksTable).omit({ id: true, created_at: true });
export type InsertCheck = z.infer<typeof insertCheckSchema>;
export type Check = typeof checksTable.$inferSelect;
