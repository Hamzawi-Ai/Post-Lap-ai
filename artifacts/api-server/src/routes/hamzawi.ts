import { Router, type IRouter } from "express";
import multer from "multer";
import { tmpdir } from "os";
import { db, usersTable, hamzawiMessagesTable, hamzawiConversationsTable, userBrandMemoryTable, mediaAssetsTable, type MediaAssetCategory } from "@workspace/db";
import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { logger } from "../lib/logger";
import { planLevel, type Plan } from "@workspace/db";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { getUserFromToken } from "../middleware/auth";
import { MediaService } from "../services/media/MediaService";
import { getOpenAI } from "../services/ai/client";
import { buildChatContext } from "../services/ai/contextBuilder";
// Side-effect import: registers the beta tool metadata into the ToolRegistry
// at server start. Registration is idempotent and required by the Reasoner (P1).
import "../services/ai/tools";
import { toolRegistry } from "../services/ai/tools";
import { classifyIntent } from "../services/ai/reasoner";
import { evaluateToolAccess } from "../services/ai/validator";
import { generateBrandedPost } from "../services/image-gen/brandedPost";
import { getConfig } from "../lib/config";
import {
  applyPartialBrandSave,
  markBrandOnboardingComplete,
  buildBrandMemoryBlock,
  upsertBrandMemory,
  appendDesignSample,
  appendMarketingNote,
  isBrandProfileComplete,
} from "../services/brand/brain";

// TODO(prompt-studio): consume AgentConfig — vision_model (override for vision turns)
const VISION_MODEL = "gpt-4o";
// TODO(prompt-studio): consume AgentConfig — text_model (override for text turns)
const TEXT_MODEL = "gpt-4o-mini";

const router: IRouter = Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "تجاوزت الحد المسموح به للمحادثة. حاول بعد دقيقة." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Dedicated rate limiter for upload endpoint — tighter window to prevent
// repeated unauthenticated multipart allocations exhausting /tmp disk.
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "تجاوزت حد رفع الملفات. حاول بعد دقيقة." },
  standardHeaders: true,
  legacyHeaders: false,
});
import { SESSION_SECRET } from "../lib/secrets";

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

/**
 * First-entry welcome after brand setup is complete.
 * Personalized from the profile — greets by name, confirms data is saved,
 * and (only if no logo) suggests uploading one later to improve results.
 */
function getWelcomeInstruction(hasLogo: boolean): string {
  const logoLine = hasLogo
    ? ""
    : "\n- لاحظ أن شعار النشاط غير مرفوع بعد: اقترح بلطف على المستخدم رفعه لاحقاً من زر المشبك 📎 لتحسين جودة نتائج التصميم.";
  return `
المستخدم أكمل للتو إعداد هوية نشاطه التجاري ويدخل إليك لأول مرة. أرسل له رسالة ترحيب قصيرة وودّية (٣-٥ جمل) بهذا الشكل:
- ابدأ بتحية وارحب باسّم نشاطه التجاري مع ذكر مجال نشاطه (إن كانا محفوظين).
- أخبره أن معلومات نشاطه أصبحت محفوظة وأنك تذكّره دائماً.
- وضّح أنك ستستخدم هذه المعلومات تلقائياً في جميع طلبات التصميم وكتابة المنشورات (الاسم، المجال، الألوان، الأسلوب...).
- يمكنك اقتراح خيارات سريعة مثل: تصميم منشور عرض، أو كتابة إعلان ممول.
- لا تعرض ترقية ولا تذكر أسعاراً ولا تذكر أي تعليمات برمجية.${logoLine}`;
}

/**
 * Permissions + marketing-notes rules applied once brand setup is done.
 * Hamzawi reads the full profile but may ONLY auto-save the two notes fields.
 */
function getPermissionsInstruction(): string {
  return `
صلاحياتك على بيانات النشاط التجاري:
- أنت تقرأ بيانات النشاط بالكامل (أعلاه) وتستخدمها في كل رد وتصميم.
- الحقلان الوحيدان اللذان يمكنك حفظهما تلقائياً هما:
  1. hamzawi_notes — وصف داخلي تكتبه أنت عن العميل أو نشاطك (معلومات مفيدة عن احتياجاته وسلوكه).
  2. marketing_notes — ملاحظات تسويقية دائمة طلبها العميل نفسه (مثل: "أفضل استخدام اللهجة الليبية" أو "لا أحب التصاميم المزدحمة").
- لحفظ أحدهما ضع في نهاية ردك: %%NOTES_SAVE%%{"hamzawi_notes": "..."} أو %%NOTES_SAVE%%{"marketing_notes": "..."} بدون أي نص حولها.
- لا تحفظ ولا تعدّل أبداً بيانات النشاط الأساسية (اسم النشاط، نوع النشاط، العنوان، الهاتف، الألوان، الأسلوب، النبذة، الشعار) — تعديلها يتم فقط من صفحة "هوية النشاط التجاري". إذا طلب المستخدم تعديلها، وجّهه إلى صفحة إعدادات النشاط.
- عند إبداء المستخدم تفضيلاً دائماً مفيداً للتسويق (مثل اللهجة المفضلة، أو عدم حبّه لأسلوب معين)، اقترح بلطف: "هل تريد أن أحفظ هذه الملاحظة لاستخدامها في المستقبل؟" واحفظها عبر %%NOTES_SAVE%% فقط بعد موافقته الصريحة. لا تحوّل كل رسالة إلى ذاكرة، ولا تحفظ إلا المعلومات القيّمة على المدى الطويل.
- إذا احتاج المستخدم رفع شعار أو تصاميم مرجعية لتحسين التصميم، اطلب منه رفعها من زر المشبك 📎 في المحادثة وستُضاف تلقائياً إلى ملف نشاطه.
- ابقَ متخصصاً في التسويق والإعلان وكتابة المحتوى وتصميم المنشورات والهوية البصرية فقط — لا تتوسع إلى مجالات أخرى.`;
}

