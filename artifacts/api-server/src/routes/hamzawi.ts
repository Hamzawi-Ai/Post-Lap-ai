import { Router, type IRouter } from "express";
import { db, usersTable, hamzawiMessagesTable, userBrandMemoryTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import jwt from "jsonwebtoken";
import OpenAI from "openai";
import { planLevel, type Plan } from "@workspace/db";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const router: IRouter = Router();
const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-secret";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// --- Signed session cookie helpers ---
// Format: {rawId}.{hmac_hex}
// The HMAC is computed over rawId using SESSION_SECRET to prevent forgery.

function signSessionId(rawId: string): string {
  const sig = createHmac("sha256", SESSION_SECRET).update(rawId).digest("hex");
  return `${rawId}.${sig}`;
}

function verifySessionId(signed: string): string | null {
  const dotIdx = signed.lastIndexOf(".");
  if (dotIdx === -1) return null;
  const rawId = signed.slice(0, dotIdx);
  const sig = signed.slice(dotIdx + 1);
  if (!rawId || !sig) return null;
  const expected = createHmac("sha256", SESSION_SECRET).update(rawId).digest("hex");
  try {
    const sigBuf = Buffer.from(sig, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expectedBuf.length) return null;
    return timingSafeEqual(sigBuf, expectedBuf) ? rawId : null;
  } catch {
    return null;
  }
}

function generateSignedSession(): { rawId: string; signed: string } {
  const rawId = `anon_${Date.now()}_${randomBytes(8).toString("hex")}`;
  return { rawId, signed: signSessionId(rawId) };
}

/**
 * Read and verify the hamzawi_session cookie.
 * Returns the verified rawId (used as DB key) or null if cookie is absent/invalid.
 */
function getVerifiedSessionId(req: { headers: { cookie?: string } }): string | null {
  const cookieHeader = req.headers.cookie ?? "";
  const match = cookieHeader.match(/hamzawi_session=([^;]+)/);
  if (!match?.[1]) return null;
  const decoded = decodeURIComponent(match[1]);
  return verifySessionId(decoded);
}

function setSessionCookie(res: { setHeader: (k: string, v: string) => void }, signed: string) {
  res.setHeader(
    "Set-Cookie",
    `hamzawi_session=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}`
  );
}

async function getUserFromToken(authHeader?: string) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, SESSION_SECRET) as { userId?: number };
    if (!decoded.userId) return null;
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .limit(1);
    return user ?? null;
  } catch {
    return null;
  }
}

interface BrandMemoryData {
  business_name?: string | null;
  business_type?: string | null;
  preferred_style?: string | null;
  notes?: string | null;
}

function buildSystemPrompt(plan: Plan | string, memory?: BrandMemoryData | null): string {
  const level = planLevel(plan);

  const planCapabilities: Record<number, string> = {
    1: "زائر (المستوى 1/5) — يكشف فقط: اشرح نتائج الفحص، لكن لا تقدم اقتراحات تصحيح مفصّلة. شجّعه على التسجيل",
    2: "مسجّل (المستوى 2/5) — يقترح بدائل: قدّم اقتراحات محددة لتحسين الإعلان لكن لا تولّد صوراً",
    3: "Smart Fix (المستوى 3/5) — يصلح الإعلانات: قدم تصحيحات مفصّلة، أخبره أنه يستطيع طلب توليد صورة بديلة متوافقة عبر الذكاء الاصطناعي",
    4: "Content (المستوى 4/5) — إدارة المحتوى: قدم كامل الدعم بما فيه توليد منشورات من وصف+صورة، وإنشاء نصوص تسويقية",
    5: "Agency (المستوى 5/5) — وكالة: كامل الصلاحيات. يدعم أنشطة تجارية متعددة. يمكنه إدارة هويات بصرية متعددة",
  };

  let memoryBlock = "";
  if (memory?.business_name) {
    memoryBlock = `
معلومات النشاط التجاري المحفوظة لهذا المستخدم:
- اسم النشاط: ${memory.business_name}
- نوع النشاط: ${memory.business_type ?? "غير محدد"}
- الأسلوب المفضل: ${memory.preferred_style ?? "غير محدد"}
- ملاحظات: ${memory.notes ?? "لا يوجد"}
`;
  }

  return `أنت حمزاوي، مساعد تسويقي ذكي متخصص في سياسات إعلانات Meta وTikTok. شخصيتك ودية، محترفة، عملية.

مستوى خطة المستخدم: ${planCapabilities[level] ?? planCapabilities[1]}

${memoryBlock}

تعليمات:
- رد دائماً بلغة المستخدم (عربي أو إنجليزي حسب رسالته)
- كن مباشراً وعملياً — لا تعيد شرح ما يعرفه المستخدم
- عند تلقّي تقرير فحص، حلّله وقدم توصيات واضحة حسب مستوى الخطة
- إذا طلب خدمة تتجاوز مستواه، اذكر الخطة المناسبة مرة واحدة فقط بدون ضغط
- خطط الترقية المتاحة: مسجّل (مجاني)، Smart Fix (400 د.ل/شهر)، Content (800 د.ل/شهر)، Agency (1000 د.ل/شهر)`;
}

