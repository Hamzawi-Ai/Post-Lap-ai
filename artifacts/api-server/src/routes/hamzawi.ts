import { Router, type IRouter } from "express";
import multer from "multer";
import { tmpdir } from "os";
import { db, usersTable, hamzawiMessagesTable, hamzawiConversationsTable, userBrandMemoryTable, mediaAssetsTable, type MediaAssetCategory } from "@workspace/db";
import { eq, desc, and, isNull, sql } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { logger } from "../lib/logger";
import { planLevel } from "@workspace/db";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { readFileSync, unlinkSync, existsSync } from "fs";
import { getUserFromToken, isAdminToken } from "../middleware/auth";
import {
  isOperationalQuestion,
  detectPeriod,
  wantsTopAccounts,
  summarizeForHamzawi,
  OPERATIONAL_DECLINE_GUARD,
} from "../services/operational/supervisor";
import { MediaService } from "../services/media/MediaService";
import { getOpenAI } from "../services/ai/client";
import type OpenAI from "openai";
import { buildChatContext } from "../services/ai/contextBuilder";
import { composeSystemPrompt } from "../services/ai/postlab";
import { uploadsUrlToBase64 } from "../services/media/assetReader";
// Side-effect import: registers the beta tool metadata into the ToolRegistry
// at server start. Registration is idempotent and required by the Reasoner (P1).
import "../services/ai/tools";
import { toolRegistry } from "../services/ai/tools";
import { classifyIntent } from "../services/ai/reasoner";
import { evaluateToolAccess } from "../services/ai/validator";
import { generateBrandedPost } from "../services/image-gen/brandedPost";
import {
  applyPartialBrandSave,
  markBrandOnboardingComplete,
  upsertBrandMemory,
  appendDesignSample,
  appendMarketingNote,
  isBrandProfileComplete,
} from "../services/brand/brain";

// TODO(prompt-studio): consume AgentConfig — vision_model (override for vision turns)
const VISION_MODEL = "gpt-4o";
// TODO(prompt-studio): consume AgentConfig — text_model (override for text turns)
const TEXT_MODEL = "gpt-4o-mini";

// C2 resource-protection limits (docs/FINAL_AUDIT_REPORT.md). A chat attachment
// may not exceed 4 MiB decoded — bounds the base64 stored in hamzawi_messages
// and the vision-model payload, and blocks guests from pushing unbounded data.
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;
// Cap on image parts re-expanded from stored history into a single vision turn
// (OpenAI cost protection). Newer image markers take precedence.
const MAX_VISION_IMAGES_PER_TURN = 6;

// A generated image is the actual response to a design request. When the model's
// raw reply was the %%GENERATE_POST%% marker only (stripped before persistence),
// the assistant turn must still read as COMPLETED in AI history — never as an
// unanswered request that would re-trigger generation on every later message.
const DESIGN_DELIVERED_HISTORY_NOTE = "[تم توليد التصميم وإرساله]";
// Fallback shown alongside the generated image when the assistant reply carried
// no visible text of its own (the image itself is the response). Success path only.
const DESIGN_DELIVERED_REPLY_FALLBACK = "تم توليد التصميم وإرساله ✓";
// History state for a generation that FAILED — never claim the design was
// delivered when the image could not actually be produced.
const DESIGN_GENERATION_FAILED_FALLBACK = "[تعذر توليد التصميم]";

/** Approximate decoded byte length of a base64 string (safe upper bound). */
function approximateBase64Bytes(base64: string): number {
  return Math.ceil((base64.length * 3) / 4);
}

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
  const raw = verifySessionId(decoded);
  // The guest cookie may ONLY reference a genuine guest session (anon_*).
  // Rejecting any user_* session id prevents a stale cookie (left behind by an
  // earlier authenticated request after client-side logout) from scoping a
  // guest to an authenticated user's chat data — a cross-user leak.
  if (!raw || !raw.startsWith("anon_")) return null;
  return raw;
}

function setSessionCookie(res: { setHeader: (k: string, v: string) => void }, signed: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `hamzawi_session=${encodeURIComponent(signed)}; Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${60 * 60 * 24 * 30}`
  );
}

