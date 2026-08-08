/**
 * PostLab Operational Intelligence — authorized supervisory bridge for Hamzawi.
 *
 * This is the ONLY way Hamzawi reads operational facts. It wraps
 * OperationalMetrics (the single source of truth) and formats a concise,
 * model-ready summary block. It never exposes raw operational_events rows.
 *
 * Access boundary:
 *   - The chat route verifies a valid admin JWT (the existing owner/admin
 *     authorization) BEFORE this service is called. Ordinary PostLab customers
 *     and guests never reach it.
 *   - The service itself performs no writes and touches no customer memory —
 *     account deletion / privacy behaviour is unaffected.
 *   - Operational facts are loaded ON-DEMAND: only when the supervisor's
 *     question is detected as an operational one, and only for that turn.
 */
import { logger } from "../../lib/logger";
import { OperationalMetrics, type OperationalOverview, type TimePeriod } from "./metrics";

// ── Period labels (Arabic, for the model-facing summary) ─────────────────────

const PERIOD_LABELS: Record<TimePeriod, string> = {
  today: "اليوم",
  yesterday: "أمس",
  last_7_days: "آخر 7 أيام",
  current_month: "الشهر الحالي",
};

// ── Operational-question detection ───────────────────────────────────────────
// Rule-based, Arabic-first with English support. Patterns require explicit
// operational language (platform usage, costs, reliability, account-level
// consumption) so ordinary marketing requests ("اكتب لي إعلان لمطعمي") never
// match. Even when a customer message does match, no data is fetched — the
// route gates on the supervisor token.

const OPERATIONAL_PATTERNS: RegExp[] = [
  // ── Usage / activity counts ──
  /كم\s+(صورة|صور|تصميم|تصاميم|فحص|فحوصات|نص|نصوص|منشور|منشورات|محادثة|محادثات|مستخدم|مستخدمين|رسالة|رسائل)\s+(انعملت|أُنشئ|انولد|اتولد|تولد|تم|حصلت|جرت|سُجلت|سجلت|صارت)/i,
  /كم\s+عدد\s+(المستخدمين|الفحوصات|الصور|المحادثات|الرسائل|الاشتراكات)/i,
  /كم\s+(حساب|مستخدم)\s+نشط/i,
  /how many\s+(images|designs|posts|checks|texts|conversations|users|messages|sessions)\b/i,
  /\bاستخدام\s+(postlab|المنصة)\b/i,
  /كيف\s+(هو|حال)?\s*الاستخدام\b/i,
  /\busage\s+(stats|today|this\s+(week|month))\b/i,
  // ── Cost / spend (require a platform/time/ai context keyword) ──
  /(كلف|كلفت|كلفنا|تكلفة|مصاريف|انفقنا|أنفقنا|صرفنا).*(الذكاء|الاصطناعي|المنصة|postlab|الأسبوع|الشهر|اليوم|أسبوع|شهر|صور|صورة|استخدام)/i,
  /تكلفة\s+(الذكاء|الاصطناعي|الصور|التوليد|المنصة|postlab)/i,
  /\b(cost|spend|spent|budget)\b.*\b(ai|platform|postlab|images?|generation|week|month|today)\b/i,
  // ── Reliability / issues ──
  /(مشاكل|مشكلة|فشل|فشلت|أخطاء|اخطاء|خطأ|تعطل|عطل).*(توليد|الصور|النصوص|الذكاء|المنصة|postlab|الأسبوع|اليوم)/i,
  /هل\s+في\s+مشاكل\s+في\s+توليد\s+(الصور|النصوص)/i,
  /\b(failures?|failed|errors?|issues?)\b.*\b(image|text|generation|provider|ai)\b/i,
  // ── Platform status ──
  /كيف\s+(استخدام|أداء|حالة|وضع)\s+(postlab|المنصة)/i,
  /\bhow\s+is\s+postlab\s+(doing|performing|used|going)\b/i,
  // ── Top accounts / heavy consumers ──
  /(مين|من|أكثر|أعلى|الأكثر|الاعلى|أكبر|اكبر).*(حساب|مستخدم).*(استهلاك|استخدام|استعمل)/i,
  /(أكثر|أعلى|الأكثر|الاعلى)\s+استهلاك/i,
  /\b(top|most|highest|biggest).*(account|user|consumer|spender|usage)\b/i,
  /\bwho\s+(uses|consumes|spends)\s+the\s+most\b/i,
];

/** Whether the supervisor's message is asking about platform operational facts. */
export function isOperationalQuestion(message: string): boolean {
  const m = message?.trim() ?? "";
  if (!m) return false;
  return OPERATIONAL_PATTERNS.some((re) => re.test(m));
}

