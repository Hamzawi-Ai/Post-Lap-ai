import { pgTable, serial, integer, text, timestamp, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * hamzawi_conversations: One named conversation per chat thread per user.
 * Supports ChatGPT-style sidebar with multiple conversations.
 * Soft-deleted via archived_at (never hard-deleted at the API level).
 */
export const hamzawiConversationsTable = pgTable("hamzawi_conversations", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
  last_message_at: timestamp("last_message_at"),
  archived_at: timestamp("archived_at"),
});

export const insertHamzawiConversationSchema = createInsertSchema(hamzawiConversationsTable).omit({
  id: true,
  created_at: true,
  updated_at: true,
});
export type InsertHamzawiConversation = z.infer<typeof insertHamzawiConversationSchema>;
export type HamzawiConversation = typeof hamzawiConversationsTable.$inferSelect;

export const hamzawiMessagesTable = pgTable("hamzawi_messages", {
  id: serial("id").primaryKey(),
  user_id: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  session_id: text("session_id").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  conversation_id: integer("conversation_id").references(() => hamzawiConversationsTable.id, {
    onDelete: "set null",
  }),
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
  // Internal description Hamzawi writes about the client (not user-facing).
  hamzawi_notes: text("hamzawi_notes"),
  // Client's permanent marketing/ad preferences (saved only with consent).
  marketing_notes: text("marketing_notes"),
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

/**
 * hamzawi_agent_config: Global single-row agent configuration for Prompt Studio.
 * Covers all Studio dimensions: identity, system prompt, personality, behavior rules,
 * knowledge source priorities, tool policies, memory window, asset cap, safety rules,
 * and retrieval config. When no row exists, AgentConfigService falls back to
 * DEFAULT_AGENT_CONFIG, preserving byte-identical existing behaviour.
 */
export const hamzawiAgentConfigTable = pgTable("hamzawi_agent_config", {
  id: serial("id").primaryKey(),
  // Identity
  agent_name: text("agent_name"),
  agent_role_description: text("agent_role_description"),
  // System prompt
  system_prompt_prefix: text("system_prompt_prefix"),
  personality_notes: text("personality_notes"),
  // Behavior rules — ordered list of instruction strings
  behavior_rules: jsonb("behavior_rules"),
  // Knowledge source priorities — map of source name → priority weight
  knowledge_priorities: jsonb("knowledge_priorities"),
  // Tool policies — map of tool id → { enabled, required_level, notes }
  tool_policies: jsonb("tool_policies"),
  // Memory config
  memory_window: integer("memory_window").notNull().default(10),
  // Asset cap — max number of brand images resolved to base64 per turn
  asset_cap: integer("asset_cap").notNull().default(6),
  // Safety rules — list of forbidden topic/content rules
  safety_rules: jsonb("safety_rules"),
  // Retrieval config — top_k, similarity_threshold, etc.
  retrieval_config: jsonb("retrieval_config"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export type HamzawiAgentConfig = typeof hamzawiAgentConfigTable.$inferSelect;
