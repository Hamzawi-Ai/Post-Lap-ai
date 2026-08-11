import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import {
  db,
  usersTable,
  checksTable,
  hamzawiConversationsTable,
  hamzawiMessagesTable,
  mediaAssetsTable,
  userBrandMemoryTable,
  type Plan,
} from "@workspace/db";
import { and, asc, between, count, eq, gte, inArray, isNotNull, isNull, like, lt, sql } from "drizzle-orm";
import { requireAdmin } from "./admin";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ownerLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: "تجاوزت الحد المسموح لمساعد المالك. حاول بعد دقيقة." },
  standardHeaders: true,
  legacyHeaders: false,
});

const PAID_PLANS: Plan[] = ["pro"];

// READ-ONLY owner assistant (V1 — data-driven only: aggregate / summarize /
// report on platform data. No LLM, no tool execution, no writes).
// The owner assistant (Hamzawi) has global visibility but no execution or
// write permissions — every query below is a SELECT/count aggregate.
router.get(
  "/owner/assistant/overview",
  ownerLimiter,
  requireAdmin,
  async (_req, res): Promise<void> => {
    try {
      const now = new Date();
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const last7 = new Date(Date.now() - 7 * 86400000);
      const in7 = new Date(Date.now() + 7 * 86400000);

      // --- Users & subscriptions ---
      const [totalUsers] = await db.select({ n: count() }).from(usersTable);
      const [newToday] = await db
        .select({ n: count() })
        .from(usersTable)
        .where(gte(usersTable.created_at, startOfToday));
      const [new7d] = await db
        .select({ n: count() })
        .from(usersTable)
        .where(gte(usersTable.created_at, last7));
      const [activeUsers] = await db
        .select({ n: count() })
        .from(usersTable)
        .where(eq(usersTable.is_active, true));
      const [inactiveUsers] = await db
        .select({ n: count() })
        .from(usersTable)
        .where(eq(usersTable.is_active, false));
      const [paidSubscribers] = await db
        .select({ n: count() })
        .from(usersTable)
        .where(inArray(usersTable.plan, PAID_PLANS));
      const [expiring7d] = await db
        .select({ n: count() })
        .from(usersTable)
        .where(between(usersTable.subscription_expires_at, now, in7));
      const [expiredSubs] = await db
        .select({ n: count() })
        .from(usersTable)
        .where(lt(usersTable.subscription_expires_at, now));
      const [brandOnboarded] = await db
        .select({ n: count() })
        .from(userBrandMemoryTable)
        .where(eq(userBrandMemoryTable.brand_onboarded, true));

      const byPlan = await db
        .select({ plan: usersTable.plan, n: count() })
        .from(usersTable)
        .groupBy(usersTable.plan);

      const expiringList = await db
        .select({
          email: usersTable.email,
          plan: usersTable.plan,
          subscription_expires_at: usersTable.subscription_expires_at,
        })
        .from(usersTable)
        .where(between(usersTable.subscription_expires_at, now, in7))
        .orderBy(asc(usersTable.subscription_expires_at))
        .limit(10);

      // --- Ad checks ---
      const [totalChecks] = await db.select({ n: count() }).from(checksTable);
      const [checksToday] = await db
        .select({ n: count() })
        .from(checksTable)
        .where(gte(checksTable.created_at, startOfToday));
      const [checks7d] = await db
        .select({ n: count() })
        .from(checksTable)
        .where(gte(checksTable.created_at, last7));
      const [approvedChecks] = await db
        .select({ n: count() })
        .from(checksTable)
        .where(eq(checksTable.status, "ممتاز"));
      const [rejectedChecks] = await db
        .select({ n: count() })
        .from(checksTable)
        .where(eq(checksTable.status, "مرفوض"));
      const [guestChecks] = await db
        .select({ n: count() })
        .from(checksTable)
        .where(isNull(checksTable.user_id));
      const [avgScore] = await db
        .select({ v: sql<number>`round(avg(${checksTable.score}))::int` })
        .from(checksTable);

      // --- Conversations ---
      const [totalConversations] = await db.select({ n: count() }).from(hamzawiConversationsTable);
      const [archivedConversations] = await db
        .select({ n: count() })
        .from(hamzawiConversationsTable)
        .where(isNotNull(hamzawiConversationsTable.archived_at));
      const [conversationsToday] = await db
        .select({ n: count() })
        .from(hamzawiConversationsTable)
        .where(gte(hamzawiConversationsTable.created_at, startOfToday));
      const [conversations7d] = await db
        .select({ n: count() })
        .from(hamzawiConversationsTable)
        .where(gte(hamzawiConversationsTable.created_at, last7));

      // --- Messages ---
      const [totalMessages] = await db.select({ n: count() }).from(hamzawiMessagesTable);
      const [messagesToday] = await db
        .select({ n: count() })
        .from(hamzawiMessagesTable)
        .where(gte(hamzawiMessagesTable.created_at, startOfToday));
      const [messages7d] = await db
        .select({ n: count() })
        .from(hamzawiMessagesTable)
        .where(gte(hamzawiMessagesTable.created_at, last7));
      const [userMessages] = await db
        .select({ n: count() })
        .from(hamzawiMessagesTable)
        .where(eq(hamzawiMessagesTable.role, "user"));
      const [assistantMessages] = await db
        .select({ n: count() })
        .from(hamzawiMessagesTable)
        .where(eq(hamzawiMessagesTable.role, "assistant"));
      const [guestMessages] = await db
        .select({ n: count() })
        .from(hamzawiMessagesTable)
        .where(isNull(hamzawiMessagesTable.user_id));
      const [imageMessages] = await db
        .select({ n: count() })
        .from(hamzawiMessagesTable)
        .where(like(hamzawiMessagesTable.content, "%ATTACHED_IMAGE%"));

      // --- Media assets ---
      const [totalMedia] = await db.select({ n: count() }).from(mediaAssetsTable);
      const byCategory = await db
        .select({ category: mediaAssetsTable.category, n: count() })
        .from(mediaAssetsTable)
        .groupBy(mediaAssetsTable.category);

      // --- Rule-based problems / recommendations (data-driven, no AI) ---
      const problems: Array<{ severity: "high" | "medium" | "low"; text: string }> = [];
      const nExpired = expiredSubs?.n ?? 0;
      const nExpiring = expiring7d?.n ?? 0;
      const nInactive = inactiveUsers?.n ?? 0;
      if (nExpired > 0) problems.push({ severity: "high", text: `${nExpired} اشتراك منتهٍ لم يُجدد.` });
      if (nExpiring > 0) problems.push({ severity: "medium", text: `${nExpiring} اشتراك تنتهي خلال 7 أيام.` });
      if (nInactive > 0) problems.push({ severity: "medium", text: `${nInactive} مستخدم موقوف.` });
      const [zeroChecksUsers] = await db
        .select({ n: count() })
        .from(usersTable)
        .where(eq(usersTable.total_checks, 0));
      if ((zeroChecksUsers?.n ?? 0) > 0) {
        problems.push({ severity: "low", text: `${zeroChecksUsers?.n ?? 0} مستخدم لم يجروا أي فحص إعلاني.` });
      }
      const totalChecksN = totalChecks?.n ?? 0;
      const guestShare = totalChecksN > 0 ? Math.round(((guestChecks?.n ?? 0) / totalChecksN) * 100) : 0;
      if (guestShare > 30) {
        problems.push({ severity: "medium", text: `${guestShare}% من الفحوصات مصدرها زوار غير مسجلين.` });
      }
      if (problems.length === 0) problems.push({ severity: "low", text: "لا توجد مشاكل ملحوظة حالياً." });

      res.json({
        ok: true,
        generated_at: new Date().toISOString(),
        users: {
          total: totalUsers?.n ?? 0,
          new_today: newToday?.n ?? 0,
          new_7d: new7d?.n ?? 0,
          active: activeUsers?.n ?? 0,
          inactive: inactiveUsers?.n ?? 0,
          paid_subscribers: paidSubscribers?.n ?? 0,
          expiring_7d: expiring7d?.n ?? 0,
          expired: expiredSubs?.n ?? 0,
          brand_onboarded: brandOnboarded?.n ?? 0,
          by_plan: Object.fromEntries(byPlan.map((r) => [r.plan, r.n])),
          expiring_list: expiringList.map((u) => ({
            email: u.email,
            plan: u.plan,
            expires_at: u.subscription_expires_at?.toISOString() ?? null,
          })),
        },
        checks: {
          total: totalChecks?.n ?? 0,
          today: checksToday?.n ?? 0,
          last_7d: checks7d?.n ?? 0,
          approved: approvedChecks?.n ?? 0,
          rejected: rejectedChecks?.n ?? 0,
          guest: guestChecks?.n ?? 0,
          avg_score: avgScore?.v ?? null,
        },
        conversations: {
          total: totalConversations?.n ?? 0,
          archived: archivedConversations?.n ?? 0,
          today: conversationsToday?.n ?? 0,
          last_7d: conversations7d?.n ?? 0,
        },
        messages: {
          total: totalMessages?.n ?? 0,
          today: messagesToday?.n ?? 0,
          last_7d: messages7d?.n ?? 0,
          user_messages: userMessages?.n ?? 0,
          assistant_messages: assistantMessages?.n ?? 0,
          guest: guestMessages?.n ?? 0,
          with_images: imageMessages?.n ?? 0,
        },
        media: {
          total: totalMedia?.n ?? 0,
          by_category: Object.fromEntries(byCategory.map((r) => [r.category, r.n])),
        },
        problems,
      });
    } catch (err) {
      logger.error({ err }, "Owner assistant overview error");
      res.status(500).json({ error: "تعذر توليد تقرير مساعد المالك" });
    }
  },
);

export default router;
