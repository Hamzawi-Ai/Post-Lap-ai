-- Migration: Collapse plan enum to FREE + PRO
-- Production-safe, idempotent — safe to re-run.
-- Verified against live schema: only users.plan and companies.plan depend on type 'plan'.
--
-- Strategy: convert columns to text FIRST, then update data, then recreate the enum.
-- This avoids the PostgreSQL restriction that prohibits using a newly-added enum value
-- in the same transaction where ALTER TYPE ... ADD VALUE was issued.
-- All DDL runs within a single DO block so it is atomic (BEGIN/COMMIT handled by caller).

DO $$
BEGIN
  -- Only run if legacy plan values still exist in the enum.
  -- If the type no longer exists, or already only contains {free, pro}, skip everything.
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'plan'
  ) AND EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'plan')
    AND enumlabel IN ('visitor', 'registered', 'professional', 'smart_fix', 'content', 'agency')
  ) THEN
    RAISE NOTICE 'Legacy plan values detected — running migration';

    -- Step 1: Drop column defaults (they carry the old enum type cast and block ALTER TYPE)
    ALTER TABLE public.users     ALTER COLUMN plan DROP DEFAULT;
    ALTER TABLE public.companies ALTER COLUMN plan DROP DEFAULT;

    -- Step 2: Convert columns to text — breaks all dependency on the plan enum type
    ALTER TABLE public.users     ALTER COLUMN plan TYPE text;
    ALTER TABLE public.companies ALTER COLUMN plan TYPE text;

    -- Step 3: Migrate data rows (string comparisons on text, no enum involvement)
    UPDATE public.users     SET plan = 'pro'  WHERE plan IN ('professional', 'smart_fix', 'content', 'agency');
    UPDATE public.users     SET plan = 'free' WHERE plan IN ('visitor', 'registered');
    UPDATE public.companies SET plan = 'pro'  WHERE plan IN ('professional', 'smart_fix', 'content', 'agency');
    UPDATE public.companies SET plan = 'free' WHERE plan IN ('visitor', 'registered');

    -- Step 4: Drop the old enum type (safe — no columns depend on it any more)
    DROP TYPE public.plan;

    -- Step 5: Create the new enum with only the two commercial tiers
    CREATE TYPE public.plan AS ENUM ('free', 'pro');

    -- Step 6: Restore columns to the new strongly-typed enum
    ALTER TABLE public.users     ALTER COLUMN plan TYPE public.plan USING plan::public.plan;
    ALTER TABLE public.companies ALTER COLUMN plan TYPE public.plan USING plan::public.plan;

    -- Step 7: Restore column defaults
    ALTER TABLE public.users     ALTER COLUMN plan SET DEFAULT 'free';
    ALTER TABLE public.companies ALTER COLUMN plan SET DEFAULT 'free';

    RAISE NOTICE 'Migration complete — plan enum is now (free, pro)';

  ELSE
    RAISE NOTICE 'plan enum already clean — nothing to do';
  END IF;
END $$;
