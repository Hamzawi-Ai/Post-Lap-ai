-- Incremental migration: add media_assets table with enums
-- Safe to apply to existing databases — only creates new types and table.
-- The project applies schema with `drizzle-kit push`; this file is the
-- explicit SQL record of what push added, safe to apply incrementally.

CREATE TYPE IF NOT EXISTS "public"."media_asset_category" AS ENUM (
  'logo', 'portfolio', 'generated', 'products', 'documents'
);

CREATE TYPE IF NOT EXISTS "public"."media_asset_provider" AS ENUM (
  'replit', 'supabase', 'r2'
);

CREATE TABLE IF NOT EXISTS "media_assets" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "company_id" integer,
  "category" "media_asset_category" DEFAULT 'portfolio' NOT NULL,
  "filename" text NOT NULL,
  "relative_path" text NOT NULL,
  "mime_type" text NOT NULL,
  "size" bigint NOT NULL,
  "storage_provider" "media_asset_provider" DEFAULT 'replit' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "media_assets_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade
);