/** Delete the hamzawi_session cookie (authenticated users and logout). */
function clearSessionCookie(res: { setHeader: (k: string, v: string) => void }) {
  res.setHeader(
    "Set-Cookie",
    `hamzawi_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
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

// ─── Chat image attachments ───────────────────────────────────────────────────
// A user uploads an image (ad-check via the scan button, or the paperclip in
// chat). The image must reach the vision model, otherwise Hamzawi genuinely
// cannot see it and answers "لا أستطيع رؤية الصورة". Root-cause fix: the chat
// turn now accepts an `attachment` ({ url } for an uploaded /uploads/… asset,
// or { dataUrl } for a raw base64 image) and ALWAYS passes it to the vision
// model when present. The reference is also persisted as a marker inside the
// stored user message so later turns keep seeing it (expanded by
// buildHistoryForAI below, stripped from visible text by the frontend parser).

const ATTACHED_IMAGE_MARKER_RE = /%%ATTACHED_IMAGE%%(\{[\s\S]*?\})%%END%%/g;

type AiContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

interface ResolvedAttachment {
  mimeType: string;
  data: string;
  /** Present when the attachment references an uploaded asset (persisted form). */
  url?: string;
}

/**
 * Resolve an optional chat attachment (an uploaded /uploads/… URL or a raw
 * base64 data URL) to image data the vision model can read. Returns null when
 * nothing usable is provided. Never throws — a bad attachment degrades to a
 * text-only turn.
 */
async function resolveAttachment(
  attachment?: { url?: string; dataUrl?: string } | null,
): Promise<ResolvedAttachment | null> {
  if (!attachment) return null;
  if (typeof attachment.url === "string" && attachment.url.startsWith("/uploads/")) {
    const img = await uploadsUrlToBase64(attachment.url);
    if (img && approximateBase64Bytes(img.data) <= MAX_ATTACHMENT_BYTES) {
      return { ...img, url: attachment.url };
    }
  }
  if (typeof attachment.dataUrl === "string" && attachment.dataUrl.startsWith("data:image/")) {
    const m = attachment.dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (m && m[2] && approximateBase64Bytes(m[2]) <= MAX_ATTACHMENT_BYTES) {
      return { mimeType: m[1], data: m[2] };
    }
  }
  return null;
}

/** Build the persistence marker for an attached image (URL form when available). */
function buildAttachmentMarker(attachment: ResolvedAttachment): string {
  const payload = attachment.url
    ? { url: attachment.url }
    : { data: `data:${attachment.mimeType};base64,${attachment.data}` };
  return `%%ATTACHED_IMAGE%%${JSON.stringify(payload)}%%END%%`;
}

/**
 * Convert stored conversation rows into OpenAI messages. Generated-image
 * markers are always stripped (never re-sent); attached-image markers are
 * re-expanded into image content parts so the vision model keeps seeing images
 * the user uploaded earlier in the conversation.
 */
async function buildHistoryForAI(
  rows: typeof hamzawiMessagesTable.$inferSelect[],
): Promise<OpenAI.Chat.Completions.ChatCompletionMessageParam[]> {
  const out: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
  let imageCount = 0;
  for (const row of [...rows].reverse()) {
    const raw = row.content ?? "";
    // Track whether this assistant turn delivered a generated design so the
    // turn is never represented as empty history (see DESIGN_DELIVERED_*).
    const deliveredGeneratedImage = /%%GENERATED_IMAGE%%[\s\S]*?%%END%%/.test(raw);
    const text = raw
      .replace(/%%GENERATED_IMAGE%%[\s\S]*?%%END%%/g, "")
      .replace(ATTACHED_IMAGE_MARKER_RE, "")
      .trim();

    const images: AiContentPart[] = [];
    const re = new RegExp(ATTACHED_IMAGE_MARKER_RE.source, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(raw)) !== null) {
      // C2: bound how many stored images are re-sent to the vision model.
      if (imageCount >= MAX_VISION_IMAGES_PER_TURN) break;
      try {
        const parsed = JSON.parse(match[1]) as { url?: string; data?: string };
        if (typeof parsed.url === "string") {
          const img = await uploadsUrlToBase64(parsed.url);
          if (img && approximateBase64Bytes(img.data) <= MAX_ATTACHMENT_BYTES) {
            images.push({
              type: "image_url",
              image_url: { url: `data:${img.mimeType};base64,${img.data}` },
            });
            imageCount++;
          }
        } else if (typeof parsed.data === "string" && parsed.data.startsWith("data:image/")) {
          const dataMatch = parsed.data.match(/^data:(image\/[a-z]+);base64,(.+)$/);
          if (dataMatch && dataMatch[2] && approximateBase64Bytes(dataMatch[2]) <= MAX_ATTACHMENT_BYTES) {
            images.push({ type: "image_url", image_url: { url: parsed.data } });
            imageCount++;
          }
        }
      } catch {
        // Malformed marker — ignore, the message still works as text.
      }
    }

    // Only user messages carry image parts — assistant rows stay plain text
    // (matches OpenAI's per-role content constraints). A completed design
    // generation must never look like an unanswered request: when the stripped
    // text is empty but the turn delivered a generated image, inject the
    // internal completion note instead of an empty assistant message.
    if (row.role === "assistant") {
      const assistantText = text.length > 0 || !deliveredGeneratedImage
        ? text
        : DESIGN_DELIVERED_HISTORY_NOTE;
      out.push({ role: "assistant", content: assistantText });
    } else {
      out.push({
        role: "user",
        content: images.length > 0 ? [{ type: "text", text }, ...images] : text,
      });
    }
  }
  return out;
}

// POST /api/hamzawi/chat
// Supports isInit: true — proactive first message from Hamzawi, no user input needed.
// Used to auto-start guided onboarding for level 4+ users on chat open.
router.post("/hamzawi/chat", chatLimiter, async (req, res): Promise<void> => {
  const { message, checkReport, isInit, conversationId: conversationIdInput, attachment } = req.body as {
    message?: string;
    isInit?: boolean;
    conversationId?: number | null;
    attachment?: { url?: string; dataUrl?: string } | null;
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

  // Supervisory context: the owner/admin JWT (role: "admin", signed with
  // SESSION_SECRET — same credential as requireAdmin). An admin token carries
  // no userId, so the owner chats as a guest session WITH read access to
  // operational intelligence. Ordinary customers/guests are never supervisory.
  const isSupervisor = !user && isAdminToken(req.headers.authorization);

  // Authenticated users follow a clean token-based flow: the JWT is the sole
  // credential and no session cookie is set. Any stale hamzawi_session cookie
  // (e.g. from an earlier guest visit, or a user_* cookie left by the previous
  // implementation) is deleted so it can never leak into a later guest session.
  // Guests keep the signed anon_* cookie for session-scoped history continuity.
  let sessionRawId: string;
  if (user) {
    sessionRawId = `user_${user.id}`;
    clearSessionCookie(res);
  } else {
    const existing = getVerifiedSessionId(req);
    if (existing) {
      sessionRawId = existing;
    } else {
      const created = generateSignedSession();
      sessionRawId = created.rawId;
    }
    setSessionCookie(res, signSessionId(sessionRawId));
  }

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

    // Resolve the user's uploaded image (if any) BEFORE the turn is built — it
    // unconditionally routes the turn to the vision model below.
    const attachedImage = await resolveAttachment(attachment);

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

    // On-demand operational access (supervisory bridge). Operational facts are
    // fetched ONLY when a valid admin JWT is present AND the owner asks an
    // operational question — never injected into normal conversations, never
    // persisted. Ordinary customers never reach OperationalMetrics; instead they
    // get a polite decline guard so Hamzawi never fabricates platform stats.
    const operationalQuestion = isOperationalQuestion(message ?? "");
    let operationalBlock = "";
    if (isSupervisor) {
      if (operationalQuestion) {
        operationalBlock = await summarizeForHamzawi(detectPeriod(message ?? ""), {
          includeTopAccounts: wantsTopAccounts(message ?? ""),
        });
      }
    }

    // The supervisor is not a paying customer: present the full-capability
    // plan text so no registration/upsell nudge is aimed at the platform owner.
    // Otherwise feed the BETA-AWARE effective level into the prompt: beta users
    // (registered + beta_access) get level 4+ capability text directly instead of
    // a runtime-appended Beta override block. composeSystemPrompt() derives the
    // capability text from planLevel(plan), so a level >= 4 account maps to the
    // "content" plan text to get full capabilities without any upgrade nudge.
    const promptPlan = isSupervisor ? "agency" : level >= 4 ? "content" : plan;
    const systemPrompt =
      composeSystemPrompt(promptPlan, memory, isOnboarding, assetContext, ctx.userName, ctx.companyName) +
      (isSupervisor
        ? `\n\n[وضع مساعد المالك (Supervisory): المستخدم الحالي هو مالك/مشرف PostLab. يمكنك الإجابة عن بيانات المنصة التشغيلية عند سؤاله عنها.]` +
          (operationalBlock ? `\n\n${operationalBlock}` : "")
        : operationalQuestion
          ? `\n\n${OPERATIONAL_DECLINE_GUARD}`
          : "");

    // Stored history with attached-image markers re-expanded as image parts
    // (generated-image markers are always stripped).
    const historyForAI = await buildHistoryForAI(recentMessages);

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

    // The attached image is passed as an image content part below. Tell the
    // model explicitly that the image is in front of it so it analyses it and
    // never answers that it cannot see the image.
    if (attachedImage && userContent.trim()) {
      userContent = `${userContent}\n[الصورة المرفقة معروضة أمامك في هذه الرسالة — حللها مباشرة وردّ بناءً عليها، ولا تقل أبداً أنك لا ترى الصورة المرفقة.]`;
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

    // Vision routing: an attached user image is an unconditional vision signal —
    // the model ALWAYS receives it, regardless of intent detection. Brand images
    // are still attached only when the intent genuinely needs image understanding
    // (original gating preserved). Normal text turns stay on the cheaper model.
    const intentVision = needsVision && hasBrandImages;
    const hasImageContext = !!attachedImage || intentVision;

    let userContentParts: string | AiContentPart[] = userContent;
    let model = TEXT_MODEL;
    if (hasImageContext) {
      model = VISION_MODEL;
      const parts: AiContentPart[] = [{ type: "text", text: userContent }];
      if (attachedImage) {
        parts.push({
          type: "image_url",
          image_url: { url: `data:${attachedImage.mimeType};base64,${attachedImage.data}` },
        });
      }
      if (intentVision) {
        for (const img of brandAssets!.images) {
          parts.push({
            type: "image_url",
            image_url: { url: `data:${img.mimeType};base64,${img.data}` },
          });
        }
      }
      userContentParts = parts;
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
    // It never overrides a legitimate conversational answer: if the model replied
    // with a clarifying question (allowed by the design instruction when offer
    // details are missing), the question is kept and no marker is forced.
    const replyAsksForMoreInfo = /[?؟]\s*$/.test(rawReply.trim());
    if (
      !isInit &&
      intentDecision.intent === "generate_image" &&
      user &&
      level >= 4 &&
      !rawReply.includes("%%GENERATE_POST%%") &&
      !replyAsksForMoreInfo
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

    let reply = generateReply;

    // For isInit: only store the assistant message (no user message shown/stored)
    if (!isInit && message?.trim()) {
      await db.insert(hamzawiMessagesTable).values({
        user_id: user?.id ?? null,
        session_id: sessionRawId,
        role: "user",
        content: attachedImage ? `${message}${buildAttachmentMarker(attachedImage)}` : message,
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
          // The generated image is the actual response. If the model's reply was
          // marker-only, close the turn with the delivery line so history never
          // looks like an unanswered request (success path only — the image was
          // actually produced here).
          if (!reply.trim()) reply = DESIGN_DELIVERED_REPLY_FALLBACK;
          // Persist the image reference inside the stored content so it survives
          // page reload via the existing messages endpoint (no schema change).
          storedContent = `${reply}\n%%GENERATED_IMAGE%%${JSON.stringify({
            url: generated.url,
            description: generateDescription,
          })}%%END%%`;
        } else {
          // Provider returned null — surface the failure instead of silently
          // returning a text reply that looks like a successful response. Never
          // claim the design was delivered: history must distinguish a failed
          // generation from a successful one.
          if (!reply.trim()) reply = DESIGN_GENERATION_FAILED_FALLBACK;
          const notice = "\n\n⚠️ لم يتمكن النظام من توليد الصورة. حاول مرة أخرى.";
          reply = `${reply}${notice}`;
          storedContent = reply;
        }
      } catch (e) {
        const err = e as { status?: number; code?: string; message?: string } | null;
        logger.error(
          { errorStatus: err?.status, errorCode: err?.code, errorMessage: err?.message },
          "Failed to generate post from Hamzawi marker",
        );
        // Surface a user-visible notice instead of silently returning only text.
        // Never claim the design was delivered on failure.
        if (!reply.trim()) reply = DESIGN_GENERATION_FAILED_FALLBACK;
        const isQuota = err?.status === 429;
        const notice = isQuota
          ? "\n\n⚠️ توليد الصور غير متاح مؤقتاً بسبب تجاوز الحصة المسموح بها. حاول بعد دقيقة."
          : "\n\n⚠️ حدث خطأ أثناء توليد الصورة. حاول مرة أخرى.";
        reply = `${reply}${notice}`;
        storedContent = reply;
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