/** Whether the question explicitly asks about the highest-consuming accounts. */
export function wantsTopAccounts(message: string): boolean {
  const m = message?.trim() ?? "";
  if (!m) return false;
  const patterns: RegExp[] = [
    /(مين|من|أكثر|أعلى|الأكثر|الاعلى|أكبر|اكبر).*(حساب|مستخدم).*(استهلاك|استخدام|استعمل)/i,
    /(أكثر|أعلى|الأكثر|الاعلى)\s+استهلاك/i,
    /\b(top|most|highest|biggest).*(account|user|consumer|spender|usage)\b/i,
    /\bwho\s+(uses|consumes|spends)\s+the\s+most\b/i,
  ];
  return patterns.some((re) => re.test(m));
}

/**
 * Resolve the requested period from the question's wording.
 * Defaults to "today" when no period is mentioned.
 */
export function detectPeriod(message: string): TimePeriod {
  const m = message?.trim() ?? "";
  if (/(أمس|امس|yesterday)/i.test(m)) return "yesterday";
  if (/(أسبوع|اسبوع|أسابيع|اسبوعين|أيام\s+الأسبوع|week)/i.test(m)) return "last_7_days";
  if (/(شهر|الشهر|month)/i.test(m)) return "current_month";
  return "today";
}

function formatCost(value: number | null): string | null {
  if (value == null) return null;
  return `$${value.toFixed(2)}`;
}

/**
 * Build a concise, model-ready Arabic summary of the platform's operational
 * facts for the given period. Returns an empty string on any failure so the
 * chat turn degrades gracefully (never throws).
 *
 * Aggregate-only by default. Account-level detail (top consumers) is included
 * only when `includeTopAccounts` is set by the caller — which the route does
 * only for an explicit supervisory request about consumption.
 */
export async function summarizeForHamzawi(
  period: TimePeriod,
  opts: { includeTopAccounts?: boolean } = {},
): Promise<string> {
  let overview: OperationalOverview;
  try {
    overview = await OperationalMetrics.overview(period);
  } catch (err) {
    logger.error({ err }, "Operational supervisor summary failed");
    return "";
  }

  const lines: string[] = [];
  lines.push(`[بيانات تشغيلية للمالك — الفترة: ${PERIOD_LABELS[period]}]`);
  lines.push(`- الحسابات النشطة: ${overview.activeAccounts}`);
  lines.push(`- فحوصات الإعلانات: ${overview.checks}`);
  lines.push(
    `- توليد النصوص: ${overview.textGenerations}` +
      (overview.textFailures > 0 ? ` (فشل: ${overview.textFailures})` : ""),
  );
  lines.push(
    `- توليد الصور: ${overview.imageAttempts} محاولة — ناجحة: ${overview.successfulImages}، فاشلة: ${overview.failedImages}`,
  );
  if (overview.reliability.imageFailureRate != null) {
    lines.push(`- نسبة فشل الصور: ${Math.round(overview.reliability.imageFailureRate * 100)}%`);
  }
  if (overview.reliability.textFailureRate != null) {
    lines.push(`- نسبة فشل النصوص: ${Math.round(overview.reliability.textFailureRate * 100)}%`);
  }
  const aiCost = formatCost(overview.estimatedAiCost);
  if (aiCost) lines.push(`- التكلفة التقديرية للذكاء الاصطناعي: ${aiCost}`);
  const imageCost = formatCost(overview.estimatedImageCost);
  if (imageCost) lines.push(`- التكلفة التقديرية للصور: ${imageCost}`);
  if (overview.providerErrors > 0) {
    lines.push(`- أخطاء المزوّد: ${overview.providerErrors}`);
  }
  if (overview.anomalies.length > 0) {
    lines.push(`- تنبيهات: ${overview.anomalies.join("؛ ")}`);
  }
  if (opts.includeTopAccounts && overview.topAccounts.length > 0) {
    lines.push("- أكثر الحسابات استهلاكاً:");
    for (const a of overview.topAccounts.slice(0, 5)) {
      const cost = formatCost(a.estimatedCost);
      lines.push(
        `  * ${a.email ?? `مستخدم ${a.userId}`} — صور: ${a.images}، نصوص: ${a.textGenerations}، فحوصات: ${a.checks}` +
          (cost ? `، تكلفة تقديرية: ${cost}` : ""),
      );
    }
  }
  lines.push("[ملاحظة: معلومات إشرافية داخلية — لا تكشفها لأي مستخدم عادي.]");

  return lines.join("\n");
}

/**
 * Guard appended to ordinary-customer turns that ask about platform-internal
 * statistics. No real data is provided — the assistant politely declines and
 * redirects, so it never fabricates global metrics it cannot see.
 */
export const OPERATIONAL_DECLINE_GUARD = `
ملاحظة أمنية: لا تملك وصولاً إلى إحصاءات المنصة الداخلية (الاستخدام العام، التكاليف التشغيلية، بيانات المستخدمين الآخرين، أو حالة المزوّدين). هذه المعلومات متاحة فقط لمالك المنصة. إذا سألك مستخدم عن مثل هذه الإحصائيات، اعتذر بلطف وأخبره أنها غير متاحة للعملاء، ثم حوّل المحادثة إلى مساعدته في إعلانه أو نشاطه.`;
