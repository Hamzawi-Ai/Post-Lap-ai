import { Router, type IRouter } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { db, usersTable, userBrandMemoryTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getUserFromToken } from "../middleware/auth";
import { autoCreateCompanyForUser, isBrandProfileComplete } from "../services/brand/brain";

const router: IRouter = Router();

async function getUserPayload(user: typeof usersTable.$inferSelect) {
  const [memory] = await db
    .select()
    .from(userBrandMemoryTable)
    .where(eq(userBrandMemoryTable.user_id, user.id))
    .limit(1);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    plan: user.plan,
    gender: user.gender ?? null,
    is_active: user.is_active,
    trials_remaining: user.trials_remaining,
    total_checks: user.total_checks,
    last_check_at: user.last_check_at?.toISOString() ?? null,
    brand_onboarded: memory?.brand_onboarded ?? false,
    brand_profile_complete: isBrandProfileComplete(memory ?? null),
  };
}

import { SESSION_SECRET, GOOGLE_CLIENT_ID } from "../lib/secrets";

// Verify Google credential and upsert user
router.post("/auth/google", async (req, res): Promise<void> => {
  const { credential } = req.body as { credential?: string };
  if (!credential) {
    res.status(400).json({ error: "رمز الدخول مطلوب" });
    return;
  }

  try {
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    // H6 (docs/FINAL_AUDIT_REPORT.md): never treat an unverified email as an
    // identity — an account with an unverified Google email is rejected.
    if (!payload?.email || payload.email_verified !== true) {
      res.status(401).json({ error: "رمز Google غير صالح" });
      return;
    }

    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, payload.email))
      .limit(1);

    let user;
    if (existing.length > 0) {
      [user] = existing;
    } else {
      [user] = await db
        .insert(usersTable)
        .values({
          email: payload.email,
          name: payload.name ?? "",
          plan: "registered",
          is_active: true,
          trials_remaining: 6,
          total_checks: 0,
        })
        .returning();

      await autoCreateCompanyForUser(user.id, payload.name ?? "");
    }

    // Reset daily trials if needed
    const today = new Date();
    const lastCheck = user.last_check_at ? new Date(user.last_check_at) : null;
    if (
      lastCheck &&
      lastCheck.toDateString() !== today.toDateString() &&
      user.plan === "registered"
    ) {
      await db
        .update(usersTable)
        .set({ trials_remaining: 6 })
        .where(eq(usersTable.id, user.id));
      user = { ...user, trials_remaining: 6 };
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, SESSION_SECRET, {
      expiresIn: "7d",
    });

    res.json({ user: await getUserPayload(user), token });
  } catch (err) {
    logger.error({ err }, "Google auth error");
    res.status(401).json({ error: "فشل تسجيل الدخول" });
  }
});

// DEV-ONLY login bypass. Never mounted in production — returns 404.
// Also requires an explicit DEV_LOGIN=1 opt-in, so the endpoint can never be
// silently active (docs/FINAL_AUDIT_REPORT.md — C1).
// Lets the full authenticated flow be tested without Google OAuth.
router.post("/dev/login", async (_req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production" || process.env.DEV_LOGIN !== "1") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  try {
    const email = "dev@test.local";
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    let user = existing;
    if (!user) {
      [user] = await db
        .insert(usersTable)
        .values({
          email,
          name: "Dev Tester",
          plan: "agency",
          is_active: true,
          trials_remaining: 99999,
          total_checks: 0,
        })
        .returning();
      await autoCreateCompanyForUser(user.id, user.name);
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, SESSION_SECRET, {
      expiresIn: "7d",
    });

    res.json({ user: await getUserPayload(user), token });
  } catch (err) {
    logger.error({ err }, "Dev login error");
    res.status(500).json({ error: "حدث خطأ" });
  }
});

// POST /auth/logout — client-side session teardown.
// The JWT is stateless (the client drops it from localStorage), so this only
// clears the server-set guest `hamzawi_session` cookie to guarantee session
// cleanup on logout. Idempotent and token-optional — logout always succeeds.
router.post("/auth/logout", (_req, res): void => {
  res.setHeader(
    "Set-Cookie",
    `hamzawi_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
  res.json({ ok: true });
});

// Get current user from JWT
router.get("/users/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "لم تسجل الدخول" });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, SESSION_SECRET) as { userId: number };
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .limit(1);

    if (!user) {
      res.status(401).json({ error: "المستخدم غير موجود" });
      return;
    }

    if (!user.is_active) {
      res.status(401).json({ error: "تم تعطيل الحساب" });
      return;
    }

    res.json(await getUserPayload(user));
  } catch {
    res.status(401).json({ error: "رمز الدخول غير صالح" });
  }
});

// Update user gender
router.patch("/users/me/gender", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "لم تسجل الدخول" });
    return;
  }
  const { gender } = req.body as { gender?: string };
  if (!gender || !["male", "female"].includes(gender)) {
    res.status(400).json({ error: "يجب اختيار ذكر أو أنثى" });
    return;
  }

  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, SESSION_SECRET) as { userId: number };
    const [user] = await db
      .update(usersTable)
      .set({ gender })
      .where(eq(usersTable.id, decoded.userId))
      .returning();

    if (!user) {
      res.status(404).json({ error: "المستخدم غير موجود" });
      return;
    }

    res.json({ gender: user.gender });
  } catch {
    res.status(401).json({ error: "رمز الدخول غير صالح" });
  }
});

// POST /auth/subscribe — self-service paid-plan upgrade.
// Disabled until a real payment flow exists: the previous behavior granted the
// paid plan to any authenticated caller with no payment verification, which was
// an unverifiable self-grant (docs/FINAL_AUDIT_REPORT.md — C3). Until payment
// verification is implemented, return a controlled "Not Available Yet" response.
router.post("/auth/subscribe", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول للاشتراك" });
    return;
  }

  res.status(501).json({
    ok: false,
    error: "الاشتراك غير متاح حالياً — سيتم تفعيله قريباً",
  });
});

export default router;
