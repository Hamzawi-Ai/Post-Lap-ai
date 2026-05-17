import { Router, type IRouter } from "express";
import multer from "multer";
import { tmpdir } from "os";
import { db, usersTable, hamzawiMessagesTable, userBrandMemoryTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import jwt from "jsonwebtoken";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { planLevel, type Plan } from "@workspace/db";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { readFileSync, unlinkSync, existsSync } from "fs";

const router: IRouter = Router();
const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-secret";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

let _gemini: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!_gemini) {
    const key = process.env.GEMINI_API_KEY ?? process.env.NANO_BANANA_API_KEY ?? "";
    _gemini = new GoogleGenAI({ apiKey: key });
  }
  return _gemini;
}

const uploadMulter = multer({
  dest: tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error("نوع الملف غير مدعوم. فقط صور PNG/JPG/WEBP"));
  },
});

function cleanup(path: string) {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {}
}

// --- Signed session cookie helpers ---
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
  address?: string | null;
  phone?: string | null;
  logo_url?: string | null;
  primary_colors?: string | null;
  preferred_style?: string | null;
  notes?: string | null;
  design_samples?: string | null;
  brand_onboarded?: boolean;
}

/**
 * Upgrade nudge injected naturally at end of Hamzawi response per user level.
 * Level 1 → register, Level 2 → smart_fix, Level 3 → content. Level 4+ no nudge.
 */
function getFunnelInstruction(level: number): string {
  if (level === 1) {
    return `
قاعدة القمع التسويقي:
بعد الإجابة على أي طلب مكتمل للمستخدم، أضف جملة واحدة طبيعية في نهاية ردك:
"عشان تشوف ليش مرفوضة بالتفصيل وتحصل على توصيات محددة — سجّل دخولك مجاناً ✨"`;
  }
  if (level === 2) {
    return `
قاعدة القمع التسويقي:
بعد الإجابة على أي طلب مكتمل للمستخدم، أضف جملة واحدة طبيعية في نهاية ردك:
"عشان تصلح الإعلان تلقائياً بالذكاء الاصطناعي — جرّب خطة Smart Fix 🛠️"`;
  }
  if (level === 3) {
    return `
قاعدة القمع التسويقي:
بعد الإجابة على أي طلب مكتمل للمستخدم، أضف جملة واحدة طبيعية في نهاية ردك:
"عشان تصمم منشوراتك بشعار نشاطك وألوانك مباشرة — انتقل لخطة إدارة المحتوى 🎨"`;
  }
  return "";
}

/**
 * Onboarding instructions for level 4+ users who haven't completed brand setup.
 * Uses two markers:
 * - %%PARTIAL_SAVE%%{field:value,...}%%END%% — emitted after each step to save incrementally
 * - %%ONBOARDING_COMPLETE%% — emitted when all required steps are done
 */
function getOnboardingInstruction(): string {
  return `
وضع خاص — إعداد هوية النشاط التجاري (ONBOARDING MODE):
المستخدم لم يُكمل إعداد هوية نشاطه بعد. ابدأ الآن جلسة الإعداد الموجّهة خطوة بخطوة.

الخطوات مرتّبة (اسأل واحدة في كل رد وانتظر):
1. اسم النشاط التجاري
2. نوع النشاط (مطعم، متجر، عيادة، شركة خدمات، ...)
3. العنوان أو المنطقة
4. رقم الهاتف للتواصل
5. الألوان الأساسية للهوية البصرية (مثلاً: أزرق وأبيض)
6. الأسلوب المفضل في التصاميم (بسيط، حيوي، فاخر، ...)
7. الشعار والتصاميم السابقة: قل للمستخدم "يمكنك رفع شعار نشاطك باستخدام زر المشبك 📎 — سيُحفظ تلقائياً كشعار. وإذا كان لديك تصاميم إعلانية سابقة أعجبتك، ارفعها واحدة واحدة وستُضاف كنماذج مرجعية نستخدمها في التصميم. هذا الخطوة اختيارية — أخبرني عندما تنتهي أو اكتب 'تخطّ'"
ملاحظة: الرفعة الأولى عبر المشبك تُحفظ كشعار (logo)، وكل رفعة لاحقة تُضاف كنموذج تصميم سابق (design_samples). للتمييز: ارفع الشعار أولاً.

بعد كل خطوة يجيب فيها المستخدم، احفظ المعلومة في نهاية ردك بدون أي نص حولها بهذا الشكل:
%%PARTIAL_SAVE%%{"field_name": "field_value"}%%END%%

أسماء الحقول: business_name, business_type, address, phone, primary_colors, preferred_style

بعد اكتمال كل الخطوات الإلزامية (1-6)، لخّص ما جمعته وقل للمستخدم أن إعداد هوية نشاطه اكتمل، ثم أضف في نهاية ردك:
%%ONBOARDING_COMPLETE%%

إذا قال المستخدم "تخطّ" أو "بعدين"، انتقل للخطوة التالية وأضف:
%%PARTIAL_SAVE%%{"skipped": "true"}%%END%%`;
}

