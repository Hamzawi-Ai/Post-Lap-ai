import { Router, type IRouter } from "express";
import multer from "multer";
import { createWriteStream, unlinkSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import { db, usersTable, checksTable, userBrandMemoryTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { logger } from "../lib/logger";
import jwt from "jsonwebtoken";
import { planLevel, type Plan } from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const router: IRouter = Router();
import { SESSION_SECRET } from "../lib/secrets";

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

// Rate limiter: 10 requests per minute per IP
const checkRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "تجاوزت الحد المسموح به. حاول بعد دقيقة." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Multer: store files in temp dir, max 50MB
const upload = multer({
  dest: tmpdir(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "video/mp4"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("نوع الملف غير مدعوم. فقط png/jpg/mp4"));
    }
  },
});

// Structured Meta policy system prompt
const SYSTEM_PROMPT = `أنت خبير سياسات إعلانات Meta. افحص الصورة المرفقة وفق الأولويات التالية بالترتيب:

(أولوية قصوى — مخالفات مباشرة):
1. صور قبل/بعد (Before/After) لأجزاء الجسم أو الوزن
2. تركيز مفرط أو مكبّر على أجزاء الجسم (بطن، أرداف، صدر، إلخ)
3. وعود ربح سريع أو نتائج مضمونة أو سحرية
4. منتجات طبية أو مالية غير مرخصة أو ادعاءات صحية غير مثبتة
5. نسبة نص في الصورة تتجاوز 20%

(تقييم عام):
6. وعود كاذبة أو مضللة أو مبالغة
7. محتوى صادم أو استهداف سمات شخصية (وزن، مرض، عرق، دين)
8. محتوى جنسي أو إيحائي

رد فقط بـ JSON صالح بالشكل التالي بدون أي نص إضافي:
{
  "status": "ممتاز" | "جيد" | "مرفوض",
  "score": 0-100,
  "violations": [
    { "type": "نوع المخالفة", "reason": "الشرح بالعربي", "severity": "high" | "medium" | "low" }
  ],
  "suggestions": ["اقتراح 1", "اقتراح 2"]
}
إذا لم توجد مخالفات، violations يكون مصفوفة فارغة [].`;

async function imageToBase64(filePath: string): Promise<string> {
  const { readFileSync } = await import("fs");
  const buffer = readFileSync(filePath);
  return buffer.toString("base64");
}

async function extractFrames(videoPath: string, maxFrames: number): Promise<string[]> {
  const { execSync } = await import("child_process");
  const framesDir = join(tmpdir(), `frames_${Date.now()}`);
  mkdirSync(framesDir, { recursive: true });

  try {
    execSync(
      `ffmpeg -i "${videoPath}" -vf fps=1 -frames:v ${maxFrames} "${framesDir}/frame_%03d.jpg" -y 2>/dev/null`,
      { timeout: 120000 }
    );

    const { readdirSync } = await import("fs");
    const files = readdirSync(framesDir)
      .filter((f) => f.endsWith(".jpg"))
      .sort()
      .map((f) => join(framesDir, f));
    return files;
  } catch {
    return [];
  }
}

function cleanup(...paths: string[]) {
  for (const p of paths) {
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {}
  }
}

async function cleanupDir(dir: string) {
  try {
    const { readdirSync, rmdirSync } = await import("fs");
    const files = readdirSync(dir);
    for (const f of files) cleanup(join(dir, f));
    rmdirSync(dir);
  } catch {}
}

interface CheckResult {
  status: "ممتاز" | "جيد" | "مرفوض";
  score: number;
  violations: Array<{ type: string; reason: string; severity: string }>;
  suggestions: string[];
}

async function checkImage(base64: string, mimeType = "image/jpeg"): Promise<CheckResult> {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 500,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "{}";
  try {
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match?.[0] ?? "{}") as Partial<CheckResult>;
    return {
      status: parsed.status ?? "جيد",
      score: parsed.score ?? 50,
      violations: parsed.violations ?? [],
      suggestions: parsed.suggestions ?? [],
    };
  } catch {
    return { status: "جيد", score: 50, violations: [], suggestions: [] };
  }
}

async function getUserFromToken(authHeader?: string) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, SESSION_SECRET) as { userId?: number; role?: string };
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

