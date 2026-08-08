import { pgTable, serial, text, integer, timestamp, boolean, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Operational usage/event stream for PostLab Operational Intelligence.
 *
 * This table is NOT customer content and is NOT part of PostLab Brain.
 * It records safe, non-sensitive operational facts: which capability ran,
 * which provider/model handled it, whether it succeeded, how much was produced,
 * and an ESTIMATED cost derived from the centralized pricing registry.
 *
 * Deliberate constraints:
 *   - No FK constraints (consistent with `checks`) — account deletion removes
 *     these rows explicitly via AccountDeletionService.
 *   - No prompts, image contents, API keys, AI responses or secrets stored.
 *     `metadata` is jsonb and is sanitized by the recorder before insert.
 *   - `estimated_cost` is an ESTIMATE based on configured pricing, never a
 *     provider invoice value.
 */
export const operationalEventsTable = pgTable("operational_events", {
  id: serial("id").primaryKey(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  user_id: integer("user_id"),
  company_id: integer("company_id"),
  event_type: text("event_type").notNull(),
  provider: text("provider"),
  model: text("model"),
  success: boolean("success"),
  quantity: integer("quantity").notNull().default(1),
  estimated_cost: numeric("estimated_cost", { precision: 12, scale: 6, mode: "number" }),
  metadata: jsonb("metadata"),
});

export const insertOperationalEventSchema = createInsertSchema(operationalEventsTable).omit({
  id: true,
  created_at: true,
});
export type InsertOperationalEvent = z.infer<typeof insertOperationalEventSchema>;
export type OperationalEvent = typeof operationalEventsTable.$inferSelect;
