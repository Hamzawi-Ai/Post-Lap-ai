---
name: Subscription plan system
description: Two-tier FREE/PRO system — DB enum, planLevel(), beta access, feature gates, and all plan-related files
---

## The rule
The system has exactly two commercial plans: `free` (level 1) and `pro` (level 2). No other plan values exist in the DB enum or codebase.

**Why:** Collapsed from a six-tier system (visitor/registered/professional/smart_fix/content/agency) to simplify commercial logic.

## Key facts
- DB enum `plan` = `{free, pro}` only. Default = `free` for both users and companies tables.
- `planLevel()` in `lib/db/src/schema/users.ts`: free→1, pro→2.
- `BETA_LEVEL = 2` in `artifacts/api-server/src/services/beta/access.ts`.
- When `BETA_ACCESS_ENABLED=true` (default), new registrations get `plan='pro'` and `trials_remaining=9999`. When false, `plan='free'` and `trials_remaining=6`.
- Owner account `dev@test.local` (id=1) has `plan='pro'`. Admin access is independent of plan (JWT role-based only).

## Feature gates
- Level 1 (FREE): check_ad, read_brand_memory access; also enforced by plan gate on chat for generate_text/generate_image intents returning upsell=true.
- Level 2 (PRO): generate_text (requiredLevel=2), generate_image (requiredLevel=2), save_brand_memory (2), read_brand_memory (2), upload_asset (2).
- Chat gate in `artifacts/api-server/src/routes/hamzawi.ts`: intents `generate_image` AND `generate_text` are gated via `evaluateToolAccess` before calling the LLM.

## How to apply
- Any new tool registration in `artifacts/api-server/src/services/ai/tools/index.ts` must use `requiredLevel: 1` (FREE) or `requiredLevel: 2` (PRO).
- VALID_PLANS in admin routes = `['free', 'pro']` only.
- Frontend `ALL_PLAN_OPTIONS`, `PLAN_LABEL`, `PLAN_COLORS` in `artifacts/postlap-ai/src/lib/admin-shared.tsx` use only `free`/`pro`.
- Never add old plan names (visitor, registered, smart_fix, content, agency, professional) back anywhere.