// POST /check — main ad inspection endpoint
router.post("/check", checkRateLimit, upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: "الرجاء رفع صورة أو فيديو" });
    return;
  }

  const filePath = req.file.path;
  const mimeType = req.file.mimetype;
  const isVideo = mimeType === "video/mp4";

  const user = await getUserFromToken(req.headers.authorization);
  const plan = (user?.plan ?? "visitor") as Plan;
  const level = planLevel(plan);
  const maxFrames = level >= 2 ? 60 : 11;

  try {
    let finalResult: CheckResult;
    let framesChecked: number | null = null;

    if (isVideo) {
      const frames = await extractFrames(filePath, maxFrames);
      framesChecked = frames.length;

      if (frames.length === 0) {
        finalResult = { status: "جيد", score: 50, violations: [], suggestions: [] };
      } else {
        finalResult = { status: "ممتاز", score: 100, violations: [], suggestions: [] };

        for (const framePath of frames) {
          const base64 = await imageToBase64(framePath);
          const result = await checkImage(base64);

          if (result.status === "مرفوض") {
            finalResult = result;
            break;
          }
          if (result.status === "جيد" && finalResult.status === "ممتاز") {
            finalResult = result;
          }
          if (result.score < finalResult.score) {
            finalResult.score = result.score;
          }
          finalResult.violations.push(...result.violations);
          finalResult.suggestions.push(...result.suggestions);
        }

        const framesDir = dirname(frames[0]);
        await cleanupDir(framesDir);
      }
    } else {
      const mtype = mimeType === "image/png" ? "image/png" : "image/jpeg";
      const base64 = await imageToBase64(filePath);
      finalResult = await checkImage(base64, mtype);
    }

    const messageMap: Record<string, string> = {
      "ممتاز": "ممتاز انطلق",
      "جيد": "جيد لكن وصوله ضعيف",
      "مرفوض": `سوف يتم رفضه${finalResult.violations[0] ? ` بسبب: ${finalResult.violations[0].reason}` : ""}`,
    };

    const reason = finalResult.violations.map((v) => v.reason).join(". ") || "";

    if (user) {
      await db.insert(checksTable).values({
        user_id: user.id,
        status: finalResult.status,
        reason,
        score: finalResult.score,
      });

      await db
        .update(usersTable)
        .set({
          total_checks: sql`${usersTable.total_checks} + 1`,
          last_check_at: new Date(),
          trials_remaining:
            plan === "visitor" || plan === "registered"
              ? sql`GREATEST(${usersTable.trials_remaining} - 1, 0)`
              : usersTable.trials_remaining,
        })
        .where(eq(usersTable.id, user.id));
    } else {
      await db.insert(checksTable).values({
        user_id: null,
        status: finalResult.status,
        reason,
        score: finalResult.score,
      });
    }

    res.json({
      status: finalResult.status,
      reason,
      score: finalResult.score,
      message: messageMap[finalResult.status] ?? finalResult.status,
      frames_checked: framesChecked,
      violations: finalResult.violations,
      suggestions: finalResult.suggestions,
    });
  } catch (err) {
    logger.error({ err }, "Ad check error");
    res.status(500).json({ error: "حدث خطأ أثناء تحليل الإعلان" });
  } finally {
    cleanup(filePath);
  }
});

