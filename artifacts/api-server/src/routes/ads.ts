import { Router, type IRouter } from "express";
import multer from "multer";
import { createWriteStream, unlinkSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import OpenAI from "openai";
import { db, usersTable, checksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { logger } from "../lib/logger";
import jwt from "jsonwebtoken";

const __dirname = dirname(fileURLToPath(import.meta.url));
const router: IRouter = Router();
const SESSION_SECRET = process.env.SESSION_SECRET ?? "dev-secret";

// Lazy-initialize OpenAI client so missing key doesn't crash at import time
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
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

// System prompt for ad inspection
const SYSTEM_PROMPT = `أنت خبير سياسات إعلانات Meta وTikTok. افحص الصورة ضد: 
1. وعود كاذبة أو مضللة
2. صور قبل/بعد للجسم
3. محتوى صادم أو مزعج
4. نسبة النص أكثر من 20%
5. استهداف سمات شخصية (وزن، مرض، إلخ)
6. ادعاءات صحية غير مثبتة
7. محتوى جنسي أو إيحائي

رد فقط بـ JSON بالشكل التالي بدون أي نص إضافي:
{"status": "ممتاز" | "جيد" | "مرفوض", "reason": "السبب بالعربي", "score": 0-100}`;

// Helper: convert image file to base64
async function imageToBase64(filePath: string): Promise<string> {
  const { readFileSync } = await import("fs");
  const buffer = readFileSync(filePath);
  return buffer.toString("base64");
}

// Helper: extract frames from video using ffmpeg (1 frame per second)
async function extractFrames(
  videoPath: string,
  maxFrames: number
): Promise<string[]> {
  const { execSync } = await import("child_process");
  const framesDir = join(tmpdir(), `frames_${Date.now()}`);
  mkdirSync(framesDir, { recursive: true });

  try {
    // Extract 1 frame per second
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
    // ffmpeg not available — return empty
    return [];
  }
}

// Helper: clean up temp files
function cleanup(...paths: string[]) {
  for (const p of paths) {
    try {
      if (existsSync(p)) unlinkSync(p);
    } catch {}
  }
}

// Helper: clean up directory and its files
async function cleanupDir(dir: string) {
  try {
    const { readdirSync, rmdirSync } = await import("fs");
    const files = readdirSync(dir);
    for (const f of files) cleanup(join(dir, f));
    rmdirSync(dir);
  } catch {}
}

// Helper: check a single image with GPT-4o
async function checkImage(base64: string, mimeType = "image/jpeg") {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 200,
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
    // Extract JSON from response
    const match = text.match(/\{[\s\S]*\}/);
    return JSON.parse(match?.[0] ?? "{}") as {
      status: "ممتاز" | "جيد" | "مرفوض";
      reason: string;
      score: number;
    };
  } catch {
    return { status: "جيد" as const, reason: "تعذر تحليل الاستجابة", score: 50 };
  }
}

// Helper: get user from JWT token (optional auth)
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

  // Get user if authenticated
  const user = await getUserFromToken(req.headers.authorization);

  // Determine max frames based on plan
  const plan = user?.plan ?? "visitor";
  const maxFrames = plan === "professional" ? 60 : 11;

  try {
    let finalResult: { status: "ممتاز" | "جيد" | "مرفوض"; reason: string; score: number };
    let framesChecked: number | null = null;

    if (isVideo) {
      // Extract frames and check each one
      const frames = await extractFrames(filePath, maxFrames);
      framesChecked = frames.length;

      if (frames.length === 0) {
        // Fallback if ffmpeg not available
        finalResult = { status: "جيد", reason: "تعذر تحليل الفيديو", score: 50 };
      } else {
        finalResult = { status: "ممتاز", reason: "", score: 100 };

        for (const framePath of frames) {
          const base64 = await imageToBase64(framePath);
          const result = await checkImage(base64);

          // If any frame is rejected, the whole video is rejected
          if (result.status === "مرفوض") {
            finalResult = result;
            break;
          }
          // Track worst result
          if (result.status === "جيد" && finalResult.status === "ممتاز") {
            finalResult = result;
          }
          // Track lowest score
          if (result.score < finalResult.score) {
            finalResult.score = result.score;
          }
        }

        // Cleanup frames
        const framesDir = dirname(frames[0]);
        await cleanupDir(framesDir);
      }
    } else {
      // Image: send directly
      const mtype = mimeType === "image/png" ? "image/png" : "image/jpeg";
      const base64 = await imageToBase64(filePath);
      finalResult = await checkImage(base64, mtype);
    }

    // Map status to display message
    const messageMap: Record<string, string> = {
      "ممتاز": "ممتاز انطلق",
      "جيد": "جيد لكن وصوله ضعيف",
      "مرفوض": `سوف يتم رفضه بسبب: ${finalResult.reason}`,
    };

    // Save check to DB and update user stats
    if (user) {
      await db.insert(checksTable).values({
        user_id: user.id,
        status: finalResult.status,
        reason: finalResult.reason,
        score: finalResult.score,
      });

      await db
        .update(usersTable)
        .set({
          total_checks: sql`${usersTable.total_checks} + 1`,
          last_check_at: new Date(),
          trials_remaining:
            plan !== "professional"
              ? sql`GREATEST(${usersTable.trials_remaining} - 1, 0)`
              : usersTable.trials_remaining,
        })
        .where(eq(usersTable.id, user.id));
    } else {
      // Anonymous check — still log to checks table
      await db.insert(checksTable).values({
        user_id: null,
        status: finalResult.status,
        reason: finalResult.reason,
        score: finalResult.score,
      });
    }

    res.json({
      status: finalResult.status,
      reason: finalResult.reason,
      score: finalResult.score,
      message: messageMap[finalResult.status] ?? finalResult.status,
      frames_checked: framesChecked,
    });
  } catch (err) {
    logger.error({ err }, "Ad check error");
    res.status(500).json({ error: "حدث خطأ أثناء تحليل الإعلان" });
  } finally {
    cleanup(filePath);
  }
});

// POST /generate-text — generate Libyan dialect ad copy
router.post("/generate-text", async (req, res): Promise<void> => {
  const { product, dialect } = req.body as { product?: string; dialect?: string };

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
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: `اكتب نص إعلاني فيسبوك باللهجة الليبية ${dialect} للمنتج: ${product}. استخدم 2-3 إيموجي. ممنوع الوعود الكاذبة. قصير وجذاب ومباشر.`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";
    res.json({ text });
  } catch (err) {
    logger.error({ err }, "Text generation error");
    res.status(500).json({ error: "حدث خطأ أثناء توليد النص" });
  }
});

// POST /image-gen — TODO: ربط API نانو بانانا لتوليد الصور
router.post("/image-gen", async (req, res): Promise<void> => {
  // TODO: ربط API نانو بانانا لتوليد الصور
  res.json({ url: "" });
});

export default router;