function buildSystemPrompt(
  plan: Plan | string,
  memory: BrandMemoryData | null,
  isOnboarding: boolean
): string {
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
    const sampleCount = memory.design_samples
      ? (() => { try { return (JSON.parse(memory.design_samples) as unknown[]).length; } catch { return 0; } })()
      : 0;
    memoryBlock = `
معلومات النشاط التجاري المحفوظة لهذا المستخدم:
- اسم النشاط: ${memory.business_name}
- نوع النشاط: ${memory.business_type ?? "غير محدد"}
- العنوان: ${memory.address ?? "غير محدد"}
- الهاتف: ${memory.phone ?? "غير محدد"}
- الألوان: ${memory.primary_colors ?? "غير محدد"}
- الأسلوب المفضل: ${memory.preferred_style ?? "غير محدد"}
- ملاحظات: ${memory.notes ?? "لا يوجد"}
${memory.logo_url ? "- الشعار: محفوظ ✓" : "- الشعار: لم يُرفع بعد"}
${sampleCount > 0 ? `- نماذج تصاميم سابقة: ${sampleCount} مرفوعة ✓` : "- نماذج تصاميم سابقة: لا يوجد"}
`;
  }

  const funnelInstruction = isOnboarding ? "" : getFunnelInstruction(level);
  const onboardingInstruction = isOnboarding ? getOnboardingInstruction() : "";

  const updateInstruction = (!isOnboarding && level >= 2 && memory?.brand_onboarded)
    ? `
تحديث بيانات النشاط التجاري:
إذا قال المستخدم "حدّث بياناتي" أو "عدّل معلوماتي" أو طلب تغيير أي معلومة في هويته البصرية، اسأله عن الحقل الذي يريد تعديله ثم احفظ التحديث في نهاية ردك بهذا الشكل (بدون نص حوله):
%%PARTIAL_SAVE%%{"field_name": "new_value"}%%END%%
الحقول المتاحة: business_name, business_type, address, phone, primary_colors, preferred_style, notes`
    : "";

  return `أنت حمزاوي، مساعد تسويقي ذكي متخصص في سياسات إعلانات Meta وTikTok. شخصيتك ودية، محترفة، عملية.

مستوى خطة المستخدم: ${planCapabilities[level] ?? planCapabilities[1]}

${memoryBlock}

تعليمات:
- رد دائماً بلغة المستخدم (عربي أو إنجليزي حسب رسالته)
- كن مباشراً وعملياً — لا تعيد شرح ما يعرفه المستخدم
- عند تلقّي تقرير فحص، حلّله وقدم توصيات واضحة حسب مستوى الخطة
- إذا طلب خدمة تتجاوز مستواه، اذكر الخطة المناسبة مرة واحدة فقط بدون ضغط
- خطط الترقية المتاحة: مسجّل (مجاني)، Smart Fix (400 د.ل/شهر)، Content (800 د.ل/شهر)، Agency (1000 د.ل/شهر)
${funnelInstruction}
${onboardingInstruction}
${updateInstruction}`;
}

/**
 * Parse %%PARTIAL_SAVE%%{...}%%END%% markers from AI reply.
 * Returns all parsed field updates and cleaned reply.
 */
