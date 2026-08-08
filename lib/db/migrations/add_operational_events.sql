-- Incremental migration: add operational_events table for PostLab Operational
-- Intelligence (usage / reliability / estimated-cost stream).
-- Safe to apply to existing databases — uses IF NOT EXISTS guards.
-- NOTE: the project applies schema authoritatively via `drizzle-kit push`
-- (see other migrations) — this file is the incremental SQL record.
-- No FK constraints by design: account deletion removes these rows explicitly
-- through AccountDeletionService. No prompts / image contents / secrets stored.

CREATE TABLE IF NOT EXISTS "operational_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "user_id" integer,
  "company_id" integer,
  "event_type" text NOT NULL,
  "provider" text,
  "model" text,
  "success" boolean,
  "quantity" integer NOT NULL DEFAULT 1,
  "estimated_cost" numeric(12, 6),
  "metadata" jsonb
);

CREATE INDEX IF NOT EXISTS "operational_events_created_at_idx" ON "operational_events" ("created_at");
CREATE INDEX IF NOT EXISTS "operational_events_user_id_idx" ON "operational_events" ("user_id");
CREATE INDEX IF NOT EXISTS "operational_events_type_idx" ON "operational_events" ("event_type");