// TODO(prompt-studio): consume AgentConfig — system_prompt_prefix, agent_name, agent_role_description,
//   personality_notes, behavior_rules, safety_rules (inject into buildSystemPrompt after Studio integration pass)
function buildSystemPrompt(
  plan: Plan | string,
  memory: BrandMemoryData | null,
  isOnboarding: boolean,
  assetContext?: string,
  userName?: string,
  companyName?: string
): string {
  const level = planLevel(plan);

  const planCapabilities: Record<number, string> = {
    1: "زائر (المستوى 1/5) — يكشف فقط: اشرح نتائج الفحص، لكن لا تقدم اقتراحات تصحيح مفصّلة. شجّعه على التسجيل",
    2: "مسجّل (المستوى 2/5) — يقترح بدائل: قدّم اقتراحات محددة لتحسين الإعلان لكن لا تولّد صوراً",
    3: "Smart Fix (المستوى 3/5) — يصلح الإعلانات: قدم تصحيحات مفصّلة، أخبره أنه يستطيع طلب توليد صورة بديلة متوافقة عبر الذكاء الاصطناعي",
    4: "Content (المستوى 4/5) — إدارة المحتوى: قدم كامل الدعم بما فيه توليد منشورات من وصف+صورة، وإنشاء نصوص تسويقية",
    5: "Agency (المستوى 5/5) — وكالة: كامل الصلاحيات. يدعم أنشطة تجارية متعددة. يمكنه إدارة هويات بصرية متعددة",
  };

  // Identity header — greet by name when known.
  const identityLines: string[] = [];
  if (userName) identityLines.push(`- المستخدم الحالي: ${userName}`);
  if (companyName) identityLines.push(`- الشركة/المنشأة: ${companyName}`);
  const identityBlock = identityLines.length > 0
    ? `\nهوية المستخدم:\n${identityLines.join("\n")}\n`
    : "";

  const memoryBlock = buildBrandMemoryBlock(memory);

  // Explicit asset listing — names each category and count so the model knows exactly what exists.
  const assetsBlock = assetContext
    ? `\nالأصول المحفوظة لهذا المستخدم (مُرفقة كصور عند الحاجة — استخدمها تلقائياً):\n${assetContext}\n`
    : "";

  const assetUsageInstruction = assetContext
    ? `- كلما كان طلب المستخدم قابلاً للاستفادة من أحد الأصول المذكورة أعلاه (الشعار، صور المنتجات، نماذج التصميم...)، أشر صراحةً إلى أنك ستستخدمه وحدد أيّها بالاسم — مثال: "سأستخدم الشعار الذي رفعته" أو "I'll use the logo you uploaded".`
    : "";

  const funnelInstruction = isOnboarding ? "" : getFunnelInstruction(level);
  const onboardingInstruction = isOnboarding ? getOnboardingInstruction() : "";
  const designGenInstruction = getDesignGenerationInstruction(level);

  const permissionsInstruction =
    (!isOnboarding && level >= 2 && memory?.brand_onboarded)
      ? getPermissionsInstruction()
      : "";

  // Pricing line derived from config.json — single source of truth.
  const cfg = getConfig();
  const pricingLine = cfg.pricing.plans
    .map((p) => `${p.name} (${p.price} ${cfg.pricing.currency}/شهر)`)
    .join("، ");

  return `أنت حمزاوي، مساعد تسويقي ذكي متخصص في سياسات إعلانات Meta وTikTok. شخصيتك ودية، محترفة، عملية.
${identityBlock}
مستوى خطة المستخدم: ${planCapabilities[level] ?? planCapabilities[1]}

${memoryBlock}${assetsBlock}

تعليمات:
- رد دائماً بلغة المستخدم (عربي أو إنجليزي حسب رسالته)
- كن مباشراً وعملياً — لا تعيد شرح ما يعرفه المستخدم
- عند تلقّي تقرير فحص، حلّله وقدم توصيات واضحة حسب مستوى الخطة
- إذا طلب خدمة تتجاوز مستواه، اذكر الخطة المناسبة مرة واحدة فقط بدون ضغط
- خطط الترقية المتاحة: مسجّل (مجاني)، ${pricingLine}
- تملك تلقائياً جميع أصول النشاط المحفوظة (الشعار، التصاميم المرجعية، صور المنتجات، مكتبة الوسائط) وتستخدمها تلقائياً عند ملاءمتها للمهمة (التعرف على الشعار، تحليل التصميم، التصميم، وصف المنتج...).
- لا تطلب أبداً من المستخدم رفع شعار أو أصول أو تصاميم موجودة أصلاً في ملف نشاطه — استخدم ما هو محفوظ مباشرة.
${assetUsageInstruction}
${funnelInstruction}
${onboardingInstruction}
${designGenInstruction}
${permissionsInstruction}`;
}