// POST /generate-text — generate Libyan dialect ad copy (requires planLevel >= 3)
// Level 4+ (content/agency): also accepts imageBase64 to generate post from image+description
router.post("/generate-text", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "يجب تسجيل الدخول لاستخدام هذه الميزة" });
    return;
  }

  const plan = user.plan as Plan;
  const level = planLevel(plan);
  // Text generation requires Smart Fix / professional or higher (level 3+)
  if (level < 3) {
    res.status(403).json({ error: "توليد النصوص متاح من خطة Smart Fix فأعلى" });
    return;
  }

  const { product, dialect, imageBase64 } = req.body as {
    product?: string;
    dialect?: string;
    imageBase64?: string;
  };

  if (!product || !dialect) {
    res.status(400).json({ error: "product و dialect مطلوبان" });
    return;
  }

  const validDialects = ["شرقية", "غربية", "جنوبية"];
  if (!validDialects.includes(dialect)) {
    res.status(400).json({ error: "اللهجة غير صحيحة" });
    return;
  }

  try {
    // Level 4+ (content/agency): use image + description for richer post generation
    const useImageMode = level >= 4 && !!imageBase64;

    const userContent: Parameters<OpenAI["chat"]["completions"]["create"]>[0]["messages"][number]["content"] = useImageMode
      ? [
          {
            type: "image_url" as const,
            image_url: { url: imageBase64!.startsWith("data:") ? imageBase64! : `data:image/jpeg;base64,${imageBase64}` },
          },
          {
            type: "text" as const,
            text: `بناءً على صورة المنتج المرفقة، اكتب منشور إعلاني احترافي باللهجة الليبية ${dialect} للمنتج/الخدمة: ${product}. استخدم 2-3 إيموجي مناسبة. ممنوع الوعود الكاذبة. اجعله قصيراً وجذاباً ومتوافقاً مع سياسات Meta.`,
          },
        ]
      : `اكتب نص إعلاني فيسبوك باللهجة الليبية ${dialect} للمنتج: ${product}. استخدم 2-3 إيموجي. ممنوع الوعود الكاذبة. قصير وجذاب ومباشر.`;

    const response = await getOpenAI().chat.completions.create({
      model: useImageMode ? "gpt-4o" : "gpt-4o-mini",
      max_tokens: 400,
      messages: [{ role: "user", content: userContent }],
    });

    const text = response.choices[0]?.message?.content ?? "";
    res.json({ text });
  } catch (err) {
    logger.error({ err }, "Text generation error");
    res.status(500).json({ error: "حدث خطأ أثناء توليد النص" });
  }
});

