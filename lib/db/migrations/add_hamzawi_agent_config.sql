-- Incremental migration: add hamzawi_agent_config table for Prompt Studio
-- Safe to apply to existing databases — uses IF NOT EXISTS guards.
-- Single-row design: one global config. Falls back to DEFAULT_AGENT_CONFIG when empty.

CREATE TABLE IF NOT EXISTS "hamzawi_agent_config" (
  "id" serial PRIMARY KEY NOT NULL,
  "agent_name" text,
  "agent_role_description" text,
  "system_prompt_prefix" text,
  "personality_notes" text,
  "behavior_rules" jsonb,
  "knowledge_priorities" jsonb,
  "tool_policies" jsonb,
  "memory_window" integer NOT NULL DEFAULT 10,
  "asset_cap" integer NOT NULL DEFAULT 6,
  "safety_rules" jsonb,
  "retrieval_config" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