/**
 * Design generation behaviour (Content plan and above, level 4+).
 * Hamzawi generates the requested design directly through the shared image
 * pipeline by emitting a GENERATE_POST marker; the server renders the image
 * and returns it in the chat. Lower plans get a normal capability reply only.
 */
function getDesignGenerationInstruction(level: number): string {
  if (level < 4) return "";
  return `
توليد التصاميم (متاح من خطتك):
- عندما يطلب المستخدم تصميماً (منشور، بوست، ستوري، بانر، فلاير، بوستر، صورة إعلان، صورة ترويجية...) — قم بتوليده مباشرة.
- لا تقترح أبداً Canva أو Photoshop أو أي أدوات تصميم يدوية أو خارجية، إلا إذا طلب المستخدم صراحةً نصيحة للتصميم اليدوي.
- استخرج من الطلب والمعلومات المحفوظة: اسم النشاط، مجاله، العرض/المنتج المعروض، الألوان، والأسلوب المفضل. اكتب وصف التصميم بالإنجليزية، موجزاً ودقيقاً (يتضمن اسم النشاط، النص الأساسي للمنشور إن ذُكر، ألوان الهوية، الحجم إن ذُكر مثل 1080x1350، والأسلوب).
- إذا كانت تفاصيل العرض ناقصة بشكل جوهري (ما الذي سيعرضه؟) اسأل سؤالاً واحداً قصيراً قبل التوليد — وإلا ولّد مباشرة دون إطالة.

قاعدة صارمة وغير قابلة للاستثناء — توليد الصورة:
عندما يكون نية المستخدم توليد تصميم أو صورة، يجب أن يحتوي ردك دائماً على الماركر التالي بدون استثناء:
%%GENERATE_POST%%{"description": "وصف التصميم بالإنجليزية هنا"}%%END%%
لا تردّ بنص وحده. لا تؤكد. لا تسأل. لا تصف ما ستفعله. فقط أضف الماركر مع وصف كامل للتصميم.
إذا كان الوصف ناقصاً، خمّن القيم المناسبة من بيانات النشاط المحفوظة وولّد مباشرة.`;
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

/**
 * Parse %%NOTES_SAVE%%{...}%% markers from AI reply.
 * Only the two editable fields are accepted: hamzawi_notes, marketing_notes.
 */
function parseNotesSaves(reply: string): {
  cleanedReply: string;
  notes: { hamzawi_notes?: string; marketing_notes?: string };
} {
  const notes: { hamzawi_notes?: string; marketing_notes?: string } = {};
  const regex = /%%NOTES_SAVE%%(\{[\s\S]*?\})%%END%%/g;
  let cleanedReply = reply;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(reply)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as Record<string, unknown>;
      if (typeof parsed.hamzawi_notes === "string" && parsed.hamzawi_notes.trim()) {
        notes.hamzawi_notes = parsed.hamzawi_notes.trim();
      }
      if (typeof parsed.marketing_notes === "string" && parsed.marketing_notes.trim()) {
        notes.marketing_notes = parsed.marketing_notes.trim();
      }
    } catch {}
  }
  cleanedReply = cleanedReply.replace(/%%NOTES_SAVE%%[\s\S]*?%%END%%/g, "").trim();

  return { cleanedReply, notes };
}

/**
 * Parse %%GENERATE_POST%%{"description":"..."}%%END%% markers from AI reply.
 * Emitted by Hamzawi (level 4+) when the user requests a design — the server
 * then runs the shared image pipeline and attaches the generated image.
 */
function parseGeneratePost(reply: string): {
  cleanedReply: string;
  description: string | null;
} {
  const regex = /%%GENERATE_POST%%(\{[\s\S]*?\})%%END%%/g;
  let description: string | null = null;
  let cleanedReply = reply;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(reply)) !== null) {
    try {
      const parsed = JSON.parse(match[1]) as { description?: string };
      if (parsed.description && parsed.description.trim()) {
        description = parsed.description.trim();
      }
    } catch {}
  }
  cleanedReply = cleanedReply.replace(/%%GENERATE_POST%%[\s\S]*?%%END%%/g, "").trim();

  return { cleanedReply, description };
}

