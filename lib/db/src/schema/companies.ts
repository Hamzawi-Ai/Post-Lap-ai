import { pgTable, serial, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { planEnum } from "./users";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().default(""),
  plan: planEnum("plan").notNull().default("free"),
  is_active: boolean("is_active").notNull().default(true),
  created_at: timestamp("created_at").defaultNow().notNull(),
  subscription_label: text("subscription_label"),
  subscription_expires_at: timestamp("subscription_expires_at"),
});

export const insertCompanySchema = createInsertSchema(companiesTable).omit({
  id: true,
  created_at: true,
});
export type InsertCompany = z.infer<typeof insertCompanySchema>;
export type Company = typeof companiesTable.$inferSelect;