// POST /image-gen — generate/fix ad image via Gemini
// mode "new_post" (level 4+): generate branded post using brand memory + product info
// default mode (level 3+): fix existing ad image per policy violations
router.post("/image-gen", async (req, res): Promise<void> => {
  const user = await getUserFromToken(req.headers.authorization);
  const plan = (user?.plan ?? "visitor") as Plan;
  const level = planLevel(plan);

  const {
    mode,
    imageBase64,
    violations,
    productDescription,
    productImageBase64,
    regenerateNote,
  } = req.body as {
    mode?: string;
    imageBase64?: string;
    violations?: Array<{ type: string; reason: string }>;
    productDescription?: string;
    productImageBase64?: string;
    regenerateNote?: string;
  };

  if (!process.env.GEMINI_API_KEY && !process.env.NANO_BANANA_API_KEY) {
    res.status(503).json({ error: "خدمة توليد الصور غير متاحة حالياً" });
    return;
  }

  // ── new_post mode: generate branded post from scratch ──────────────────────
  if (mode === "new_post") {
    if (!user) {
      res.status(401).json({ error: "يجب تسجيل الدخول لاستخدام هذه الميزة" });
      return;
    }
    if (level < 4) {
      res.status(403).json({ error: "توليد المنشورات المُبوَّبة متاح من خطة إدارة المحتوى فأعلى" });
      return;
    }
    if (!productDescription) {
      res.status(400).json({ error: "وصف المنتج مطلوب" });
      return;
    }

    try {
      const memory = await db
        .select()
        .from(userBrandMemoryTable)
        .where(eq(userBrandMemoryTable.user_id, user.id))
        .limit(1)
        .then((r) => r[0] ?? null);

      const brandContext = memory?.business_name
        ? `Brand identity:\n- Business name: ${memory.business_name}\n- Business type: ${memory.business_type ?? "unspecified"}\n- Brand colors: ${memory.primary_colors ?? "professional defaults"}\n- Design style: ${memory.preferred_style ?? "professional and clean"}\n- Notes: ${memory.notes ?? "none"}`
        : "No brand identity saved — use professional defaults with a clean modern style.";

      let basePrompt = `Create a professional social media advertisement image for Meta (Facebook/Instagram) that is fully compliant with Meta advertising policies.\n\n${brandContext}\n\nProduct/Service: ${productDescription}\n\nRequirements:\n- Professional design matching the brand identity\n- Clean layout with brand colors and style\n- Visually appealing composition for social media\n- No text overlays exceeding 20% of the image\n- No misleading claims or before/after comparisons\n- High quality, scroll-stopping visual`;
      if (regenerateNote) basePrompt += `\n\nAdditional note: ${regenerateNote}`;

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
        { text: basePrompt },
      ];

      const hasLogo = memory?.logo_url?.startsWith("data:");
      if (hasLogo) {
        const logoMatch = memory!.logo_url!.match(/^data:(image\/[a-z]+);base64,(.+)$/);
        if (logoMatch) {
          parts.push({ inlineData: { mimeType: logoMatch[1], data: logoMatch[2] } });
        }
      }

      // Include previous design samples (up to 3) as visual style references
      const designSamples: string[] = (() => {
        if (!memory?.design_samples) return [];
        try { return JSON.parse(memory.design_samples) as string[]; } catch { return []; }
      })();
      const samplesAdded = designSamples.slice(0, 3).filter((s) => s.startsWith("data:")).map((s) => {
        const m = s.match(/^data:(image\/[a-z]+);base64,(.+)$/);
        return m ? { mimeType: m[1], data: m[2] } : null;
      }).filter(Boolean) as Array<{ mimeType: string; data: string }>;
      for (const sample of samplesAdded) {
        parts.push({ inlineData: sample });
      }

      const contextDesc = [
        hasLogo ? "brand logo" : "",
        samplesAdded.length > 0 ? `${samplesAdded.length} design sample(s)` : "",
      ].filter(Boolean).join(" and ");
      if (contextDesc) {
        parts[0].text = `${basePrompt}\n\nProvided visual references: ${contextDesc} — use the logo in the design, and draw inspiration from the style and layout of the design samples.`;
      }

      if (productImageBase64) {
        const productMatch = productImageBase64.match(/^data:(image\/[a-z]+);base64,(.+)$/);
        const mimeType = productMatch?.[1] ?? "image/jpeg";
        const data = productMatch?.[2] ?? productImageBase64.replace(/^data:image\/[a-z]+;base64,/, "");
        const existingNote = contextDesc ? parts[0].text : basePrompt;
        parts[0].text = `${existingNote ?? basePrompt}\n\nA product image is also provided — feature it prominently in the advertisement.`;
        parts.push({ inlineData: { mimeType, data } });
      }

      const gemini = getGemini();
      const result = await gemini.models.generateContent({
        model: "gemini-2.0-flash-exp",
        contents: [{ role: "user", parts }],
        config: { responseModalities: ["IMAGE", "TEXT"] },
      });

      const generatedParts = result.candidates?.[0]?.content?.parts ?? [];
      const imagePart = generatedParts.find(
        (p): p is { inlineData: { mimeType: string; data: string } } =>
          typeof p === "object" && p !== null && "inlineData" in p && !!p.inlineData
      );

      if (imagePart?.inlineData?.data) {
        res.json({ url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` });
      } else {
        res.status(500).json({ error: "لم يتم توليد صورة. حاول مرة أخرى." });
      }
    } catch (err) {
      logger.error({ err }, "Gemini new_post image gen error");
      res.status(500).json({ error: "حدث خطأ أثناء توليد المنشور" });
    }
    return;
  }

  // ── default mode: fix existing ad image ────────────────────────────────────
  if (level < 3) {
    res.status(403).json({ error: "توليد الصورة متاح من خطة Smart Fix فأعلى" });
    return;
  }

  if (!imageBase64) {
    res.status(400).json({ error: "imageBase64 مطلوب" });
    return;
  }

  try {
    const violationsList = violations?.map((v) => `- ${v.type}: ${v.reason}`).join("\n") ?? "";
    const editPrompt = violations?.length
      ? `Edit this advertisement image to fix the following policy violations:\n${violationsList}\nRemove the violations while preserving the overall design, colors, and branding. Make it Meta-compliant.`
      : "Clean up this advertisement image to make it fully compliant with Meta advertising policies while preserving the design.";

    const gemini = getGemini();
    const result = await gemini.models.generateContent({
      model: "gemini-2.0-flash-exp",
      contents: [
        {
          role: "user",
          parts: [
            { text: editPrompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64.replace(/^data:image\/[a-z]+;base64,/, ""),
              },
            },
          ],
        },
      ],
      config: { responseModalities: ["IMAGE", "TEXT"] },
    });

    const parts = result.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find(
      (p): p is { inlineData: { mimeType: string; data: string } } =>
        typeof p === "object" && p !== null && "inlineData" in p && !!p.inlineData
    );

    if (imagePart?.inlineData?.data) {
      res.json({ url: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}` });
    } else {
      res.status(500).json({ error: "لم يتم توليد صورة" });
    }
  } catch (err) {
    logger.error({ err }, "Gemini image gen error");
    res.status(500).json({ error: "حدث خطأ أثناء توليد الصورة" });
  }
});

export default router;