// POST /api/hamzawi/chat
// Supports isInit: true — proactive first message from Hamzawi, no user input needed.
// Used to auto-start guided onboarding for level 4+ users on chat open.
router.post("/hamzawi/chat", chatLimiter, async (req, res): Promise<void> => {
  const { message, checkReport, isInit, conversationId: conversationIdInput } = req.body as {
    message?: string;
    isInit?: boolean;
    conversationId?: number | null;
    checkReport?: {
      status: string;
      score: number;
      violations?: Array<{ type: string; reason: string; severity: string }>;
      suggestions?: string[];
    } | null;
  };

  // isInit allows generating the first proactive message without a user message
  if (!isInit && !message?.trim()) {
    res.status(400).json({ error: "الرسالة مطلوبة" });
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

  // Resolve conversation for authenticated users only.
  // Guest users (no auth) never receive a conversation_id — their messages are session-scoped.
  // Explicitly reject conversationId from unauthenticated callers so we don't silently accept
  // and ignore a field that requires auth context.
  if (!user && conversationIdInput) {
    res.status(401).json({ error: "يجب تسجيل الدخول لاستخدام معرّف المحادثة" });
    return;
  }

  let resolvedConversationId: number | null = null;
  if (user) {
    if (conversationIdInput) {
      // Validate ownership: the conversation must belong to this user and not be archived.
      const [ownedConv] = await db
        .select({ id: hamzawiConversationsTable.id })
        .from(hamzawiConversationsTable)
        .where(
          and(
            eq(hamzawiConversationsTable.id, conversationIdInput),
            eq(hamzawiConversationsTable.user_id, user.id),
            isNull(hamzawiConversationsTable.archived_at)
          )
        )
        .limit(1);

      if (!ownedConv) {
        res.status(403).json({ error: "المحادثة غير موجودة أو لا تملك صلاحية الوصول إليها" });
        return;
      }
      resolvedConversationId = ownedConv.id;
    } else {
      try {
        const firstMessage = message?.trim() ?? "محادثة جديدة";
        // Use first ~40 chars of the user message as the auto-generated title
        const autoTitle = firstMessage.length > 40
          ? `${firstMessage.slice(0, 40)}…`
          : firstMessage;
        const [newConv] = await db
          .insert(hamzawiConversationsTable)
          .values({ user_id: user.id, title: autoTitle })
          .returning();
        resolvedConversationId = newConv.id;
      } catch (e) {
        logger.error({ e }, "Failed to auto-create conversation");
        // Non-fatal — continue without a conversation_id
      }
    }
  }

  try {
    const ctx = await buildChatContext({ user, sessionId: sessionRawId, conversationId: resolvedConversationId });
    const { plan, level, memory, isOnboarding, recentMessages, brandAssets, assetContext } = ctx;

    // isInit: proactive first message.
    // - Brand setup not done → start guided onboarding.
    // - Brand setup done but no chat history → personalized welcome.
    // - History already exists → nothing new to say (avoid re-welcoming on reload).
    let triggerMessage: string | undefined;
    if (isInit) {
      if (isOnboarding) {
        triggerMessage = "ابدأ الآن بتحية المستخدم وأول سؤال في جلسة إعداد هوية النشاط التجاري.";
      } else if (user && memory && isBrandProfileComplete(memory) && recentMessages.length === 0) {
        triggerMessage = `أرسل رسالة الترحيب الأولى للمستخدم.\n${getWelcomeInstruction(!!memory.logo_url)}`;
      } else {
        res.json({ reply: null, sessionId: sessionRawId, onboardingComplete: false });
        return;
      }
    }

    const systemPrompt = buildSystemPrompt(plan, memory, isOnboarding, assetContext, ctx.userName, ctx.companyName);

    const historyForAI = recentMessages
      .reverse()
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content.replace(/%%GENERATED_IMAGE%%[\s\S]*?%%END%%/g, "").trim(),
      }));

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

    // Intent-based vision routing: use the vision model + attach the company's
    // brand images ONLY when the request actually needs image understanding.
    // Normal text conversations stay on the cheaper text model.
    const hasBrandImages = !!(brandAssets && brandAssets.images.length > 0);

    // P1: Reasoner — rule-first intent classification (LLM only for
    // ambiguous/compound requests). Routing-only: drives vision-model choice
    // and upsell messaging. Tool execution is NOT migrated yet.
    const intentDecision = await classifyIntent(message ?? "");
    const needsVision = !isInit && !!message && intentDecision.needsVision;

    // P1: Validator-backed upsell gate. Asking Hamzawi to generate a branded
    // post requires level 4+ (content/agency). If the account can't do it,
    // answer with a clear upsell instead of an LLM call whose marker would be
    // ignored downstream (the pipeline below already guards level >= 4).
    if (!isInit && message && intentDecision.intent === "generate_image") {
      const imageTool = toolRegistry.get("generate_image");
      if (imageTool) {
        const access = evaluateToolAccess(imageTool, {
          user: user
            ? {
                id: user.id,
                is_active: user.is_active,
                subscription_expires_at: user.subscription_expires_at,
              }
            : null,
          level,
        });
        if (!access.allowed) {
          const reply = access.message ?? "هذه الميزة غير متاحة حالياً.";
          await db.insert(hamzawiMessagesTable).values({
            user_id: user?.id ?? null,
            session_id: sessionRawId,
            role: "user",
            content: message,
            conversation_id: resolvedConversationId,
          });
          await db.insert(hamzawiMessagesTable).values({
            user_id: user?.id ?? null,
            session_id: sessionRawId,
            role: "assistant",
            content: reply,
            conversation_id: resolvedConversationId,
          });
          if (resolvedConversationId) {
            const now = new Date();
            await db
              .update(hamzawiConversationsTable)
              .set({ updated_at: now, last_message_at: now })
              .where(eq(hamzawiConversationsTable.id, resolvedConversationId))
              .catch(() => {});
          }
          res.json({
            reply,
            sessionId: sessionRawId,
            onboardingComplete: false,
            upsell: true,
            ...(resolvedConversationId ? { conversationId: resolvedConversationId } : {}),
          });
          return;
        }
      }
    }

    let userContentParts:
      | string
      | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
    let model = TEXT_MODEL;
    if (needsVision && hasBrandImages) {
      model = VISION_MODEL;
      userContentParts = [
        { type: "text", text: userContent },
        ...brandAssets!.images.map((img) => ({
          type: "image_url" as const,
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        })),
      ];
    } else {
      userContentParts = userContent;
    }

    const response = await getOpenAI().chat.completions.create({
      model,
      max_tokens: 600,
      messages: [
        { role: "system", content: systemPrompt },
        ...historyForAI,
        { role: "user", content: triggerMessage ?? userContentParts },
      ],
    });

    let rawReply = response.choices[0]?.message?.content ?? "عذراً، حدث خطأ. حاول مرة أخرى.";

    // Last-resort retry: if generate_image was the resolved intent but the model
    // omitted the %%GENERATE_POST%% marker, send one strict follow-up prompt.
    // This is a diagnostic backstop only — the primary path (expanded patterns +
    // stronger system prompt) should handle the common cases without reaching here.
    if (
      !isInit &&
      intentDecision.intent === "generate_image" &&
      user &&
      level >= 4 &&
      !rawReply.includes("%%GENERATE_POST%%")
    ) {
      const truncatedMsg = (message ?? "").slice(0, 120);
      logger.warn(
        { intent: "generate_image", userId: user.id, message: truncatedMsg },
        "missing_image_marker — marker absent on first attempt, retrying"
      );
      try {
        const retryResponse = await getOpenAI().chat.completions.create({
          model,
          max_tokens: 400,
          messages: [
            { role: "system", content: systemPrompt },
            ...historyForAI,
            { role: "user", content: triggerMessage ?? userContentParts },
            { role: "assistant", content: rawReply },
            {
              role: "user",
              content:
                'أضف الماركر المطلوب الآن — فقط: %%GENERATE_POST%%{"description": "وصف التصميم بالإنجليزية"}%%END%%',
            },
          ],
        });
        const retryContent = retryResponse.choices[0]?.message?.content ?? "";
        if (retryContent.includes("%%GENERATE_POST%%")) {
          // Merge: keep original conversational text, append the marker from the retry
          const markerMatch = retryContent.match(/%%GENERATE_POST%%[\s\S]*?%%END%%/);
          if (markerMatch) {
            rawReply = `${rawReply}\n${markerMatch[0]}`;
          }
          logger.info(
            { intent: "generate_image", userId: user.id, message: truncatedMsg, retry_success: true },
            "missing_image_marker — retry_success"
          );
        }
      } catch (retryErr) {
        logger.error({ retryErr }, "missing_image_marker retry failed");
      }
    }

    // Parse partial saves, onboarding completion, notes-save, and generate-post markers
    const { cleanedReply, partialData, isOnboardingComplete } = parsePartialSaves(rawReply);
    const { cleanedReply: notesReply, notes } = parseNotesSaves(cleanedReply);
    const { cleanedReply: generateReply, description: generateDescription } = parseGeneratePost(notesReply);

    // Save the two editable notes fields (only with explicit AI consent markers)
    if (user && (notes.hamzawi_notes || notes.marketing_notes)) {
      try {
        if (notes.hamzawi_notes) {
          await upsertBrandMemory(user.id, { hamzawi_notes: notes.hamzawi_notes });
        }
        if (notes.marketing_notes) {
          await appendMarketingNote(user.id, notes.marketing_notes);
        }
      } catch (e) {
        logger.error({ e }, "Failed to save Hamzawi notes");
      }
    }

    // Apply partial business-field saves ONLY during guided onboarding.
    // Post-onboarding Hamzawi is restricted to the two notes fields above.
    if (user && isOnboarding && partialData.length > 0) {
      try {
        await applyPartialBrandSave(user.id, partialData);
      } catch (e) {
        logger.error({ e }, "Failed to save partial brand data");
      }
    }

    // Mark onboarding as complete
    if (user && isOnboardingComplete) {
      try {
        await markBrandOnboardingComplete(user.id);
      } catch (e) {
        logger.error({ e }, "Failed to mark onboarding complete");
      }
    }

    const reply = generateReply;

    // For isInit: only store the assistant message (no user message shown/stored)
    if (!isInit && message?.trim()) {
      await db.insert(hamzawiMessagesTable).values({
        user_id: user?.id ?? null,
        session_id: sessionRawId,
        role: "user",
        content: message,
        conversation_id: resolvedConversationId,
      });
    }

    // When Hamzawi emitted a GENERATE_POST marker (level 4+ design request),
    // run the shared image pipeline and return the generated image.
    let storedContent = reply;
    let generatedImageUrl: string | undefined;
    let generatedDescription: string | undefined;
    if (user && generateDescription && level >= 4) {
      try {
        const generated = await generateBrandedPost({
          userId: user.id,
          description: generateDescription,
        });
        if (generated) {
          generatedImageUrl = generated.url;
          generatedDescription = generateDescription;
          // Persist the image reference inside the stored content so it survives
          // page reload via the existing messages endpoint (no schema change).
          storedContent = `${reply}\n%%GENERATED_IMAGE%%${JSON.stringify({
            url: generated.url,
            description: generateDescription,
          })}%%END%%`;
        }
      } catch (e) {
        logger.error({ e }, "Failed to generate post from Hamzawi marker");
      }
    }

    await db.insert(hamzawiMessagesTable).values({
      user_id: user?.id ?? null,
      session_id: sessionRawId,
      role: "assistant",
      content: storedContent,
      conversation_id: resolvedConversationId,
    });

    // Update conversation timestamps after each assistant reply
    if (resolvedConversationId) {
      const now = new Date();
      await db
        .update(hamzawiConversationsTable)
        .set({ updated_at: now, last_message_at: now })
        .where(eq(hamzawiConversationsTable.id, resolvedConversationId))
        .catch((e: unknown) => logger.error({ e }, "Failed to update conversation timestamps"));
    }

    res.json({
      reply,
      sessionId: sessionRawId,
      onboardingComplete: isOnboardingComplete,
      ...(resolvedConversationId ? { conversationId: resolvedConversationId } : {}),
      ...(generatedImageUrl ? { imageUrl: generatedImageUrl, generatedDescription } : {}),
    });
  } catch (err) {
    logger.error({ err }, "Hamzawi chat error");
    res.status(500).json({ error: "حدث خطأ في المساعد" });
  }
});

