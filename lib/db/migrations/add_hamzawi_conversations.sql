-- Incremental migration: add hamzawi_conversations table and conversation_id FK
-- Safe to apply to existing databases — uses IF NOT EXISTS / IF NOT EXISTS guards.
-- All existing hamzawi_messages rows remain valid with conversation_id = NULL.

CREATE TABLE IF NOT EXISTS "hamzawi_conversations" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "title" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "last_message_at" timestamp,
  "archived_at" timestamp,
  CONSTRAINT "hamzawi_conversations_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);

ALTER TABLE "hamzawi_messages"
  ADD COLUMN IF NOT EXISTS "conversation_id" integer
  REFERENCES "public"."hamzawi_conversations"("id") ON DELETE SET NULL;