// POST /api/hamzawi/chat
router.post("/hamzawi/chat", async (req, res): Promise<void> => {
  const { message, checkReport } = req.body as {
    message?: string;
    checkReport?: {
      status: string;
      score: number;
      violations?: Array<{ type: string; reason: string; severity: string }>;
      suggestions?: string[];
    } | null;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const user = await getUserFromToken(req.headers.authorization);

  // For anonymous visitors: verify existing signed cookie or issue a new one.
  // The rawId is used as the DB session_id key; the signed value is sent in the cookie.
  let sessionRawId: string;
  let signedCookie: string;
  if (user) {
    // Authenticated users don't need anonymous session — use a stable placeholder
    sessionRawId = `user_${user.id}`;
    signedCookie = signSessionId(sessionRawId);
  } else {
    const existing = getVerifiedSessionId(req);
    if (existing) {
      sessionRawId = existing;
      signedCookie = signSessionId(existing);
    } else {
      const created = generateSignedSession();
      sessionRawId = created.rawId;
      signedCookie = created.signed;
    }
  }

  setSessionCookie(res, signedCookie);

  try {
    const plan = (user?.plan ?? "visitor") as Plan;

    const memory = user
      ? await db
          .select()
          .from(userBrandMemoryTable)
          .where(eq(userBrandMemoryTable.user_id, user.id))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null;

    const systemPrompt = buildSystemPrompt(plan, memory);

    const recentMessages = await db
      .select()
      .from(hamzawiMessagesTable)
      .where(
        user
          ? eq(hamzawiMessagesTable.user_id, user.id)
          : eq(hamzawiMessagesTable.session_id, sessionRawId)
      )
      .orderBy(desc(hamzawiMessagesTable.created_at))
      .limit(10);

    const historyForAI = recentMessages
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    let userContent = message;
    if (checkReport) {
      const reportSummary = `[تقرير فحص الإعلان — الحالة: "${checkReport.status}" — النقاط: ${checkReport.score}/100${
        checkReport.violations?.length
          ? ` — المخالفات: ${checkReport.violations.map((v) => `${v.type}: ${v.reason} (${v.severity})`).join("; ")}`
          : ""
      }${
        checkReport.suggestions?.length
          ? ` — الاقتراحات المبدئية: ${checkReport.suggestions.join("; ")}`
          : ""
      }]`;
      userContent = `${reportSummary}\n\n${message}`;
    }

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        ...historyForAI,
        { role: "user", content: userContent },
      ],
    });

    const reply = response.choices[0]?.message?.content ?? "عذراً، حدث خطأ. حاول مرة أخرى.";

    await db.insert(hamzawiMessagesTable).values({
      user_id: user?.id ?? null,
      session_id: sessionRawId,
      role: "user",
      content: message,
    });

    await db.insert(hamzawiMessagesTable).values({
      user_id: user?.id ?? null,
      session_id: sessionRawId,
      role: "assistant",
      content: reply,
    });

    res.json({ reply, sessionId: sessionRawId });
  } catch (err) {
    logger.error({ err }, "Hamzawi chat error");
    res.status(500).json({ error: "حدث خطأ في المساعد" });
  }
});

// GET /api/hamzawi/messages
router.get("/hamzawi/messages", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  // For anonymous visitors, only return messages if they hold a valid signed cookie.
  // An absent or tampered cookie returns an empty list (not an error).
  const verifiedSessionId = user ? null : getVerifiedSessionId(req);

  try {
    const messages = await db
      .select()
      .from(hamzawiMessagesTable)
      .where(
        user
          ? eq(hamzawiMessagesTable.user_id, user.id)
          : verifiedSessionId
            ? eq(hamzawiMessagesTable.session_id, verifiedSessionId)
            : eq(hamzawiMessagesTable.session_id, "__none__") // no valid session → empty result
      )
      .orderBy(desc(hamzawiMessagesTable.created_at))
      .limit(30);

    res.json({ messages: messages.reverse() });
  } catch (err) {
    logger.error({ err }, "Hamzawi get messages error");
    res.status(500).json({ error: "حدث خطأ" });
  }
});

// GET /api/hamzawi/memory
router.get("/hamzawi/memory", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول" });
    return;
  }

  try {
    const [memory] = await db
      .select()
      .from(userBrandMemoryTable)
      .where(eq(userBrandMemoryTable.user_id, user.id))
      .limit(1);

    res.json({ memory: memory ?? null });
  } catch (err) {
    logger.error({ err }, "Hamzawi get memory error");
    res.status(500).json({ error: "حدث خطأ" });
  }
});

// PUT /api/hamzawi/memory
router.put("/hamzawi/memory", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول" });
    return;
  }

  const level = planLevel(user.plan);
  if (level < 2) {
    res.status(403).json({ error: "حفظ هوية النشاط متاح من خطة مسجّل فأعلى" });
    return;
  }

  const { business_name, business_type, logo_url, primary_colors, preferred_style, notes } =
    req.body as {
      business_name?: string;
      business_type?: string;
      logo_url?: string;
      primary_colors?: string;
      preferred_style?: string;
      notes?: string;
    };

  try {
    const existing = await db
      .select()
      .from(userBrandMemoryTable)
      .where(eq(userBrandMemoryTable.user_id, user.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(userBrandMemoryTable)
        .set({
          business_name,
          business_type,
          logo_url,
          primary_colors,
          preferred_style,
          notes,
          updated_at: new Date(),
        })
        .where(eq(userBrandMemoryTable.user_id, user.id));
    } else {
      await db.insert(userBrandMemoryTable).values({
        user_id: user.id,
        business_name,
        business_type,
        logo_url,
        primary_colors,
        preferred_style,
        notes,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Hamzawi update memory error");
    res.status(500).json({ error: "حدث خطأ" });
  }
});

export default router;
