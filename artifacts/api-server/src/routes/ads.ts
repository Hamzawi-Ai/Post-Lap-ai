import { Router, type IRouter } from "express";
import multer from "multer";
import { unlinkSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { db, usersTable, checksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { logger } from "../lib/logger";
import { planLevel, type Plan } from "@workspace/db";
import { getUserFromToken } from "../middleware/auth";
import { getOpenAI } from "../services/ai/client";
import type OpenAI from "openai";
import { generateBrandedPost, saveGeneratedImage } from "../services/image-gen/brandedPost";
import { getImageProvider, isImageGenAvailable } from "../services/image-gen/provider";

const router: IRouter = Router();

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
  const isGuest = !user;

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

    const [inserted] = await db
      .insert(checksTable)
      .values({
        user_id: user?.id ?? null,
        status: finalResult.status,
        reason,
        score: finalResult.score,
      })
      .returning({ id: checksTable.id });

    if (user) {
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
    }

    // Guests only receive Safe/Warning/High-Risk — full analysis is hidden.
    const response: Record<string, unknown> = {
      id: inserted.id,
      status: finalResult.status,
      reason: isGuest ? "" : reason,
      score: finalResult.score,
      message: messageMap[finalResult.status] ?? finalResult.status,
      frames_checked: framesChecked,
      violations: isGuest ? [] : finalResult.violations,
      suggestions: isGuest ? [] : finalResult.suggestions,
    };

    res.json(response);
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

  if (!isImageGenAvailable()) {
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
      // Shared pipeline: brand memory + media library + configured provider.
      const result = await generateBrandedPost({
        userId: user.id,
        description: productDescription,
        productImageBase64,
        regenerateNote,
      });

      if (!result) {
        res.status(500).json({ error: "لم يتم توليد صورة. حاول مرة أخرى." });
        return;
      }
      res.json({ url: result.url });
    } catch (err) {
      logger.error({ err }, "new_post image gen error");
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

    const provider = getImageProvider();
    const generated = await provider.generate({
      prompt: editPrompt,
      referenceImages: [
        {
          mimeType: "image/jpeg",
          data: imageBase64.replace(/^data:image\/[a-z]+;base64,/, ""),
        },
      ],
    });

    if (generated) {
      const genBuffer = Buffer.from(generated.data, "base64");
      // Save fixed image for authenticated users so refresh doesn't lose it
      let publicUrl: string | null = null;
      if (user) {
        const [userRow] = await db
          .select({ company_id: usersTable.company_id })
          .from(usersTable)
          .where(eq(usersTable.id, user.id))
          .limit(1);
        publicUrl = await saveGeneratedImage(
          user.id,
          userRow?.company_id ?? null,
          genBuffer,
          generated.mimeType,
        );
      }
      res.json({
        url: publicUrl ?? `data:${generated.mimeType};base64,${generated.data}`,
      });
    } else {
      res.status(500).json({ error: "لم يتم توليد صورة" });
    }
  } catch (err) {
    logger.error({ err }, "Image gen error");
    res.status(500).json({ error: "حدث خطأ أثناء توليد الصورة" });
  }
});

export default router;
