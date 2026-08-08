import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";
import { db, usersTable, checksTable } from "@workspace/db";
import { count, eq, gte } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const adminLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "محاولات دخول كثيرة. حاول بعد دقيقة." },
  standardHeaders: true,
  legacyHeaders: false,
});

import { SESSION_SECRET, ADMIN_PASSWORD } from "../lib/secrets";

function requireAdmin(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization as string | undefined;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, SESSION_SECRET) as { role?: string };
    if (decoded.role !== "admin") {
      res.status(401).json({ error: "Not authorized" });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function formatUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    plan: u.plan,
    gender: u.gender,
    is_active: u.is_active,
    subscription_label: u.subscription_label ?? null,
    subscription_expires_at: u.subscription_expires_at?.toISOString() ?? null,
    trials_remaining: u.trials_remaining,
    total_checks: u.total_checks,
    last_check_at: u.last_check_at?.toISOString() ?? null,
    created_at: u.created_at.toISOString(),
  };
}

function expiryFromDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// Admin login
router.post("/admin/login", adminLoginLimiter, async (req, res): Promise<void> => {
  const { password } = req.body as { password?: string };
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "كلمة السر غلط" });
    return;
  }
  const token = jwt.sign({ role: "admin" }, SESSION_SECRET, { expiresIn: "1d" });
  res.json({ token });
});

// List all users
router.get("/admin/users", requireAdmin, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.created_at);
  res.json(users.map(formatUser));
});

// Create user by email (manual add)
router.post("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const { email, name, plan, subscription_label, duration_days } = req.body as {
    email?: string;
    name?: string;
    plan?: string;
    subscription_label?: string;
    duration_days?: number;
  };

  const VALID_PLANS = ["visitor", "registered", "professional", "smart_fix", "content", "agency"];
  if (!email || !plan || !VALID_PLANS.includes(plan ?? "")) {
    res.status(400).json({ error: "email and valid plan required" });
    return;
  }

  const expiresAt = duration_days ? expiryFromDays(duration_days) : undefined;
  const isPaidPlan = ["professional", "smart_fix", "content", "agency"].includes(plan);

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    const [updated] = await db
      .update(usersTable)
      .set({
        plan: plan as typeof usersTable.$inferInsert["plan"],
        subscription_label: subscription_label ?? null,
        subscription_expires_at: expiresAt ?? null,
        is_active: true,
      })
      .where(eq(usersTable.email, email))
      .returning();
    logger.info({ email, plan }, "Existing user plan set by admin");
    res.json(formatUser(updated!));
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      name: name ?? email.split("@")[0],
      plan: plan as typeof usersTable.$inferInsert["plan"],
      subscription_label: subscription_label ?? null,
      subscription_expires_at: expiresAt ?? null,
      is_active: true,
      trials_remaining: isPaidPlan ? 9999 : 6,
    })
    .returning();

  logger.info({ email, plan }, "User created by admin");
  res.json(formatUser(user!));
});

// Upgrade user plan (with optional label + duration)
router.patch("/admin/users/:id/upgrade", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const { plan, subscription_label, duration_days } = req.body as {
    plan?: string;
    subscription_label?: string;
    duration_days?: number;
  };

  const VALID_PLANS = ["visitor", "registered", "professional", "smart_fix", "content", "agency"];
  if (!plan || !VALID_PLANS.includes(plan)) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }

  const expiresAt = duration_days ? expiryFromDays(duration_days) : undefined;

  const updateData: Partial<typeof usersTable.$inferInsert> = {
    plan: plan as typeof usersTable.$inferInsert["plan"],
    ...(subscription_label !== undefined && { subscription_label }),
    ...(expiresAt !== undefined && { subscription_expires_at: expiresAt }),
  };

  const [user] = await db
    .update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  logger.info({ userId: id, plan }, "User plan upgraded by admin");
  res.json(formatUser(user));
});

// Delete user
router.delete("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const [deleted] = await db.delete(usersTable).where(eq(usersTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  logger.info({ userId: id }, "User deleted by admin");
  res.json({ success: true });
});

// Activate / deactivate user by email
router.patch("/admin/activate", requireAdmin, async (req, res): Promise<void> => {
  const { email, active } = req.body as { email?: string; active?: boolean };

  if (!email || typeof active !== "boolean") {
    res.status(400).json({ error: "email and active (boolean) required" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ is_active: active })
    .where(eq(usersTable.email, email))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  logger.info({ email, active }, "User activation status changed by admin");
  res.json(formatUser(user));
});

// Set plan by email (owner tool)
const VALID_PLANS = ["visitor", "registered", "professional", "smart_fix", "content", "agency"];
router.patch("/admin/set-plan-by-email", requireAdmin, async (req, res): Promise<void> => {
  const { email, plan } = req.body as { email?: string; plan?: string };

  if (!email || !plan || !VALID_PLANS.includes(plan)) {
    res.status(400).json({ error: "email and valid plan required" });
    return;
  }

  const [user] = await db
    .update(usersTable)
    .set({ plan: plan as typeof usersTable.$inferInsert["plan"] })
    .where(eq(usersTable.email, email))
    .returning();

  if (!user) {
    res.status(404).json({ error: "لم يُوجد مستخدم بهذا البريد" });
    return;
  }

  logger.info({ email, plan }, "User plan set by email via owner panel");
  res.json(formatUser(user));
});

// Grant unlimited usage to a user
router.post("/admin/users/:id/unlimited", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const [user] = await db
    .update(usersTable)
    .set({ trials_remaining: 99999 })
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  logger.info({ userId: id }, "Unlimited usage granted by admin");
  res.json(formatUser(user));
});

// Reset daily limits (restore default trials)
router.post("/admin/users/:id/reset-limits", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const [user] = await db
    .update(usersTable)
    .set({ trials_remaining: 10 })
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "المستخدم غير موجود" });
    return;
  }

  logger.info({ userId: id }, "Daily limits reset by admin");
  res.json(formatUser(user));
});

// Usage stats — admin only (aggregate metrics, no longer anonymously exposed).
router.get("/stats", requireAdmin, async (_req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalChecks] = await db.select({ count: count() }).from(checksTable);
  const [totalUsers] = await db.select({ count: count() }).from(usersTable);
  const [checksToday] = await db
    .select({ count: count() })
    .from(checksTable)
    .where(gte(checksTable.created_at, today));
  const [approvedCount] = await db
    .select({ count: count() })
    .from(checksTable)
    .where(eq(checksTable.status, "ممتاز"));
  const [rejectedCount] = await db
    .select({ count: count() })
    .from(checksTable)
    .where(eq(checksTable.status, "مرفوض"));

  res.json({
    total_checks: totalChecks?.count ?? 0,
    total_users: totalUsers?.count ?? 0,
    checks_today: checksToday?.count ?? 0,
    approved_count: approvedCount?.count ?? 0,
    rejected_count: rejectedCount?.count ?? 0,
  });
});

export default router;