// ─── Conversation CRUD endpoints ────────────────────────────────────────────

// GET /api/hamzawi/conversations
// List non-archived conversations for the logged-in user, sorted by
// last_message_at DESC NULLS LAST, then created_at DESC.
router.get("/hamzawi/conversations", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول" });
    return;
  }

  try {
    const conversations = await db
      .select()
      .from(hamzawiConversationsTable)
      .where(
        and(
          eq(hamzawiConversationsTable.user_id, user.id),
          isNull(hamzawiConversationsTable.archived_at)
        )
      )
      .orderBy(
        sql`${hamzawiConversationsTable.last_message_at} DESC NULLS LAST`,
        desc(hamzawiConversationsTable.created_at)
      );

    res.json({ conversations });
  } catch (err) {
    logger.error({ err }, "Hamzawi list conversations error");
    res.status(500).json({ error: "حدث خطأ" });
  }
});

// POST /api/hamzawi/conversations
// Create a new conversation for the logged-in user. Returns id + title.
router.post("/hamzawi/conversations", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول" });
    return;
  }

  const { title } = req.body as { title?: string };
  const conversationTitle = title?.trim() || "محادثة جديدة";

  try {
    const [conversation] = await db
      .insert(hamzawiConversationsTable)
      .values({ user_id: user.id, title: conversationTitle })
      .returning();

    res.json({ id: conversation.id, title: conversation.title });
  } catch (err) {
    logger.error({ err }, "Hamzawi create conversation error");
    res.status(500).json({ error: "حدث خطأ" });
  }
});

