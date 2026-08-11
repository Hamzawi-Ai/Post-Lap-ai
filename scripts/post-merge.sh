#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Run hand-written SQL migrations before drizzle-kit push.
# These handle DDL that drizzle-kit push cannot safely generate
# (e.g. enum type changes while dependent columns still hold old values).
# All files are idempotent — safe to re-run on every deploy.
for f in lib/db/migrations/*.sql; do
  echo "Applying migration: $f"
  psql "$DATABASE_URL" -f "$f"
done

pnpm --filter db push
