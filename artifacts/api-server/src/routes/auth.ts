import { Router, type IRouter } from "express";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

import { SESSION_SECRET } from "../lib/secrets";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";

// Verify Google credential and upsert user
router.post("/auth/google", async (req, res): Promise<void> => {
  const { credential } = req.body as { credential?: string };
  if (!credential) {
    res.status(400).json({ error: "credential required" });
    return;
  }

  try {
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      res.status(401).json({ error: "Invalid Google token" });
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

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        gender: user.gender ?? null,
        is_active: user.is_active,
        trials_remaining: user.trials_remaining,
        total_checks: user.total_checks,
        last_check_at: user.last_check_at?.toISOString() ?? null,
      },
      token,
    });
  } catch (err) {
    logger.error({ err }, "Google auth error");
    res.status(401).json({ error: "Authentication failed" });
  }
});

// Get current user from JWT
router.get("/users/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
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
      res.status(401).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      plan: user.plan,
      gender: user.gender ?? null,
      is_active: user.is_active,
      trials_remaining: user.trials_remaining,
      total_checks: user.total_checks,
      last_check_at: user.last_check_at?.toISOString() ?? null,
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

// Update user gender
router.patch("/users/me/gender", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const { gender } = req.body as { gender?: string };
  if (!gender || !["male", "female"].includes(gender)) {
    res.status(400).json({ error: "gender must be male or female" });
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
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ gender: user.gender });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

export default router;