function parsePartialSaves(reply: string): {
  cleanedReply: string;
  partialData: Array<Record<string, string>>;
  isOnboardingComplete: boolean;
} {
  const partialData: Array<Record<string, string>> = [];
  const partialRegex = /%%PARTIAL_SAVE%%(\{[\s\S]*?\})%%END%%/g;
  let cleanedReply = reply;
  let match: RegExpExecArray | null;

  while ((match = partialRegex.exec(reply)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as Record<string, string>;
      if (!parsed.skipped) partialData.push(parsed);
    } catch {}
  }
  cleanedReply = cleanedReply.replace(/%%PARTIAL_SAVE%%[\s\S]*?%%END%%/g, "").trim();

  const isOnboardingComplete = cleanedReply.includes("%%ONBOARDING_COMPLETE%%");
  cleanedReply = cleanedReply.replace(/%%ONBOARDING_COMPLETE%%/g, "").trim();

  return { cleanedReply, partialData, isOnboardingComplete };
}

async function upsertBrandMemory(userId: number, fields: Partial<BrandMemoryData>) {
  const existing = await db
    .select()
    .from(userBrandMemoryTable)
    .where(eq(userBrandMemoryTable.user_id, userId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(userBrandMemoryTable)
      .set({ ...fields, updated_at: new Date() })
      .where(eq(userBrandMemoryTable.user_id, userId));
  } else {
    await db.insert(userBrandMemoryTable).values({ user_id: userId, ...fields });
  }
}

// POST /api/hamzawi/chat
// Supports isInit: true — proactive first message from Hamzawi, no user input needed.
// Used to auto-start guided onboarding for level 4+ users on chat open.
router.post("/hamzawi/chat", async (req, res): Promise<void> => {
  const { message, checkReport, isInit } = req.body as {
    message?: string;
    isInit?: boolean;
    checkReport?: {
      status: string;
      score: number;
      violations?: Array<{ type: string; reason: string; severity: string }>;
      suggestions?: string[];
    } | null;
  };

  // isInit allows generating the first proactive message without a user message
  if (!isInit && !message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const user = await getUserFromToken(req.headers.authorization);

  let sessionRawId: string;
  let signedCookie: string;
  if (user) {
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
    const level = planLevel(plan);

    const memory = user
      ? await db
          .select()
          .from(userBrandMemoryTable)
          .where(eq(userBrandMemoryTable.user_id, user.id))
          .limit(1)
          .then((r) => r[0] ?? null)
      : null;

    // Onboarding mode: level 4+ users who haven't completed brand setup
    const isOnboarding = level >= 4 && !memory?.brand_onboarded;

    // isInit but no onboarding needed — nothing to proactively say; return null
    if (isInit && !isOnboarding) {
      res.json({ reply: null, sessionId: sessionRawId, onboardingComplete: false });
      return;
    }

    const systemPrompt = buildSystemPrompt(plan, memory, isOnboarding);

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

    // For isInit onboarding: use a hidden trigger prompt (not stored, not shown)
    const triggerMessage = isInit
      ? "ابدأ الآن بتحية المستخدم وأول سؤال في جلسة إعداد هوية النشاط التجاري."
      : undefined;

    let userContent = message ?? "";
    if (!isInit && checkReport && message) {
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
      max_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        ...historyForAI,
        { role: "user", content: triggerMessage ?? userContent },
      ],
    });

    const rawReply = response.choices[0]?.message?.content ?? "عذراً، حدث خطأ. حاول مرة أخرى.";

    // Parse partial saves and onboarding completion markers
    const { cleanedReply, partialData, isOnboardingComplete } = parsePartialSaves(rawReply);

    // Apply partial field saves incrementally — works both during onboarding AND post-onboarding
    // (for "حدّث بياناتي" conversational updates). Whitelist fields for safety.
    const ALLOWED_PARTIAL_FIELDS = new Set([
      "business_name", "business_type", "address", "phone",
      "primary_colors", "preferred_style", "notes",
    ]);
    if (user && partialData.length > 0) {
      const mergedFields: Partial<BrandMemoryData> = {};
      for (const chunk of partialData) {
        for (const [k, v] of Object.entries(chunk)) {
          if (ALLOWED_PARTIAL_FIELDS.has(k)) {
            (mergedFields as Record<string, unknown>)[k] = v;
          }
        }
      }
      if (Object.keys(mergedFields).length > 0) {
        try {
          await upsertBrandMemory(user.id, mergedFields);
        } catch (e) {
          logger.error({ e }, "Failed to save partial brand data");
        }
      }
    }

    // Mark onboarding as complete
    if (user && isOnboardingComplete) {
      try {
        await upsertBrandMemory(user.id, { brand_onboarded: true });
      } catch (e) {
        logger.error({ e }, "Failed to mark onboarding complete");
      }
    }

    const reply = cleanedReply;

    // For isInit: only store the assistant message (no user message shown/stored)
    if (!isInit && message?.trim()) {
      await db.insert(hamzawiMessagesTable).values({
        user_id: user?.id ?? null,
        session_id: sessionRawId,
        role: "user",
        content: message,
      });
    }

    await db.insert(hamzawiMessagesTable).values({
      user_id: user?.id ?? null,
      session_id: sessionRawId,
      role: "assistant",
      content: reply,
    });

    res.json({
      reply,
      sessionId: sessionRawId,
      onboardingComplete: isOnboardingComplete,
    });
  } catch (err) {
    logger.error({ err }, "Hamzawi chat error");
    res.status(500).json({ error: "حدث خطأ في المساعد" });
  }
});