// PATCH /api/hamzawi/conversations/:id
// Rename a conversation (title only). The conversation must belong to the user.
router.patch("/hamzawi/conversations/:id", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول" });
    return;
  }

  const conversationId = parseInt(req.params.id, 10);
  if (isNaN(conversationId)) {
    res.status(400).json({ error: "معرّف المحادثة غير صالح" });
    return;
  }

  const { title } = req.body as { title?: string };
  if (!title?.trim()) {
    res.status(400).json({ error: "العنوان مطلوب" });
    return;
  }

  try {
    const [updated] = await db
      .update(hamzawiConversationsTable)
      .set({ title: title.trim(), updated_at: new Date() })
      .where(
        and(
          eq(hamzawiConversationsTable.id, conversationId),
          eq(hamzawiConversationsTable.user_id, user.id)
        )
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "المحادثة غير موجودة" });
      return;
    }

    res.json({ id: updated.id, title: updated.title });
  } catch (err) {
    logger.error({ err }, "Hamzawi rename conversation error");
    res.status(500).json({ error: "حدث خطأ" });
  }
});

// DELETE /api/hamzawi/conversations/:id
// Soft-delete: sets archived_at = now(). The row and its messages are preserved.
// Archived conversations are excluded from the list endpoint.
router.delete("/hamzawi/conversations/:id", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول" });
    return;
  }

  const conversationId = parseInt(req.params.id, 10);
  if (isNaN(conversationId)) {
    res.status(400).json({ error: "معرّف المحادثة غير صالح" });
    return;
  }

  try {
    const [archived] = await db
      .update(hamzawiConversationsTable)
      .set({ archived_at: new Date(), updated_at: new Date() })
      .where(
        and(
          eq(hamzawiConversationsTable.id, conversationId),
          eq(hamzawiConversationsTable.user_id, user.id)
        )
      )
      .returning();

    if (!archived) {
      res.status(404).json({ error: "المحادثة غير موجودة" });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Hamzawi archive conversation error");
    res.status(500).json({ error: "حدث خطأ" });
  }
});