// GET /api/hamzawi/messages
router.get("/hamzawi/messages", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
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
            : eq(hamzawiMessagesTable.session_id, "__none__")
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

  const {
    business_name,
    business_type,
    address,
    phone,
    logo_url,
    primary_colors,
    preferred_style,
    notes,
    brand_onboarded,
    append_design_sample,
  } = req.body as {
    business_name?: string;
    business_type?: string;
    address?: string;
    phone?: string;
    logo_url?: string;
    primary_colors?: string;
    preferred_style?: string;
    notes?: string;
    brand_onboarded?: boolean;
    append_design_sample?: string;
  };

  try {
    // If appending a design sample, fetch existing samples and merge
    let design_samples_value: string | undefined;
    if (append_design_sample) {
      const existing = await db
        .select({ design_samples: userBrandMemoryTable.design_samples })
        .from(userBrandMemoryTable)
        .where(eq(userBrandMemoryTable.user_id, user.id))
        .limit(1)
        .then((r) => r[0]?.design_samples ?? null);

      let arr: string[] = [];
      if (existing) {
        try { arr = JSON.parse(existing) as string[]; } catch { arr = []; }
      }
      // Keep max 5 design samples (avoid unbounded DB growth)
      arr = [...arr, append_design_sample].slice(-5);
      design_samples_value = JSON.stringify(arr);
    }

    const payload: Partial<BrandMemoryData> & { updated_at?: Date } = {
      business_name,
      business_type,
      address,
      phone,
      logo_url,
      primary_colors,
      preferred_style,
      notes,
      ...(brand_onboarded !== undefined ? { brand_onboarded } : {}),
      ...(design_samples_value !== undefined ? { design_samples: design_samples_value } : {}),
      updated_at: new Date(),
    };

    await upsertBrandMemory(user.id, payload);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Hamzawi update memory error");
    res.status(500).json({ error: "حدث خطأ" });
  }
});

// POST /api/hamzawi/upload-asset
// Accepts an image upload, converts to base64 data URL, returns it.
// The client is responsible for persisting the URL to memory (logo_url, etc.)
router.post("/hamzawi/upload-asset", uploadMulter.single("file"), async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول" });
    return;
  }

  const level = planLevel(user.plan);
  if (level < 2) {
    res.status(403).json({ error: "رفع الأصول متاح من خطة مسجّل فأعلى" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "الرجاء رفع صورة" });
    return;
  }

  const filePath = req.file.path;
  const mimeType = req.file.mimetype;

  try {
    const buffer = readFileSync(filePath);
    const base64 = buffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;
    res.json({ url: dataUrl });
  } catch (err) {
    logger.error({ err }, "Asset upload error");
    res.status(500).json({ error: "حدث خطأ أثناء رفع الملف" });
  } finally {
    cleanup(filePath);
  }
});

export default router;