// ─── Messages endpoint ───────────────────────────────────────────────────────

// GET /api/hamzawi/messages
// Optional query param: conversationId — when present, returns messages for that
// specific conversation (authentication + ownership required). When absent, falls
// back to the legacy session/user query so existing frontend code works unchanged.
router.get("/hamzawi/messages", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  const verifiedSessionId = user ? null : getVerifiedSessionId(req);
  const conversationIdRaw = req.query.conversationId as string | undefined;
  const conversationId = conversationIdRaw ? parseInt(conversationIdRaw, 10) : null;

  try {
    let messages: typeof hamzawiMessagesTable.$inferSelect[];

    if (conversationId && !isNaN(conversationId)) {
      // Conversation-scoped reads require authentication — unauthenticated callers
      // cannot enumerate messages across guessable numeric conversation IDs (IDOR guard).
      if (!user) {
        res.status(401).json({ error: "يجب تسجيل الدخول للوصول إلى المحادثة" });
        return;
      }

      // Validate ownership via hamzawi_conversations table before returning any rows.
      const [ownedConv] = await db
        .select({ id: hamzawiConversationsTable.id })
        .from(hamzawiConversationsTable)
        .where(
          and(
            eq(hamzawiConversationsTable.id, conversationId),
            eq(hamzawiConversationsTable.user_id, user.id)
          )
        )
        .limit(1);

      if (!ownedConv) {
        res.status(403).json({ error: "المحادثة غير موجودة أو لا تملك صلاحية الوصول إليها" });
        return;
      }

      messages = await db
        .select()
        .from(hamzawiMessagesTable)
        .where(
          and(
            eq(hamzawiMessagesTable.conversation_id, conversationId),
            eq(hamzawiMessagesTable.user_id, user.id)
          )
        )
        .orderBy(desc(hamzawiMessagesTable.created_at))
        .limit(30);
    } else {
      // Legacy path: return last 30 messages for the session/user (no conversation filter).
      messages = await db
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
    }

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
    hamzawi_notes,
    marketing_notes,
    brand_onboarded,
    append_design_sample,
    design_samples,
  } = req.body as {
    business_name?: string;
    business_type?: string;
    address?: string;
    phone?: string;
    logo_url?: string;
    primary_colors?: string;
    preferred_style?: string;
    notes?: string;
    hamzawi_notes?: string;
    marketing_notes?: string;
    brand_onboarded?: boolean;
    append_design_sample?: string;
    design_samples?: string[];
  };

  // ── Brand identity write guard (TEMPORARY beta mechanism) ─────────────────
  // Business rule: each account is one business with exactly one official logo,
  // chosen only during onboarding or from Brand Settings. Hamzawi must never
  // silently set/replace the logo or design references, and uploaded images
  // must never become logos automatically.
  //
  // For the beta, the Brand Settings form marks itself with source:"settings".
  // This trusts a client-supplied field and is a TEMPORARY compatibility
  // mechanism only — the long-term implementation must enforce this entirely
  // server-side (based on the authenticated request's origin/flow), not on a
  // client-supplied flag.
  const touchesBrandIdentity =
    logo_url !== undefined ||
    append_design_sample !== undefined ||
    design_samples !== undefined;

  if (touchesBrandIdentity) {
    const [existingMemory] = await db
      .select()
      .from(userBrandMemoryTable)
      .where(eq(userBrandMemoryTable.user_id, user.id))
      .limit(1);
    const profileComplete = isBrandProfileComplete(existingMemory ?? null);
    const inGuidedOnboarding = level >= 4 && !profileComplete;
    const isSettingsSource = (req.body as { source?: string }).source === "settings";

    if (!isSettingsSource && !inGuidedOnboarding) {
      res.status(403).json({
        error:
          "تغيير الشعار والتصاميم المرجعية يتم فقط من صفحة هوية النشاط التجاري أو أثناء إعداد النشاط",
      });
      return;
    }
  }

  try {
    const payload: Record<string, unknown> = {
      business_name,
      business_type,
      address,
      phone,
      logo_url,
      primary_colors,
      preferred_style,
      notes,
      hamzawi_notes,
      marketing_notes,
      ...(Array.isArray(design_samples)
        ? { design_samples: JSON.stringify(design_samples.filter(Boolean)) }
        : {}),
      ...(brand_onboarded !== undefined ? { brand_onboarded } : {}),
    };

    // Remove undefined values
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) delete payload[key];
    }

    await upsertBrandMemory(user.id, payload as Parameters<typeof upsertBrandMemory>[1]);

    // Append a single design sample (guarded: only allowed from Brand Settings
    // source or during guided onboarding — see guard above)
    if (append_design_sample) {
      await appendDesignSample(user.id, append_design_sample);
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Hamzawi update memory error");
    res.status(500).json({ error: "حدث خطأ" });
  }
});

// Pre-auth middleware for upload — runs BEFORE Multer writes any temp file,
// preventing unauthenticated requests from touching the disk at all.
async function requireUploadAuth(
  req: Parameters<typeof getUserFromToken>[0] extends infer R ? { headers: { authorization?: string } } : never,
  res: import("express").Response,
  next: import("express").NextFunction,
): Promise<void> {
  const user = await getUserFromToken((req as import("express").Request).headers.authorization);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول" });
    return;
  }
  const level = planLevel(user.plan);
  if (level < 2) {
    res.status(403).json({ error: "رفع الأصول متاح من خطة مسجّل فأعلى" });
    return;
  }
  // Attach to request so the handler doesn't need to re-query
  (req as import("express").Request & { uploadUser: typeof user }).uploadUser = user;
  next();
}

// POST /api/hamzawi/upload-asset
// Accepts an image upload, saves it to disk, inserts a media_assets row,
// and returns file metadata (never Base64).
// Middleware order: rate-limit → pre-auth (before disk) → multer → handler.
// Optional multipart field: category (default "portfolio"; use "logo" for brand logos).
router.post(
  "/hamzawi/upload-asset",
  uploadLimiter,
  requireUploadAuth,
  uploadMulter.single("file"),
  async (req, res): Promise<void> => {
    const user = (req as import("express").Request & { uploadUser: Awaited<ReturnType<typeof getUserFromToken>> }).uploadUser!;

    if (!req.file) {
      res.status(400).json({ error: "الرجاء رفع صورة" });
      return;
    }

    const tmpPath = req.file.path;
    const mimeType = req.file.mimetype;
    const rawCategory = (req.body as { category?: string }).category ?? "portfolio";

    // Validate category against the allowlist before any filesystem operation
    let category: MediaAssetCategory;
    try {
      category = MediaService.validateCategory(rawCategory);
    } catch {
      cleanup(tmpPath);
      res.status(400).json({ error: "فئة الملف غير مدعومة. الفئات المسموحة: logo, portfolio, generated, products, documents" });
      return;
    }

    try {
      // Look up the user's company_id; fall back to user.id for solo users
      const [userRow] = await db
        .select({ company_id: usersTable.company_id })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);

      const companyId = userRow?.company_id ?? user.id;

      // Read from temp file and delete it — all fs I/O owned by MediaService
      const buffer = await MediaService.consumeTempFile(tmpPath);

      const { filename, relativePath, publicUrl } = await MediaService.saveFile(
        companyId,
        category,
        req.file.originalname ?? "upload",
        buffer,
        mimeType,
      );

      let inserted: typeof mediaAssetsTable.$inferSelect;
      try {
        [inserted] = await db
          .insert(mediaAssetsTable)
          .values({
            user_id: user.id,
            company_id: userRow?.company_id ?? null,
            category,
            filename,
            relative_path: relativePath,
            mime_type: mimeType,
            size: buffer.byteLength,
          })
          .returning();
      } catch (dbErr) {
        // DB insert failed — remove the orphaned file to maintain consistency
        await MediaService.deleteFile(relativePath).catch(() => {});
        throw dbErr;
      }

      res.json({
        // `url` kept for backward compatibility with existing frontend callers
        url: publicUrl,
        id: inserted.id,
        category: inserted.category,
        filename: inserted.filename,
        relativePath: inserted.relative_path,
        publicUrl,
        size: inserted.size,
        mimeType: inserted.mime_type,
      });
    } catch (err) {
      logger.error({ err }, "Asset upload error");
      cleanup(tmpPath);
      res.status(500).json({ error: "حدث خطأ أثناء رفع الملف" });
    }
  },
);

export default router;
